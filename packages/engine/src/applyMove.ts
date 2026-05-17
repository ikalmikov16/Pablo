import type { GameState, Move, MoveResult } from './types';

/**
 * Apply a single move to the game state.
 *
 * STUB — the Phase 2 agent must implement every branch of `Move`,
 * returning `{ ok: false, error }` for any illegal move. See docs/GAME_LOGIC.md.
 *
 * MUST be pure: do not mutate `state`; construct and return a new object.
 */
export function applyMove(state: GameState, move: Move): MoveResult {
  void state;
  void move;
  return { ok: false, error: 'unknown_move' };
}
