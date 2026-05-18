/**
 * CardSlotGrid — generic 2×2 / 3×2 / 4×N grid of cards used by every
 * "pick a slot" surface (peek, match, swap, power).
 *
 * It deliberately takes its slot data as a prop rather than reading from
 * the store so that the same component can render:
 *  - the local player's hand (with face-up overrides for reveal phases),
 *  - any opponent's hand (always face-down for blind picking),
 *  - a synthetic slot list (e.g. peek-phase grid).
 *
 * Card sizing scales with the parent `gridWidth` and the number of cards,
 * with a max width cap so 4-card hands read as a tidy 2×2 instead of
 * filling the whole screen.
 *
 * Hard rules followed:
 *  - No design tokens hardcoded — colors, radii, gaps come from `tokens`.
 *  - Taps route through `PlayingCard.onTap` because a wrapping
 *    TouchableOpacity does not receive the press (gesture-handler /
 *    Skia view tree captures it first). Selection styling lives on a
 *    sibling wrapper view.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { Card } from '@pablo/engine';
import { defaultCardTheme } from '../../../design/cardTheme';
import { tokens } from '../../../design/tokens';
import { PlayingCard } from '../../cards/PlayingCard';

const CARD_ASPECT = 1.46; // h/w
const GAP = tokens.space.sm;
/** Cap card width so a 4-card grid is a compact 2×2 rather than feature-wall. */
const DEFAULT_MAX_CARD_WIDTH = 96;
/** Placeholder used when no card data is available; the back is shown so
 *  suit/rank values never leak. */
const FACE_DOWN_CARD: Card = { suit: 'spades', rank: 1 };

export type CardSlot = {
  /** Stable identifier for this slot — usually the hand index. */
  readonly index: number;
  /** Card data when known to the local player; null = face-down placeholder. */
  readonly card: Card | null;
};

export type CardSlotGridProps = {
  readonly slots: ReadonlyArray<CardSlot>;
  /** Width budget for the whole grid (the parent container width). */
  readonly gridWidth: number;
  /** Optional max card width; defaults to 96. */
  readonly maxCardWidth?: number;
  /**
   * Decide whether a slot is shown face-up. Defaults to always face-down,
   * which is the correct behaviour for every "pick a slot" surface in v1
   * (the player relies on their memory).
   */
  readonly faceUpFor?: (slot: CardSlot) => boolean;
  /** Called when a slot is tapped. */
  readonly onTap?: (slot: CardSlot) => void;
  /** Slots that the player may pick. Others are dimmed and untappable. */
  readonly legalIndices?: ReadonlyArray<number>;
  /** Slots currently selected (e.g. mid-pick); shown with an accent border. */
  readonly selectedIndices?: ReadonlyArray<number>;
};

export function colsFor(handSize: number): number {
  if (handSize <= 4) return 2;
  if (handSize <= 6) return 3;
  return 4;
}

function chunk<T>(arr: ReadonlyArray<T>, size: number): ReadonlyArray<ReadonlyArray<T>> {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export function CardSlotGrid({
  slots,
  gridWidth,
  maxCardWidth = DEFAULT_MAX_CARD_WIDTH,
  faceUpFor,
  onTap,
  legalIndices,
  selectedIndices,
}: CardSlotGridProps) {
  const cols = colsFor(slots.length);
  const availableCardWidth = Math.floor((gridWidth - (cols + 1) * GAP) / cols);
  const cardWidth = Math.max(1, Math.min(availableCardWidth, maxCardWidth));
  const cardHeight = Math.floor(cardWidth * CARD_ASPECT);
  const rows = chunk(slots, cols);

  const isLegal = (idx: number) => (legalIndices === undefined ? true : legalIndices.includes(idx));
  const isSelected = (idx: number) =>
    selectedIndices !== undefined && selectedIndices.includes(idx);

  return (
    <View style={styles.grid}>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          {row.map((slot) => {
            const legal = isLegal(slot.index);
            const selected = isSelected(slot.index);
            const faceUp = faceUpFor ? faceUpFor(slot) : false;
            const cardData = slot.card ?? FACE_DOWN_CARD;
            return (
              <View
                key={`slot-${slot.index}`}
                style={[
                  styles.slot,
                  { width: cardWidth, height: cardHeight },
                  selected && styles.slotSelected,
                  !legal && styles.slotDimmed,
                ]}
              >
                <PlayingCard
                  card={cardData}
                  faceUp={faceUp}
                  theme={defaultCardTheme}
                  size={{ width: cardWidth, height: cardHeight }}
                  draggable={false}
                  flippable={false}
                  onTap={onTap && legal ? () => onTap(slot) : undefined}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    alignSelf: 'center',
    gap: GAP,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
    justifyContent: 'center',
  },
  slot: {
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  slotSelected: {
    borderColor: tokens.color.accent.primary,
  },
  slotDimmed: {
    opacity: 0.35,
  },
});
