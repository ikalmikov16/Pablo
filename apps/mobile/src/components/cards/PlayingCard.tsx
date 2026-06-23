/**
 * <PlayingCard> — the single component that renders every card in the app.
 *
 * Hard rules (cards.mdc):
 *  - One component renders every card. Branch on rank/suit never happens above this tree.
 *  - No hardcoded colors — all decoration comes from the CardTheme prop.
 *  - All animation lives in worklets (useAnimatedStyle, withTiming, withSpring).
 *  - Themes are config: swapping theme re-renders without remounting this component.
 *
 * Rendering model: the card is authored in a fixed design space (240 units
 * wide, see cardSizes.ts) and the whole Skia scene is scaled by one Group
 * transform, so every size is the identical drawing. The face is one simple
 * layout at every size: jumbo corner index + one large center suit.
 */
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Canvas, Group, Path, RoundedRect, Skia, type SkPath } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { Card, Suit } from '@pablo/engine';
import type { CardTheme } from '../../design/cardTheme';
import { tokens } from '../../design/tokens';
import { CARD_FLIP_TIMING } from '../../feedback/motion';
import { rankLabel, suitColor } from './internal/cardHelpers';
import { DESIGN_WIDTH, cardScale, design, radiusFor } from './internal/cardSizes';
import { suitPath } from './internal/suitPaths';
import { starPathSvg, zelligeTiles } from './internal/zellige';

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
  /** Skip flip timing — use on flight overlays so parent translate does not fight 3D flip. */
  suppressFlipAnimation?: boolean;
};

const DEFAULT_SIZE: PlayingCardSize = { width: 220, height: 320 };
const SUITS: ReadonlyArray<Suit> = ['hearts', 'diamonds', 'clubs', 'spades'];
const SNAP_SPRING = { damping: 18, stiffness: 220, mass: 1 } as const;

function parseSkiaPath(svg: string, label: string): SkPath | null {
  const path = Skia.Path.MakeFromSVGString(svg);
  if (!path && __DEV__) {
    console.error(`[PlayingCard] invalid SVG path: ${label}`);
  }
  return path;
}

function SuitAt({
  path: suitSkPath,
  cx,
  cy,
  size,
  color,
}: {
  readonly path: SkPath;
  readonly cx: number;
  readonly cy: number;
  readonly size: number;
  readonly color: string;
}) {
  return (
    <Group
      transform={[
        { translateX: cx },
        { translateY: cy },
        { scaleX: size },
        { scaleY: size },
        { translateX: -0.5 },
        { translateY: -0.5 },
      ]}
    >
      <Path path={suitSkPath} color={color} style="fill" />
    </Group>
  );
}

/** Plain back (classic / midnight) drawn in design units. */
function PlainBackFace({
  W,
  H,
  radius,
  inset,
  palette,
}: {
  readonly W: number;
  readonly H: number;
  readonly radius: number;
  readonly inset: number;
  readonly palette: CardTheme['back']['palette'];
}) {
  const diamond = 0.5 * Math.min(W - inset * 2, H - inset * 2);
  return (
    <>
      <RoundedRect x={0} y={0} width={W} height={H} r={radius} color={palette.primary} />
      <RoundedRect
        x={inset}
        y={inset}
        width={W - inset * 2}
        height={H - inset * 2}
        r={Math.max(radius - 4, 2)}
        color={palette.secondary}
      />
      <Group transform={[{ translateX: W / 2 }, { translateY: H / 2 }, { rotate: Math.PI / 4 }]}>
        <RoundedRect
          x={-diamond / 2}
          y={-diamond / 2}
          width={diamond}
          height={diamond}
          r={Math.max(2, diamond * 0.15)}
          color={palette.accent}
        />
      </Group>
    </>
  );
}

/** Zellige back drawn in design units. */
function ZelligeBackFace({
  W,
  H,
  radius,
  hairline,
  palette,
  tileSize,
  starSkPath,
}: {
  readonly W: number;
  readonly H: number;
  readonly radius: number;
  /** Smallest stroke that still renders 1 px on screen. */
  readonly hairline: number;
  readonly palette: CardTheme['back']['palette'];
  readonly tileSize: number;
  readonly starSkPath: SkPath;
}) {
  const inset = Math.max(10, tileSize * 0.35);
  const tiles = zelligeTiles(W, H, tileSize);

  return (
    <>
      <RoundedRect x={0} y={0} width={W} height={H} r={radius} color={palette.primary} />
      <RoundedRect
        x={inset}
        y={inset}
        width={W - inset * 2}
        height={H - inset * 2}
        r={Math.max(radius - 3, 2)}
        color={palette.secondary}
        style="stroke"
        strokeWidth={Math.max(hairline, tileSize * 0.06)}
      />
      {tiles.map((tile, i) => (
        <SuitAt
          key={`z-${i}`}
          path={starSkPath}
          cx={tile.cx}
          cy={tile.cy}
          size={tile.scale}
          color={tile.slot === 'accent' ? palette.accent : palette.secondary}
        />
      ))}
    </>
  );
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
  suppressFlipAnimation = false,
}: PlayingCardProps) {
  const { width: W, height: H } = size;

  // Design-space frame: one uniform scale, height re-expressed in design units.
  const scale = cardScale(W);
  const DH = H / scale;
  const radiusD = radiusFor(W) / scale;
  const hairline = 1 / scale;
  const strokeD = Math.max(design.borderStroke, hairline);

  const flipProgress = useSharedValue(faceUp ? 1 : 0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);

  useEffect(() => {
    if (suppressFlipAnimation) {
      flipProgress.value = faceUp ? 1 : 0;
      return;
    }
    flipProgress.value = withTiming(faceUp ? 1 : 0, CARD_FLIP_TIMING);
  }, [faceUp, flipProgress, suppressFlipAnimation]);

  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .enabled(flippable || onTap !== undefined)
    .onEnd(() => {
      'worklet';
      if (flippable) {
        const nextValue = flipProgress.value < 0.5 ? 1 : 0;
        flipProgress.value = withTiming(nextValue, CARD_FLIP_TIMING);
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

  const gesture = Gesture.Race(panGesture, tapGesture);

  const rootStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }, { translateY: dragY.value }],
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(flipProgress.value, [0, 1], [0, 180])}deg` },
    ],
  }));

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(flipProgress.value, [0, 1], [180, 360])}deg` },
    ],
  }));

  const skiaPaths = useMemo(() => {
    const suits = {} as Record<Suit, SkPath | null>;
    for (const suit of SUITS) {
      suits[suit] = parseSkiaPath(suitPath(suit), suit);
    }
    return { suits, star: parseSkiaPath(starPathSvg(), 'star') };
  }, []);

  const textColor = suitColor(card.suit, theme);
  const label = rankLabel(card.rank);
  const suitSkPath = skiaPaths.suits[card.suit];

  const cornerCx = design.cornerInsetX + design.cornerColW / 2;

  const useZelligeBack = theme.back.pattern === 'zellige' && skiaPaths.star !== null;
  const interactive = flippable || draggable || onTap !== undefined;

  const inner = (
    <Animated.View style={[{ width: W, height: H }, rootStyle]}>
      <Animated.View style={[StyleSheet.absoluteFillObject, backStyle, styles.face]}>
        <Canvas style={StyleSheet.absoluteFillObject}>
          <Group transform={[{ scale }]}>
            {useZelligeBack ? (
              <ZelligeBackFace
                W={DESIGN_WIDTH}
                H={DH}
                radius={radiusD}
                hairline={hairline}
                palette={theme.back.palette}
                tileSize={design.zelligeTile}
                starSkPath={skiaPaths.star!}
              />
            ) : (
              <PlainBackFace
                W={DESIGN_WIDTH}
                H={DH}
                radius={radiusD}
                inset={design.backInset}
                palette={theme.back.palette}
              />
            )}
          </Group>
        </Canvas>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFillObject, frontStyle, styles.face]}>
        <Canvas style={StyleSheet.absoluteFillObject}>
          <Group transform={[{ scale }]}>
            <RoundedRect
              x={0}
              y={0}
              width={DESIGN_WIDTH}
              height={DH}
              r={radiusD}
              color={theme.face.palette.bg}
            />
            <RoundedRect
              x={strokeD / 2}
              y={strokeD / 2}
              width={DESIGN_WIDTH - strokeD}
              height={DH - strokeD}
              r={radiusD}
              color={theme.face.palette.border}
              style="stroke"
              strokeWidth={strokeD}
            />
            {suitSkPath && (
              <>
                <SuitAt
                  path={suitSkPath}
                  cx={cornerCx}
                  cy={design.cornerSuitCy}
                  size={design.cornerSuit}
                  color={textColor}
                />
                <SuitAt
                  path={suitSkPath}
                  cx={DESIGN_WIDTH / 2}
                  cy={DH * design.centerSuitYFrac}
                  size={design.centerSuit}
                  color={textColor}
                />
              </>
            )}
          </Group>
        </Canvas>

        <View
          style={[
            styles.corner,
            {
              left: design.cornerInsetX * scale,
              top: design.cornerInsetY * scale,
              width: design.cornerColW * scale,
            },
          ]}
          pointerEvents="none"
        >
          <Text style={[styles.rankText, { fontSize: design.rank * scale, color: textColor }]}>
            {label}
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
  corner: {
    position: 'absolute',
    alignItems: 'center',
  },
  rankText: {
    fontFamily: tokens.font.family.bold,
  },
});

export const PlayingCard = memo(PlayingCardComponent);
