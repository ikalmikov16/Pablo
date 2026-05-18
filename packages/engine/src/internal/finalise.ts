/**
 * Round-finalisation helper used by applyMove and drawPenaltyCard.
 * Extracted to a separate internal module so penalty.ts can import it
 * without creating a circular dependency with applyMove.ts.
 *
 * Internal — not re-exported from @pablo/engine.
 */

import type { GameEvent, GameState } from '../types';
import { scoreRound } from '../score';

/**
 * Transition a game to `status='ended'`:
 *  - Scores the round via scoreRound.
 *  - Emits `round_ended` with the per-player hand totals and winners array.
 *  - Writes perPlayerHand into state.scores so the projection reflects results.
 *  - Clears drawn and pendingPower (in case the round ended mid-action).
 */
export function finaliseRound(state: GameState, events: GameEvent[]): { state: GameState } {
  const ended: GameState = { ...state, status: 'ended', drawn: null, pendingPower: null };
  const roundScore = scoreRound(ended);

  events.push({
    type: 'round_ended',
    scores: roundScore.perPlayerHand,
    winners: roundScore.winners,
  });

  return {
    state: { ...ended, scores: roundScore.perPlayerHand },
  };
}
