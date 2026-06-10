/**
 * Phase 6 integration: two real PabloClient instances against local Supabase.
 *
 * Gate: PABLO_RUN_INTEGRATION=1
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import type { PlayerView } from '@pablo/engine';
import { DEFAULT_RULES } from '@pablo/engine';
import { createRealClient } from '../../apps/mobile/src/supabase/realClient';
import type { PabloClient, Room } from '../../apps/mobile/src/supabase/types';
import { signInAnon } from './helpers.ts';

const SKIP = !process.env.PABLO_RUN_INTEGRATION;

if (SKIP) {
  console.log('Skipping multiplayer integration tests. Set PABLO_RUN_INTEGRATION=1 to run.');
}

describe('Phase 6 integration: realClient multiplayer', () => {
  let host: PabloClient;
  let guest: PabloClient;
  let hostUid: string;
  let guestUid: string;
  let roomId: string;
  let gameId: string;

  beforeAll(async () => {
    if (SKIP) return;
    const hostSession = await signInAnon();
    const guestSession = await signInAnon();
    hostUid = hostSession.uid;
    guestUid = guestSession.uid;
    host = createRealClient({ supabase: hostSession.client });
    guest = createRealClient({ supabase: guestSession.client });
  });

  test.skipIf(SKIP)('host creates room and guest joins', async () => {
    const created = await host.createRoom({
      maxPlayers: 2,
      rules: DEFAULT_RULES,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    roomId = created.data.id;

    const joined = await guest.joinRoom({ code: created.data.code });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(joined.data.members).toContain(guestUid);
  });

  test.skipIf(SKIP)('guest discovers gameId via subscribeRoom currentGameId', async () => {
    const started = await host.startGame({ roomId });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    gameId = started.data;

    const roomFromGuest = await new Promise<Room>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('subscribeRoom timeout')), 8000);
      const unsub = guest.subscribeRoom(roomId, (room) => {
        if (room.currentGameId) {
          clearTimeout(timeout);
          unsub();
          resolve(room);
        }
      });
    });

    expect(roomFromGuest.currentGameId).toBe(gameId);
  });

  test.skipIf(SKIP)('both clients receive player views', async () => {
    const hostView = await new Promise<PlayerView>((resolve) => {
      const unsub = host.subscribePlayerView(gameId, (v) => {
        unsub();
        resolve(v);
      });
    });

    const guestView = await new Promise<PlayerView>((resolve) => {
      const unsub = guest.subscribePlayerView(gameId, (v) => {
        unsub();
        resolve(v);
      });
    });

    expect(hostView.self).toBe(hostUid);
    expect(guestView.self).toBe(guestUid);
    expect(hostView.status).toBe('peek_phase');
  });

  test.skipIf(SKIP)('getActiveSession reconnects guest', async () => {
    const session = await guest.getActiveSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    expect(session.data).toEqual({ roomId, gameId, mode: 'online' });
  });

  test.skipIf(SKIP)('idempotent applyMove returns same version', async () => {
    const version = await new Promise<number>((resolve) => {
      const unsub = host.subscribePlayerView(gameId, (_view, ver) => {
        unsub();
        resolve(ver);
      });
    });

    const move = {
      type: 'choose_peek' as const,
      playerId: hostUid,
      indices: [0, 1],
    };
    const key = `test-idem-${gameId}`;

    const first = await host.applyMove({
      gameId,
      move,
      idempotencyKey: key,
      expectedVersion: version,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await host.applyMove({
      gameId,
      move,
      idempotencyKey: key,
      expectedVersion: version,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.version).toBe(first.data.version);
  });
});
