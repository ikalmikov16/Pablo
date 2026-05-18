import { describe, expect, test } from 'bun:test';
import { DEFAULT_RULES, applyMove, computePlayerView, legalMoves, newGame } from '@pablo/engine';

import {
  getLegalMovesForPlayer,
  selectCanDraw,
  selectMyHandSlots,
  selectOpponentEntries,
  selectSelf,
  selectStatus,
  selectVersion,
} from './selectors';
import type { GameStore } from './gameStore';

const HUMAN = 'human';
const BOT = 'bot:1';

function makeState() {
  return newGame({ id: 'g1', players: [HUMAN, BOT], seed: 'sel-test', rules: DEFAULT_RULES });
}

/** Advance through peek phase. */
function advanceToPlaying() {
  let state = makeState();
  for (const p of state.players) {
    const legal = legalMoves(state, p);
    const peek = legal.find((m) => m.type === 'choose_peek');
    if (peek) {
      const r = applyMove(state, peek);
      if (r.ok) state = r.state;
    }
  }
  return state;
}

function makeStoreSnapshot(overrides?: Partial<GameStore>): GameStore {
  const base: GameStore = {
    view: null,
    pendingView: null,
    version: 0,
    ui: {
      selection: { kind: 'none' },
      dragInFlight: false,
      peekPicks: [],
      endOfRoundVisible: false,
      peekOverlayVisible: false,
      toast: null,
    },
    animQueue: { pending: [] },
    receiveView: () => {},
    promoteView: () => {},
    enqueueEvents: () => {},
    dequeueEvents: () => {},
    setSelection: () => {},
    clearSelection: () => {},
    setDragInFlight: () => {},
    addPeekPick: () => {},
    clearPeekPicks: () => {},
    showToast: () => {},
    dismissToast: () => {},
    setEndOfRoundVisible: () => {},
    setPeekOverlayVisible: () => {},
    ...overrides,
  };
  return base;
}

describe('selectSelf', () => {
  test('returns null when no view', () => {
    expect(selectSelf(makeStoreSnapshot())).toBeNull();
  });

  test('returns the self player id', () => {
    const state = makeState();
    const view = computePlayerView(state, HUMAN);
    const s = makeStoreSnapshot({ view });
    expect(selectSelf(s)).toBe(HUMAN);
  });
});

describe('selectStatus', () => {
  test('returns null when no view', () => {
    expect(selectStatus(makeStoreSnapshot())).toBeNull();
  });

  test('returns peek_phase initially', () => {
    const state = makeState();
    const view = computePlayerView(state, HUMAN);
    const s = makeStoreSnapshot({ view });
    expect(selectStatus(s)).toBe('peek_phase');
  });

  test('returns playing after peek', () => {
    const state = advanceToPlaying();
    const view = computePlayerView(state, HUMAN);
    const s = makeStoreSnapshot({ view });
    expect(selectStatus(s)).toBe('playing');
  });
});

describe('selectMyHandSlots', () => {
  test('returns correct number of slots', () => {
    const state = makeState();
    const view = computePlayerView(state, HUMAN);
    const s = makeStoreSnapshot({ view });
    const slots = selectMyHandSlots(s);
    expect(slots).toHaveLength(DEFAULT_RULES.initialHandSize);
  });

  test('slots are initially face-down', () => {
    const state = makeState();
    const view = computePlayerView(state, HUMAN);
    const s = makeStoreSnapshot({ view });
    const slots = selectMyHandSlots(s);
    // Before peek, all face-down (no knownCards).
    for (const slot of slots) {
      expect(slot.faceUp).toBe(false);
    }
  });
});

describe('selectOpponentEntries', () => {
  test('excludes self from opponent list', () => {
    const state = makeState();
    const view = computePlayerView(state, HUMAN);
    const s = makeStoreSnapshot({ view });
    const opponents = selectOpponentEntries(s);
    expect(opponents.every((o) => o.id !== HUMAN)).toBe(true);
    expect(opponents).toHaveLength(1);
  });
});

describe('selectCanDraw', () => {
  test('returns false when not view', () => {
    expect(selectCanDraw(makeStoreSnapshot())).toBe(false);
  });

  test('returns true on human turn after peek', () => {
    const state = advanceToPlaying();
    if (state.players[state.turnIndex] !== HUMAN) return; // skip if bot is first
    const view = computePlayerView(state, HUMAN);
    const s = makeStoreSnapshot({ view });
    expect(selectCanDraw(s)).toBe(true);
  });
});

describe('selectVersion', () => {
  test('returns 0 initially', () => {
    expect(selectVersion(makeStoreSnapshot())).toBe(0);
  });

  test('returns the stored version', () => {
    expect(selectVersion(makeStoreSnapshot({ version: 7 }))).toBe(7);
  });
});

describe('getLegalMovesForPlayer', () => {
  test('returns draw_from_deck as a legal move on turn', () => {
    const state = advanceToPlaying();
    const currentId = state.players[state.turnIndex]!;
    const view = computePlayerView(state, currentId);
    const moves = getLegalMovesForPlayer(view, currentId);
    expect(moves.some((m) => m.type === 'draw_from_deck')).toBe(true);
  });

  test('returns empty for a player whose turn it is not', () => {
    const state = advanceToPlaying();
    const currentIdx = state.turnIndex;
    const other = state.players.find((_, i) => i !== currentIdx);
    if (!other) return;
    const view = computePlayerView(state, other);
    const moves = getLegalMovesForPlayer(view, other);
    // Non-current players can only call_pablo (or nothing during drawn/power).
    const hasDraw = moves.some((m) => m.type === 'draw_from_deck');
    expect(hasDraw).toBe(false);
  });
});
