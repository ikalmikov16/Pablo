import type { GameState, PlayerId, PlayerView } from './types';

/**
 * Project a full GameState into what `playerId` is allowed to see.
 *
 * STUB — the Phase 2 agent must implement:
 *  - Hide deck order (only return `deckCount`).
 *  - Hide opponent hidden cards.
 *  - Include cards `playerId` has peeked at (their own initial 2 bottom, plus any cards revealed by 7/8/9/10 powers).
 *  - Include the discard pile top.
 *
 * NOTE: tracking "what `playerId` knows" requires per-player knowledge state.
 * The Phase 2 agent should decide whether that lives inside GameState or in a
 * sidecar structure. Document the decision in docs/PLAN.md.
 */
export function computePlayerView(state: GameState, playerId: PlayerId): PlayerView {
  void state;
  void playerId;
  throw new Error('computePlayerView: not implemented');
}
