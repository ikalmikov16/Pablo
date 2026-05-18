/**
 * HandGrid — renders the local player's variable-size hand.
 *
 * Layout:
 *  - Explicit row chunking guarantees the grid stays in `cols` columns
 *    regardless of available width.
 *  - `cardWidth` is the min of (i) the width derived from `gridWidth` and
 *    (ii) `MAX_CARD_WIDTH`. This keeps the grid from blowing up on a
 *    near-empty screen — the default 4-card hand reads as a compact 2×2.
 *
 * Visibility & uniformity:
 *  - The local hand is ALWAYS face-down here. We render every slot through
 *    `PlayingCard` (with a placeholder card for slots we don't know yet)
 *    so all four positions look identical — the player cannot tell from
 *    the back which cards they have peeked.
 *  - Slot order is preserved across re-renders because every slot is keyed
 *    by its index. The card *inside* a slot may change (swap, penalty),
 *    but the slot itself never remounts.
 *  - Peeks reveal cards only inside dedicated overlays (PeekOverlay,
 *    PowerFlow). Once those overlays close, the card is face-down again
 *    here — the player must memorise.
 */

import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import type { Card } from '@pablo/engine';
import { defaultCardTheme } from '../../design/cardTheme';
import { tokens } from '../../design/tokens';
import { useGameStore, useGameStoreShallow } from '../../store/provider';
import { selectMyHandSlots, selectSelection } from '../../store/selectors';
import { PlayingCard } from '../cards/PlayingCard';

const CARD_ASPECT = 1.46; // h/w
const GAP = tokens.space.sm;
/** Cap card width so the hand reads as a tidy grid, not a feature wall. */
const MAX_CARD_WIDTH = 96;
/** Placeholder shown when we have no engine-known card for a slot. The card's
 *  back is rendered (faceUp is always false), so suit/rank values never show. */
const FACE_DOWN_CARD: Card = { suit: 'spades', rank: 1 };

function gridLayoutFor(handSize: number): { cols: number; rows: number } {
  if (handSize <= 4) return { cols: 2, rows: 2 };
  if (handSize <= 6) return { cols: 3, rows: 2 };
  if (handSize <= 8) return { cols: 4, rows: 2 };
  return { cols: 4, rows: Math.ceil(handSize / 4) };
}

function chunk<T>(arr: ReadonlyArray<T>, size: number): ReadonlyArray<ReadonlyArray<T>> {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
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
  const slots = useGameStoreShallow(selectMyHandSlots);
  const selection = useGameStore(selectSelection);

  const { cols } = gridLayoutFor(slots.length);
  const availableCardWidth = Math.floor((gridWidth - (cols + 1) * GAP) / cols);
  const cardWidth = Math.max(1, Math.min(availableCardWidth, MAX_CARD_WIDTH));
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

  const layoutTransition = LinearTransition.springify().damping(18).stiffness(200);
  const rows = chunk(slots, cols);

  return (
    <View style={styles.grid}>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          {row.map((slot) => {
            const card = slot.cardId ? catalog[slot.cardId] : null;
            const selected = isSelected(slot.index);
            const highlighted = isHighlighted(slot.index);
            return (
              <Animated.View
                // Key by slot index — slots are stable visual positions and
                // never remount when the card inside changes.
                key={`slot-${slot.index}`}
                layout={layoutTransition}
                style={[
                  styles.slotWrapper,
                  { width: cardWidth, height: cardHeight },
                  selected && styles.selected,
                  highlighted && styles.highlighted,
                ]}
              >
                <PlayingCard
                  card={card ?? FACE_DOWN_CARD}
                  faceUp={false}
                  theme={defaultCardTheme}
                  size={{ width: cardWidth, height: cardHeight }}
                  draggable={false}
                  flippable={false}
                  onTap={onSlotTap ? () => onSlotTap(slot.index) : undefined}
                />
              </Animated.View>
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
  slotWrapper: {
    borderRadius: tokens.radius.md,
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
