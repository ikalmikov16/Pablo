/**
 * Screen-root overlay that animates cards between snapshotted anchor positions.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import type { Card } from '@pablo/engine';
import { defaultCardTheme } from '../../design/cardTheme';
import { tokens } from '../../design/tokens';
import { flightMotionIntent, HIDDEN_EMERGE_MS, timingFor } from '../../feedback/motion';
import { useGameStore } from '../../store/provider';
import { selectActiveFlights } from '../../store/selectors';
import type { Flight } from '../../store/flightTypes';
import { PlayingCard } from '../cards/PlayingCard';

const FACE_DOWN_CARD: Card = { suit: 'spades', rank: 1 };
const { peakScale, peakShadow } = tokens.game.motion.lift;

/** Render at the largest visible size; animate uniform scale down so Skia stays sharp. */
function flightRenderSize(flight: Flight): { readonly w: number; readonly h: number } {
  return {
    w: Math.max(flight.fromCoords.w, flight.toCoords.w),
    h: Math.max(flight.fromCoords.h, flight.toCoords.h),
  };
}

/** Uniform scale from width so aspect ratio never skews (no separate scaleX/scaleY). */
function uniformScaleForRect(
  rectW: number,
  rectH: number,
  renderW: number,
  renderH: number,
): number {
  return Math.min(rectW / renderW, rectH / renderH);
}

type FlightCardProps = {
  readonly flight: Flight;
  readonly catalog: Readonly<Record<string, Card>>;
  readonly onComplete: (id: string) => void;
};

function FlightCard({ flight, catalog, onComplete }: FlightCardProps) {
  const progress = useSharedValue(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const completeFlight = useCallback((id: string) => {
    onCompleteRef.current(id);
  }, []);

  const intent = flightMotionIntent({
    emphasis: flight.emphasis,
    durationMs: flight.durationMs,
    toAnchor: flight.toAnchor,
  });
  const timingConfig = timingFor(intent, 'normal', { duration: flight.durationMs });

  const fromX = flight.fromCoords.x;
  const fromY = flight.fromCoords.y;
  const toX = flight.toCoords.x;
  const toY = flight.toCoords.y;
  const renderSize = flightRenderSize(flight);
  const renderW = renderSize.w;
  const renderH = renderSize.h;
  const startScale = uniformScaleForRect(
    flight.fromCoords.w,
    flight.fromCoords.h,
    renderW,
    renderH,
  );
  const endScale = uniformScaleForRect(flight.toCoords.w, flight.toCoords.h, renderW, renderH);
  const isHiddenEmerge = flight.emphasis === 'hiddenSwap';

  useEffect(() => {
    const finish = (finished: boolean | undefined) => {
      'worklet';
      if (finished) {
        runOnJS(completeFlight)(flight.id);
      }
    };

    progress.value = withDelay(flight.delayMs, withTiming(1, timingConfig, finish));
  }, [completeFlight, flight.delayMs, flight.id, progress, timingConfig]);

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const anchorX = interpolate(t, [0, 1], [fromX, toX]);
    const anchorY = interpolate(t, [0, 1], [fromY, toY]);

    let scale = interpolate(t, [0, 1], [startScale, endScale]);
    if (flight.liftEnabled) {
      const lift = Math.sin(t * Math.PI);
      scale *= 1 + lift * (peakScale - 1);
    }
    if (isHiddenEmerge) {
      const emergeEnd = Math.min(1, HIDDEN_EMERGE_MS / flight.durationMs);
      const emerge = interpolate(t, [0, emergeEnd], [0.6, 1], 'clamp');
      scale *= emerge;
    }

    const visibleW = renderW * scale;
    const visibleH = renderH * scale;
    const x = anchorX - (renderW - visibleW) / 2;
    const y = anchorY - (renderH - visibleH) / 2;

    const shadowOpacity = flight.liftEnabled ? Math.sin(t * Math.PI) * peakShadow : 0;
    const elevation = Math.round(shadowOpacity * 24);

    return {
      position: 'absolute',
      left: 0,
      top: 0,
      width: renderW,
      height: renderH,
      zIndex: flight.zRank,
      shadowColor: tokens.shadow.card.shadowColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity,
      shadowRadius: 8,
      elevation,
      transform: [{ translateX: x }, { translateY: y }, { scale }],
    };
  });

  const displayFaceUp = flight.flipMidFlight ? false : flight.faceUp && flight.cardId !== null;

  const card =
    flight.faceUp && flight.cardId ? (catalog[flight.cardId] ?? FACE_DOWN_CARD) : FACE_DOWN_CARD;

  return (
    <Animated.View style={style} pointerEvents="none">
      <FlightCardFace
        flight={flight}
        card={card}
        displayFaceUp={displayFaceUp}
        progress={progress}
        renderSize={renderSize}
      />
    </Animated.View>
  );
}

function FlightCardFace({
  flight,
  card,
  displayFaceUp,
  progress,
  renderSize,
}: {
  readonly flight: Flight;
  readonly card: Card;
  readonly displayFaceUp: boolean;
  readonly progress: SharedValue<number>;
  readonly renderSize: { readonly w: number; readonly h: number };
}) {
  const size = { width: renderSize.w, height: renderSize.h };

  if (!flight.flipMidFlight) {
    return (
      <PlayingCard
        card={card}
        faceUp={displayFaceUp}
        theme={defaultCardTheme}
        size={size}
        draggable={false}
        flippable={false}
        suppressFlipAnimation
      />
    );
  }

  const frontStyle = useAnimatedStyle(() => ({
    opacity: progress.value >= 0.5 ? 1 : 0,
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: progress.value < 0.5 ? 1 : 0,
  }));

  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFillObject, backStyle]}>
        <PlayingCard
          card={FACE_DOWN_CARD}
          faceUp={false}
          theme={defaultCardTheme}
          size={size}
          draggable={false}
          flippable={false}
          suppressFlipAnimation
        />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFillObject, frontStyle]}>
        <PlayingCard
          card={card}
          faceUp={true}
          theme={defaultCardTheme}
          size={size}
          draggable={false}
          flippable={false}
          suppressFlipAnimation
        />
      </Animated.View>
    </>
  );
}

type Props = {
  readonly catalog: Readonly<Record<string, Card>>;
};

export function FlyingCardLayer({ catalog }: Props) {
  const flights = useGameStore(selectActiveFlights);
  const removeFlight = useGameStore((s) => s.removeFlight);

  const sortedFlights = useMemo(() => [...flights].sort((a, b) => a.zRank - b.zRank), [flights]);

  if (sortedFlights.length === 0) return null;

  return (
    <Animated.View style={styles.layer} pointerEvents="none">
      {sortedFlights.map((f) => (
        <FlightCard key={f.id} flight={f} catalog={catalog} onComplete={removeFlight} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: tokens.game.zIndex.flightOverlay,
  },
});
