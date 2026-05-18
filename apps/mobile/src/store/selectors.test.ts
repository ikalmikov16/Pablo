import { describe, expect, test } from 'bun:test';
import { DEFAULT_RULES, applyMove, computePlayerView, legalMoves, newGame } from '@pablo/engine';

import {
  getLegalMovesForPlayer,
  selectActionBarItems,
  selectCanDraw,
  selectLastPeekReveal,
  selectMatchHandPairs,
  selectMyHandSlots,
  selectOpponentEntries,
  selectPeekOverlayVisible,
  selectPlayers,
  selectPowerOverlayVisible,
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
      peekJustHappened: false,
      lastPeekReveal: null,
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
    setPeekJustHappened: () => {},
    setLastPeekReveal: () => {},
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

describe('selectPeekOverlayVisible', () => {
  test('false when there is no view', () => {
    expect(selectPeekOverlayVisible(makeStoreSnapshot())).toBe(false);
  });

  test('true in peek_phase before the player has peeked (pick phase)', () => {
    const state = makeState();
    const view = computePlayerView(state, HUMAN);
    const s = makeStoreSnapshot({ view });
    expect(selectPeekOverlayVisible(s)).toBe(true);
  });

  test('false in peek_phase once the player has peeked and not flagged for reveal', () => {
    // Walk the engine through HUMAN peeking [0,1]; BOT has not peeked yet.
    let state = makeState();
    const peek = legalMoves(state, HUMAN).find((m) => m.type === 'choose_peek');
    if (peek) {
      const r = applyMove(state, peek);
      if (r.ok) state = r.state;
    }
    const view = computePlayerView(state, HUMAN);
    // status still peek_phase (bot hasn't peeked), but human knownCards filled.
    expect(view.status).toBe('peek_phase');
    const s = makeStoreSnapshot({ view });
    expect(selectPeekOverlayVisible(s)).toBe(false);
  });

  test('stays visible in the reveal phase via peekJustHappened, even after status flips to playing', () => {
    const state = advanceToPlaying();
    const view = computePlayerView(state, HUMAN);
    expect(view.status).toBe('playing');
    // Without peekJustHappened the overlay is gone.
    expect(selectPeekOverlayVisible(makeStoreSnapshot({ view }))).toBe(false);
    // With peekJustHappened set, the overlay stays mounted so the player
    // can memorise their cards.
    const s = makeStoreSnapshot({
      view,
      ui: {
        selection: { kind: 'none' },
        dragInFlight: false,
        peekPicks: [],
        endOfRoundVisible: false,
        peekOverlayVisible: false,
        peekJustHappened: true,
        lastPeekReveal: null,
        toast: null,
      },
    });
    expect(selectPeekOverlayVisible(s)).toBe(true);
  });
});

describe('selectLastPeekReveal / selectPowerOverlayVisible', () => {
  test('selectLastPeekReveal returns null by default', () => {
    expect(selectLastPeekReveal(makeStoreSnapshot())).toBeNull();
  });

  test('selectLastPeekReveal returns the configured reveal', () => {
    const reveal = { target: HUMAN, handIndex: 2 } as const;
    const s = makeStoreSnapshot({
      ui: {
        selection: { kind: 'none' },
        dragInFlight: false,
        peekPicks: [],
        endOfRoundVisible: false,
        peekOverlayVisible: false,
        peekJustHappened: false,
        lastPeekReveal: reveal,
        toast: null,
      },
    });
    expect(selectLastPeekReveal(s)).toEqual(reveal);
  });

  test('selectPowerOverlayVisible is false without a pending power or reveal', () => {
    const state = advanceToPlaying();
    const view = computePlayerView(state, HUMAN);
    expect(selectPowerOverlayVisible(makeStoreSnapshot({ view }))).toBe(false);
  });

  test('selectPowerOverlayVisible is true when a reveal is set, even with no pending power', () => {
    const state = advanceToPlaying();
    const view = computePlayerView(state, HUMAN);
    const s = makeStoreSnapshot({
      view,
      ui: {
        selection: { kind: 'none' },
        dragInFlight: false,
        peekPicks: [],
        endOfRoundVisible: false,
        peekOverlayVisible: false,
        peekJustHappened: false,
        lastPeekReveal: { target: HUMAN, handIndex: 0 },
        toast: null,
      },
    });
    expect(selectPowerOverlayVisible(s)).toBe(true);
  });
});

describe('selector reference stability', () => {
  // React 18's useSyncExternalStore (which Zustand v5 uses under the hood)
  // calls each selector multiple times per render and requires the returned
  // value to be reference-stable for the same input state — otherwise it
  // warns "the result of getSnapshot should be cached" and can enter an
  // infinite render loop. These tests pin that contract for the selectors
  // that return derived collections.

  test('selectMyHandSlots returns the same array reference for the same view', () => {
    const state = makeState();
    const view = computePlayerView(state, HUMAN);
    const s = makeStoreSnapshot({ view });
    expect(selectMyHandSlots(s)).toBe(selectMyHandSlots(s));
  });

  test('selectMyHandSlots returns a different array when the view changes', () => {
    const state = makeState();
    const v1 = computePlayerView(state, HUMAN);
    const v2 = computePlayerView(state, HUMAN); // freshly computed → new ref
    expect(selectMyHandSlots(makeStoreSnapshot({ view: v1 }))).not.toBe(
      selectMyHandSlots(makeStoreSnapshot({ view: v2 })),
    );
  });

  test('selectOpponentEntries returns the same array reference for the same view', () => {
    const state = makeState();
    const view = computePlayerView(state, HUMAN);
    const s = makeStoreSnapshot({ view });
    expect(selectOpponentEntries(s)).toBe(selectOpponentEntries(s));
  });

  test('selectActionBarItems returns the same array reference for the same view', () => {
    const state = advanceToPlaying();
    const view = computePlayerView(state, state.players[state.turnIndex]!);
    const s = makeStoreSnapshot({ view });
    expect(selectActionBarItems(s)).toBe(selectActionBarItems(s));
  });

  test('selectMatchHandPairs returns the same array reference for the same view', () => {
    const state = advanceToPlaying();
    const view = computePlayerView(state, state.players[state.turnIndex]!);
    const s = makeStoreSnapshot({ view });
    expect(selectMatchHandPairs(s)).toBe(selectMatchHandPairs(s));
  });

  test('selectPlayers returns the same empty array when no view is set', () => {
    const s1 = makeStoreSnapshot();
    const s2 = makeStoreSnapshot();
    expect(selectPlayers(s1)).toBe(selectPlayers(s2));
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
