import type { GameRules, GameState, PlayerId } from './types';
import { DEFAULT_RULES } from './types';

/**
 * Build the initial state for a new round.
 *
 * STUB — the Phase 2 agent must implement:
 *  - Build a 52-card catalog (suits × ranks).
 *  - Shuffle using a seeded PRNG (NOT Math.random — randomness comes from `seed`).
 *  - Deal `rules.initialHandSize` cards to each player.
 *  - Flip the top card of the remaining deck to start the discard pile.
 *  - Set turnIndex to 0, status to 'playing', drawn to null.
 *  - Initialize scores to 0 for every player.
 *
 * See docs/GAME_LOGIC.md for the canonical rules.
 */
export function newGame(opts: {
  readonly id: string;
  readonly players: ReadonlyArray<PlayerId>;
  readonly seed: string;
  readonly rules?: Partial<GameRules>;
}): GameState {
  // intentionally unimplemented; Phase 2 agent fills this in
  void opts;
  void DEFAULT_RULES;
  throw new Error('newGame: not implemented — see packages/engine/src/newGame.ts');
}
