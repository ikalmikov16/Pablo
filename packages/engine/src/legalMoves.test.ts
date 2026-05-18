import { describe, expect, it } from 'bun:test';
import { legalMoves } from './legalMoves';
import { applyMove } from './applyMove';
import { newGame } from './newGame';
import type { GameState } from './types';

function makeGame(players = ['alice', 'bob'], seed = 'lm-test'): GameState {
  return newGame({ id: 'lm', players, seed });
}

describe('legalMoves — fresh turn', () => {
  it('allows draw_from_deck, draw_from_discard, call_pablo', () => {
    const state = makeGame();
    const moves = legalMoves(state, 'alice');
    const types = moves.map((m) => m.type);
    expect(types).toContain('draw_from_deck');
    expect(types).toContain('draw_from_discard');
    expect(types).toContain('call_pablo');
  });

  it('does not include draw_from_discard when pile is empty', () => {
    const state = { ...makeGame(), discard: [] };
    const moves = legalMoves(state, 'alice');
    expect(moves.map((m) => m.type)).not.toContain('draw_from_discard');
  });

  it('does not include call_pablo after pablo already called', () => {
    const state = {
      ...makeGame(),
      pabloCalledBy: 'alice',
      status: 'final_turns' as const,
      finalTurnsRemaining: 1,
    };
    const moves = legalMoves(state, 'bob');
    expect(moves.map((m) => m.type)).not.toContain('call_pablo');
  });
});

describe('legalMoves — after deck draw', () => {
  it('includes swap_drawn for each slot and discard_drawn', () => {
    const state = makeGame();
    const drawResult = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(drawResult.ok).toBe(true);
    if (!drawResult.ok) return;
    const moves = legalMoves(drawResult.state, 'alice');
    const types = moves.map((m) => m.type);
    expect(types.filter((t) => t === 'swap_drawn').length).toBe(4);
    expect(types).toContain('discard_drawn');
  });

  it('does not include draw_from_deck or call_pablo while holding a card', () => {
    const state = makeGame();
    const drawResult = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    if (!drawResult.ok) return;
    const moves = legalMoves(drawResult.state, 'alice');
    const types = moves.map((m) => m.type);
    expect(types).not.toContain('draw_from_deck');
    expect(types).not.toContain('call_pablo');
  });
});

describe('legalMoves — after discard draw', () => {
  it('only includes swap_drawn (no discard_drawn) when allowDrawDiscardAndDiscard=false', () => {
    const state = makeGame();
    const drawResult = applyMove(state, { type: 'draw_from_discard', playerId: 'alice' });
    expect(drawResult.ok).toBe(true);
    if (!drawResult.ok) return;
    const moves = legalMoves(drawResult.state, 'alice');
    const types = moves.map((m) => m.type);
    expect(types.filter((t) => t === 'swap_drawn').length).toBe(4);
    expect(types).not.toContain('discard_drawn');
  });

  it('includes discard_drawn when allowDrawDiscardAndDiscard=true', () => {
    const state = newGame({
      id: 't',
      players: ['alice', 'bob'],
      seed: 's',
      rules: { allowDrawDiscardAndDiscard: true },
    });
    const drawResult = applyMove(state, { type: 'draw_from_discard', playerId: 'alice' });
    if (!drawResult.ok) return;
    const moves = legalMoves(drawResult.state, 'alice');
    const types = moves.map((m) => m.type);
    expect(types).toContain('discard_drawn');
  });
});

describe('legalMoves — power pending', () => {
  it('peek_self: only use_peek_self × 4 + skip_power', () => {
    const state: GameState = {
      ...makeGame(),
      pendingPower: { rank: 7, power: 'peek_self', playerId: 'alice' },
    };
    const moves = legalMoves(state, 'alice');
    const types = moves.map((m) => m.type);
    expect(types.filter((t) => t === 'use_peek_self').length).toBe(4);
    expect(types).toContain('skip_power');
    expect(types).not.toContain('draw_from_deck');
  });

  it('peek_opponent: use_peek_opponent for each (opponent × slot) + skip_power', () => {
    const state: GameState = {
      ...makeGame(['alice', 'bob', 'carol']),
      pendingPower: { rank: 8, power: 'peek_opponent', playerId: 'alice' },
    };
    const moves = legalMoves(state, 'alice');
    const types = moves.map((m) => m.type);
    // 2 opponents × 4 slots = 8
    expect(types.filter((t) => t === 'use_peek_opponent').length).toBe(8);
    expect(types).toContain('skip_power');
  });

  it('swap_blind: use_swap_blind for each (self slot × opponent × opponent slot) + skip_power', () => {
    const state: GameState = {
      ...makeGame(['alice', 'bob']),
      pendingPower: { rank: 9, power: 'swap_blind', playerId: 'alice' },
    };
    const moves = legalMoves(state, 'alice');
    const types = moves.map((m) => m.type);
    // 4 self × 1 opponent × 4 = 16
    expect(types.filter((t) => t === 'use_swap_blind').length).toBe(16);
    expect(types).toContain('skip_power');
  });
});

describe('legalMoves — access control', () => {
  it('returns empty for non-current player', () => {
    const state = makeGame();
    expect(legalMoves(state, 'bob').length).toBe(0);
  });

  it('returns empty when game has ended', () => {
    const state = { ...makeGame(), status: 'ended' as const };
    expect(legalMoves(state, 'alice').length).toBe(0);
  });
});
