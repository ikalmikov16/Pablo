/**
 * Pure deck-stack decoration helpers.
 */

const DECK_LAYER_THRESHOLDS = [
  { min: 25, layers: 3 },
  { min: 10, layers: 2 },
  { min: 2, layers: 1 },
] as const;

/** How many fake edge layers render under the deck top card. */
export function deckDepthLayers(deckCount: number): 0 | 1 | 2 | 3 {
  if (deckCount <= 1) return 0;
  for (const { min, layers } of DECK_LAYER_THRESHOLDS) {
    if (deckCount >= min) return layers;
  }
  return 0;
}
