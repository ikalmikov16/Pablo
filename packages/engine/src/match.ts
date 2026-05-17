import type { GameRules, MatchState, PlayerId, RoundScore } from './types';

/**
 * Match lifecycle helpers.
 *
 * STUBS — the Phase 2 agent implements per docs/GAME_LOGIC.md.
 *
 * A match holds multiple rounds. Score cap is `rules.maxScore`. The match
 * ends when any player's cumulative score reaches the cap; the winner is the
 * player with the *lowest* cumulative score at that point.
 */

export function newMatch(opts: {
  readonly id: string;
  readonly players: ReadonlyArray<PlayerId>;
  readonly seed: string;
  readonly rules?: Partial<GameRules>;
}): MatchState {
  void opts;
  throw new Error('newMatch: not implemented');
}

/** Start a new round inside an existing match. Status must be 'between_rounds' or fresh. */
export function startNextRound(match: MatchState): MatchState {
  void match;
  throw new Error('startNextRound: not implemented');
}

/** Finalize the current round, write into history, decide if match ends. */
export function endRound(match: MatchState, roundScore: RoundScore): MatchState {
  void match;
  void roundScore;
  throw new Error('endRound: not implemented');
}
