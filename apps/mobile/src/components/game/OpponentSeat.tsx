/**
 * OpponentSeat — name (above) and a compact face-down 2×2 hand grid.
 *
 * Never reads `knownCards` for rendering — peeks are shown only in overlays.
 */

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { PlayerViewEntry } from '@pablo/engine';
import { radiusFor } from '../cards/internal/cardSizes';
import { tokens } from '../../design/tokens';
import { timingFor } from '../../feedback/motion';
import { useGameStore } from '../../store/provider';
import {
  selectActorFocusPlayerIds,
  selectDestinationAnchorKeys,
  selectMatchFailedShakeSlots,
  selectSourceAnchorKeys,
  selectSpotlightAnchorKeys,
} from '../../store/selectors';
import { anchorKey } from '../../store/flightTypes';
import { CardSlotGrid, type CardSlot } from './internal/CardSlotGrid';
import { useActorFocusIntensity, useSpotlightRing } from './internal/useCueMotion';
import { useAnchor } from './internal/useAnchor';

type Props = {
  readonly entry: PlayerViewEntry;
  readonly displayName: string;
  readonly cardWidth: number;
  readonly isCurrent: boolean;
};

const SHAKE_STEP = timingFor('snap', 'instant');
const FOCUS_BG = tokens.game.surface.slotSelected;
const FOCUS_BG_OFF = 'rgba(45,106,79,0)';

function OpponentSlotWrapper({
  entryId,
  slot,
  children,
  size,
  destKeys,
  sourceKeys,
  shake,
  spotlight,
}: {
  readonly entryId: string;
  readonly slot: CardSlot;
  readonly children: React.ReactNode;
  readonly size: { readonly width: number; readonly height: number };
  readonly destKeys: ReadonlySet<string>;
  readonly sourceKeys: ReadonlySet<string>;
  readonly shake: boolean;
  readonly spotlight: boolean;
}) {
  const { ref, onLayout } = useAnchor({
    kind: 'opponentSlot',
    playerId: entryId,
    index: slot.index,
  });
  const shakeX = useSharedValue(0);
  const ringOpacity = useSharedValue(0);
  useSpotlightRing(spotlight, ringOpacity);

  const slotAnchor = anchorKey({ kind: 'opponentSlot', playerId: entryId, index: slot.index });
  const ghosted = destKeys.has(slotAnchor) || sourceKeys.has(slotAnchor);
  const slotRadius = radiusFor(size.width);

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
      style={[wrapperStyle, styles.slotWrapper, size]}
      collapsable={false}
    >
      <Animated.View style={[StyleSheet.absoluteFillObject, contentStyle]}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

export function OpponentSeat({ entry, displayName, cardWidth, isCurrent }: Props) {
  const destKeys = useGameStore(selectDestinationAnchorKeys);
  const sourceKeys = useGameStore(selectSourceAnchorKeys);
  const gridLayoutTransition = LinearTransition.springify().damping(20).stiffness(180);
  const shakeSlots = useGameStore((s) => selectMatchFailedShakeSlots(s, entry.id));
  const actorFocused = useGameStore((s) => selectActorFocusPlayerIds(s).has(entry.id));
  const spotlightKeys = useGameStore(selectSpotlightAnchorKeys);
  const seatAnchor = useAnchor({ kind: 'opponentSeat', playerId: entry.id });
  const focusIntensity = useSharedValue(0);
  useActorFocusIntensity(actorFocused, focusIntensity);

  const slots = Array.from({ length: entry.handSize }, (_, index) => ({
    index,
    card: null,
  }));

  const gap = tokens.game.table.handGap;
  const cols = 2;
  const gridWidth = cols * cardWidth + (cols - 1) * gap;

  const slotWrapper = React.useCallback(
    (slot: CardSlot, children: React.ReactNode, size: { width: number; height: number }) => (
      <OpponentSlotWrapper
        entryId={entry.id}
        slot={slot}
        size={size}
        destKeys={destKeys}
        sourceKeys={sourceKeys}
        shake={shakeSlots.includes(slot.index)}
        spotlight={spotlightKeys.has(
          anchorKey({ kind: 'opponentSlot', playerId: entry.id, index: slot.index }),
        )}
      >
        {children}
      </OpponentSlotWrapper>
    ),
    [destKeys, entry.id, shakeSlots, sourceKeys, spotlightKeys],
  );

  const seatAnimStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(focusIntensity.value, [0, 1], [FOCUS_BG_OFF, FOCUS_BG]),
    borderRadius: tokens.radius.md,
  }));

  const nameAnimStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      focusIntensity.value,
      [0, 1],
      [tokens.color.text.primary, tokens.color.accent.primary],
    ),
  }));

  return (
    <View style={[styles.seat, isCurrent && styles.current]}>
      <View
        ref={seatAnchor.ref}
        onLayout={seatAnchor.onLayout}
        style={styles.seatAnchorMarker}
        collapsable={false}
        pointerEvents="none"
      />
      <Animated.View style={[styles.seatBody, actorFocused && styles.actorFocusPad, seatAnimStyle]}>
        <Animated.Text style={[styles.name, nameAnimStyle]} numberOfLines={1}>
          {displayName}
        </Animated.Text>
        <Animated.View layout={gridLayoutTransition}>
          <CardSlotGrid
            slots={slots}
            gridWidth={gridWidth}
            cardWidth={cardWidth}
            gap={gap}
            slotWrapper={slotWrapper}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  seat: {
    alignItems: 'center',
    gap: tokens.game.table.nameGap,
  },
  seatBody: {
    alignItems: 'center',
    gap: tokens.game.table.nameGap,
  },
  actorFocusPad: {
    padding: tokens.space.xs,
  },
  seatAnchorMarker: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    top: '55%',
    alignSelf: 'center',
  },
  current: {
    backgroundColor: tokens.game.surface.currentTurnTint,
    borderRadius: tokens.radius.md,
    padding: tokens.space.xs,
  },
  name: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.semibold,
    maxWidth: '100%',
  },
  slotWrapper: {},
});
