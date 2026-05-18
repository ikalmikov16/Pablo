/**
 * Edge cases from docs/GAME_LOGIC.md — "Edge cases the engine must handle".
 */
import { describe, expect, it } from 'bun:test';
import { applyMove } from './applyMove';
import { newGame } from './newGame';
import { scoreRound } from './score';
import { cardId } from './internal/cards';
import type { CardId, GameState, Rank } from './types';

function makeGame(players = ['alice', 'bob'], seed = 'edge'): GameState {
  return newGame({ id: 'e', players, seed });
}

/** Find a card of the given rank that is actually in `state.deck`. */
function findRankInDeck(state: GameState, rank: Rank): CardId {
  const found = state.deck.find((id) => state.cardCatalog[id]!.rank === rank);
  if (!found) throw new Error(`no rank-${rank} card in deck for this seed`);
  return found;
}

// ---------------------------------------------------------------------------
// Deck exhaustion
// ---------------------------------------------------------------------------

describe('deck exhaustion — reshuffle', () => {
  it('reshuffles discard into deck and continues when deck is empty', () => {
    const base = makeGame();
    // Manufacture a state where deck is empty but discard has several cards.
    const extraDiscard = base.deck.slice(0, 5);
    const state: GameState = {
      ...base,
      deck: [],
      discard: [base.discard[0]!, ...extraDiscard], // top + some others
    };

    const result = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.some((e) => e.type === 'deck_reshuffled')).toBe(true);
    expect(result.state.drawn).not.toBeNull();
    // Discard should now have only its former top card.
    expect(result.state.discard.length).toBe(1);
    // Deck should have (extraDiscard.length - 1) cards (one was drawn).
    expect(result.state.deck.length).toBe(extraDiscard.length - 1);
  });

  it('ends the round when deck AND discard are exhausted', () => {
    const base = makeGame();
    // Only one card in discard, nothing in deck → nothing to reshuffle.
    const state: GameState = {
      ...base,
      deck: [],
      discard: [base.discard[0]!],
    };

    const result = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.status).toBe('ended');
    expect(result.events.some((e) => e.type === 'round_ended')).toBe(true);
  });

  it('reshuffle is deterministic: same sub-seed → same deck order', () => {
    const state: GameState = {
      ...makeGame(),
      deck: [],
      discard: [
        cardId('hearts', 1),
        cardId('hearts', 2),
        cardId('hearts', 3),
        cardId('hearts', 4),
        cardId('hearts', 5),
      ],
    };

    const r1 = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    const r2 = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    // Both runs from identical state should produce identical results.
    expect(r1.state.deck).toEqual(r2.state.deck);
    expect(r1.state.drawn?.cardId).toBe(r2.state.drawn?.cardId);
  });

  it('reshuffleCount increments each reshuffle', () => {
    const state: GameState = {
      ...makeGame(),
      deck: [],
      discard: [cardId('hearts', 1), cardId('hearts', 2), cardId('hearts', 3)],
    };
    const r = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.reshuffleCount).toBe(1);
  });

  it('no Pablo penalty when round ends by exhaustion without a Pablo call', () => {
    const base = makeGame();
    const state: GameState = {
      ...base,
      deck: [],
      discard: [base.discard[0]!],
      pabloCalledBy: null,
    };
    const result = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Round ended without Pablo — no penalty in scores.
    const roundEndEvent = result.events.find((e) => e.type === 'round_ended');
    expect(roundEndEvent).toBeDefined();
    if (roundEndEvent?.type !== 'round_ended') return;
    // Scores should have no inflated value from a 10-point penalty.
    for (const score of Object.values(roundEndEvent.scores)) {
      // max hand value in a default game is ~40; penalty would add 10 on top.
      expect(score).toBeLessThanOrEqual(50);
    }
  });
});

// ---------------------------------------------------------------------------
// Calling Pablo with empty deck
// ---------------------------------------------------------------------------

describe('calling Pablo with empty deck', () => {
  it('is legal', () => {
    const state: GameState = {
      ...makeGame(),
      deck: [],
      discard: [cardId('hearts', 1)],
    };
    const result = applyMove(state, { type: 'call_pablo', playerId: 'alice' });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Power only on discard, not swap
// ---------------------------------------------------------------------------

describe('power activation rule', () => {
  it('drawing and swapping a 7/8/9 does NOT activate any power', () => {
    for (const rank of [7, 8, 9] as const) {
      const state = makeGame();
      const powerCard = findRankInDeck(state, rank);
      const deck = state.deck.filter((id) => id !== powerCard).concat([powerCard]);
      const withDraw = applyMove({ ...state, deck }, { type: 'draw_from_deck', playerId: 'alice' });
      expect(withDraw.ok).toBe(true);
      if (!withDraw.ok) return;
      const swap = applyMove(withDraw.state, {
        type: 'swap_drawn',
        playerId: 'alice',
        handIndex: 0,
      });
      expect(swap.ok).toBe(true);
      if (!swap.ok) return;
      expect(swap.state.pendingPower).toBeNull();
    }
  });

  it('drawing from discard and swapping a power card does NOT activate any power', () => {
    for (const rank of [7, 8, 9] as const) {
      const state = makeGame();
      const powerCard = findRankInDeck(state, rank);
      // Move the power card from the deck onto the discard pile (no duplicates).
      const stateWithDiscardPowerCard: GameState = {
        ...state,
        deck: state.deck.filter((id) => id !== powerCard),
        discard: [...state.discard, powerCard],
      };
      const withDraw = applyMove(stateWithDiscardPowerCard, {
        type: 'draw_from_discard',
        playerId: 'alice',
      });
      expect(withDraw.ok).toBe(true);
      if (!withDraw.ok) return;
      expect(withDraw.state.drawn?.cardId).toBe(powerCard);
      const swap = applyMove(withDraw.state, {
        type: 'swap_drawn',
        playerId: 'alice',
        handIndex: 0,
      });
      expect(swap.ok).toBe(true);
      if (!swap.ok) return;
      expect(swap.state.pendingPower).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// K♥ = 0, other kings = 10
// ---------------------------------------------------------------------------

describe('scoring — king of hearts only', () => {
  it('K♥ is 0, K♦/K♠/K♣ are each 10', () => {
    const state = makeGame();
    const kh = cardId('hearts', 13);
    const kd = cardId('diamonds', 13);
    const ks = cardId('spades', 13);
    const kc = cardId('clubs', 13);

    const withKings: GameState = {
      ...state,
      status: 'ended',
      hands: { alice: [kh, kd, ks, kc], bob: ['01S', '01D', '01C', '01H'] },
    };
    const result = scoreRound(withKings);
    expect(result.perPlayerHand['alice']).toBe(0 + 10 + 10 + 10); // 30
  });
});

// ---------------------------------------------------------------------------
// Full 2-player game flow
// ---------------------------------------------------------------------------

describe('full 2-player game flow', () => {
  it('completes a round from newGame to a round_ended event', () => {
    // Play 3 full turns (swap), then alice calls Pablo, bob finishes his final turn.
    let s = makeGame();

    // 3 turns: each player draws and swaps slot 0 (alice, bob, alice).
    for (let i = 0; i < 3; i++) {
      const current = s.players[s.turnIndex]!;
      const drawResult = applyMove(s, { type: 'draw_from_deck', playerId: current });
      if (!drawResult.ok) throw new Error('draw failed');
      s = drawResult.state;

      if (s.pendingPower !== null) {
        const skip = applyMove(s, { type: 'skip_power', playerId: current });
        if (!skip.ok) throw new Error('skip failed');
        s = skip.state;
        continue;
      }

      const swapResult = applyMove(s, { type: 'swap_drawn', playerId: current, handIndex: 0 });
      if (!swapResult.ok) throw new Error('swap failed');
      s = swapResult.state;

      if (s.pendingPower !== null) {
        const skip = applyMove(s, { type: 'skip_power', playerId: current });
        if (!skip.ok) throw new Error('skip failed');
        s = skip.state;
      }
    }

    // It's bob's turn (index 1). Alice calls Pablo on her next turn — advance to her.
    // Actually after 3 turns we are at turnIndex=1 (alice=0, bob=1, alice=0 → next is bob=1).
    // Let bob do one turn, then alice calls Pablo.
    const bobCurrent = s.players[s.turnIndex]!;
    const bobDraw = applyMove(s, { type: 'draw_from_deck', playerId: bobCurrent });
    if (bobDraw.ok) {
      s = bobDraw.state;
      if (s.pendingPower !== null) {
        const skip = applyMove(s, { type: 'skip_power', playerId: bobCurrent });
        if (skip.ok) s = skip.state;
      } else {
        const swap = applyMove(s, { type: 'swap_drawn', playerId: bobCurrent, handIndex: 0 });
        if (swap.ok) {
          s = swap.state;
          if (s.pendingPower !== null) {
            const skip = applyMove(s, { type: 'skip_power', playerId: bobCurrent });
            if (skip.ok) s = skip.state;
          }
        }
      }
    }

    // Now alice calls Pablo.
    const pabloResult = applyMove(s, { type: 'call_pablo', playerId: 'alice' });
    expect(pabloResult.ok).toBe(true);
    if (!pabloResult.ok) return;
    s = pabloResult.state;
    expect(s.status).toBe('final_turns');

    // Bob takes his final turn.
    const bobFinalDraw = applyMove(s, { type: 'draw_from_deck', playerId: 'bob' });
    expect(bobFinalDraw.ok).toBe(true);
    if (!bobFinalDraw.ok) return;
    s = bobFinalDraw.state;

    if (s.status !== 'ended') {
      if (s.pendingPower !== null) {
        const skip = applyMove(s, { type: 'skip_power', playerId: 'bob' });
        if (skip.ok) s = skip.state;
      } else if (s.drawn !== null) {
        const swap = applyMove(s, { type: 'swap_drawn', playerId: 'bob', handIndex: 0 });
        if (swap.ok) {
          s = swap.state;
          if (s.pendingPower !== null) {
            const skip = applyMove(s, { type: 'skip_power', playerId: 'bob' });
            if (skip.ok) s = skip.state;
          }
        }
      }
    }

    expect(s.status).toBe('ended');
  });

  it('alice calls pablo and round ends after bob finishes his final turn', () => {
    const state = makeGame();
    const pabloResult = applyMove(state, { type: 'call_pablo', playerId: 'alice' });
    expect(pabloResult.ok).toBe(true);
    if (!pabloResult.ok) return;
    expect(pabloResult.state.status).toBe('final_turns');

    // Bob takes his final turn.
    let s = pabloResult.state;
    const bobDrawResult = applyMove(s, { type: 'draw_from_deck', playerId: 'bob' });
    expect(bobDrawResult.ok).toBe(true);
    if (!bobDrawResult.ok) return;
    s = bobDrawResult.state;
    if (s.status !== 'ended') {
      const bobSwap = applyMove(s, { type: 'swap_drawn', playerId: 'bob', handIndex: 0 });
      expect(bobSwap.ok).toBe(true);
      if (!bobSwap.ok) return;
      s = bobSwap.state;
      // Handle power if activated.
      if (s.pendingPower !== null) {
        const skip = applyMove(s, { type: 'skip_power', playerId: 'bob' });
        expect(skip.ok).toBe(true);
        if (!skip.ok) return;
        s = skip.state;
      }
    }
    expect(s.status).toBe('ended');
  });
});
