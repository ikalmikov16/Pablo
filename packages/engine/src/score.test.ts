import { describe, expect, it } from 'bun:test';
import { scoreRound } from './score';
import { newGame } from './newGame';
import type { GameState } from './types';
import { DEFAULT_RULES } from './types';
import { cardId } from './internal/cards';

function makeEndedGame(overrides: Partial<GameState> = {}): GameState {
  const base = newGame({ id: 's', players: ['alice', 'bob'], seed: 'score-test' });
  return { ...base, status: 'ended', ...overrides };
}

/** Build hands from explicit card ids by injecting them into the state. */
function withHands(state: GameState, hands: Record<string, string[]>): GameState {
  return { ...state, hands };
}

describe('scoreRound — hand values', () => {
  it('sums hand: A♠ + 5♦ + J♣ + K♣ = 26', () => {
    const state = makeEndedGame();
    const a = cardId('spades', 1);
    const five = cardId('diamonds', 5);
    const jack = cardId('clubs', 11);
    const kingC = cardId('clubs', 13);
    const stateWithHands = withHands(state, {
      alice: [a, five, jack, kingC],
      bob: ['01S', '02S', '03S', '04S'],
    });
    const result = scoreRound({ ...stateWithHands });
    expect(result.perPlayerHand['alice']).toBe(26); // 1 + 5 + 10 + 10
  });

  it('K♥ counts as 0', () => {
    const state = makeEndedGame();
    const kh = cardId('hearts', 13);
    const kd = cardId('diamonds', 13);
    const two = cardId('clubs', 2);
    const three = cardId('clubs', 3);
    const stateWithHands = withHands(state, {
      alice: [kh, kd, two, three],
      bob: ['01S', '02S', '03S', '04S'],
    });
    const result = scoreRound(stateWithHands);
    expect(result.perPlayerHand['alice']).toBe(15); // 0 + 10 + 2 + 3
  });

  it('K♦, K♠, K♣ each count as 10 (not 0)', () => {
    const state = makeEndedGame();
    for (const suit of ['diamonds', 'clubs', 'spades'] as const) {
      const k = cardId(suit, 13);
      const stateWithHands = withHands(state, {
        alice: [k, '01S', '02S', '03S'],
        bob: ['01D', '02D', '03D', '04D'],
      });
      const result = scoreRound(stateWithHands);
      expect(result.perPlayerHand['alice']).toBe(10 + 1 + 2 + 3);
    }
  });

  it('ace counts as 1', () => {
    const state = makeEndedGame();
    const ace = cardId('spades', 1);
    const stateWithHands = withHands(state, {
      alice: [ace, ace, ace, ace],
      bob: ['05S', '05D', '05C', '05H'],
    });
    // Catalog technically has unique cards, but for hand value tests we only
    // care about the lookup result per cardId.
    const result = scoreRound(stateWithHands);
    expect(result.perPlayerHand['alice']).toBe(4); // 4 aces = 4
  });

  it('respects custom cardValueOverrides', () => {
    const state = newGame({
      id: 's2',
      players: ['alice', 'bob'],
      seed: 's',
      rules: { cardValueOverrides: [{ suit: 'spades', rank: 1, value: 11 }] },
    });
    const ace = cardId('spades', 1);
    const s = withHands(
      { ...state, status: 'ended' },
      {
        alice: [ace, '02S', '03S', '04S'],
        bob: ['05S', '06S', '07S', '08S'],
      },
    );
    const result = scoreRound(s);
    expect(result.perPlayerHand['alice']).toBe(11 + 2 + 3 + 4);
  });
});

describe('scoreRound — Pablo caller wins', () => {
  it('caller has lowest: caller scores 0', () => {
    const state = makeEndedGame({ pabloCalledBy: 'alice' });
    // Alice hand=5, Bob hand=10.
    const stateWithHands = withHands(state, {
      alice: ['05S', '05D', '05C', '05H'], // but catalog is shared; use real card ids
      bob: ['10S', '10D', '10C', '10H'],
    });
    // Give alice low hand by hand value construction.
    const alice5 = cardId('spades', 5);
    const bob10 = cardId('diamonds', 10);
    const final: GameState = withHands(stateWithHands, {
      alice: [alice5, alice5, alice5, alice5],
      bob: [bob10, bob10, bob10, bob10],
    });
    const result = scoreRound(final);
    expect(result.perPlayerRound['alice']).toBe(0);
    expect(result.perPlayerRound['bob']).toBe(40);
    expect(result.pabloCallerWasLowest).toBe(true);
  });

  it('caller tied for lowest: caller and tied non-caller both score 0', () => {
    const state = makeEndedGame({ pabloCalledBy: 'alice' });
    const card5 = cardId('spades', 5);
    const final = withHands(state, {
      alice: [card5, card5, card5, card5],
      bob: [card5, card5, card5, card5],
    });
    const result = scoreRound(final);
    expect(result.perPlayerRound['alice']).toBe(0);
    expect(result.perPlayerRound['bob']).toBe(0);
  });
});

describe('scoreRound — Pablo caller loses', () => {
  it('caller NOT lowest: caller pays hand + penalty', () => {
    const state = makeEndedGame({ pabloCalledBy: 'alice' });
    const aliceHigh = cardId('diamonds', 10);
    const bobLow = cardId('spades', 1);
    const final = withHands(state, {
      alice: [aliceHigh, aliceHigh, aliceHigh, aliceHigh],
      bob: [bobLow, bobLow, bobLow, bobLow],
    });
    const result = scoreRound(final);
    // alice hand = 40, bob hand = 4
    expect(result.perPlayerRound['alice']).toBe(40 + DEFAULT_RULES.pabloPenalty);
    expect(result.perPlayerRound['bob']).toBe(0); // lowest non-caller scores 0
    expect(result.pabloCallerWasLowest).toBe(false);
  });
});

describe('scoreRound — no Pablo called', () => {
  it('lowest player scores 0, others score hand', () => {
    const state = makeEndedGame({ pabloCalledBy: null });
    const card1 = cardId('spades', 1);
    const card10 = cardId('diamonds', 10);
    const final = withHands(state, {
      alice: [card1, card1, card1, card1],
      bob: [card10, card10, card10, card10],
    });
    const result = scoreRound(final);
    expect(result.perPlayerRound['alice']).toBe(0);
    expect(result.perPlayerRound['bob']).toBe(40);
    expect(result.pabloCallerWasLowest).toBeNull();
  });

  it('tied lowest players all score 0', () => {
    const state = makeEndedGame({ pabloCalledBy: null });
    const card5 = cardId('hearts', 5);
    const final = withHands(state, {
      alice: [card5, card5, card5, card5],
      bob: [card5, card5, card5, card5],
    });
    const result = scoreRound(final);
    expect(result.perPlayerRound['alice']).toBe(0);
    expect(result.perPlayerRound['bob']).toBe(0);
  });
});

describe('scoreRound — cumulative', () => {
  it('adds round score on top of existing scores in state', () => {
    const base = newGame({ id: 's', players: ['alice', 'bob'], seed: 'c' });
    const state: GameState = {
      ...base,
      status: 'ended',
      scores: { alice: 15, bob: 30 },
      pabloCalledBy: null,
    };
    const card1 = cardId('spades', 1);
    const card10 = cardId('diamonds', 10);
    const final = withHands(state, {
      alice: [card1, card1, card1, card1],
      bob: [card10, card10, card10, card10],
    });
    const result = scoreRound(final);
    expect(result.cumulative['alice']).toBe(15); // 15 + 0 (was lowest)
    expect(result.cumulative['bob']).toBe(70); // 30 + 40
  });
});
