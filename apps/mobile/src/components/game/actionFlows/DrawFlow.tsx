/**
 * DrawFlow — sub-menu shown after draw_from_deck resolves.
 * Options: Swap into a slot, Discard (with power), Match drawn card.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Card } from '@pablo/engine';
import { defaultCardTheme } from '../../../design/cardTheme';
import { tokens } from '../../../design/tokens';
import { t } from '../../../i18n';
import { useGameStore } from '../../../store/provider';
import {
  selectDrawnCardId,
  selectMatchDrawnSlots,
  selectSwapDrawnSlots,
} from '../../../store/selectors';
import { PlayingCard } from '../../cards/PlayingCard';

const CARD_W = 64;
const CARD_H = Math.floor(CARD_W * 1.46);

type Props = {
  readonly catalog: Readonly<Record<string, Card>>;
  readonly onSwap: (index: number) => void;
  readonly onDiscard: () => void;
  readonly onMatchDrawn: (index: number) => void;
};

export function DrawFlow({ catalog, onSwap, onDiscard, onMatchDrawn }: Props) {
  const drawnCardId = useGameStore(selectDrawnCardId);
  const swapSlots = useGameStore(selectSwapDrawnSlots);
  const matchSlots = useGameStore(selectMatchDrawnSlots);

  const drawnCard = drawnCardId ? catalog[drawnCardId] : null;

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <Text style={styles.hint}>{t('game.actionHint.afterDraw')}</Text>

        {/* Drawn card preview */}
        {drawnCard && (
          <View style={styles.drawnPreview}>
            <PlayingCard
              card={drawnCard}
              faceUp={true}
              theme={defaultCardTheme}
              size={{ width: CARD_W, height: CARD_H }}
              draggable={false}
              flippable={false}
            />
            <Text style={styles.drawnLabel}>{t('game.drawn.label')}</Text>
          </View>
        )}

        <View style={styles.actions}>
          {/* Discard */}
          <TouchableOpacity style={styles.actionBtn} onPress={onDiscard} activeOpacity={0.8}>
            <Text style={styles.actionText}>{t('game.action.discard')}</Text>
          </TouchableOpacity>

          {/* Swap into slot */}
          {swapSlots.length > 0 && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => onSwap(swapSlots[0]!)}
              activeOpacity={0.8}
            >
              <Text style={styles.actionText}>{t('game.action.swap')}</Text>
            </TouchableOpacity>
          )}

          {/* Match drawn */}
          {matchSlots.length > 0 && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.matchBtn]}
              onPress={() => onMatchDrawn(matchSlots[0]!)}
              activeOpacity={0.8}
            >
              <Text style={[styles.actionText, styles.matchText]}>{t('game.action.match')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.color.surface.overlay,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 35,
  },
  sheet: {
    backgroundColor: tokens.color.surface.card,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    padding: tokens.space.xl,
    width: '100%',
    gap: tokens.space.lg,
    alignItems: 'center',
  },
  hint: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
    textAlign: 'center',
  },
  drawnPreview: {
    alignItems: 'center',
    gap: tokens.space.xs,
  },
  drawnLabel: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.text.secondary,
  },
  actions: {
    flexDirection: 'row',
    gap: tokens.space.sm,
    width: '100%',
  },
  actionBtn: {
    flex: 1,
    backgroundColor: tokens.color.border.subtle,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    alignItems: 'center',
  },
  matchBtn: {
    backgroundColor: tokens.color.accent.primary,
  },
  actionText: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.primary,
    fontWeight: tokens.font.weight.semibold,
  },
  matchText: {
    color: tokens.color.text.inverse,
  },
});
