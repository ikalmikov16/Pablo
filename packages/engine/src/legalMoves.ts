import type { GameState, Move, PlayerId } from './types';

/**
 * Return the list of legal moves for `playerId` in the current state.
 *
 * Used by the UI to enable/disable controls and (later) by a bot opponent.
 *
 * STUB — Phase 2 agent implements.
 */
export function legalMoves(state: GameState, playerId: PlayerId): ReadonlyArray<Move> {
  void state;
  void playerId;
  return [];
}
