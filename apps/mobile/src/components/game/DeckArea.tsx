/**
 * DeckArea — shows the draw pile and the discard pile top card.
 * Tapping anywhere on the draw card triggers draw_from_deck when legal.
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import type { Card } from '@pablo/engine';
import { radiusFor } from '../cards/internal/cardSizes';
import { defaultCardTheme } from '../../design/cardTheme';
import { tokens } from '../../design/tokens';
import { textStyle } from '../../design/typography';
import { t } from '../../i18n';
import { PlayingCard } from '../cards/PlayingCard';
import { springFor } from '../../feedback/motion';
import { useGameStore } from '../../store/provider';
import { selectDiscardPulse } from '../../store/selectors';
import { deckDepthLayers } from './internal/pileDecor';
import { useAnchor } from './internal/useAnchor';

const CARD_ASPECT = 1.46;
const FACE_DOWN_CARD: Card = { suit: 'spades', rank: 1 };
const DECK_LAYER_OPACITIES = [0.9, 0.65, 0.4] as const;

type Props = {
  readonly deckCount: number;
  readonly discardTopCardId: string | null;
  readonly catalog: Readonly<Record<string, Card>>;
  readonly canDraw: boolean;
  readonly onDraw: () => void;
  readonly cardWidth?: number;
};

export function DeckArea({
  deckCount,
  discardTopCardId,
  catalog,
  canDraw,
  onDraw,
  cardWidth = tokens.game.size.deckCard,
}: Props) {
  const cardHeight = Math.floor(cardWidth * CARD_ASPECT);
  const discardCard = discardTopCardId ? catalog[discardTopCardId] : null;
  const deckLabel =
    deckCount > 0 ? t('game.deck.count', { count: deckCount }) : t('game.deck.empty');
  const depthCount = deckDepthLayers(deckCount);
  const layerOpacities = DECK_LAYER_OPACITIES.slice(0, depthCount);
  const slotRadius = radiusFor(cardWidth);
  const deckBackColor = defaultCardTheme.back.palette.primary;

  const deckAnchor = useAnchor({ kind: 'deck' });
  const discardAnchor = useAnchor({ kind: 'discard' });
  const discardPulse = useGameStore(selectDiscardPulse);
  const discardScale = useSharedValue(1);

  useEffect(() => {
    if (!discardPulse) return;
    discardScale.value = withSequence(
      withSpring(1.06, springFor('pulse')),
      withSpring(1, springFor('pulse')),
    );
  }, [discardPulse, discardScale]);

  const discardPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: discardScale.value }],
  }));

  return (
    <View style={styles.row}>
      <View style={styles.pileGroup}>
        <View
          ref={deckAnchor.ref}
          onLayout={deckAnchor.onLayout}
          style={[
            styles.cardSlot,
            { width: cardWidth, height: cardHeight },
            !canDraw && styles.disabled,
          ]}
          collapsable={false}
        >
          {layerOpacities.map((opacity, i) => (
            <View
              key={`deck-layer-${i}`}
              style={[
                styles.deckLayer,
                {
                  top: (i + 1) * 2,
                  width: cardWidth,
                  height: cardHeight,
                  borderRadius: slotRadius,
                  backgroundColor: deckBackColor,
                  opacity,
                },
              ]}
            />
          ))}
          <PlayingCard
            card={FACE_DOWN_CARD}
            faceUp={false}
            theme={defaultCardTheme}
            size={{ width: cardWidth, height: cardHeight }}
            draggable={false}
            flippable={false}
            onTap={canDraw ? onDraw : undefined}
          />
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{deckLabel}</Text>
        </View>
      </View>

      <View style={styles.pileGroup}>
        <Animated.View style={discardPulseStyle}>
          <View
            ref={discardAnchor.ref}
            onLayout={discardAnchor.onLayout}
            style={[styles.cardSlot, { width: cardWidth, height: cardHeight }]}
            collapsable={false}
          >
            {discardCard ? (
              <PlayingCard
                card={discardCard}
                faceUp={true}
                theme={defaultCardTheme}
                size={{ width: cardWidth, height: cardHeight }}
                draggable={false}
                flippable={false}
              />
            ) : (
              <View
                style={[
                  styles.emptyDiscard,
                  { width: cardWidth, height: cardHeight, borderRadius: slotRadius },
                ]}
              />
            )}
          </View>
        </Animated.View>
        {!discardCard && <Text style={styles.label}>{t('game.discard.empty')}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: tokens.space.xl,
  },
  pileGroup: {
    alignItems: 'center',
    gap: tokens.space.xs,
  },
  cardSlot: {
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
  deckLayer: {
    position: 'absolute',
    left: 0,
  },
  emptyDiscard: {
    backgroundColor: tokens.game.surface.slotEmpty,
    borderWidth: 1,
    borderColor: tokens.game.surface.feltOutline,
    borderStyle: 'dashed',
  },
  disabled: {
    opacity: 0.4,
  },
  badge: {
    backgroundColor: tokens.game.surface.deckBadgeBg,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.space.sm,
    paddingVertical: tokens.space.xs,
    ...tokens.shadow.raised,
  },
  badgeText: {
    ...textStyle('xs', 'semibold'),
    color: tokens.game.text.onFelt,
  },
  label: {
    ...textStyle('xs'),
    color: tokens.game.text.onFeltMuted,
  },
});
