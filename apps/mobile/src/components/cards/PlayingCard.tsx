/**
 * <PlayingCard> — the single component that renders every card in the app.
 *
 * Hard rules (cards.mdc):
 *  - One component renders every card. Branch on rank/suit never happens above this tree.
 *  - No hardcoded colors — all decoration comes from the CardTheme prop.
 *  - All animation lives in worklets (useAnimatedStyle, withTiming, withSpring).
 *  - Themes are config: swapping theme re-renders without remounting this component.
 *
 * Architecture:
 *  - Root Animated.View handles translate (drag) and serves as the gesture target.
 *  - Back face Animated.View: rotateY 0→180, backfaceVisibility hidden.
 *    Contains a Skia Canvas for the decorative back pattern.
 *  - Front face Animated.View: rotateY 180→360, backfaceVisibility hidden.
 *    Contains a Skia Canvas for the card surface background + stroked border, and
 *    RN Text overlays for rank/suit labels (avoids font-file loading in the
 *    prototype phase — Skia text is a Phase 7 polish item).
 *  - Tap gesture toggles flip; Pan gesture drives drag; they race so a quick tap
 *    never accidentally starts a pan.
 *
 * Control model:
 *  - `faceUp` is the source of truth. When the prop changes, the card animates
 *    to that face. This is what powers in-game flips driven by store updates
 *    (e.g. PeekOverlay revealing a card after `peek_one` resolves).
 *  - When `flippable` is true, the tap gesture also flips the card and fires
 *    `onFlip`. Consumers that want the visual to follow their own state should
 *    mirror it through `faceUp` from their side; tapping a flippable card
 *    without echoing the flip in the parent state would lead to drift, so
 *    `flippable` is reserved for self-contained lab/preview surfaces.
 */
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Canvas, RoundedRect } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { Card } from '@pablo/engine';
import type { CardTheme } from '../../design/cardTheme';
import { rankLabel, suitColor, suitGlyph } from './internal/cardHelpers';

export type PlayingCardSize = { width: number; height: number };

export type PlayingCardProps = {
  card: Card;
  faceUp: boolean;
  theme: CardTheme;
  size?: PlayingCardSize;
  draggable?: boolean;
  flippable?: boolean;
  onFlip?: (nowFaceUp: boolean) => void;
  /**
   * Called when the card is tapped. Wires the tap into PlayingCard's own
   * gesture system, which is the only way to reliably receive a press here:
   * even when `flippable` and `draggable` are false, the native gesture
   * handler / Skia view tree captures touches in a way that interferes with
   * a parent `TouchableOpacity` / `Pressable`. Consumers that need a tap
   * (PeekOverlay, MatchHand/Discard, etc.) MUST use `onTap` and apply any
   * visual selected/highlighted styling on a sibling view.
   */
  onTap?: () => void;
};

const DEFAULT_SIZE: PlayingCardSize = { width: 220, height: 320 };

/** Spring config for snap-back after drag. */
const SNAP_SPRING = { damping: 18, stiffness: 220, mass: 1 } as const;

/** Flip timing: inOut cubic, 450 ms — avoids the spring overshoot that causes
 *  double-crossover at the 90° half-turn. */
const FLIP_TIMING = { duration: 450, easing: Easing.inOut(Easing.cubic) } as const;

/** Font/inset sizes scale linearly with card width so the same component looks
 *  right at both the interactive size (220×320) and the variants thumbnail (72×104). */
function sizesFor(width: number) {
  return {
    rank: Math.round(width * 0.1),
    suitSmall: Math.round(width * 0.075),
    centerSuit: Math.round(width * 0.25),
    cornerInsetX: Math.max(4, Math.round(width * 0.05)),
    cornerInsetY: Math.max(4, Math.round(width * 0.045)),
    borderStroke: Math.max(1, Math.round(width * 0.008)),
  };
}

function PlayingCardComponent({
  card,
  faceUp,
  theme,
  size = DEFAULT_SIZE,
  draggable = true,
  flippable = true,
  onFlip,
  onTap,
}: PlayingCardProps) {
  const { width: W, height: H } = size;
  const s = useMemo(() => sizesFor(W), [W]);

  // flipProgress: 0 = back visible, 1 = front visible.
  const flipProgress = useSharedValue(faceUp ? 1 : 0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);

  // Keep the flip animation in sync with the `faceUp` prop. When a parent
  // updates `faceUp`, we animate to the new target rather than snapping.
  useEffect(() => {
    flipProgress.value = withTiming(faceUp ? 1 : 0, FLIP_TIMING);
  }, [faceUp, flipProgress]);

  // --- Gestures ---

  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .enabled(flippable || onTap !== undefined)
    .onEnd(() => {
      'worklet';
      if (flippable) {
        const nextValue = flipProgress.value < 0.5 ? 1 : 0;
        flipProgress.value = withTiming(nextValue, FLIP_TIMING);
        if (onFlip) {
          runOnJS(onFlip)(nextValue === 1);
        }
      }
      if (onTap) {
        runOnJS(onTap)();
      }
    });

  const panGesture = Gesture.Pan()
    .enabled(draggable)
    .onUpdate((e) => {
      'worklet';
      dragX.value = e.translationX;
      dragY.value = e.translationY;
    })
    .onEnd(() => {
      'worklet';
      dragX.value = withSpring(0, SNAP_SPRING);
      dragY.value = withSpring(0, SNAP_SPRING);
    });

  // Race: a quick tap wins before a pan threshold is crossed.
  const gesture = Gesture.Race(panGesture, tapGesture);

  // --- Animated styles ---

  const rootStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }, { translateY: dragY.value }],
  }));

  // Back face: starts visible (rotateY=0), hides at 180.
  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(flipProgress.value, [0, 1], [0, 180])}deg` },
    ],
  }));

  // Front face: starts hidden (rotateY=180), visible at 360.
  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(flipProgress.value, [0, 1], [180, 360])}deg` },
    ],
  }));

  // --- Theme-derived render data (memoized per theme.id, not the whole theme object) ---

  const backElements = useMemo(
    () => ({
      bg: theme.back.palette.primary,
      secondary: theme.back.palette.secondary,
      r: theme.border.radius,
    }),
    // Keyed on theme.id: re-memoizes when theme identity changes, not every render.
    [theme.id, W, H],
  );

  const faceElements = useMemo(
    () => ({
      bg: theme.face.palette.bg,
      border: theme.face.palette.border,
      r: theme.border.radius,
    }),
    // Keyed on theme.id: re-memoizes when theme identity changes, not every render.
    [theme.id, W, H],
  );

  const textColor = suitColor(card.suit, theme);
  const label = rankLabel(card.rank);
  const glyph = suitGlyph(card.suit);

  // The card is "interactive" if any of its gestures are wired up. When it's
  // not interactive we skip the GestureDetector entirely, because a
  // GestureDetector still claims touches even when every contained gesture
  // is `.enabled(false)`, which would block a parent <Pressable>/<TouchableOpacity>.
  const interactive = flippable || draggable || onTap !== undefined;

  const inner = (
    <Animated.View style={[{ width: W, height: H }, rootStyle]}>
      {/* ── BACK FACE ──
          Solid two-tone back: outer surface + slightly inset secondary panel.
          A zellige-inspired pattern fill replaces this in Phase 6 (`design.mdc`). */}
      <Animated.View style={[StyleSheet.absoluteFillObject, backStyle, styles.face]}>
        <Canvas style={StyleSheet.absoluteFillObject}>
          <RoundedRect
            x={0}
            y={0}
            width={W}
            height={H}
            r={backElements.r}
            color={backElements.bg}
          />
          <RoundedRect
            x={8}
            y={8}
            width={W - 16}
            height={H - 16}
            r={Math.max(backElements.r - 4, 2)}
            color={backElements.secondary}
          />
        </Canvas>
      </Animated.View>

      {/* ── FRONT FACE ── */}
      <Animated.View style={[StyleSheet.absoluteFillObject, frontStyle, styles.face]}>
        <Canvas style={StyleSheet.absoluteFillObject}>
          {/* Background fill — covers the whole card with the face bg colour */}
          <RoundedRect
            x={0}
            y={0}
            width={W}
            height={H}
            r={faceElements.r}
            color={faceElements.bg}
          />
          {/* Border — STROKE, not fill. Inset by half the stroke width so it
              lands fully on-card rather than being clipped at the edge. */}
          <RoundedRect
            x={s.borderStroke / 2}
            y={s.borderStroke / 2}
            width={W - s.borderStroke}
            height={H - s.borderStroke}
            r={faceElements.r}
            color={faceElements.border}
            style="stroke"
            strokeWidth={s.borderStroke}
          />
        </Canvas>

        {/* RN text overlays (pointerEvents none so gestures hit the wrapper). */}
        <View
          style={[styles.cornerTopLeft, { top: s.cornerInsetY, left: s.cornerInsetX }]}
          pointerEvents="none"
        >
          <Text style={[styles.rankText, { fontSize: s.rank, color: textColor }]}>{label}</Text>
          <Text style={[styles.suitSmall, { fontSize: s.suitSmall, color: textColor }]}>
            {glyph}
          </Text>
        </View>

        <View style={styles.centerPip} pointerEvents="none">
          <Text style={[styles.centerSuit, { fontSize: s.centerSuit, color: textColor }]}>
            {glyph}
          </Text>
        </View>

        <View
          style={[
            styles.cornerBottomRight,
            styles.rotated,
            { bottom: s.cornerInsetY, right: s.cornerInsetX },
          ]}
          pointerEvents="none"
        >
          <Text style={[styles.rankText, { fontSize: s.rank, color: textColor }]}>{label}</Text>
          <Text style={[styles.suitSmall, { fontSize: s.suitSmall, color: textColor }]}>
            {glyph}
          </Text>
        </View>
      </Animated.View>
    </Animated.View>
  );

  if (!interactive) return inner;
  return <GestureDetector gesture={gesture}>{inner}</GestureDetector>;
}

const styles = StyleSheet.create({
  face: {
    backfaceVisibility: 'hidden',
  },
  cornerTopLeft: {
    position: 'absolute',
    alignItems: 'center',
  },
  cornerBottomRight: {
    position: 'absolute',
    alignItems: 'center',
  },
  rotated: {
    transform: [{ rotate: '180deg' }],
  },
  centerPip: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontWeight: '700',
  },
  suitSmall: {},
  centerSuit: {},
});

export const PlayingCard = memo(PlayingCardComponent);
