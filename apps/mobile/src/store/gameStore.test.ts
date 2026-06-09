import { afterEach, describe, expect, test } from 'bun:test';
import { DEFAULT_RULES, applyMove, computePlayerView, legalMoves, newGame } from '@pablo/engine';

import { createGameStore } from './gameStore';

const HUMAN = 'human';
const BOT = 'bot:1';

function advanceToPlaying() {
  let state = newGame({
    id: 'g1',
    players: [HUMAN, BOT],
    seed: 'latch-test',
    rules: DEFAULT_RULES,
  });
  for (const p of state.players) {
    const peek = legalMoves(state, p).find((m) => m.type === 'choose_peek');
    if (peek) {
      const r = applyMove(state, peek);
      if (r.ok) state = r.state;
    }
  }
  return state;
}

function makePlayingViews() {
  const base = advanceToPlaying();
  const v0 = computePlayerView(base, HUMAN);
  const trimmed = {
    ...base,
    hands: { ...base.hands, [HUMAN]: base.hands[HUMAN]!.slice(0, 3) },
  };
  const v1 = computePlayerView(trimmed, HUMAN);
  return { v0, v1 };
}

function flushDisplaySync(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

describe('displayView latch', () => {
  const stores: ReturnType<typeof createGameStore>[] = [];

  afterEach(() => {
    for (const store of stores) {
      store.getState().disposeFlightTimers();
    }
    stores.length = 0;
  });

  function openStore() {
    const store = createGameStore();
    stores.push(store);
    return store;
  }

  test('receiveView while a batch is active does not change displayView', async () => {
    const store = openStore();
    const { v0, v1 } = makePlayingViews();

    store.getState().receiveView(v0, 1);
    await flushDisplaySync();
    expect(store.getState().displayView).toBe(v0);

    store.setState({
      animQueue: { pending: [[]] },
      flightQueue: { activeBatchId: 'batch-1', flights: [], cues: [] },
    });

    store.getState().receiveView(v1, 2);
    await flushDisplaySync();

    expect(store.getState().view).toBe(v1);
    expect(store.getState().displayView).toBe(v0);
  });

  test('after batch completion displayView equals the latest view', () => {
    const store = openStore();
    const { v0, v1 } = makePlayingViews();

    store.getState().receiveView(v0, 1);
    store.setState({
      view: v1,
      version: 2,
      displayView: v0,
      displayVersion: 1,
      flightQueue: { activeBatchId: 'batch-1', flights: [], cues: [] },
      animQueue: { pending: [[]] },
    });

    store.setState({
      displayView: v1,
      displayVersion: 2,
    });
    store.getState().dequeueEvents();

    expect(store.getState().displayView).toBe(v1);
    expect(store.getState().displayVersion).toBe(2);
  });

  test('multiple view updates during a batch stay pinned until completion', async () => {
    const store = openStore();
    const { v0, v1 } = makePlayingViews();
    const base = advanceToPlaying();
    const v2 = computePlayerView(
      {
        ...base,
        hands: { ...base.hands, [HUMAN]: base.hands[HUMAN]!.slice(0, 2) },
      },
      HUMAN,
    );

    store.getState().receiveView(v0, 1);
    await flushDisplaySync();

    store.setState({
      animQueue: { pending: [[]] },
      flightQueue: { activeBatchId: 'batch-1', flights: [], cues: [] },
    });

    store.getState().receiveView(v1, 2);
    store.getState().receiveView(v2, 3);
    await flushDisplaySync();

    expect(store.getState().displayView).toBe(v0);
    expect(store.getState().view).toBe(v2);

    store.setState({ displayView: v2, displayVersion: 3 });
    store.getState().dequeueEvents();

    expect(store.getState().displayView).toBe(v2);
  });

  test('dequeueEvents watchdog syncs display when choreography is idle', () => {
    const store = openStore();
    const { v0, v1 } = makePlayingViews();

    store.setState({
      view: v1,
      version: 2,
      displayView: v0,
      displayVersion: 1,
      animQueue: { pending: [] },
      flightQueue: { activeBatchId: null, flights: [], cues: [] },
    });

    store.getState().dequeueEvents();
    expect(store.getState().displayView).toBe(v1);
  });
});
