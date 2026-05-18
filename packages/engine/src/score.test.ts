import { describe, expect, it } from 'bun:test';
import { scoreRound } from './score';
import { newGame } from './newGame';
import type { GameState } from './types';
import { cardId } from './internal/cards';

function makeEndedGame(overrides: Partial<GameState> = {}): GameState {
  const base = newGame({ id: 's', players: ['alice', 'bob'], seed: 'score-test' });
  return { ...base, status: 'ended', ...overrides };
}

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
    const final = withHands(state, { alice: [a, five, jack, kingC], bob: ['01S', '02S', '03S'] });
    const result = scoreRound(final);
    expect(result.perPlayerHand['alice']).toBe(26); // 1+5+10+10
  });

  it('K♥ counts as 0', () => {
    const state = makeEndedGame();
    const kh = cardId('hearts', 13);
    const kd = cardId('diamonds', 13);
    const two = cardId('clubs', 2);
    const three = cardId('clubs', 3);
    const final = withHands(state, {
      alice: [kh, kd, two, three],
      bob: ['01S', '02S', '03S', '04S'],
    });
    const result = scoreRound(final);
    expect(result.perPlayerHand['alice']).toBe(15); // 0+10+2+3
  });

  it('K♦, K♠, K♣ each count as 10 (not 0)', () => {
    const state = makeEndedGame();
    for (const suit of ['diamonds', 'clubs', 'spades'] as const) {
      const k = cardId(suit, 13);
      const final = withHands(state, {
        alice: [k, '01S', '02S', '03S'],
        bob: ['01D', '02D', '03D', '04D'],
      });
      const result = scoreRound(final);
      expect(result.perPlayerHand['alice']).toBe(10 + 1 + 2 + 3);
    }
  });

  it('ace counts as 1', () => {
    const state = makeEndedGame();
    const ace = cardId('spades', 1);
    const final = withHands(state, {
      alice: [ace, ace, ace, ace],
      bob: ['05S', '05D', '05C', '05H'],
    });
    const result = scoreRound(final);
    expect(result.perPlayerHand['alice']).toBe(4);
  });

  it('respects custom cardValueOverrides', () => {
    const state = newGame({
      id: 's2',
      players: ['alice', 'bob'],
      seed: 's',
      rules: { cardValueOverrides: [{ suit: 'spades', rank: 1, value: 11 }] },
    });
    const ace = cardId('spades', 1);
    const final = withHands(
      { ...state, status: 'ended' },
      { alice: [ace, '02S', '03S', '04S'], bob: ['05S', '06S', '07S', '08S'] },
    );
    const result = scoreRound(final);
    expect(result.perPlayerHand['alice']).toBe(11 + 2 + 3 + 4);
  });
});

describe('scoreRound — winners (no caller penalty)', () => {
  it('single lowest player wins (sole winner)', () => {
    const state = makeEndedGame();
    const card1 = cardId('spades', 1);
    const card10 = cardId('diamonds', 10);
    const final = withHands(state, {
      alice: [card1, card1, card1, card1],
      bob: [card10, card10, card10, card10],
    });
    const result = scoreRound(final);
    expect(result.winners).toEqual(['alice']);
  });

  it('tied lowest players all win (multi-winner)', () => {
    const state = makeEndedGame();
    const card5 = cardId('hearts', 5);
    const final = withHands(state, {
      alice: [card5, card5, card5, card5],
      bob: [card5, card5, card5, card5],
    });
    const result = scoreRound(final);
    expect(result.winners).toHaveLength(2);
    expect(result.winners).toContain('alice');
    expect(result.winners).toContain('bob');
  });

  it('Pablo caller with lowest hand is in winners (no penalty)', () => {
    const state = makeEndedGame({ pabloCalledBy: 'alice' });
    const card1 = cardId('spades', 1);
    const card10 = cardId('diamonds', 10);
    const final = withHands(state, {
      alice: [card1, card1, card1, card1],
      bob: [card10, card10, card10, card10],
    });
    const result = scoreRound(final);
    expect(result.winners).toEqual(['alice']);
    // Caller scores their hand value (not 0, not penalised — just scored normally)
    expect(result.perPlayerHand['alice']).toBe(4);
  });

  it('Pablo caller NOT lowest is not in winners (still no penalty added)', () => {
    const state = makeEndedGame({ pabloCalledBy: 'alice' });
    const card10 = cardId('diamonds', 10);
    const card1 = cardId('spades', 1);
    const final = withHands(state, {
      alice: [card10, card10, card10, card10],
      bob: [card1, card1, card1, card1],
    });
    const result = scoreRound(final);
    // alice called Pablo but has highest hand — she simply loses
    expect(result.winners).toEqual(['bob']);
    expect(result.perPlayerHand['alice']).toBe(40); // no penalty added
    expect(result.perPlayerHand['bob']).toBe(4);
  });

  it('Pablo caller tied for lowest: caller AND tied non-callers all win', () => {
    const state = makeEndedGame({ pabloCalledBy: 'alice' });
    const card5 = cardId('clubs', 5);
    const final = withHands(state, {
      alice: [card5, card5, card5, card5],
      bob: [card5, card5, card5, card5],
    });
    const result = scoreRound(final);
    expect(result.winners).toHaveLength(2);
    expect(result.winners).toContain('alice');
    expect(result.winners).toContain('bob');
  });

  it('three-player game: two tied lowest, one higher', () => {
    const state = { ...makeEndedGame(), players: ['alice', 'bob', 'carol'] as const };
    const card5 = cardId('spades', 5);
    const card10 = cardId('diamonds', 10);
    const finalState = {
      ...state,
      hands: {
        alice: [card5, card5, card5, card5],
        bob: [card5, card5, card5, card5],
        carol: [card10, card10, card10, card10],
      },
      scores: { alice: 0, bob: 0, carol: 0 },
      knownCards: {
        alice: { alice: {}, bob: {}, carol: {} },
        bob: { alice: {}, bob: {}, carol: {} },
        carol: { alice: {}, bob: {}, carol: {} },
      },
    };
    const result = scoreRound(finalState);
    expect(result.winners).toHaveLength(2);
    expect(result.winners).toContain('alice');
    expect(result.winners).toContain('bob');
    expect(result.winners).not.toContain('carol');
  });

  it('returns no pabloCallerWasLowest field (removed in Phase 2.5)', () => {
    const state = makeEndedGame({ pabloCalledBy: 'alice' });
    const result = scoreRound(state);
    // @ts-expect-error pabloCallerWasLowest was removed in Phase 2.5
    expect(result.pabloCallerWasLowest).toBeUndefined();
  });

  it('returns no winner singular field (replaced by winners array)', () => {
    const state = makeEndedGame();
    const result = scoreRound(state);
    // @ts-expect-error winner (singular) was replaced by winners[]
    expect(result.winner).toBeUndefined();
  });
});
