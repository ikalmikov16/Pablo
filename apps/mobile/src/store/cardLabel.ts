/**
 * Localised display label for a card in toasts and banners.
 */

import type { Card, CardId } from '@pablo/engine';
import { rankLabel, suitGlyph } from '../components/cards/internal/cardHelpers';

export function formatCardLabel(card: Card): string {
  return `${rankLabel(card.rank)}${suitGlyph(card.suit)}`;
}

export function formatCardIdLabel(catalog: Readonly<Record<string, Card>>, cardId: CardId): string {
  const card = catalog[cardId];
  return card ? formatCardLabel(card) : cardId;
}
