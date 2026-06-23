import type { GameEvent, GameRules, PlayerId, PlayerView } from '@pablo/engine';
import { DEFAULT_RULES } from '@pablo/engine';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

import { fail, invokeEdge, ok } from './internal/edgeInvoke';
import { GameTickPump } from './internal/realtimeTick';
import { mapRoomApi, mapRoomRow } from './internal/roomMapper';
import { getSupabaseBrowser } from './internal/supabaseBrowser';
import type {
  ActiveSession,
  ClientResult,
  DisplayNameMap,
  GameId,
  PabloClient,
  Room,
  RoomId,
  Unsubscribe,
} from './types';

export type RealClientOptions = {
  /** Inject a Supabase client (integration tests). Defaults to the RN browser singleton. */
  readonly supabase?: SupabaseClient;
};

type PumpEntry = {
  readonly pump: GameTickPump;
  readonly channel: RealtimeChannel;
  refCount: number;
};

type RoomChannelEntry = {
  readonly channel: RealtimeChannel;
  readonly listeners: Set<(room: Room) => void>;
};

async function fetchRoom(supabase: SupabaseClient, roomId: RoomId): Promise<ClientResult<Room>> {
  const { data: row, error } = await supabase
    .from('rooms')
    .select('id, code, host_id, status, rules, max_players, current_game_id')
    .eq('id', roomId)
    .maybeSingle();

  if (error || !row) return fail('not_found');

  const { data: members, error: membersErr } = await supabase
    .from('room_members')
    .select('user_id')
    .eq('room_id', roomId)
    .order('seat');

  if (membersErr) return fail('internal_error');

  return ok(
    mapRoomRow(
      row as Parameters<typeof mapRoomRow>[0],
      (members ?? []).map((m: { user_id: string }) => m.user_id),
    ),
  );
}

export function createRealClient(opts: RealClientOptions = {}): PabloClient {
  const supabase = opts.supabase ?? getSupabaseBrowser();
  const pumps = new Map<GameId, PumpEntry>();
  const roomChannels = new Map<RoomId, RoomChannelEntry>();

  function acquirePump(gameId: GameId): GameTickPump {
    let entry = pumps.get(gameId);
    if (!entry) {
      const pump = new GameTickPump(gameId, {
        getPlayerView: (id) =>
          invokeEdge<{ view: PlayerView; version: number }>(supabase, 'getPlayerView', {
            gameId: id,
          }),
        getEventsSince: (id, sinceVersion) =>
          invokeEdge<{ events: ReadonlyArray<GameEvent>; currentVersion: number }>(
            supabase,
            'getEventsSince',
            { gameId: id, sinceVersion },
          ),
      });

      const channel = supabase.channel(`game:${gameId}`);
      channel.on('broadcast', { event: 'tick' }, () => {
        pump.onTick();
      });
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          pump.onTick();
        }
      });

      entry = { pump, channel, refCount: 0 };
      pumps.set(gameId, entry);
    }
    entry.refCount += 1;
    return entry.pump;
  }

  function releasePump(gameId: GameId): void {
    const entry = pumps.get(gameId);
    if (!entry) return;
    entry.refCount -= 1;
    if (entry.refCount <= 0) {
      entry.pump.dispose();
      void supabase.removeChannel(entry.channel);
      pumps.delete(gameId);
    }
  }

  async function signIn(): Promise<ClientResult<PlayerId>> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) return ok(session.user.id);

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) return fail('unauthenticated');
    return ok(data.user.id);
  }

  async function setDisplayName(name: string): Promise<ClientResult<void>> {
    const auth = await signIn();
    if (!auth.ok) return auth;

    const trimmed = name.trim();
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: trimmed.length > 0 ? trimmed : null })
      .eq('id', auth.data);

    if (error) return fail('internal_error');
    return ok(undefined);
  }

  async function fetchDisplayNames(ids: ReadonlyArray<PlayerId>): Promise<DisplayNameMap> {
    if (ids.length === 0) return {};
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', ids as string[]);

    if (error || !data) return {};
    const map: Record<string, string | null> = {};
    for (const row of data as ReadonlyArray<{ id: string; display_name: string | null }>) {
      map[row.id] = row.display_name;
    }
    return map;
  }

  async function getDisplayNames(
    ids: ReadonlyArray<PlayerId>,
  ): Promise<ClientResult<DisplayNameMap>> {
    return ok(await fetchDisplayNames(ids));
  }

  function subscribeDisplayNames(
    ids: ReadonlyArray<PlayerId>,
    onChange: (names: DisplayNameMap) => void,
  ): Unsubscribe {
    if (ids.length === 0) {
      onChange({});
      return () => {};
    }

    let active = true;
    const refetch = () => {
      void fetchDisplayNames(ids).then((names) => {
        if (active) onChange(names);
      });
    };
    refetch();

    const filterIds = [...ids].join(',');
    const channel = supabase
      .channel(`profiles:${filterIds}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=in.(${filterIds})` },
        () => {
          refetch();
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }

  async function createRoom(opts: {
    rules?: Partial<GameRules>;
    maxPlayers?: number;
  }): Promise<ClientResult<Room>> {
    const auth = await signIn();
    if (!auth.ok) return auth;

    const rules: GameRules = { ...DEFAULT_RULES, ...opts.rules };
    const { data, error } = await supabase.rpc('create_room', {
      p_rules: rules as unknown as Record<string, unknown>,
      p_max_players: opts.maxPlayers ?? 4,
    });

    if (error) return fail('internal_error');
    if (!data) return fail('internal_error');

    return ok(mapRoomRow(data as Parameters<typeof mapRoomRow>[0], [auth.data]));
  }

  async function joinRoom(opts: { code: string }): Promise<ClientResult<Room>> {
    const auth = await signIn();
    if (!auth.ok) return auth;

    const result = await invokeEdge<{ room: Parameters<typeof mapRoomApi>[0] }>(
      supabase,
      'joinRoom',
      {
        code: opts.code.toUpperCase(),
      },
    );
    if (!result.ok) return result;
    return ok(mapRoomApi(result.data.room));
  }

  async function leaveRoom(opts: { roomId: RoomId }): Promise<ClientResult<void>> {
    return invokeEdge(supabase, 'leaveRoom', { roomId: opts.roomId });
  }

  async function startGame(opts: { roomId: RoomId }): Promise<ClientResult<GameId>> {
    const result = await invokeEdge<{ gameId: GameId }>(supabase, 'startGame', {
      roomId: opts.roomId,
    });
    if (!result.ok) return result;
    return ok(result.data.gameId);
  }

  async function returnToLobby(opts: { roomId: RoomId }): Promise<ClientResult<void>> {
    return invokeEdge(supabase, 'returnToLobby', { roomId: opts.roomId });
  }

  async function getActiveSession(): Promise<ClientResult<ActiveSession | null>> {
    const auth = await signIn();
    if (!auth.ok) return auth;

    const { data: memberships, error } = await supabase
      .from('room_members')
      .select('room_id')
      .eq('user_id', auth.data);

    if (error) return fail('internal_error');

    for (const row of memberships ?? []) {
      const roomResult = await fetchRoom(supabase, row.room_id as RoomId);
      if (!roomResult.ok) continue;
      const room = roomResult.data;
      if (room.status === 'playing' && room.currentGameId) {
        return ok({
          roomId: room.id,
          gameId: room.currentGameId,
          mode: 'online',
        });
      }
    }

    return ok(null);
  }

  async function applyMove(opts: {
    gameId: GameId;
    move: Parameters<PabloClient['applyMove']>[0]['move'];
    idempotencyKey: string;
    expectedVersion: number;
  }): Promise<ClientResult<{ version: number }>> {
    return invokeEdge(supabase, 'applyMove', {
      gameId: opts.gameId,
      move: opts.move,
      idempotencyKey: opts.idempotencyKey,
      expectedVersion: opts.expectedVersion,
    });
  }

  function subscribeRoom(roomId: RoomId, onChange: (room: Room) => void): Unsubscribe {
    // Re-fetch the room and fan out to every current listener. Reads the entry
    // fresh on each call so a channel created by the first subscriber still
    // notifies later subscribers that share it.
    const emitAll = async () => {
      const result = await fetchRoom(supabase, roomId);
      if (!result.ok) return;
      const current = roomChannels.get(roomId);
      if (!current) return;
      for (const listener of current.listeners) listener(result.data);
    };

    let entry = roomChannels.get(roomId);
    if (!entry) {
      const listeners = new Set<(room: Room) => void>();
      const channel = supabase
        .channel(`room:${roomId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
          () => {
            void emitAll();
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
          () => {
            void emitAll();
          },
        )
        .subscribe();
      entry = { channel, listeners };
      roomChannels.set(roomId, entry);
    }
    entry.listeners.add(onChange);

    // Prime just this subscriber with the current room state.
    void fetchRoom(supabase, roomId).then((result) => {
      if (result.ok && roomChannels.get(roomId)?.listeners.has(onChange)) {
        onChange(result.data);
      }
    });

    return () => {
      const current = roomChannels.get(roomId);
      if (!current) return;
      current.listeners.delete(onChange);
      if (current.listeners.size === 0) {
        void supabase.removeChannel(current.channel);
        roomChannels.delete(roomId);
      }
    };
  }

  function subscribePlayerView(
    gameId: GameId,
    onChange: (view: PlayerView, version: number) => void,
  ): Unsubscribe {
    const pump = acquirePump(gameId);
    const unsub = pump.subscribeView(onChange);
    return () => {
      unsub();
      releasePump(gameId);
    };
  }

  function subscribeGameEvents(
    gameId: GameId,
    onChange: (events: ReadonlyArray<GameEvent>) => void,
  ): Unsubscribe {
    const pump = acquirePump(gameId);
    const unsub = pump.subscribeEvents(onChange);
    return () => {
      unsub();
      releasePump(gameId);
    };
  }

  return {
    signIn,
    setDisplayName,
    getDisplayNames,
    subscribeDisplayNames,
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    returnToLobby,
    getActiveSession,
    applyMove,
    subscribeRoom,
    subscribePlayerView,
    subscribeGameEvents,
  };
}
