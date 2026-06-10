import { describe, expect, test } from 'bun:test';
import type { GameEvent, PlayerView } from '@pablo/engine';
import { DEFAULT_RULES } from '@pablo/engine';

import type { ClientResult } from '../types';
import { GameTickPump, type TickPumpDeps } from './realtimeTick';

function makeView(_version: number): PlayerView {
  return {
    self: 'p1',
    status: 'playing',
    deckCount: 40,
    currentPlayerId: 'p1',
    players: [],
    catalog: {},
    discardTopCardId: null,
    drawnCardId: null,
    drawnFrom: null,
    pendingPower: null,
    pabloCalledBy: null,
    rules: DEFAULT_RULES,
  };
}

function ok<T>(data: T): ClientResult<T> {
  return { ok: true, data };
}

describe('GameTickPump', () => {
  test('view callback fires before events callback', async () => {
    const order: string[] = [];
    let viewCalls = 0;
    let eventsCalls = 0;
    let version = 1;

    const deps: TickPumpDeps = {
      getPlayerView: async () => {
        await Promise.resolve();
        viewCalls += 1;
        return ok({ view: makeView(version), version });
      },
      getEventsSince: async (_gameId, since) => {
        await Promise.resolve();
        eventsCalls += 1;
        // Server only returns events newer than `since`.
        const events =
          since < version
            ? ([
                { type: 'peek_chosen', playerId: 'p1' },
              ] as const satisfies ReadonlyArray<GameEvent>)
            : ([] as const satisfies ReadonlyArray<GameEvent>);
        return ok({ events, currentVersion: version });
      },
    };

    const pump = new GameTickPump('g1', deps);
    pump.subscribeView(() => {
      order.push('view');
    });
    pump.subscribeEvents(() => {
      order.push('events');
    });

    // First sync snaps to the current version (no history replay).
    await new Promise((r) => setTimeout(r, 15));

    // A subsequent move bumps the version → the next tick emits its events.
    version = 2;
    pump.onTick();
    await new Promise((r) => setTimeout(r, 15));

    expect(viewCalls).toBeGreaterThanOrEqual(2);
    expect(eventsCalls).toBeGreaterThanOrEqual(2);
    expect(order).toContain('events');
    expect(order.indexOf('view')).toBeLessThan(order.indexOf('events'));
  });

  test('initial sync snaps to current version without replaying history', async () => {
    const emittedEvents: ReadonlyArray<GameEvent>[] = [];

    const deps: TickPumpDeps = {
      // Reconnecting into a game already at version 30.
      getPlayerView: async () => ok({ view: makeView(30), version: 30 }),
      getEventsSince: async (_gameId, since) =>
        ok({
          // The catch-up fetch would return the whole history on first sync.
          events:
            since === 0
              ? ([
                  { type: 'peek_chosen', playerId: 'p1' },
                  { type: 'peek_phase_ended' },
                ] as const satisfies ReadonlyArray<GameEvent>)
              : ([] as const satisfies ReadonlyArray<GameEvent>),
          currentVersion: 30,
        }),
    };

    const pump = new GameTickPump('g1', deps);
    pump.subscribeView(() => {});
    pump.subscribeEvents((events) => {
      emittedEvents.push(events);
    });

    pump.onTick();
    await new Promise((r) => setTimeout(r, 15));

    // No history replayed: the snap consumed version 30 silently.
    expect(emittedEvents).toHaveLength(0);
  });

  test('coalesces ticks during in-flight pump into one extra pump', async () => {
    let viewCalls = 0;
    let resolveView: (() => void) | undefined;

    const deps: TickPumpDeps = {
      getPlayerView: async () => {
        viewCalls += 1;
        await new Promise<void>((r) => {
          resolveView = r;
        });
        return ok({ view: makeView(viewCalls), version: viewCalls });
      },
      getEventsSince: async (_gameId, since) =>
        ok({ events: [], currentVersion: since === 0 ? 1 : 2 }),
    };

    const pump = new GameTickPump('g1', deps);
    pump.subscribeView(() => {});

    pump.onTick();
    pump.onTick();
    pump.onTick();

    resolveView!();
    await new Promise((r) => setTimeout(r, 30));

    expect(viewCalls).toBe(2);
  });

  test('version-skew guard re-pumps without emitting events early', async () => {
    const emittedEvents: ReadonlyArray<GameEvent>[] = [];
    let viewCalls = 0;
    let phase: 'init' | 'skew' = 'init';

    const deps: TickPumpDeps = {
      getPlayerView: async () => {
        viewCalls += 1;
        if (phase === 'init') return ok({ view: makeView(1), version: 1 });
        // In the skew phase the view starts stale (v=1) and catches up to v=2
        // only on the re-pump.
        const version = viewCalls >= 3 ? 2 : 1;
        return ok({ view: makeView(version), version });
      },
      getEventsSince: async () =>
        phase === 'init'
          ? ok({ events: [], currentVersion: 1 })
          : ok({
              events: [
                { type: 'peek_chosen', playerId: 'p1' },
              ] as const satisfies ReadonlyArray<GameEvent>,
              currentVersion: 2,
            }),
    };

    const pump = new GameTickPump('g1', deps);
    pump.subscribeView(() => {});
    pump.subscribeEvents((events) => {
      emittedEvents.push(events);
    });

    // Initial sync: snaps to version 1, emits nothing.
    await new Promise((r) => setTimeout(r, 15));
    phase = 'skew';
    pump.onTick();
    await new Promise((r) => setTimeout(r, 30));

    // Events at version 2 must wait for the view to reach version 2.
    expect(emittedEvents).toHaveLength(1);
  });

  test('advances lastSeenVersion across ticks', async () => {
    const sinceVersions: number[] = [];
    let version = 1;

    const deps: TickPumpDeps = {
      getPlayerView: async () => ok({ view: makeView(version), version }),
      getEventsSince: async (_gameId, since) => {
        sinceVersions.push(since);
        const events =
          since < version
            ? ([
                { type: 'peek_chosen', playerId: 'p1' },
              ] as const satisfies ReadonlyArray<GameEvent>)
            : ([] as const satisfies ReadonlyArray<GameEvent>);
        return ok({ events, currentVersion: version });
      },
    };

    const pump = new GameTickPump('g1', deps);
    pump.subscribeView(() => {});
    pump.subscribeEvents(() => {});

    // Initial sync at version 1, then two moves.
    await new Promise((r) => setTimeout(r, 15));
    version = 2;
    pump.onTick();
    await new Promise((r) => setTimeout(r, 15));
    version = 3;
    pump.onTick();
    await new Promise((r) => setTimeout(r, 15));

    expect(sinceVersions[0]).toBe(0);
    expect(sinceVersions.at(-1)).toBe(2);
  });
});
