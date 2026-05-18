/**
 * Deck-reshuffle helper shared by drawTopOfDeck and drawPenaltyCard.
 * Internal — not re-exported from @pablo/engine.
 */

import type { GameEvent, GameState } from '../types';
import { makeRng, shuffle } from './rng';

/**
 * Reshuffle the discard pile (minus its top card) back into the deck.
 *
 * Increments reshuffleCount. Sub-seed: `${state.seed}:rs${newCount}`.
 * Emits `deck_reshuffled`. Does NOT end the round — callers check for an
 * empty deck afterward and finalise if needed.
 *
 * Precondition: discard.length > 1 (caller is responsible for checking).
 */
export function reshuffleDiscardIntoDeck(state: GameState, events: GameEvent[]): GameState {
  const reshuffleCount = state.reshuffleCount + 1;
  const subSeed = `${state.seed}:rs${reshuffleCount}`;
  const rng = makeRng(subSeed);

  const topDiscard = state.discard[state.discard.length - 1]!;
  const toReshuffle = state.discard.slice(0, state.discard.length - 1);
  const newDeck = shuffle(toReshuffle, rng);

  events.push({ type: 'deck_reshuffled' });

  return {
    ...state,
    deck: newDeck,
    discard: [topDiscard],
    reshuffleCount,
  };
}
