import { describe, expect, it } from 'bun:test';
import { legalMoves } from './legalMoves';
import { applyMove } from './applyMove';
import { newGame } from './newGame';
import type { GameState } from './types';

function makeGame(players = ['alice', 'bob'], seed = 'lm-test'): GameState {
  return newGame({ id: 'lm', players, seed });
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

function makePlayingGame(players = ['alice', 'bob'], seed = 'lm-test'): GameState {
  return advancePastPeek(makeGame(players, seed));
}

// ---------------------------------------------------------------------------
// Peek phase
// ---------------------------------------------------------------------------

describe('legalMoves — peek_phase', () => {
  it('returns choose_peek combos for player who has not peeked', () => {
    const state = makeGame();
    const moves = legalMoves(state, 'alice');
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.type === 'choose_peek')).toBe(true);
    // C(4, 2) = 6 combinations.
    expect(moves.length).toBe(6);
  });

  it('returns empty for player who already peeked', () => {
    const state = makeGame();
    const afterAlice = applyMove(state, {
      type: 'choose_peek',
      playerId: 'alice',
      indices: [0, 1],
    });
    expect(afterAlice.ok).toBe(true);
    if (!afterAlice.ok) return;
    const moves = legalMoves(afterAlice.state, 'alice');
    expect(moves.length).toBe(0);
  });

  it('returns empty for unknown player during peek_phase', () => {
    const state = makeGame();
    expect(legalMoves(state, 'nobody').length).toBe(0);
  });

  it('returns empty after all players peek (status now playing)', () => {
    const state = advancePastPeek(makeGame());
    expect(state.status).toBe('playing');
    // legalMoves for peek_phase path should be skipped entirely.
    const moves = legalMoves(state, 'alice');
    expect(moves.map((m) => m.type)).toContain('draw_from_deck'); // now in playing
  });
});

// ---------------------------------------------------------------------------
// Playing — idle (current player)
// ---------------------------------------------------------------------------

describe('legalMoves — playing idle (current player)', () => {
  it('includes draw_from_deck', () => {
    const state = makePlayingGame();
    expect(legalMoves(state, 'alice').some((m) => m.type === 'draw_from_deck')).toBe(true);
  });

  it('includes match_hand pairs: C(4,2) = 6 pairs', () => {
    const state = makePlayingGame();
    const moves = legalMoves(state, 'alice');
    expect(moves.filter((m) => m.type === 'match_hand').length).toBe(6);
  });

  it('includes match_discard for each slot when discard is non-empty', () => {
    const state = makePlayingGame();
    expect(state.discard.length).toBeGreaterThan(0);
    const moves = legalMoves(state, 'alice');
    expect(moves.filter((m) => m.type === 'match_discard').length).toBe(
      state.hands['alice']!.length,
    );
  });

  it('does NOT include match_discard when discard is empty', () => {
    const state = { ...makePlayingGame(), discard: [] };
    const moves = legalMoves(state, 'alice');
    expect(moves.some((m) => m.type === 'match_discard')).toBe(false);
  });

  it('includes call_pablo when pabloCalledBy is null', () => {
    const state = makePlayingGame();
    expect(legalMoves(state, 'alice').some((m) => m.type === 'call_pablo')).toBe(true);
  });

  it('does NOT include call_pablo when pablo already called', () => {
    const state = { ...makePlayingGame(), pabloCalledBy: 'alice' };
    expect(legalMoves(state, 'alice').some((m) => m.type === 'call_pablo')).toBe(false);
  });

  it('does NOT include draw_from_discard (removed in Phase 2.5)', () => {
    const state = makePlayingGame();
    expect(legalMoves(state, 'alice').some((m) => m.type === ('draw_from_discard' as string))).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Playing — idle (non-current player)
// ---------------------------------------------------------------------------

describe('legalMoves — playing idle (non-current player)', () => {
  it('returns [call_pablo] for non-current player when pabloCalledBy is null', () => {
    const state = makePlayingGame();
    const moves = legalMoves(state, 'bob');
    expect(moves.length).toBe(1);
    expect(moves[0]!.type).toBe('call_pablo');
  });

  it('returns empty for non-current player when pablo already called', () => {
    const state = { ...makePlayingGame(), pabloCalledBy: 'alice' };
    expect(legalMoves(state, 'bob').length).toBe(0);
  });

  it('all non-current players can call_pablo in a 3-player game', () => {
    const state = makePlayingGame(['alice', 'bob', 'carol']);
    // alice is turnIndex=0; bob and carol are non-current.
    const bobMoves = legalMoves(state, 'bob');
    const carolMoves = legalMoves(state, 'carol');
    expect(bobMoves.some((m) => m.type === 'call_pablo')).toBe(true);
    expect(carolMoves.some((m) => m.type === 'call_pablo')).toBe(true);
  });

  it('returns empty for non-current player when drawn !== null (off-turn Pablo blocked)', () => {
    const state = makePlayingGame();
    const withDraw = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    if (!withDraw.ok) return;
    expect(legalMoves(withDraw.state, 'bob').length).toBe(0);
  });

  it('returns empty for non-current player when pendingPower !== null', () => {
    const state: GameState = {
      ...makePlayingGame(),
      pendingPower: { rank: 7, power: 'peek_self', playerId: 'alice' },
    };
    expect(legalMoves(state, 'bob').length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Playing — drawn phase
// ---------------------------------------------------------------------------

describe('legalMoves — after deck draw', () => {
  it('includes swap_drawn for each hand slot', () => {
    const state = makePlayingGame();
    const drawResult = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(drawResult.ok).toBe(true);
    if (!drawResult.ok) return;
    const moves = legalMoves(drawResult.state, 'alice');
    expect(moves.filter((m) => m.type === 'swap_drawn').length).toBe(
      drawResult.state.hands['alice']!.length,
    );
  });

  it('includes discard_drawn', () => {
    const state = makePlayingGame();
    const drawResult = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    if (!drawResult.ok) return;
    expect(legalMoves(drawResult.state, 'alice').some((m) => m.type === 'discard_drawn')).toBe(
      true,
    );
  });

  it('includes match_drawn for each hand slot', () => {
    const state = makePlayingGame();
    const drawResult = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    if (!drawResult.ok) return;
    expect(
      legalMoves(drawResult.state, 'alice').filter((m) => m.type === 'match_drawn').length,
    ).toBe(drawResult.state.hands['alice']!.length);
  });

  it('does NOT include call_pablo while holding a drawn card', () => {
    const state = makePlayingGame();
    const drawResult = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    if (!drawResult.ok) return;
    expect(legalMoves(drawResult.state, 'alice').some((m) => m.type === 'call_pablo')).toBe(false);
  });

  it('returns empty for non-current player during drawn phase', () => {
    const state = makePlayingGame();
    const drawResult = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    if (!drawResult.ok) return;
    expect(legalMoves(drawResult.state, 'bob').length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Power pending
// ---------------------------------------------------------------------------

describe('legalMoves — power pending', () => {
  it('peek_self: only use_peek_self × handSize + skip_power', () => {
    const state: GameState = {
      ...makePlayingGame(),
      pendingPower: { rank: 7, power: 'peek_self', playerId: 'alice' },
    };
    const moves = legalMoves(state, 'alice');
    const handSize = state.hands['alice']!.length;
    expect(moves.filter((m) => m.type === 'use_peek_self').length).toBe(handSize);
    expect(moves.some((m) => m.type === 'skip_power')).toBe(true);
    expect(moves.some((m) => m.type === 'draw_from_deck')).toBe(false);
  });

  it('peek_opponent: use_peek_opponent for each (opponent × their slots) + skip_power', () => {
    const state: GameState = {
      ...makePlayingGame(['alice', 'bob', 'carol']),
      pendingPower: { rank: 8, power: 'peek_opponent', playerId: 'alice' },
    };
    const moves = legalMoves(state, 'alice');
    const bobSlots = state.hands['bob']!.length;
    const carolSlots = state.hands['carol']!.length;
    expect(moves.filter((m) => m.type === 'use_peek_opponent').length).toBe(bobSlots + carolSlots);
    expect(moves.some((m) => m.type === 'skip_power')).toBe(true);
  });

  it('swap_blind: use_swap_blind for each (self slot × opponent × opp slot) + skip_power', () => {
    const state: GameState = {
      ...makePlayingGame(['alice', 'bob']),
      pendingPower: { rank: 9, power: 'swap_blind', playerId: 'alice' },
    };
    const moves = legalMoves(state, 'alice');
    const aliceSlots = state.hands['alice']!.length;
    const bobSlots = state.hands['bob']!.length;
    expect(moves.filter((m) => m.type === 'use_swap_blind').length).toBe(aliceSlots * bobSlots);
    expect(moves.some((m) => m.type === 'skip_power')).toBe(true);
  });

  it('returns empty for non-current player during power pending', () => {
    const state: GameState = {
      ...makePlayingGame(),
      pendingPower: { rank: 7, power: 'peek_self', playerId: 'alice' },
    };
    expect(legalMoves(state, 'bob').length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Ended
// ---------------------------------------------------------------------------

describe('legalMoves — ended', () => {
  it('returns empty for everyone', () => {
    const state = { ...makePlayingGame(), status: 'ended' as const };
    expect(legalMoves(state, 'alice').length).toBe(0);
    expect(legalMoves(state, 'bob').length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Variable hand size
// ---------------------------------------------------------------------------

describe('legalMoves — variable hand size', () => {
  it('match_hand reflects actual hand size (3 cards → 3 pairs)', () => {
    const state = { ...makePlayingGame(), hands: { ...makePlayingGame().hands } };
    // Shrink alice's hand to 3.
    const alice3 = state.hands['alice']!.slice(0, 3);
    const shrunk = { ...state, hands: { ...state.hands, alice: alice3 } };
    const moves = legalMoves(shrunk, 'alice');
    // C(3,2) = 3 pairs.
    expect(moves.filter((m) => m.type === 'match_hand').length).toBe(3);
  });

  it('match_discard reflects actual hand size (3 cards → 3 slots)', () => {
    const state = makePlayingGame();
    const alice3 = state.hands['alice']!.slice(0, 3);
    const shrunk = { ...state, hands: { ...state.hands, alice: alice3 } };
    const moves = legalMoves(shrunk, 'alice');
    expect(moves.filter((m) => m.type === 'match_discard').length).toBe(3);
  });
});
