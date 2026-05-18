/**
 * DeckArea — shows the draw pile and the discard pile top card.
 * Tapping the deck triggers draw_from_deck when legal.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Card } from '@pablo/engine';
import { defaultCardTheme } from '../../design/cardTheme';
import { tokens } from '../../design/tokens';
import { t } from '../../i18n';
import { PlayingCard } from '../cards/PlayingCard';

const CARD_W = 72;
const CARD_H = Math.floor(CARD_W * 1.46);
const FACE_DOWN_CARD: Card = { suit: 'spades', rank: 1 };

type Props = {
  readonly deckCount: number;
  readonly discardTopCardId: string | null;
  readonly catalog: Readonly<Record<string, Card>>;
  readonly canDraw: boolean;
  readonly onDraw: () => void;
};

export function DeckArea({ deckCount, discardTopCardId, catalog, canDraw, onDraw }: Props) {
  const discardCard = discardTopCardId ? catalog[discardTopCardId] : null;

  return (
    <View style={styles.row}>
      {/* Draw pile */}
      <View style={styles.pileGroup}>
        <TouchableOpacity
          onPress={onDraw}
          disabled={!canDraw}
          activeOpacity={0.7}
          style={[styles.cardSlot, !canDraw && styles.disabled]}
        >
          <PlayingCard
            card={FACE_DOWN_CARD}
            faceUp={false}
            theme={defaultCardTheme}
            size={{ width: CARD_W, height: CARD_H }}
            draggable={false}
            flippable={false}
          />
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {deckCount > 0 ? t('game.deck.count', { count: deckCount }) : t('game.deck.empty')}
            </Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.label}>{t('game.deck.count', { count: deckCount })}</Text>
      </View>

      {/* Discard pile */}
      <View style={styles.pileGroup}>
        <View style={styles.cardSlot}>
          {discardCard ? (
            <PlayingCard
              card={discardCard}
              faceUp={true}
              theme={defaultCardTheme}
              size={{ width: CARD_W, height: CARD_H }}
              draggable={false}
              flippable={false}
            />
          ) : (
            <View style={[styles.emptyDiscard, { width: CARD_W, height: CARD_H }]} />
          )}
        </View>
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
    paddingVertical: tokens.space.md,
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
  badge: {
    position: 'absolute',
    bottom: tokens.space.xs,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  badgeText: {
    backgroundColor: tokens.game.surface.deckBadgeBg,
    color: tokens.color.text.inverse,
    fontSize: tokens.font.size.xs,
    paddingHorizontal: tokens.space.xs,
    paddingVertical: 2,
    borderRadius: tokens.radius.sm,
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text.secondary,
  },
});
