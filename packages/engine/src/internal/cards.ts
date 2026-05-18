/**
 * Card catalog builder and value helpers.
 * Internal — not re-exported from @pablo/engine.
 */

import type { Card, CardId, GameRules, Rank, Suit } from '../types';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

/** Stable CardId encoding: rank padded to 2 digits + suit initial ('H','D','C','S'). */
export function cardId(suit: Suit, rank: Rank): CardId {
  const suitChar = suit[0]!.toUpperCase();
  return `${rank.toString().padStart(2, '0')}${suitChar}`;
}

/**
 * Build the full 52-card catalog.
 * Returns both the catalog map and the ordered list of all card ids
 * (in a canonical suit × rank order, before shuffling).
 */
export function buildCatalog(): { catalog: Record<CardId, Card>; ids: CardId[] } {
  const catalog: Record<CardId, Card> = {};
  const ids: CardId[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const id = cardId(suit, rank);
      catalog[id] = { suit, rank };
      ids.push(id);
    }
  }
  return { catalog, ids };
}

/**
 * Point value of a single card under the given rules.
 * `cardValueOverrides` take precedence over the rank-based lookup.
 */
export function cardValue(card: Card, rules: GameRules): number {
  for (const override of rules.cardValueOverrides) {
    if (override.suit === card.suit && override.rank === card.rank) {
      return override.value;
    }
  }
  if (card.rank === 1) return 1;
  if (card.rank <= 10) return card.rank;
  if (card.rank === 11) return rules.jackValue;
  if (card.rank === 12) return rules.queenValue;
  return rules.kingValue; // rank 13
}
