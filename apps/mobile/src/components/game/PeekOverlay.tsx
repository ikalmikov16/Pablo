/**
 * PeekOverlay — prompts the local player to peek at their initial cards.
 *
 * Shown during peek_phase until the local player has chosen their N cards.
 * Bots resolve automatically via the bot scheduler — this overlay only shows
 * a "waiting" state for them.
 */

import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Card } from '@pablo/engine';
import { defaultCardTheme } from '../../design/cardTheme';
import { tokens } from '../../design/tokens';
import { t } from '../../i18n';
import { useGameStore } from '../../store/provider';
import {
  selectMyHandSlots,
  selectPeekPicks,
  selectPeekRequired,
  selectPlayers,
  selectSelf,
} from '../../store/selectors';
import { PlayingCard } from '../cards/PlayingCard';

const CARD_W = 80;
const CARD_H = Math.floor(CARD_W * 1.46);
const FACE_DOWN_CARD: Card = { suit: 'spades', rank: 1 };

type Props = {
  readonly catalog: Readonly<Record<string, Card>>;
  readonly onConfirm: (indices: ReadonlyArray<number>) => void;
};

export function PeekOverlay({ catalog, onConfirm }: Props) {
  const slots = useGameStore(selectMyHandSlots);
  const peekPicks = useGameStore(selectPeekPicks);
  const peekRequired = useGameStore(selectPeekRequired);
  const players = useGameStore(selectPlayers);
  const self = useGameStore(selectSelf);
  const addPeekPick = useGameStore((s) => s.addPeekPick);

  const botsRemaining = players.filter(
    (p) => p.id !== self && Object.keys(p.knownCards).length < peekRequired,
  ).length;

  const togglePick = useCallback(
    (index: number) => {
      if (peekPicks.includes(index) || peekPicks.length >= peekRequired) return;
      addPeekPick(index);
    },
    [peekPicks, peekRequired, addPeekPick],
  );

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('game.peek.instruction', { count: peekRequired })}</Text>

        <View style={styles.handRow}>
          {slots.map((slot) => {
            const picked = peekPicks.includes(slot.index);
            const cardData = slot.cardId ? catalog[slot.cardId] : null;
            return (
              <TouchableOpacity
                key={slot.index}
                style={[styles.slotBtn, picked && styles.slotPicked]}
                onPress={() => togglePick(slot.index)}
                activeOpacity={0.75}
              >
                <PlayingCard
                  card={cardData ?? FACE_DOWN_CARD}
                  faceUp={picked && cardData !== null}
                  theme={defaultCardTheme}
                  size={{ width: CARD_W, height: CARD_H }}
                  draggable={false}
                  flippable={false}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        {botsRemaining > 0 && (
          <Text style={styles.waiting}>
            {botsRemaining === 1
              ? t('game.peek.waitingForBots', { remaining: botsRemaining })
              : t('game.peek.waitingForBotsPlural', { remaining: botsRemaining })}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.confirmBtn, peekPicks.length < peekRequired && styles.confirmDisabled]}
          disabled={peekPicks.length < peekRequired}
          onPress={() => onConfirm(peekPicks)}
          activeOpacity={0.8}
        >
          <Text style={styles.confirmText}>{t('game.peek.confirm')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.color.surface.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  card: {
    backgroundColor: tokens.color.surface.card,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.xl,
    alignItems: 'center',
    gap: tokens.space.lg,
    marginHorizontal: tokens.space.xl,
    width: '90%',
  },
  title: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.primary,
    textAlign: 'center',
  },
  handRow: {
    flexDirection: 'row',
    gap: tokens.space.sm,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  slotBtn: {
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  slotPicked: {
    borderColor: tokens.color.accent.primary,
  },
  waiting: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
    textAlign: 'center',
  },
  confirmBtn: {
    backgroundColor: tokens.color.accent.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.xl,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  confirmDisabled: {
    backgroundColor: tokens.color.border.subtle,
  },
  confirmText: {
    color: tokens.color.text.inverse,
    fontWeight: tokens.font.weight.semibold,
    fontSize: tokens.font.size.md,
  },
});
