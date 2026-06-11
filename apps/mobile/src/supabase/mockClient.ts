/**
 * mockClient — full PabloClient implementation backed by @pablo/engine.
 *
 * All state lives in the closure (module-local). Tests spin up isolated
 * instances by calling createMockClient() with different options.
 *
 * Phase 6 swaps the import in apps/mobile/src/supabase/index.ts from
 * `./mockClient` to `./realClient`.
 */

import {
  type GameEvent,
  type GameRules,
  type PlayerId,
  type PlayerView,
  DEFAULT_RULES,
  applyMove,
  computePlayerView,
  makeRng,
  newGame,
} from '@pablo/engine';

import type { PabloClient } from './types';
import type {
  ActiveSession,
  ClientErrorCode,
  ClientResult,
  GameId,
  Room,
  RoomId,
  Unsubscribe,
} from './types';
import { defaultClock, defaultScheduler, type Clock, type Scheduler } from './internal/clock';
import { BOT_IDS, generateRoomCode, isBotId, makeRoom } from './internal/room';
import { applyAndFanout, makeGameRecord, type GameRecord } from './internal/viewStore';
import { makeBotRngs, makeBotScheduler, type BotRngs } from './internal/botScheduler';

// ─────────────────────────────────────────────────────────────────────────────
// Public extension: bot helpers exposed only through MockClient (not PabloClient)
// ─────────────────────────────────────────────────────────────────────────────

export type MockClient = PabloClient & {
  /**
   * Attach N bots to an existing room before starting. NOT on PabloClient —
   * Phase 6 rooms are joined by humans; bots are a single-player-mode concept.
   */
  readonly addBotsToRoom: (opts: {
    roomId: RoomId;
    count: 1 | 2 | 3;
  }) => Promise<ClientResult<Room>>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────────────────────────────────────

export type MockClientOptions = {
  /** Returns a new unique string each call. Default: a counter-based string. */
  readonly seedSource?: () => string;
  /** Injected clock. Default: Date.now(). */
  readonly clock?: Clock;
  /** Injected scheduler. Default: global setTimeout. */
  readonly scheduler?: Scheduler;
  /** Id used for the local human player. Default: 'human'. */
  readonly localPlayerId?: PlayerId;
};

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createMockClient(opts: MockClientOptions = {}): MockClient {
  const localPlayerId: PlayerId = opts.localPlayerId ?? 'human';
  const clock = opts.clock ?? defaultClock;
  const scheduler = opts.scheduler ?? defaultScheduler;

  // Per-client RNG for room codes and game seeds (not in-game randomness).
  let seedCounter = 0;
  const baseSeedFn = opts.seedSource ?? (() => `mock:${clock.now()}:${seedCounter++}`);
  const clientRng = makeRng(baseSeedFn());

  const rooms = new Map<RoomId, Room>();
  const roomSubs = new Map<RoomId, Set<(r: Room) => void>>();
  let activeSession: ActiveSession | null = null;

  // Per-game state: record + per-bot RNGs
  const games = new Map<GameId, { record: GameRecord; rngs: BotRngs }>();

  const botScheduler = makeBotScheduler(scheduler);

  let gameCounter = 0;
  let roomCounter = 0;

  function nextGameId(): GameId {
    return `game:${gameCounter++}`;
  }
  function nextRoomId(): RoomId {
    return `room:${roomCounter++}`;
  }

  function notifyRoom(room: Room): void {
    const subs = roomSubs.get(room.id);
    if (!subs) return;
    for (const cb of subs) cb(room);
  }

  function ok<T>(data: T): ClientResult<T> {
    return { ok: true, data };
  }
  function fail(error: ClientErrorCode): ClientResult<never> {
    return { ok: false, error };
  }

  // ── signIn ────────────────────────────────────────────────────────────────

  async function signIn(): Promise<ClientResult<PlayerId>> {
    return ok(localPlayerId);
  }

  // ── createRoom ────────────────────────────────────────────────────────────

  async function createRoom(opts: {
    rules?: Partial<GameRules>;
    maxPlayers?: number;
  }): Promise<ClientResult<Room>> {
    const id = nextRoomId();
    const code = generateRoomCode(clientRng);
    const rules: GameRules = { ...DEFAULT_RULES, ...opts.rules };
    const room = makeRoom({
      id,
      code,
      hostId: localPlayerId,
      rules,
      maxPlayers: opts.maxPlayers ?? 4,
    });
    rooms.set(id, room);
    return ok(room);
  }

  // ── addBotsToRoom ─────────────────────────────────────────────────────────

  async function addBotsToRoom(opts: {
    roomId: RoomId;
    count: 1 | 2 | 3;
  }): Promise<ClientResult<Room>> {
    const room = rooms.get(opts.roomId);
    if (!room) return fail('not_found');
    const botSlice = BOT_IDS.slice(0, opts.count) as PlayerId[];
    const members = [...room.members, ...botSlice];
    const updated: Room = { ...room, members };
    rooms.set(opts.roomId, updated);
    notifyRoom(updated);
    return ok(updated);
  }

  // ── joinRoom ─────────────────────────────────────────────────────────────

  async function joinRoom(opts: { code: string }): Promise<ClientResult<Room>> {
    for (const room of rooms.values()) {
      if (room.code === opts.code) return ok(room);
    }
    return fail('not_found');
  }

  // ── leaveRoom ─────────────────────────────────────────────────────────────

  async function leaveRoom(opts: { roomId: RoomId }): Promise<ClientResult<void>> {
    const room = rooms.get(opts.roomId);
    if (!room) return fail('not_found');
    // Cancel pending bot moves for THIS room's game only — other rooms'
    // games keep their schedulers running.
    if (room.currentGameId) {
      const entry = games.get(room.currentGameId);
      if (entry) botScheduler.cancelAll(entry.record);
    }
    rooms.delete(opts.roomId);
    if (activeSession?.roomId === opts.roomId) {
      activeSession = null;
    }
    return ok(undefined);
  }

  // ── startGame ─────────────────────────────────────────────────────────────

  async function startGame(opts: { roomId: RoomId }): Promise<ClientResult<GameId>> {
    const room = rooms.get(opts.roomId);
    if (!room) return fail('not_found');

    const gameId = nextGameId();
    const seed = `${baseSeedFn()}:game:${gameId}`;
    const initialState = newGame({
      id: gameId,
      players: room.members,
      seed,
      rules: room.rules,
    });

    const record = makeGameRecord(initialState);
    const rngs = makeBotRngs(initialState);
    games.set(gameId, { record, rngs });

    // Update room status
    const updatedRoom: Room = { ...room, status: 'playing', currentGameId: gameId };
    rooms.set(opts.roomId, updatedRoom);
    notifyRoom(updatedRoom);
    if (!room.members.some(isBotId)) {
      activeSession = { roomId: opts.roomId, gameId, mode: 'online' };
    }

    // Kick the bot scheduler (bots peek immediately).
    botScheduler.kick(record, rngs);

    return ok(gameId);
  }

  // ── returnToLobby ─────────────────────────────────────────────────────────

  async function returnToLobby(opts: { roomId: RoomId }): Promise<ClientResult<void>> {
    const room = rooms.get(opts.roomId);
    if (!room) return fail('not_found');
    if (room.hostId !== localPlayerId) return fail('not_authorized');
    const updated: Room = { ...room, status: 'waiting', currentGameId: null };
    rooms.set(opts.roomId, updated);
    notifyRoom(updated);
    activeSession = null;
    return ok(undefined);
  }

  // ── getActiveSession ────────────────────────────────────────────────────────

  async function getActiveSession(): Promise<ClientResult<ActiveSession | null>> {
    if (!activeSession) return ok(null);
    const entry = games.get(activeSession.gameId);
    if (!entry) {
      activeSession = null;
      return ok(null);
    }
    if (entry.record.state.status === 'ended') {
      activeSession = null;
      return ok(null);
    }
    return ok(activeSession);
  }

  // ── applyMove ─────────────────────────────────────────────────────────────

  async function applyMoveClient(opts: {
    gameId: GameId;
    move: Parameters<PabloClient['applyMove']>[0]['move'];
    idempotencyKey: string;
    expectedVersion: number;
  }): Promise<ClientResult<{ version: number }>> {
    const entry = games.get(opts.gameId);
    if (!entry) return fail('not_found');
    const { record, rngs } = entry;

    // Idempotency: re-submit returns cached result.
    const cached = record.idempotency.get(opts.idempotencyKey);
    if (cached !== undefined) return ok({ version: cached });

    // Version check.
    if (opts.expectedVersion !== record.version) return fail('version_mismatch');

    const result = applyMove(record.state, opts.move);
    if (!result.ok) return fail(result.error);

    record.idempotency.set(opts.idempotencyKey, record.version + 1);
    applyAndFanout(record, result.state, result.events);

    // Kick bots after every human move.
    botScheduler.kick(record, rngs);

    return ok({ version: record.version });
  }

  // ── subscribeRoom ─────────────────────────────────────────────────────────

  function subscribeRoom(roomId: RoomId, onChange: (room: Room) => void): Unsubscribe {
    let subs = roomSubs.get(roomId);
    if (!subs) {
      subs = new Set();
      roomSubs.set(roomId, subs);
    }
    subs.add(onChange);
    const current = rooms.get(roomId);
    if (current) onChange(current);
    const localSubs = subs;
    return () => {
      localSubs.delete(onChange);
    };
  }

  // ── subscribePlayerView ───────────────────────────────────────────────────

  function subscribePlayerView(
    gameId: GameId,
    onChange: (view: PlayerView, version: number) => void,
  ): Unsubscribe {
    const entry = games.get(gameId);
    if (!entry) return () => {};
    const { record } = entry;
    let subs = record.viewSubs.get(localPlayerId);
    if (!subs) {
      subs = new Set();
      record.viewSubs.set(localPlayerId, subs);
    }
    subs.add(onChange);
    const localSubs = subs;
    // Fire immediately with current state and current version.
    onChange(computePlayerView(record.state, localPlayerId), record.version);
    return () => {
      localSubs.delete(onChange);
    };
  }

  // ── subscribeGameEvents ───────────────────────────────────────────────────

  function subscribeGameEvents(
    gameId: GameId,
    onChange: (events: ReadonlyArray<GameEvent>) => void,
  ): Unsubscribe {
    const entry = games.get(gameId);
    if (!entry) return () => {};
    const { record } = entry;
    record.eventSubs.add(onChange);
    return () => record.eventSubs.delete(onChange);
  }

  return {
    signIn,
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    returnToLobby,
    getActiveSession,
    applyMove: applyMoveClient,
    subscribeRoom,
    subscribePlayerView,
    subscribeGameEvents,
    addBotsToRoom,
  };
}
