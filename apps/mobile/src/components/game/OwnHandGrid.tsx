/**
 * OwnHandGrid — local player's hand via CardSlotGrid + store-driven selection.
 */

import React, { useCallback, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { Card } from '@pablo/engine';
import { radiusFor } from '../cards/internal/cardSizes';
import { tokens } from '../../design/tokens';
import { timingFor } from '../../feedback/motion';
import { useGameStore, useGameStoreShallow } from '../../store/provider';
import {
  selectDestinationAnchorKeys,
  selectMatchFailedShakeSlots,
  selectMyHandSlotsDisplay,
  selectSourceAnchorKeys,
  selectSelection,
  selectSelf,
  selectSpotlightAnchorKeys,
} from '../../store/selectors';
import { anchorKey } from '../../store/flightTypes';
import { CardSlotGrid, type CardSlot } from './internal/CardSlotGrid';
import { useSpotlightRing } from './internal/useCueMotion';
import { useAnchor } from './internal/useAnchor';

const FACE_DOWN_CARD: Card = { suit: 'spades', rank: 1 };
const SHAKE_STEP = timingFor('snap', 'instant');
const NO_SHAKE_SLOTS: readonly number[] = [];

type Props = {
  readonly gridWidth: number;
  readonly catalog: Readonly<Record<string, Card>>;
  readonly cardWidth?: number;
  readonly onSlotTap?: (index: number) => void;
  readonly highlightIndices?: ReadonlyArray<number>;
};

export function OwnHandGrid({ gridWidth, catalog, cardWidth, onSlotTap, highlightIndices }: Props) {
  const selfId = useGameStore(selectSelf);
  const handSlots = useGameStoreShallow(selectMyHandSlotsDisplay);
  const selection = useGameStore(selectSelection);
  const destKeys = useGameStore(selectDestinationAnchorKeys);
  const sourceKeys = useGameStore(selectSourceAnchorKeys);
  const shakeSlots = useGameStore((s) =>
    selfId ? selectMatchFailedShakeSlots(s, selfId) : NO_SHAKE_SLOTS,
  );
  const spotlightKeys = useGameStore(selectSpotlightAnchorKeys);

  const slots: ReadonlyArray<CardSlot> = handSlots.map((s) => ({
    index: s.index,
    card: s.cardId ? (catalog[s.cardId] ?? FACE_DOWN_CARD) : null,
  }));

  const selectedIndices = React.useMemo(() => {
    if (selection.kind === 'one') return [selection.index];
    if (selection.kind === 'two') return [selection.indexA, selection.indexB];
    return [];
  }, [selection]);

  const isHighlighted = useCallback(
    (idx: number) => highlightIndices?.includes(idx) ?? false,
    [highlightIndices],
  );

  const isSelected = useCallback((idx: number) => selectedIndices.includes(idx), [selectedIndices]);

  const layoutTransition = LinearTransition.springify().damping(18).stiffness(200);

  const slotWrapper = useCallback(
    (slot: CardSlot, children: React.ReactNode, size: { width: number; height: number }) => (
      <OwnSlotWrapper
        slot={slot}
        size={size}
        ghosted={
          destKeys.has(anchorKey({ kind: 'ownSlot', index: slot.index })) ||
          sourceKeys.has(anchorKey({ kind: 'ownSlot', index: slot.index }))
        }
        shake={shakeSlots.includes(slot.index)}
        isSelected={isSelected(slot.index)}
        isHighlighted={isHighlighted(slot.index)}
        spotlight={spotlightKeys.has(anchorKey({ kind: 'ownSlot', index: slot.index }))}
        layoutTransition={layoutTransition}
      >
        {children}
      </OwnSlotWrapper>
    ),
    [destKeys, isHighlighted, isSelected, layoutTransition, shakeSlots, sourceKeys, spotlightKeys],
  );

  return (
    <CardSlotGrid
      slots={slots}
      gridWidth={gridWidth}
      cardWidth={cardWidth}
      maxCardWidth={tokens.game.size.ownCardMax}
      onTap={onSlotTap ? (s) => onSlotTap(s.index) : undefined}
      slotWrapper={slotWrapper}
    />
  );
}

function OwnSlotWrapper({
  slot,
  children,
  size,
  ghosted,
  shake,
  isSelected,
  isHighlighted,
  spotlight,
  layoutTransition,
}: {
  readonly slot: CardSlot;
  readonly children: React.ReactNode;
  readonly size: { readonly width: number; readonly height: number };
  readonly ghosted: boolean;
  readonly shake: boolean;
  readonly isSelected: boolean;
  readonly isHighlighted: boolean;
  readonly spotlight: boolean;
  readonly layoutTransition: ReturnType<typeof LinearTransition.springify>;
}) {
  const { ref, onLayout } = useAnchor({ kind: 'ownSlot', index: slot.index });
  const shakeX = useSharedValue(0);
  const ringOpacity = useSharedValue(0);
  useSpotlightRing(spotlight, ringOpacity);

  useEffect(() => {
    if (!shake) return;
    const offset = tokens.game.shake.offset;
    shakeX.value = withSequence(
      withTiming(offset, SHAKE_STEP),
      withTiming(-offset, SHAKE_STEP),
      withTiming(offset, SHAKE_STEP),
      withTiming(0, SHAKE_STEP),
    );
  }, [shake, shakeX]);

  const slotRadius = radiusFor(size.width);

  const wrapperStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
    borderWidth: ghosted ? 1 : tokens.game.choreography.spotlightBorderWidth,
    borderStyle: ghosted ? 'dashed' : 'solid',
    borderColor: ghosted
      ? tokens.game.surface.slotGhostBorder
      : interpolateColor(
          ringOpacity.value,
          [0, 1],
          ['rgba(45,106,79,0)', tokens.game.choreography.spotlightBorderColor],
        ),
    borderRadius: slotRadius,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: ghosted ? 0 : 1,
  }));

  return (
    <Animated.View
      ref={ref}
      onLayout={onLayout}
      layout={layoutTransition}
      style={[
        wrapperStyle,
        styles.slotWrapper,
        size,
        isSelected && styles.selected,
        isHighlighted && styles.highlighted,
      ]}
      collapsable={false}
    >
      <Animated.View style={[StyleSheet.absoluteFillObject, contentStyle]}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slotWrapper: {},
  selected: {
    shadowColor: tokens.color.accent.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 6,
    backgroundColor: tokens.game.surface.slotSelected,
  },
  highlighted: {
    borderWidth: 2,
    borderColor: tokens.color.accent.primary,
  },
});
