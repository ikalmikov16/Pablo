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
};

export function OwnHandGrid({ gridWidth, catalog, cardWidth }: Props) {
  const selfId = useGameStore(selectSelf);
  const handSlots = useGameStoreShallow(selectMyHandSlotsDisplay);
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
        spotlight={spotlightKeys.has(anchorKey({ kind: 'ownSlot', index: slot.index }))}
        layoutTransition={layoutTransition}
      >
        {children}
      </OwnSlotWrapper>
    ),
    [destKeys, layoutTransition, shakeSlots, sourceKeys, spotlightKeys],
  );

  return (
    <CardSlotGrid
      slots={slots}
      gridWidth={gridWidth}
      cardWidth={cardWidth}
      maxCardWidth={tokens.game.size.ownCardMax}
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
  spotlight,
  layoutTransition,
}: {
  readonly slot: CardSlot;
  readonly children: React.ReactNode;
  readonly size: { readonly width: number; readonly height: number };
  readonly ghosted: boolean;
  readonly shake: boolean;
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
          [
            tokens.game.choreography.spotlightBorderTransparent,
            tokens.game.choreography.spotlightBorderColor,
          ],
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
      style={[wrapperStyle, styles.slotWrapper, size]}
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
});
