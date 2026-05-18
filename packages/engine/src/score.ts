import type { GameState, PlayerId, RoundScore } from './types';
import { cardValue } from './internal/cards';

/**
 * Compute scores at the end of a game.
 *
 * Rules (from docs/GAME_LOGIC.md):
 *  - Sum each player's hand values.
 *  - The player(s) with the lowest sum win. Ties produce multiple winners.
 *  - There is no Pablo-caller penalty (removed in 2026-05-17 revision).
 *  - There is no caller-vs-lowest special case.
 *
 * Returns perPlayerHand (raw totals) and winners (all players tied for lowest).
 */
export function scoreRound(state: GameState): RoundScore {
  const { players, hands, rules, cardCatalog } = state;

  const perPlayerHand: Record<PlayerId, number> = {};
  for (const p of players) {
    const hand = hands[p] ?? [];
    let total = 0;
    for (const cardId of hand) {
      const card = cardCatalog[cardId];
      if (card) total += cardValue(card, rules);
    }
    perPlayerHand[p] = total;
  }

  let lowestHand = Infinity;
  for (const p of players) {
    if (perPlayerHand[p]! < lowestHand) lowestHand = perPlayerHand[p]!;
  }

  const winners = players.filter((p) => perPlayerHand[p] === lowestHand);

  return { perPlayerHand, winners };
}
