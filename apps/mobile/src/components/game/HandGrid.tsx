/**
 * HandGrid — renders the local player's variable-size hand.
 *
 * - Cards are keyed by id (or slot index for face-down) so they never remount.
 * - Layout animates via Reanimated LinearTransition when hand size changes.
 * - Tap selects a slot; the selection is lifted into the store.
 */

import React, { useCallback } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import type { Card } from '@pablo/engine';
import { defaultCardTheme } from '../../design/cardTheme';
import { tokens } from '../../design/tokens';
import { useGameStore } from '../../store/provider';
import { selectMyHandSlots, selectSelection } from '../../store/selectors';
import { PlayingCard } from '../cards/PlayingCard';

const CARD_ASPECT = 1.46; // h/w
const GAP = tokens.space.sm;

function gridLayoutFor(handSize: number): { cols: number; rows: number } {
  if (handSize <= 4) return { cols: 2, rows: 2 };
  if (handSize <= 6) return { cols: 3, rows: 2 };
  if (handSize <= 8) return { cols: 4, rows: 2 };
  return { cols: 4, rows: Math.ceil(handSize / 4) };
}

type Props = {
  readonly gridWidth: number;
  readonly catalog: Readonly<Record<string, Card>>;
  /** Called when a slot is tapped. Passes the slot index. */
  readonly onSlotTap?: (index: number) => void;
  /** Indices that should be highlighted as selectable. */
  readonly highlightIndices?: ReadonlyArray<number>;
};

export function HandGrid({ gridWidth, catalog, onSlotTap, highlightIndices }: Props) {
  const slots = useGameStore(selectMyHandSlots);
  const selection = useGameStore(selectSelection);

  const { cols } = gridLayoutFor(slots.length);
  const cardWidth = Math.floor((gridWidth - (cols + 1) * GAP) / cols);
  const cardHeight = Math.floor(cardWidth * CARD_ASPECT);

  const isHighlighted = useCallback(
    (idx: number) => highlightIndices?.includes(idx) ?? false,
    [highlightIndices],
  );

  const isSelected = useCallback(
    (idx: number) => {
      if (selection.kind === 'one') return selection.index === idx;
      if (selection.kind === 'two') return selection.indexA === idx || selection.indexB === idx;
      return false;
    },
    [selection],
  );

  // Each slot is wrapped in an Animated.View with LinearTransition so that
  // when a card is removed (match) or added (penalty) the remaining slots
  // slide to their new positions instead of jumping.
  const layoutTransition = LinearTransition.springify().damping(18).stiffness(200);

  return (
    <View style={[styles.grid, { padding: GAP }]}>
      {slots.map((slot) => {
        const card = slot.cardId ? catalog[slot.cardId] : null;
        const selected = isSelected(slot.index);
        const highlighted = isHighlighted(slot.index);
        const key = slot.cardId ?? `face-down-${slot.index}`;

        return (
          <Animated.View
            key={key}
            layout={layoutTransition}
            style={[
              styles.slotWrapper,
              {
                width: cardWidth,
                height: cardHeight,
                marginRight: GAP,
                marginBottom: GAP,
              },
              selected && styles.selected,
              highlighted && styles.highlighted,
            ]}
          >
            <TouchableOpacity
              onPress={() => onSlotTap?.(slot.index)}
              activeOpacity={0.8}
              style={styles.slotInner}
            >
              {card ? (
                <PlayingCard
                  card={card}
                  faceUp={slot.faceUp}
                  theme={defaultCardTheme}
                  size={{ width: cardWidth, height: cardHeight }}
                  draggable={false}
                  flippable={false}
                />
              ) : (
                <View
                  style={[
                    styles.faceDownSlot,
                    { width: cardWidth, height: cardHeight, borderRadius: tokens.radius.md },
                  ]}
                />
              )}
            </TouchableOpacity>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'center',
  },
  slotWrapper: {
    borderRadius: tokens.radius.md,
  },
  slotInner: {
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
  faceDownSlot: {
    backgroundColor: tokens.game.surface.slotEmpty,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    borderStyle: 'dashed',
  },
  selected: {
    shadowColor: tokens.color.accent.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 6,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.game.surface.slotSelected,
  },
  highlighted: {
    borderWidth: 2,
    borderColor: tokens.color.accent.primary,
    borderRadius: tokens.radius.md,
  },
});
