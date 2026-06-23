/**
 * SVG suit paths in a unit box [0, 1]² — parsed once per suit in PlayingCard.
 */
import type { Suit } from '@pablo/engine';

const SUIT_PATHS: Readonly<Record<Suit, string>> = {
  hearts:
    'M 0.5 0.92 C 0.5 0.92 0.06 0.58 0.06 0.36 C 0.06 0.16 0.26 0.04 0.5 0.26 C 0.74 0.04 0.94 0.16 0.94 0.36 C 0.94 0.58 0.5 0.92 0.5 0.92 Z',
  diamonds: 'M 0.5 0.06 L 0.94 0.5 L 0.5 0.94 L 0.06 0.5 Z',
  spades:
    'M 0.5 0.08 C 0.34 0.28 0.08 0.34 0.08 0.52 C 0.08 0.72 0.28 0.86 0.5 0.68 C 0.72 0.86 0.92 0.72 0.92 0.52 C 0.92 0.34 0.66 0.28 0.5 0.08 Z M 0.5 0.68 L 0.42 0.94 L 0.58 0.94 Z',
  // Clover style: three overlapping circles (top, lower-left, lower-right) + a flared stem.
  clubs:
    'M 0.74 0.3 C 0.74 0.43 0.63 0.54 0.5 0.54 C 0.37 0.54 0.26 0.43 0.26 0.3 C 0.26 0.17 0.37 0.06 0.5 0.06 C 0.63 0.06 0.74 0.17 0.74 0.3 Z ' +
    'M 0.51 0.6 C 0.51 0.73 0.4 0.84 0.27 0.84 C 0.14 0.84 0.03 0.73 0.03 0.6 C 0.03 0.47 0.14 0.36 0.27 0.36 C 0.4 0.36 0.51 0.47 0.51 0.6 Z ' +
    'M 0.97 0.6 C 0.97 0.73 0.86 0.84 0.73 0.84 C 0.6 0.84 0.49 0.73 0.49 0.6 C 0.49 0.47 0.6 0.36 0.73 0.36 C 0.86 0.36 0.97 0.47 0.97 0.6 Z ' +
    'M 0.5 0.58 L 0.4 0.98 L 0.6 0.98 Z',
};

export function suitPath(suit: Suit): string {
  return SUIT_PATHS[suit];
}
