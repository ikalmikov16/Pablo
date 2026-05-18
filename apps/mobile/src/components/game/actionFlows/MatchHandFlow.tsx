/**
 * MatchHandFlow — modal that lets the user pick two of their own slots for match_hand.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Card } from '@pablo/engine';
import { defaultCardTheme } from '../../../design/cardTheme';
import { tokens } from '../../../design/tokens';
import { t } from '../../../i18n';
import { useGameStore } from '../../../store/provider';
import { selectMatchHandPairs, selectMyHandSlots } from '../../../store/selectors';
import { PlayingCard } from '../../cards/PlayingCard';

const CARD_W = 64;
const CARD_H = Math.floor(CARD_W * 1.46);
const FACE_DOWN_CARD: Card = { suit: 'spades', rank: 1 };

type Props = {
  readonly catalog: Readonly<Record<string, Card>>;
  readonly onConfirm: (a: number, b: number) => void;
  readonly onCancel: () => void;
};

export function MatchHandFlow({ catalog, onConfirm, onCancel }: Props) {
  const slots = useGameStore(selectMyHandSlots);
  const legalPairs = useGameStore(selectMatchHandPairs);
  const [picks, setPicks] = useState<number[]>([]);

  function toggle(idx: number) {
    if (picks.includes(idx)) {
      setPicks(picks.filter((i) => i !== idx));
    } else if (picks.length < 2) {
      setPicks([...picks, idx]);
    }
  }

  const isLegalPair =
    picks.length === 2 &&
    legalPairs.some(
      ([a, b]) => (a === picks[0] && b === picks[1]) || (a === picks[1] && b === picks[0]),
    );

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <Text style={styles.title}>{t('game.actionHint.pickTwoOwnSlots')}</Text>

        <View style={styles.handRow}>
          {slots.map((slot) => {
            const picked = picks.includes(slot.index);
            const card = slot.cardId ? catalog[slot.cardId] : null;
            return (
              <TouchableOpacity
                key={slot.index}
                onPress={() => toggle(slot.index)}
                style={[styles.slotBtn, picked && styles.picked]}
                activeOpacity={0.8}
              >
                <PlayingCard
                  card={card ?? FACE_DOWN_CARD}
                  faceUp={slot.faceUp}
                  theme={defaultCardTheme}
                  size={{ width: CARD_W, height: CARD_H }}
                  draggable={false}
                  flippable={false}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
            <Text style={styles.cancelText}>{t('game.action.skipPower')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmBtn, !isLegalPair && styles.disabled]}
            disabled={!isLegalPair}
            onPress={() => picks.length === 2 && onConfirm(picks[0]!, picks[1]!)}
            activeOpacity={0.8}
          >
            <Text style={styles.confirmText}>{t('game.action.matchHand')}</Text>
          </TouchableOpacity>
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
  },
  title: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.primary,
    textAlign: 'center',
  },
  handRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: tokens.space.sm,
    flexWrap: 'wrap',
  },
  slotBtn: {
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  picked: {
    borderColor: tokens.color.accent.primary,
  },
  btnRow: {
    flexDirection: 'row',
    gap: tokens.space.sm,
  },
  confirmBtn: {
    flex: 2,
    backgroundColor: tokens.color.accent.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    alignItems: 'center',
  },
  disabled: {
    backgroundColor: tokens.color.border.subtle,
  },
  confirmText: {
    color: tokens.color.text.inverse,
    fontWeight: tokens.font.weight.semibold,
    fontSize: tokens.font.size.sm,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    alignItems: 'center',
  },
  cancelText: {
    color: tokens.color.text.secondary,
    fontSize: tokens.font.size.sm,
  },
});
