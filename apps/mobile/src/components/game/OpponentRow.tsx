/**
 * OpponentRow — displays one opponent's hand (face-down), name, score, and
 * a contextual Pablo button.
 *
 * The Pablo button is hidden for bot opponents (the human player never calls
 * Pablo on behalf of a bot — bots decide for themselves). In Phase 6 it will
 * be visible for human opponents.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Card, PlayerViewEntry } from '@pablo/engine';
import { defaultCardTheme } from '../../design/cardTheme';
import { tokens } from '../../design/tokens';
import { t } from '../../i18n';
import { isBotId } from '../../supabase/internal/room';
import { PlayingCard } from '../cards/PlayingCard';

const MINI_CARD_W = tokens.game.size.miniCard;
const MINI_CARD_H = Math.floor(MINI_CARD_W * 1.46);
const FACE_DOWN_CARD: Card = { suit: 'spades', rank: 1 };

type Props = {
  readonly entry: PlayerViewEntry;
  readonly displayName: string;
  readonly catalog: Readonly<Record<string, Card>>;
  readonly pabloCallable: boolean;
  readonly onCallPablo: () => void;
  readonly isCurrent: boolean;
};

export function OpponentRow({
  entry,
  displayName,
  catalog,
  pabloCallable,
  onCallPablo,
  isCurrent,
}: Props) {
  const showPabloButton = !isBotId(entry.id) && pabloCallable;

  return (
    <View style={[styles.row, isCurrent && styles.currentRow]}>
      <View style={styles.nameArea}>
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.score}>{t('game.score', { score: entry.score })}</Text>
      </View>

      <View style={styles.cards}>
        {Array.from({ length: entry.handSize }, (_, i) => {
          const knownId = entry.knownCards[i];
          const card = knownId ? (catalog[knownId] ?? FACE_DOWN_CARD) : null;
          return (
            <View key={i} style={styles.cardWrapper}>
              <PlayingCard
                card={card ?? FACE_DOWN_CARD}
                faceUp={card !== null}
                theme={defaultCardTheme}
                size={{ width: MINI_CARD_W, height: MINI_CARD_H }}
                draggable={false}
                flippable={false}
              />
            </View>
          );
        })}
      </View>

      {showPabloButton && (
        <TouchableOpacity
          style={styles.pabloBtn}
          onPress={onCallPablo}
          activeOpacity={0.8}
          accessibilityLabel={t('game.pablo.callButton')}
        >
          <Text style={styles.pabloBtnText}>{t('game.pablo.callButton')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.sm,
    gap: tokens.space.md,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border.subtle,
  },
  currentRow: {
    backgroundColor: tokens.game.surface.currentTurnTint,
  },
  nameArea: {
    width: 80,
  },
  name: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.primary,
  },
  score: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text.secondary,
    marginTop: 2,
  },
  cards: {
    flex: 1,
    flexDirection: 'row',
    gap: tokens.space.xs,
    flexWrap: 'wrap',
  },
  cardWrapper: {
    borderRadius: tokens.radius.sm,
    overflow: 'hidden',
  },
  pabloBtn: {
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.xs,
    backgroundColor: tokens.game.accent.pabloOnTurn,
    borderRadius: tokens.radius.md,
  },
  pabloBtnText: {
    color: tokens.color.text.inverse,
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.semibold,
  },
});
