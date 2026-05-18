import { describe, expect, it } from 'bun:test';
import { newGame } from './newGame';
import { DEFAULT_RULES } from './types';

describe('newGame', () => {
  it('deals initialHandSize cards to every player', () => {
    const state = newGame({ id: 'g1', players: ['alice', 'bob', 'carol'], seed: 'test-seed-1' });
    expect(state.players).toEqual(['alice', 'bob', 'carol']);
    for (const p of state.players) {
      expect(state.hands[p]?.length).toBe(DEFAULT_RULES.initialHandSize);
    }
  });

  it('places exactly one card on the discard pile to start', () => {
    const state = newGame({ id: 'g2', players: ['alice', 'bob'], seed: 'test-seed-2' });
    expect(state.discard.length).toBe(1);
  });

  it('uses 52 cards total across catalog/deck/discard/hands', () => {
    const state = newGame({
      id: 'g3',
      players: ['alice', 'bob', 'carol', 'dave'],
      seed: 'test-seed-3',
    });
    expect(Object.keys(state.cardCatalog).length).toBe(52);
    const dealtToHands = state.players.reduce((acc, p) => acc + (state.hands[p]?.length ?? 0), 0);
    expect(state.deck.length + state.discard.length + dealtToHands).toBe(52);
  });

  it('is deterministic given the same seed', () => {
    const a = newGame({ id: 'g4', players: ['a', 'b'], seed: 'same' });
    const b = newGame({ id: 'g4', players: ['a', 'b'], seed: 'same' });
    expect(a.deck).toEqual(b.deck);
    expect(a.discard).toEqual(b.discard);
    expect(a.hands).toEqual(b.hands);
  });

  it('produces different deals for different seeds', () => {
    const a = newGame({ id: 'g5', players: ['a', 'b'], seed: 'one' });
    const b = newGame({ id: 'g5', players: ['a', 'b'], seed: 'two' });
    expect(a.deck).not.toEqual(b.deck);
  });

  it('starts with status="peek_phase" (default initialPeekCount=2)', () => {
    const state = newGame({ id: 'g6', players: ['alice', 'bob'], seed: 'seed-6' });
    expect(state.status).toBe('peek_phase');
  });

  it('starts with status="playing" when initialPeekCount=0', () => {
    const state = newGame({
      id: 'g6b',
      players: ['alice', 'bob'],
      seed: 'seed-6b',
      rules: { initialPeekCount: 0 },
    });
    expect(state.status).toBe('playing');
  });

  it('starts with turnIndex=0, drawn=null, pabloCalledBy=null, scores=0', () => {
    const state = newGame({ id: 'g7', players: ['alice', 'bob'], seed: 'seed-7' });
    expect(state.turnIndex).toBe(0);
    expect(state.drawn).toBeNull();
    expect(state.pabloCalledBy).toBeNull();
    expect(state.scores).toEqual({ alice: 0, bob: 0 });
  });

  it('knownCards is completely empty at start (no auto-peek)', () => {
    const state = newGame({ id: 'g8', players: ['alice', 'bob'], seed: 'peek-test' });
    for (const p of state.players) {
      const knowledge = state.knownCards[p]?.[p] ?? {};
      expect(Object.keys(knowledge).length).toBe(0);
    }
  });

  it('each card id appears exactly once across deck, discard, and hands', () => {
    const state = newGame({ id: 'g9', players: ['alice', 'bob', 'carol'], seed: 'unique' });
    const seen = new Set<string>();
    for (const id of state.deck) seen.add(id);
    for (const id of state.discard) seen.add(id);
    for (const p of state.players) {
      for (const id of state.hands[p]!) seen.add(id);
    }
    expect(seen.size).toBe(52);
  });

  it('leaves correct deck size for 2 players: 52 - 2*4 - 1 = 43', () => {
    const state = newGame({ id: 'g10', players: ['a', 'b'], seed: 's' });
    expect(state.deck.length).toBe(43);
  });

  it('leaves correct deck size for 6 players: 52 - 6*4 - 1 = 27', () => {
    const state = newGame({
      id: 'g11',
      players: ['a', 'b', 'c', 'd', 'e', 'f'],
      seed: 's',
    });
    expect(state.deck.length).toBe(27);
  });

  it('cardCatalog contains exactly one of each (suit, rank) pair', () => {
    const state = newGame({ id: 'g12', players: ['a', 'b'], seed: 's' });
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    for (const suit of suits) {
      for (const rank of ranks) {
        const found = Object.values(state.cardCatalog).filter(
          (c) => c.suit === suit && c.rank === rank,
        );
        expect(found.length).toBe(1);
      }
    }
  });

  it('merges caller rules over defaults', () => {
    const state = newGame({
      id: 'g13',
      players: ['a', 'b'],
      seed: 's',
      rules: { minHandSize: 1 },
    });
    expect(state.rules.minHandSize).toBe(1);
    expect(state.rules.penaltyCardOnFail).toBe(DEFAULT_RULES.penaltyCardOnFail);
    expect(state.rules.initialPeekCount).toBe(DEFAULT_RULES.initialPeekCount);
  });

  it('throws for invalid player count (1 player)', () => {
    expect(() => newGame({ id: 'g14', players: ['solo'], seed: 's' })).toThrow();
  });

  it('throws for invalid player count (7 players)', () => {
    expect(() =>
      newGame({ id: 'g15', players: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], seed: 's' }),
    ).toThrow();
  });

  it('initialises pendingPower=null and reshuffleCount=0', () => {
    const state = newGame({ id: 'g16', players: ['a', 'b'], seed: 's' });
    expect(state.pendingPower).toBeNull();
    expect(state.reshuffleCount).toBe(0);
  });

  it('does not have a roundNumber field (Phase 2.5 removal)', () => {
    const state = newGame({ id: 'g17', players: ['a', 'b'], seed: 's' });
    // @ts-expect-error roundNumber was removed in Phase 2.5
    expect(state.roundNumber).toBeUndefined();
  });

  it('does not have a finalTurnsRemaining field (Phase 2.5 removal)', () => {
    const state = newGame({ id: 'g18', players: ['a', 'b'], seed: 's' });
    // @ts-expect-error finalTurnsRemaining was removed in Phase 2.5
    expect(state.finalTurnsRemaining).toBeUndefined();
  });
});
