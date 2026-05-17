import { describe, expect, it } from 'bun:test';
import { newGame } from './newGame';
import { DEFAULT_RULES } from './types';

/**
 * These tests intentionally fail until the Phase 2 agent implements the engine.
 * They are the contract.
 *
 * To run: `bun test`
 */

describe('newGame', () => {
  it('deals initialHandSize cards to every player', () => {
    const state = newGame({
      id: 'g1',
      players: ['alice', 'bob', 'carol'],
      seed: 'test-seed-1',
    });
    expect(state.players).toEqual(['alice', 'bob', 'carol']);
    for (const p of state.players) {
      expect(state.hands[p]?.length).toBe(DEFAULT_RULES.initialHandSize);
    }
  });

  it('places exactly one card on the discard pile to start', () => {
    const state = newGame({
      id: 'g2',
      players: ['alice', 'bob'],
      seed: 'test-seed-2',
    });
    expect(state.discard.length).toBe(1);
  });

  it('uses 52 cards total across catalog/deck/discard/hands', () => {
    const state = newGame({
      id: 'g3',
      players: ['alice', 'bob', 'carol', 'dave'],
      seed: 'test-seed-3',
    });
    const catalogSize = Object.keys(state.cardCatalog).length;
    expect(catalogSize).toBe(52);

    const dealtToHands = state.players.reduce(
      (acc, p) => acc + (state.hands[p]?.length ?? 0),
      0,
    );
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

  it('starts with status="playing", turnIndex=0, drawn=null, scores=0', () => {
    const state = newGame({ id: 'g6', players: ['alice', 'bob'], seed: 'seed-6' });
    expect(state.status).toBe('playing');
    expect(state.turnIndex).toBe(0);
    expect(state.drawn).toBeNull();
    expect(state.pabloCalledBy).toBeNull();
    expect(state.scores).toEqual({ alice: 0, bob: 0 });
    expect(state.roundNumber).toBe(1);
  });
});
