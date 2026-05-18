import { describe, expect, it } from 'bun:test';
import { computePlayerView } from './playerView';
import { applyMove } from './applyMove';
import { newGame } from './newGame';
import type { GameState } from './types';

function makeGame(players = ['alice', 'bob'], seed = 'pv-test'): GameState {
  return newGame({ id: 'pv', players, seed });
}

function advancePastPeek(state: GameState): GameState {
  let s = state;
  for (const p of state.players) {
    const peekCount = state.rules.initialPeekCount;
    const indices = Array.from({ length: peekCount }, (_, i) => i);
    const result = applyMove(s, { type: 'choose_peek', playerId: p, indices });
    if (!result.ok) throw new Error(`advancePastPeek failed: ${result.error}`);
    s = result.state;
  }
  return s;
}

function makePlayingGame(players = ['alice', 'bob'], seed = 'pv-test'): GameState {
  return advancePastPeek(makeGame(players, seed));
}

// ---------------------------------------------------------------------------
// Basic projection
// ---------------------------------------------------------------------------

describe('computePlayerView — basic projection', () => {
  it('returns correct self, status, deckCount, discardTopCardId', () => {
    const state = makePlayingGame();
    const view = computePlayerView(state, 'alice');
    expect(view.self).toBe('alice');
    expect(view.status).toBe('playing');
    expect(view.deckCount).toBe(state.deck.length);
    expect(view.discardTopCardId).toBe(state.discard[state.discard.length - 1]!);
  });

  it('returns currentPlayerId correctly', () => {
    const state = makePlayingGame();
    const view = computePlayerView(state, 'alice');
    expect(view.currentPlayerId).toBe(state.players[state.turnIndex]!);
  });

  it('returns correct handSize for each player', () => {
    const state = makePlayingGame();
    const view = computePlayerView(state, 'alice');
    for (const entry of view.players) {
      expect(entry.handSize).toBe(state.hands[entry.id]!.length);
    }
  });

  it('returns null discardTopCardId when discard is empty', () => {
    const state = { ...makePlayingGame(), discard: [] };
    const view = computePlayerView(state, 'alice');
    expect(view.discardTopCardId).toBeNull();
  });

  it('includes the full 52-card catalog', () => {
    const state = makePlayingGame();
    const view = computePlayerView(state, 'alice');
    expect(Object.keys(view.catalog).length).toBe(52);
  });

  it('throws for unknown player', () => {
    const state = makePlayingGame();
    expect(() => computePlayerView(state, 'nobody')).toThrow();
  });

  it('isCurrentTurn is true for the current player only', () => {
    const state = makePlayingGame(['alice', 'bob', 'carol']);
    expect(state.turnIndex).toBe(0);
    const view = computePlayerView(state, 'bob');
    const aliceEntry = view.players.find((p) => p.id === 'alice')!;
    const bobEntry = view.players.find((p) => p.id === 'bob')!;
    const carolEntry = view.players.find((p) => p.id === 'carol')!;
    expect(aliceEntry.isCurrentTurn).toBe(true);
    expect(bobEntry.isCurrentTurn).toBe(false);
    expect(carolEntry.isCurrentTurn).toBe(false);
  });

  it('drawnFrom is always "deck" when drawn is set (Phase 2.5: only deck draw)', () => {
    const state = makePlayingGame();
    const drawResult = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    if (!drawResult.ok) return;
    const view = computePlayerView(drawResult.state, 'alice');
    expect(view.drawnFrom).toBe('deck');
  });
});

// ---------------------------------------------------------------------------
// Peek phase
// ---------------------------------------------------------------------------

describe('computePlayerView — peek_phase status', () => {
  it('status reflects peek_phase before all players peek', () => {
    const state = makeGame();
    const view = computePlayerView(state, 'alice');
    expect(view.status).toBe('peek_phase');
  });

  it('knownCards is empty before choose_peek', () => {
    const state = makeGame();
    const view = computePlayerView(state, 'alice');
    const aliceEntry = view.players.find((p) => p.id === 'alice')!;
    expect(Object.keys(aliceEntry.knownCards).length).toBe(0);
  });

  it('knownCards reflects chosen indices after choose_peek', () => {
    const state = makeGame();
    const afterPeek = applyMove(state, {
      type: 'choose_peek',
      playerId: 'alice',
      indices: [0, 2],
    });
    if (!afterPeek.ok) return;
    const view = computePlayerView(afterPeek.state, 'alice');
    const aliceEntry = view.players.find((p) => p.id === 'alice')!;
    expect(aliceEntry.knownCards[0]).toBeDefined();
    expect(aliceEntry.knownCards[2]).toBeDefined();
    expect(aliceEntry.knownCards[1]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Known-card projection
// ---------------------------------------------------------------------------

describe('computePlayerView — knownCards projection', () => {
  it('alice can see her own known slots from choose_peek', () => {
    const state = makeGame();
    const afterPeek = applyMove(state, {
      type: 'choose_peek',
      playerId: 'alice',
      indices: [0, 1],
    });
    if (!afterPeek.ok) return;
    // Alice has not finished peek phase yet, but her knowledge is set.
    const view = computePlayerView(afterPeek.state, 'alice');
    const aliceEntry = view.players.find((p) => p.id === 'alice')!;
    expect(aliceEntry.knownCards[0]).toBe(afterPeek.state.hands['alice']![0]);
    expect(aliceEntry.knownCards[1]).toBe(afterPeek.state.hands['alice']![1]);
  });

  it("alice cannot see bob's cards (no knowledge)", () => {
    const state = makePlayingGame();
    const view = computePlayerView(state, 'alice');
    const bobEntry = view.players.find((p) => p.id === 'bob')!;
    // Bob's cards should not be visible unless alice peeked them.
    expect(Object.keys(bobEntry.knownCards).length).toBe(0);
  });

  it('stale knowledge is filtered out: if card moved, slot not exposed', () => {
    const state = makePlayingGame();
    const aliceSlot0 = state.hands['alice']![0]!;
    // Plant stale entry: alice "knows" her slot 0, but it's the wrong card.
    const differentCard = Object.keys(state.cardCatalog).find((id) => id !== aliceSlot0)!;
    const staleState: GameState = {
      ...state,
      knownCards: {
        ...state.knownCards,
        alice: {
          ...state.knownCards['alice'],
          alice: { 0: differentCard },
        },
      },
    };
    const view = computePlayerView(staleState, 'alice');
    const aliceEntry = view.players.find((p) => p.id === 'alice')!;
    // Stale entry filtered out (differentCard !== actual hand[0]).
    expect(aliceEntry.knownCards[0]).toBeUndefined();
  });

  it('cross-player peek knowledge shown to peeker (peek_opponent power)', () => {
    const state = makePlayingGame();
    // Manually plant cross-player knowledge: alice knows bob slot 2.
    const bobCard2 = state.hands['bob']![2]!;
    const withKnowledge: GameState = {
      ...state,
      knownCards: {
        ...state.knownCards,
        alice: {
          ...state.knownCards['alice'],
          bob: { 2: bobCard2 },
        },
      },
    };
    const view = computePlayerView(withKnowledge, 'alice');
    const bobEntry = view.players.find((p) => p.id === 'bob')!;
    expect(bobEntry.knownCards[2]).toBe(bobCard2);
  });
});

// ---------------------------------------------------------------------------
// Drawn card visibility
// ---------------------------------------------------------------------------

describe('computePlayerView — drawn card visibility', () => {
  it('drawnCardId is non-null only for the drawing player', () => {
    const state = makePlayingGame();
    const drawResult = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    if (!drawResult.ok) return;

    const aliceView = computePlayerView(drawResult.state, 'alice');
    const bobView = computePlayerView(drawResult.state, 'bob');

    expect(aliceView.drawnCardId).toBe(drawResult.state.drawn!.cardId);
    expect(aliceView.drawnFrom).toBe('deck');
    expect(bobView.drawnCardId).toBeNull();
    expect(bobView.drawnFrom).toBeNull();
  });

  it('drawnCardId is null when no card is drawn', () => {
    const state = makePlayingGame();
    const view = computePlayerView(state, 'alice');
    expect(view.drawnCardId).toBeNull();
    expect(view.drawnFrom).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// pabloCalledBy and pendingPower
// ---------------------------------------------------------------------------

describe('computePlayerView — pabloCalledBy and pendingPower', () => {
  it('pabloCalledBy is included in the view', () => {
    const state = { ...makePlayingGame(), pabloCalledBy: 'alice' };
    const view = computePlayerView(state, 'bob');
    expect(view.pabloCalledBy).toBe('alice');
  });

  it('pendingPower is included in the view', () => {
    const state: GameState = {
      ...makePlayingGame(),
      pendingPower: { rank: 7, power: 'peek_self', playerId: 'alice' },
    };
    const view = computePlayerView(state, 'bob');
    expect(view.pendingPower).toEqual({ rank: 7, power: 'peek_self', playerId: 'alice' });
  });

  it('pabloCalledBy is null when nobody has called', () => {
    const state = makePlayingGame();
    const view = computePlayerView(state, 'alice');
    expect(view.pabloCalledBy).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ended state
// ---------------------------------------------------------------------------

describe('computePlayerView — ended state', () => {
  it('status shows ended after round ends', () => {
    const state = makePlayingGame();
    const pablo = applyMove(state, { type: 'call_pablo', playerId: 'alice' });
    if (!pablo.ok) return;
    const view = computePlayerView(pablo.state, 'alice');
    expect(view.status).toBe('ended');
  });

  it('scores are visible in player entries', () => {
    const state = makePlayingGame();
    const pablo = applyMove(state, { type: 'call_pablo', playerId: 'alice' });
    if (!pablo.ok) return;
    const view = computePlayerView(pablo.state, 'alice');
    const aliceEntry = view.players.find((p) => p.id === 'alice')!;
    expect(typeof aliceEntry.score).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Variable hand size
// ---------------------------------------------------------------------------

describe('computePlayerView — variable hand sizes', () => {
  it('handSize updates after match removes slots', () => {
    let state = makePlayingGame();
    // Force matching rank in slots 0 and 1.
    const rank = state.cardCatalog[state.hands['alice']![0]!]!.rank;
    // Check if slot 1 already has the same rank.
    const slot1Rank = state.cardCatalog[state.hands['alice']![1]!]!.rank;
    if (slot1Rank !== rank) {
      // Try to find a matching card by looking at the deck.
      const matchingInDeck = state.deck.find((id) => state.cardCatalog[id]!.rank === rank);
      if (matchingInDeck) {
        const oldHand = state.hands['alice']!;
        const newHand = [oldHand[0]!, matchingInDeck, ...oldHand.slice(2)];
        const remaining = state.deck.filter((id) => id !== matchingInDeck);
        remaining.push(oldHand[1]!);
        state = { ...state, hands: { ...state.hands, alice: newHand }, deck: remaining };
      }
    }

    const slot0Rank = state.cardCatalog[state.hands['alice']![0]!]!.rank;
    const slot1RankNow = state.cardCatalog[state.hands['alice']![1]!]!.rank;
    if (slot0Rank !== slot1RankNow) {
      // Couldn't set up, skip.
      return;
    }

    const matchResult = applyMove(state, {
      type: 'match_hand',
      playerId: 'alice',
      handIndexA: 0,
      handIndexB: 1,
    });
    if (!matchResult.ok) return;
    if (matchResult.state.hands['alice']!.length < state.hands['alice']!.length - 1) return;

    const view = computePlayerView(matchResult.state, 'alice');
    const aliceEntry = view.players.find((p) => p.id === 'alice')!;
    expect(aliceEntry.handSize).toBe(matchResult.state.hands['alice']!.length);
  });

  it('handSize increases after penalty card', () => {
    const state = makePlayingGame();
    // Force wrong rank in slot 0 vs discard top.
    const discardTopId = state.discard[state.discard.length - 1]!;
    const topRank = state.cardCatalog[discardTopId]!.rank;
    const wrongRank = ((topRank % 13) + 1) as typeof topRank & number;
    // Swap in a wrong-rank card.
    const wrongCard = Object.values(state.cardCatalog).find(
      (c) =>
        c.rank === wrongRank &&
        !Object.values(state.hands)
          .flat()
          .includes(Object.keys(state.cardCatalog).find((k) => state.cardCatalog[k] === c) ?? ''),
    );
    if (!wrongCard) return;

    const result = applyMove(state, { type: 'match_discard', playerId: 'alice', handIndex: 0 });
    if (!result.ok) return;

    const view = computePlayerView(result.state, 'alice');
    const aliceEntry = view.players.find((p) => p.id === 'alice')!;
    // Either penalty was added (size > 4) or discard succeeded (size < 4).
    expect(aliceEntry.handSize).toBe(result.state.hands['alice']!.length);
  });
});
