import { describe, expect, it } from 'bun:test';
import { computePlayerView } from './playerView';
import { applyMove } from './applyMove';
import { newGame } from './newGame';
import type { CardId, GameState, Rank } from './types';

function makeGame(players = ['alice', 'bob'], seed = 'view-test'): GameState {
  return newGame({ id: 'v', players, seed });
}

function findRankInDeck(state: GameState, rank: Rank): CardId {
  const found = state.deck.find((id) => state.cardCatalog[id]!.rank === rank);
  if (!found) throw new Error(`no rank-${rank} card in deck`);
  return found;
}

describe('computePlayerView — structure', () => {
  it('returns deckCount not deck', () => {
    const state = makeGame();
    const view = computePlayerView(state, 'alice');
    expect((view as unknown as Record<string, unknown>).deck).toBeUndefined();
    expect(view.deckCount).toBe(state.deck.length);
  });

  it('returns discardTopCardId matching last element of discard', () => {
    const state = makeGame();
    const view = computePlayerView(state, 'alice');
    expect(view.discardTopCardId).toBe(state.discard[state.discard.length - 1] ?? null);
  });

  it('returns null for discardTopCardId when discard is empty', () => {
    const state = { ...makeGame(), discard: [] };
    const view = computePlayerView(state, 'alice');
    expect(view.discardTopCardId).toBeNull();
  });

  it('includes all players in the players array', () => {
    const state = makeGame(['alice', 'bob', 'carol']);
    const view = computePlayerView(state, 'alice');
    expect(view.players.map((p) => p.id)).toEqual(['alice', 'bob', 'carol']);
  });

  it('sets self correctly', () => {
    const state = makeGame();
    expect(computePlayerView(state, 'alice').self).toBe('alice');
    expect(computePlayerView(state, 'bob').self).toBe('bob');
  });

  it('throws for unknown player', () => {
    const state = makeGame();
    expect(() => computePlayerView(state, 'nobody')).toThrow();
  });
});

describe('computePlayerView — knowledge', () => {
  it('alice sees her own initial peeked slots (positions 2, 3)', () => {
    const state = makeGame();
    const view = computePlayerView(state, 'alice');
    const aliceEntry = view.players.find((p) => p.id === 'alice')!;
    expect(aliceEntry.knownCards[2]).toBe(state.hands['alice']![2]);
    expect(aliceEntry.knownCards[3]).toBe(state.hands['alice']![3]);
    expect(aliceEntry.knownCards[0]).toBeUndefined();
    expect(aliceEntry.knownCards[1]).toBeUndefined();
  });

  it("alice does not see bob's cards without a peek", () => {
    const state = makeGame();
    const view = computePlayerView(state, 'alice');
    const bobEntry = view.players.find((p) => p.id === 'bob')!;
    expect(Object.keys(bobEntry.knownCards).length).toBe(0);
  });

  it("after peek_opponent, alice sees the peeked card in bob's entry", () => {
    const state = makeGame();
    const eightCard = findRankInDeck(state, 8);
    const deck = state.deck.filter((id) => id !== eightCard).concat([eightCard]);
    const withDraw = applyMove({ ...state, deck }, { type: 'draw_from_deck', playerId: 'alice' });
    expect(withDraw.ok).toBe(true);
    if (!withDraw.ok) return;
    const withPower = applyMove(withDraw.state, { type: 'discard_drawn', playerId: 'alice' });
    expect(withPower.ok).toBe(true);
    if (!withPower.ok) return;

    const afterPeek = applyMove(withPower.state, {
      type: 'use_peek_opponent',
      playerId: 'alice',
      targetPlayer: 'bob',
      targetHandIndex: 0,
    });
    expect(afterPeek.ok).toBe(true);
    if (!afterPeek.ok) return;

    const view = computePlayerView(afterPeek.state, 'alice');
    const bobEntry = view.players.find((p) => p.id === 'bob')!;
    expect(bobEntry.knownCards[0]).toBe(afterPeek.state.hands['bob']![0]);

    // Bob's own view does not gain alice's knowledge.
    const bobView = computePlayerView(afterPeek.state, 'bob');
    const aliceEntry = bobView.players.find((p) => p.id === 'alice')!;
    expect(aliceEntry.knownCards[0]).toBeUndefined();
  });

  it('drawnCardId is null for the non-drawing player', () => {
    const state = makeGame();
    const drawResult = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    if (!drawResult.ok) return;
    const bobView = computePlayerView(drawResult.state, 'bob');
    expect(bobView.drawnCardId).toBeNull();
  });

  it('drawnCardId is set for the drawing player', () => {
    const state = makeGame();
    const drawResult = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    if (!drawResult.ok) return;
    const aliceView = computePlayerView(drawResult.state, 'alice');
    expect(aliceView.drawnCardId).toBe(drawResult.state.drawn?.cardId ?? null);
  });

  it('pabloCalledBy is visible in all player views', () => {
    const state = {
      ...makeGame(),
      pabloCalledBy: 'alice',
      status: 'final_turns' as const,
      finalTurnsRemaining: 1,
    };
    expect(computePlayerView(state, 'alice').pabloCalledBy).toBe('alice');
    expect(computePlayerView(state, 'bob').pabloCalledBy).toBe('alice');
  });

  it('stale knowledge is filtered out after a swap', () => {
    // Alice peeks bob slot 0, then bob draws and swaps slot 0 with a new card.
    const state = makeGame();
    const bobCard0 = state.hands['bob']![0]!;
    // Manually inject alice's knowledge of bob[0].
    const withKnowledge: GameState = {
      ...state,
      knownCards: {
        ...state.knownCards,
        alice: {
          ...state.knownCards['alice'],
          bob: { 0: bobCard0 },
        },
      },
    };

    // Advance to bob's turn.
    const aliceDrawResult = applyMove(withKnowledge, { type: 'draw_from_deck', playerId: 'alice' });
    if (!aliceDrawResult.ok) return;
    const aliceSwap = applyMove(aliceDrawResult.state, {
      type: 'swap_drawn',
      playerId: 'alice',
      handIndex: 0,
    });
    if (!aliceSwap.ok) return;

    // Bob draws and swaps slot 0.
    const bobDrawResult = applyMove(aliceSwap.state, { type: 'draw_from_deck', playerId: 'bob' });
    if (!bobDrawResult.ok) return;
    const bobSwap = applyMove(bobDrawResult.state, {
      type: 'swap_drawn',
      playerId: 'bob',
      handIndex: 0,
    });
    if (!bobSwap.ok) return;

    // Alice's knowledge of bob[0] should now be cleared.
    const view = computePlayerView(bobSwap.state, 'alice');
    const bobEntry = view.players.find((p) => p.id === 'bob')!;
    expect(bobEntry.knownCards[0]).toBeUndefined();
  });
});
