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
import { defaultCardTheme } from '../../design/cardTheme';
import { tokens } from '../../design/tokens';
import { t } from '../../i18n';
import { PlayingCard } from '../cards/PlayingCard';
import { springFor } from '../../feedback/motion';
import { useGameStore } from '../../store/provider';
import { selectDiscardPulse } from '../../store/selectors';
import { useAnchor } from './internal/useAnchor';

const CARD_ASPECT = 1.46;
const FACE_DOWN_CARD: Card = { suit: 'spades', rank: 1 };

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
          style={[styles.cardSlot, !canDraw && styles.disabled]}
          collapsable={false}
        >
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
        <Text style={styles.label}>{deckLabel}</Text>
      </View>

      <View style={styles.pileGroup}>
        <Animated.View style={discardPulseStyle}>
          <View
            ref={discardAnchor.ref}
            onLayout={discardAnchor.onLayout}
            style={styles.cardSlot}
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
              <View style={[styles.emptyDiscard, { width: cardWidth, height: cardHeight }]} />
            )}
          </View>
        </Animated.View>
        <Text style={styles.label}>{t('game.discard.empty')}</Text>
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
  emptyDiscard: {
    backgroundColor: tokens.game.surface.slotEmpty,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    borderStyle: 'dashed',
    borderRadius: tokens.radius.md,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text.secondary,
  },
});
