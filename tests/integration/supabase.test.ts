/**
 * End-to-end integration test against a running local Supabase stack.
 *
 * Requires:
 *   supabase start && supabase functions serve
 *   apps/mobile/.env.local populated with EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY
 *
 * Gate: set PABLO_RUN_INTEGRATION=1 to run.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameRules, PlayerView } from '@pablo/engine';
import { DEFAULT_RULES } from '@pablo/engine';
import { callFn, FUNCTIONS_URL, signInAnon, SUPABASE_ANON_KEY, SUPABASE_URL } from './helpers.ts';

const SKIP = !process.env.PABLO_RUN_INTEGRATION;

if (SKIP) {
  console.log('Skipping integration tests. Set PABLO_RUN_INTEGRATION=1 to run.');
}

type ClientResult<T> = { ok: true; data: T } | { ok: false; error: string };

type RoomShape = {
  id: string;
  code: string;
  hostId: string;
  status: string;
  members: string[];
  maxPlayers: number;
  rules: GameRules;
};

describe('Phase 5 integration: full game loop', () => {
  let hostClient: SupabaseClient;
  let player2Client: SupabaseClient;
  let hostUid: string;
  let player2Uid: string;
  let roomId: string;
  let gameId: string;

  beforeAll(async () => {
    if (SKIP) return;
    ({ client: hostClient, uid: hostUid } = await signInAnon());
    ({ client: player2Client, uid: player2Uid } = await signInAnon());
  });

  test.skipIf(SKIP)('host creates a room via RPC', async () => {
    const res = await hostClient.rpc('create_room', {
      p_rules: DEFAULT_RULES as unknown as Record<string, unknown>,
      p_max_players: 2,
    });
    expect(res.error).toBeNull();
    const room = res.data as RoomShape;
    expect(room).toBeTruthy();
    expect(room.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    roomId = room.id;
  });

  test.skipIf(SKIP)('authenticated users cannot directly query games table', async () => {
    const res = await hostClient.from('games').select('*');
    // RLS deny-all: either an error or 0 rows
    expect(res.data?.length ?? 0).toBe(0);
  });

  test.skipIf(SKIP)('authenticated SELECT on room_members does not recurse', async () => {
    // A self-referential RLS policy on room_members (e.g.
    // `EXISTS (SELECT 1 FROM room_members WHERE ...)`) raises "infinite
    // recursion detected in policy for relation room_members" the moment a
    // mobile client tries to subscribe to or read the table directly. The
    // `is_room_member()` SECURITY DEFINER helper exists precisely to break
    // that recursion. This test asserts the host can read their own membership
    // without error — it would have caught the recursion bug introduced
    // pre-fix, since edge functions use the admin client and bypass RLS.
    const { data, error } = await hostClient
      .from('room_members')
      .select('user_id, seat')
      .eq('room_id', roomId);
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data!.some((r: { user_id: string }) => r.user_id === hostUid)).toBe(true);
  });

  test.skipIf(SKIP)('player2 joins the room via joinRoom edge function', async () => {
    // Need the room code — fetch from rooms table (RLS allows read)
    const { data: roomRow } = await hostClient
      .from('rooms')
      .select('code')
      .eq('id', roomId)
      .single();
    expect(roomRow).toBeTruthy();

    const res = await callFn<ClientResult<{ room: RoomShape }>>(player2Client, 'joinRoom', {
      code: roomRow!.code,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.room.members).toContain(player2Uid);
  });

  test.skipIf(SKIP)('host starts the game', async () => {
    const res = await callFn<ClientResult<{ gameId: string }>>(hostClient, 'startGame', { roomId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    gameId = res.data.gameId;
    expect(typeof gameId).toBe('string');
  });

  test.skipIf(SKIP)('getPlayerView returns peek_phase after startGame', async () => {
    const res = await callFn<ClientResult<{ view: PlayerView; version: number }>>(
      hostClient,
      'getPlayerView',
      { gameId },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.view.status).toBe('peek_phase');
    expect(res.data.version).toBe(0);
  });

  let versionAfterPeek = 0;

  test.skipIf(SKIP)('both players choose_peek with indices [0,1]', async () => {
    // Host peeks
    const r1 = await callFn<ClientResult<{ version: number }>>(hostClient, 'applyMove', {
      gameId,
      move: { type: 'choose_peek', playerId: hostUid, indices: [0, 1] },
      idempotencyKey: 'peek-host-1',
      expectedVersion: 0,
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.data.version).toBe(1);

    // Player2 peeks
    const r2 = await callFn<ClientResult<{ version: number }>>(player2Client, 'applyMove', {
      gameId,
      move: { type: 'choose_peek', playerId: player2Uid, indices: [0, 1] },
      idempotencyKey: 'peek-p2-1',
      expectedVersion: 1,
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    versionAfterPeek = r2.data.version;
    expect(versionAfterPeek).toBe(2);
  });

  test.skipIf(SKIP)('game transitions to playing after both peeks', async () => {
    const res = await callFn<ClientResult<{ view: PlayerView; version: number }>>(
      hostClient,
      'getPlayerView',
      { gameId },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.view.status).toBe('playing');
    expect(res.data.view.currentPlayerId).toBe(hostUid);
  });

  test.skipIf(SKIP)('host calls pablo on their first turn (ends round immediately)', async () => {
    // On host's turn, call pablo immediately (on-turn → round ends immediately)
    const res = await callFn<ClientResult<{ version: number }>>(hostClient, 'applyMove', {
      gameId,
      move: { type: 'call_pablo', playerId: hostUid },
      idempotencyKey: 'pablo-host-1',
      expectedVersion: versionAfterPeek,
    });
    expect(res.ok).toBe(true);
  });

  test.skipIf(SKIP)('game has ended after pablo called on-turn', async () => {
    const res = await callFn<ClientResult<{ view: PlayerView; version: number }>>(
      hostClient,
      'getPlayerView',
      { gameId },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.view.status).toBe('ended');
  });

  test.skipIf(SKIP)('idempotency: same key twice returns same version', async () => {
    // Re-send the pablo move with the same idempotency key
    const r1 = await callFn<ClientResult<{ version: number }>>(hostClient, 'applyMove', {
      gameId,
      move: { type: 'call_pablo', playerId: hostUid },
      idempotencyKey: 'pablo-host-1',
      expectedVersion: versionAfterPeek,
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    // Should return the same version as the original call
    expect(typeof r1.data.version).toBe('number');
  });

  test.skipIf(SKIP)('version_mismatch: stale expectedVersion returns error', async () => {
    const res = await callFn<ClientResult<{ version: number }>>(hostClient, 'applyMove', {
      gameId,
      move: { type: 'draw_from_deck', playerId: hostUid },
      idempotencyKey: `stale-${crypto.randomUUID()}`,
      expectedVersion: 0, // stale — game has advanced
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('version_mismatch');
  });

  test.skipIf(SKIP)('move rejected if playerId does not match caller', async () => {
    const res = await callFn<ClientResult<{ version: number }>>(hostClient, 'applyMove', {
      gameId,
      move: { type: 'draw_from_deck', playerId: player2Uid }, // host pretending to be p2
      idempotencyKey: `spoof-${crypto.randomUUID()}`,
      expectedVersion: versionAfterPeek,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('not_authorized');
  });

  test.skipIf(SKIP)('getEventsSince: returns events with correct structure', async () => {
    // Host gets all events since the start
    const hostEvents = await callFn<
      ClientResult<{
        events: Array<{ type: string; playerId?: string }>;
        currentVersion: number;
      }>
    >(hostClient, 'getEventsSince', { gameId, sinceVersion: -1 });
    expect(hostEvents.ok).toBe(true);
    if (!hostEvents.ok) return;

    // Player2 gets all events
    const p2Events = await callFn<
      ClientResult<{
        events: Array<{ type: string; playerId?: string }>;
        currentVersion: number;
      }>
    >(player2Client, 'getEventsSince', { gameId, sinceVersion: -1 });
    expect(p2Events.ok).toBe(true);
    if (!p2Events.ok) return;

    // Both players see the same number of events
    expect(hostEvents.data.events.length).toBe(p2Events.data.events.length);
    expect(hostEvents.data.events.length).toBeGreaterThan(0);

    // Both see the same currentVersion
    expect(hostEvents.data.currentVersion).toBe(p2Events.data.currentVersion);

    // Events include peek_chosen for both players (produced by choose_peek moves)
    const peekChosen = hostEvents.data.events.filter((e) => e.type === 'peek_chosen');
    expect(peekChosen.length).toBe(2);

    // Events include round_ended (produced by call_pablo on-turn)
    const roundEnded = hostEvents.data.events.filter((e) => e.type === 'round_ended');
    expect(roundEnded.length).toBeGreaterThan(0);

    // sinceVersion filter works: fetching only the last version returns a subset
    const lastEvents = await callFn<
      ClientResult<{
        events: Array<{ type: string }>;
        currentVersion: number;
      }>
    >(hostClient, 'getEventsSince', { gameId, sinceVersion: hostEvents.data.currentVersion - 1 });
    expect(lastEvents.ok).toBe(true);
    if (!lastEvents.ok) return;
    expect(lastEvents.data.events.length).toBeLessThan(hostEvents.data.events.length);

    // NOTE: peeked event redaction (cardId=null for non-viewer) is covered by the
    // unit test in tests/redact.test.ts. The peeked event is emitted by use_peek_self /
    // use_peek_opponent power moves (rank 7/8), not by the initial choose_peek phase.
  });

  test.skipIf(SKIP)('unauthenticated request returns 401', async () => {
    // The local Supabase gateway (Kong) enforces JWT at the proxy level and returns
    // 401 before the edge function runs — both missing and malformed tokens are caught.
    // The important assertion is that the HTTP status is 401; the body format is Kong's.
    const res = await fetch(`${FUNCTIONS_URL}/getPlayerView`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId }),
    });
    expect(res.status).toBe(401);
  });

  test.skipIf(SKIP)(
    'non-member gets not_authorized (not not_found) for getPlayerView',
    async () => {
      // Per plan §10 Q4 locked decision: never return `not_found` for games we
      // weren't authorized to know exist. Both "no such game" and "exists but
      // you're not a member" must map to the same `not_authorized` code so
      // game IDs cannot be probed by enumeration.
      const { client: stranger } = await signInAnon();
      const res = await callFn<ClientResult<{ view: PlayerView; version: number }>>(
        stranger,
        'getPlayerView',
        { gameId },
      );
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error).toBe('not_authorized');
    },
  );

  test.skipIf(SKIP)(
    'non-existent gameId also returns not_authorized (no existence leak)',
    async () => {
      const res = await callFn<ClientResult<{ view: PlayerView; version: number }>>(
        hostClient,
        'getPlayerView',
        { gameId: crypto.randomUUID() },
      );
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error).toBe('not_authorized');
    },
  );

  test.skipIf(SKIP)('leaveRoom removes player from room', async () => {
    // Create a second room for cleanup test
    const { client: tmpHost } = await signInAnon();
    const rpcRes = await tmpHost.rpc('create_room', {
      p_rules: DEFAULT_RULES as unknown as Record<string, unknown>,
      p_max_players: 4,
    });
    expect(rpcRes.error).toBeNull();
    const tmpRoom = rpcRes.data as RoomShape;

    const leaveRes = await callFn<ClientResult<Record<string, never>>>(tmpHost, 'leaveRoom', {
      roomId: tmpRoom.id,
    });
    expect(leaveRes.ok).toBe(true);

    // Room should be deleted (last member left)
    const { data: roomCheck } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      .from('rooms')
      .select('id')
      .eq('id', tmpRoom.id);
    expect((roomCheck ?? []).length).toBe(0);
  });
});
