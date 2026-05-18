import { describe, expect, it } from 'bun:test';
import { newMatch, startNextRound, endRound } from './match';
import { scoreRound } from './score';
import { newGame } from './newGame';
import type { RoundScore } from './types';

function stubRoundScore(players: string[]): RoundScore {
  const perPlayerHand: Record<string, number> = {};
  const perPlayerRound: Record<string, number> = {};
  const cumulative: Record<string, number> = {};
  for (let i = 0; i < players.length; i++) {
    const p = players[i]!;
    perPlayerHand[p] = i === 0 ? 5 : 20;
    perPlayerRound[p] = i === 0 ? 0 : 20;
    cumulative[p] = perPlayerRound[p]!;
  }
  return {
    perPlayerHand,
    perPlayerRound,
    cumulative,
    winner: players[0]!,
    pabloCallerWasLowest: null,
  };
}

describe('newMatch', () => {
  it('starts between_rounds with all zeroes and no current round', () => {
    const match = newMatch({ id: 'm1', players: ['alice', 'bob'], seed: 'ms' });
    expect(match.status).toBe('between_rounds');
    expect(match.currentRound).toBeNull();
    expect(match.cumulativeScores).toEqual({ alice: 0, bob: 0 });
    expect(match.roundHistory.length).toBe(0);
    expect(match.winner).toBeNull();
  });

  it('stores the rules', () => {
    const match = newMatch({ id: 'm2', players: ['a', 'b'], seed: 's', rules: { maxScore: 50 } });
    expect(match.rules.maxScore).toBe(50);
  });
});

describe('startNextRound', () => {
  it('creates a playing GameState with the correct round number', () => {
    const match = newMatch({ id: 'm', players: ['alice', 'bob'], seed: 'ms' });
    const started = startNextRound(match);
    expect(started.status).toBe('in_progress');
    expect(started.currentRound).not.toBeNull();
    expect(started.currentRound?.status).toBe('playing');
    expect(started.currentRound?.roundNumber).toBe(1);
  });

  it('round 2 seed is different from round 1 seed', () => {
    let match = newMatch({ id: 'm', players: ['alice', 'bob'], seed: 'ms' });
    match = startNextRound(match);
    const round1Deck = match.currentRound?.deck.slice();

    // Fake end of round 1 with a stub score.
    const stub = stubRoundScore(['alice', 'bob']);
    match = endRound(match, stub);
    match = startNextRound(match);
    const round2Deck = match.currentRound?.deck.slice();

    expect(round1Deck).not.toEqual(round2Deck);
  });

  it('round seed is deterministic given same match seed', () => {
    const m1 = startNextRound(newMatch({ id: 'm', players: ['a', 'b'], seed: 'fixed' }));
    const m2 = startNextRound(newMatch({ id: 'm', players: ['a', 'b'], seed: 'fixed' }));
    expect(m1.currentRound?.deck).toEqual(m2.currentRound?.deck);
  });

  it('throws when match has ended', () => {
    const match = newMatch({ id: 'm', players: ['a', 'b'], seed: 's' });
    const ended = { ...match, status: 'ended' as const, winner: 'a' };
    expect(() => startNextRound(ended)).toThrow();
  });
});

describe('endRound', () => {
  it('appends to roundHistory and returns to between_rounds when below maxScore', () => {
    let match = startNextRound(newMatch({ id: 'm', players: ['alice', 'bob'], seed: 'ms' }));
    const stub = stubRoundScore(['alice', 'bob']);
    match = endRound(match, stub);
    expect(match.status).toBe('between_rounds');
    expect(match.roundHistory.length).toBe(1);
    expect(match.currentRound).toBeNull();
  });

  it('updates cumulativeScores correctly', () => {
    let match = startNextRound(newMatch({ id: 'm', players: ['alice', 'bob'], seed: 'ms' }));
    const stub = stubRoundScore(['alice', 'bob']);
    match = endRound(match, stub);
    expect(match.cumulativeScores['alice']).toBe(0);
    expect(match.cumulativeScores['bob']).toBe(20);
  });

  it('ends the match when a player reaches maxScore', () => {
    const match = newMatch({
      id: 'm',
      players: ['alice', 'bob'],
      seed: 's',
      rules: { maxScore: 10 },
    });
    let m = startNextRound(match);
    const stub = stubRoundScore(['alice', 'bob']);
    // bob gets 20 which exceeds maxScore=10.
    m = endRound(m, stub);
    expect(m.status).toBe('ended');
    expect(m.winner).toBe('alice'); // lowest cumulative wins
  });

  it('3-round cumulative scoring correctness', () => {
    let match = newMatch({ id: 'm', players: ['alice', 'bob'], seed: 'ms' });
    for (let round = 0; round < 3; round++) {
      match = startNextRound(match);
      // alice gets 0, bob gets 15 each round.
      const score: RoundScore = {
        perPlayerHand: { alice: 5, bob: 15 },
        perPlayerRound: { alice: 0, bob: 15 },
        cumulative: {},
        winner: 'alice',
        pabloCallerWasLowest: null,
      };
      match = endRound(match, score);
    }
    expect(match.cumulativeScores['alice']).toBe(0);
    expect(match.cumulativeScores['bob']).toBe(45);
  });
});

describe('match — real round integration', () => {
  it('full 2-player round produces a valid scoreRound result', () => {
    const game = newGame({ id: 'r', players: ['alice', 'bob'], seed: 'full-round' });
    const ended = { ...game, status: 'ended' as const };
    const result = scoreRound(ended);
    // Both players should have a non-negative round score.
    expect(result.perPlayerRound['alice']).toBeGreaterThanOrEqual(0);
    expect(result.perPlayerRound['bob']).toBeGreaterThanOrEqual(0);
    expect(['alice', 'bob']).toContain(result.winner);
  });
});
