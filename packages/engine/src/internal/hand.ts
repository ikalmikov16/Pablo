/**
 * Hand-slot manipulation helpers.
 * Internal — not re-exported from @pablo/engine.
 */

import type { CardId, HandIndex } from '../types';

/**
 * Remove slots from a hand by index. Returns the compacted new hand and an
 * indexMap where indexMap[oldIdx] = newIdx, or undefined if that slot was
 * removed.
 *
 * `removed` may be in any order; duplicates are silently de-duplicated.
 */
export function removeSlots(
  hand: ReadonlyArray<CardId>,
  removed: ReadonlyArray<HandIndex>,
): { newHand: ReadonlyArray<CardId>; indexMap: ReadonlyArray<number | undefined> } {
  const removedSet = new Set(removed);
  const indexMap: (number | undefined)[] = new Array(hand.length).fill(undefined);
  const newHand: CardId[] = [];

  for (let i = 0; i < hand.length; i++) {
    if (!removedSet.has(i)) {
      indexMap[i] = newHand.length;
      newHand.push(hand[i]!);
    }
  }

  return { newHand, indexMap };
}
