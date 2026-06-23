/**
 * Pure helper functions for card display.
 * No React, no Skia, no Reanimated — just data transforms.
 */
import type { Rank, Suit } from '@pablo/engine';
import type { CardTheme } from '../../../design/cardTheme';

/** Unicode suit glyph for text labels (toasts, banners). Card art uses Skia paths. */
export function suitGlyph(suit: Suit): string {
  switch (suit) {
    case 'hearts':
      return '♥';
    case 'diamonds':
      return '♦';
    case 'clubs':
      return '♣';
    case 'spades':
      return '♠';
  }
}

/** Display label for a rank (Ace → A, 11 → J, 12 → Q, 13 → K). */
export function rankLabel(rank: Rank): string {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return String(rank);
}

/** Whether a suit is "red" for color-coding purposes. */
export function isRedSuit(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

/** Pick the correct suit color from the active theme palette. */
export function suitColor(suit: Suit, theme: CardTheme): string {
  return isRedSuit(suit) ? theme.face.palette.red : theme.face.palette.black;
}
