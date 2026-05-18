/**
 * Penalty-card helper.
 * Internal — not re-exported from @pablo/engine.
 */

import type { GameEvent, GameState, PlayerId } from '../types';
import { reshuffleDiscardIntoDeck } from './reshuffle';
import { finaliseRound } from './finalise';

/**
 * Draw a penalty card from the top of the deck and append it face-down to the
 * recipient's hand.
 *
 * Rules (docs/GAME_LOGIC.md § "Penalty cards"):
 *  - The penalty card is face-down; the owner does NOT learn its rank.
 *    No knownCards entry is written.
 *  - If the deck is empty, reshuffle the discard (minus its top card) first.
 *  - If the deck is still empty after reshuffle, the round ends.
 *
 * Returns { state, roundEnded }. When roundEnded=true the caller must return
 * immediately without advancing the turn.
 */
export function drawPenaltyCard(
  state: GameState,
  recipient: PlayerId,
  events: GameEvent[],
): { state: GameState; roundEnded: boolean } {
  let s = state;

  if (s.deck.length === 0) {
    if (s.discard.length <= 1) {
      const { state: finalState } = finaliseRound(s, events);
      return { state: finalState, roundEnded: true };
    }
    s = reshuffleDiscardIntoDeck(s, events);
    if (s.deck.length === 0) {
      const { state: finalState } = finaliseRound(s, events);
      return { state: finalState, roundEnded: true };
    }
  }

  const newDeck = s.deck.slice();
  const cardId = newDeck.pop()!;
  const newHand = [...s.hands[recipient]!, cardId];

  events.push({ type: 'penalty_card_dealt', playerId: recipient });

  return {
    state: {
      ...s,
      deck: newDeck,
      hands: { ...s.hands, [recipient]: newHand },
    },
    roundEnded: false,
  };
}
