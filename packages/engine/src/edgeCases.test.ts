import { describe, expect, it } from 'bun:test';
import { applyMove } from './applyMove';
import { legalMoves } from './legalMoves';
import { newGame } from './newGame';
import type { GameState, Rank } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGame(players = ['alice', 'bob'], seed = 'edge'): GameState {
  return newGame({ id: 'edge', players, seed });
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

function makePlaying(players = ['alice', 'bob'], seed = 'edge'): GameState {
  return advancePastPeek(makeGame(players, seed));
}

function placeRankOnTop(state: GameState, rank: Rank): { state: GameState; cardId: string } {
  const inDeck = state.deck.find((id) => state.cardCatalog[id]!.rank === rank);
  if (inDeck) {
    const deck = state.deck.filter((id) => id !== inDeck).concat([inDeck]);
    return { state: { ...state, deck }, cardId: inDeck };
  }
  for (const player of state.players) {
    const hand = state.hands[player]!;
    for (let i = 0; i < hand.length; i++) {
      const id = hand[i]!;
      if (state.cardCatalog[id]!.rank === rank) {
        const bottomOfDeck = state.deck[0]!;
        const newHand = hand.slice();
        newHand[i] = bottomOfDeck;
        const newDeck = state.deck.slice(1).concat([id]);
        return {
          state: { ...state, deck: newDeck, hands: { ...state.hands, [player]: newHand } },
          cardId: id,
        };
      }
    }
  }
  throw new Error(`placeRankOnTop: rank ${rank} not found`);
}

// ---------------------------------------------------------------------------
// Deck exhaustion during draw_from_deck
// ---------------------------------------------------------------------------

describe('edge case — deck exhaustion on draw', () => {
  it('reshuffles when deck is empty but discard has > 1 card', () => {
    const base = makePlaying();
    // Deck empty, discard has multiple cards.
    const extraCards = base.deck.slice(0, 4);
    const state: GameState = {
      ...base,
      deck: [],
      discard: [...base.discard, ...extraCards],
    };
    const result = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.some((e) => e.type === 'deck_reshuffled')).toBe(true);
    expect(result.state.drawn).not.toBeNull();
    expect(result.state.reshuffleCount).toBe(1);
  });

  it('ends round when deck is empty and discard has only 1 card', () => {
    const base = makePlaying();
    const state: GameState = { ...base, deck: [], discard: [base.discard[0]!] };
    const result = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.status).toBe('ended');
    expect(result.events.some((e) => e.type === 'round_ended')).toBe(true);
  });

  it('reshuffleCount increments on each reshuffle', () => {
    const base = makePlaying();
    const extraCards = base.deck.slice(0, 4);
    const state: GameState = {
      ...base,
      deck: [],
      discard: [...base.discard, ...extraCards],
    };
    const result = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    if (!result.ok) return;
    expect(result.state.reshuffleCount).toBe(base.reshuffleCount + 1);
  });
});

// ---------------------------------------------------------------------------
// Reshuffle determinism
// ---------------------------------------------------------------------------

describe('edge case — reshuffle determinism', () => {
  it('same seed produces same deck after reshuffle', () => {
    const extraCards = ['01S', '02S', '03S', '04S'];
    function makeReshuffle(seed: string) {
      const base = advancePastPeek(newGame({ id: 'r', players: ['alice', 'bob'], seed }));
      const extra = base.deck.slice(0, 4);
      const state: GameState = {
        ...base,
        deck: [],
        discard: [...base.discard, ...extra],
      };
      return applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    }
    void extraCards;
    const r1 = makeReshuffle('determ-seed');
    const r2 = makeReshuffle('determ-seed');
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.state.deck).toEqual(r2.state.deck);
  });

  it('different seeds produce different post-reshuffle decks', () => {
    function makeReshuffle(seed: string) {
      const base = advancePastPeek(newGame({ id: 'r', players: ['alice', 'bob'], seed }));
      const extra = base.deck.slice(0, 4);
      const state: GameState = {
        ...base,
        deck: [],
        discard: [...base.discard, ...extra],
      };
      return applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    }
    const r1 = makeReshuffle('seed-A');
    const r2 = makeReshuffle('seed-B');
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    // Very likely different — if this flaps it's a seed collision.
    expect(r1.state.deck).not.toEqual(r2.state.deck);
  });
});

// ---------------------------------------------------------------------------
// Power chain: activate → skip_power
// ---------------------------------------------------------------------------

describe('edge case — power chain', () => {
  it('discard_drawn(8) sets pendingPower=peek_opponent; skip_power clears it', () => {
    const { state: withEight } = placeRankOnTop(makePlaying(), 8);
    const withDraw = applyMove(withEight, { type: 'draw_from_deck', playerId: 'alice' });
    if (!withDraw.ok) throw new Error('draw failed');
    const withPower = applyMove(withDraw.state, { type: 'discard_drawn', playerId: 'alice' });
    if (!withPower.ok) throw new Error('discard failed');
    expect(withPower.state.pendingPower?.power).toBe('peek_opponent');

    const skip = applyMove(withPower.state, { type: 'skip_power', playerId: 'alice' });
    expect(skip.ok).toBe(true);
    if (!skip.ok) return;
    expect(skip.state.pendingPower).toBeNull();
    expect(skip.state.turnIndex).toBe(1);
  });

  it('swap_drawn(9) does NOT trigger pendingPower', () => {
    const { state: withNine } = placeRankOnTop(makePlaying(), 9);
    const withDraw = applyMove(withNine, { type: 'draw_from_deck', playerId: 'alice' });
    if (!withDraw.ok) throw new Error('draw failed');
    const withSwap = applyMove(withDraw.state, {
      type: 'swap_drawn',
      playerId: 'alice',
      handIndex: 0,
    });
    expect(withSwap.ok).toBe(true);
    if (!withSwap.ok) return;
    expect(withSwap.state.pendingPower).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Multi-player off-turn Pablo in 4-player game
// ---------------------------------------------------------------------------

describe('edge case — 4-player off-turn Pablo', () => {
  it('D calls off-turn during A turn; round ends when A→B→C→D completes', () => {
    const state = makePlaying(['alice', 'bob', 'carol', 'dave']);
    // Dave (index 3) calls during Alice's (index 0) turn.
    const daveCall = applyMove(state, { type: 'call_pablo', playerId: 'dave' });
    expect(daveCall.ok).toBe(true);
    if (!daveCall.ok) return;
    expect(daveCall.state.pabloCalledBy).toBe('dave');
    expect(daveCall.state.status).toBe('playing');

    function doTurn(gs: GameState, pid: string): GameState {
      if (gs.status === 'ended') return gs;
      const draw = applyMove(gs, { type: 'draw_from_deck', playerId: pid });
      if (!draw.ok) return gs;
      let ns = draw.state;
      if (ns.status === 'ended') return ns;
      const disc = applyMove(ns, { type: 'discard_drawn', playerId: pid });
      if (!disc.ok) return ns;
      ns = disc.state;
      if (ns.pendingPower !== null) {
        const skip = applyMove(ns, { type: 'skip_power', playerId: pid });
        if (skip.ok) ns = skip.state;
      }
      return ns;
    }

    let s = daveCall.state;
    s = doTurn(s, 'alice');
    expect(s.status).toBe('playing'); // B not yet reached
    s = doTurn(s, 'bob');
    expect(s.status).toBe('playing'); // C not yet reached
    s = doTurn(s, 'carol');
    // advanceTurn from Carol → Dave (caller) → round ends.
    expect(s.status).toBe('ended');
  });
});

// ---------------------------------------------------------------------------
// Knowledge after penalty card
// ---------------------------------------------------------------------------

describe('edge case — penalty card and knowledge', () => {
  it('penalty card owner does NOT gain knowledge of penalty slot', () => {
    let state = makePlaying();
    // Force wrong_rank on match_discard slot 0.
    const discardTop = state.discard[state.discard.length - 1]!;
    const topRank = state.cardCatalog[discardTop]!.rank;
    // Scan for a card with different rank to place in slot 0.
    let wrongCard: string | undefined;
    for (const id of state.deck) {
      if (state.cardCatalog[id]!.rank !== topRank) {
        wrongCard = id;
        break;
      }
    }
    if (!wrongCard) return; // All deck cards match — skip.

    // Place wrongCard in alice slot 0.
    const aliceHand = state.hands['alice']!.slice();
    const displaced = aliceHand[0]!;
    aliceHand[0] = wrongCard;
    const newDeck = state.deck.filter((id) => id !== wrongCard);
    newDeck.push(displaced);
    state = { ...state, hands: { ...state.hands, alice: aliceHand }, deck: newDeck };

    const result = applyMove(state, { type: 'match_discard', playerId: 'alice', handIndex: 0 });
    if (!result.ok) return;
    if (result.state.status === 'ended') return; // deck exhausted, skip

    const aliceHandFinal = result.state.hands['alice']!;
    const penaltySlot = aliceHandFinal.length - 1;
    // Penalty card at penaltySlot: alice should NOT know what it is.
    const aliceKnowledge = result.state.knownCards['alice']?.['alice'] ?? {};
    expect(aliceKnowledge[penaltySlot]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// min_hand_size rules with all three match types
// ---------------------------------------------------------------------------

describe('edge case — min_hand_size boundary', () => {
  it('match_drawn at exactly minHandSize fails with min_hand_size when ranks match', () => {
    // Build a fully-deterministic state: alice has exactly minHandSize cards,
    // slot 0 matches the deck top, deck has plenty of cards (so the move
    // can't end the round by exhaustion).
    const base = makePlaying();
    const minHandSize = base.rules.minHandSize;

    // Use card IDs straight from the catalog (avoids relying on shuffle order).
    const ace = '01H';
    const aceClubs = '01C';
    const filler = '05D';
    const filler2 = '06S';

    const state: GameState = {
      ...base,
      // Alice has 2 cards: [Ace♥, 5♦]. Hand size === minHandSize (2).
      hands: {
        ...base.hands,
        alice: [ace, filler].slice(0, minHandSize),
        bob: [filler2, filler2, filler2, filler2],
      },
      // Deck top is Ace♣ — same rank as slot 0 (Ace♥).
      deck: [...base.deck.slice(0, base.deck.length - 1), aceClubs],
    };

    const withDraw = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(withDraw.ok).toBe(true);
    if (!withDraw.ok) return;
    expect(withDraw.state.drawn?.cardId).toBe(aceClubs);

    const result = applyMove(withDraw.state, {
      type: 'match_drawn',
      playerId: 'alice',
      handIndex: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fail = result.events.find((e) => e.type === 'match_failed');
    expect(fail?.type).toBe('match_failed');
    if (fail?.type !== 'match_failed') return;
    expect(fail.reason).toBe('min_hand_size');
    // Hand grew by 2: drawn card + penalty card.
    expect(result.state.hands['alice']!.length).toBe(minHandSize + 2);
  });
});

// ---------------------------------------------------------------------------
// Full game loop (2-player) via legalMoves → applyMove
// ---------------------------------------------------------------------------

describe('edge case — full game loop', () => {
  it('a bot following legalMoves never gets stuck and reaches ended status', () => {
    const state = makeGame(['alice', 'bob'], 'loop-test');
    let s = state;
    let iterations = 0;
    const MAX_ITERATIONS = 500;

    while (s.status !== 'ended' && iterations < MAX_ITERATIONS) {
      // Determine whose turn it is to act.
      const currentPid = s.players[s.turnIndex]!;
      let actingPid: string | undefined;

      if (s.status === 'peek_phase') {
        // Find a player who hasn't peeked yet.
        for (const p of s.players) {
          const knowledge = s.knownCards[p]?.[p] ?? {};
          if (Object.keys(knowledge).length === 0) {
            actingPid = p;
            break;
          }
        }
      } else {
        actingPid = currentPid;
      }

      if (!actingPid) break;

      const moves = legalMoves(s, actingPid);
      if (moves.length === 0) break;

      // Prefer call_pablo to end the game; otherwise draw_from_deck; otherwise first.
      const move =
        moves.find((m) => m.type === 'call_pablo') ??
        moves.find((m) => m.type === 'draw_from_deck') ??
        moves[0]!;
      const result = applyMove(s, move);
      expect(result.ok).toBe(true);
      if (!result.ok) break;
      s = result.state;
      iterations++;
    }

    expect(s.status).toBe('ended');
    expect(iterations).toBeLessThan(MAX_ITERATIONS);
  });
});
