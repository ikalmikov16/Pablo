import type { GameState, RoundScore } from './types';

/**
 * Compute scores at the end of a round.
 *
 * STUB — Phase 2 agent implements per docs/GAME_LOGIC.md "Scoring" section:
 *  - Sum hand values per player using `rules.kingValue` and `rules.jackQueenValue`.
 *  - If Pablo caller had the lowest score: caller scores 0, others score their hand.
 *  - If Pablo caller did NOT have the lowest: caller scores hand + `rules.pabloPenalty`.
 *  - Ties for lowest among non-callers: all tied players score 0.
 *  - Update cumulative scores.
 */
export function scoreRound(state: GameState): RoundScore {
  void state;
  throw new Error('scoreRound: not implemented');
}
