/**
 * MatchDiscardFlow — lets the user pick which of their slots to match against
 * the current discard top.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Card } from '@pablo/engine';
import { defaultCardTheme } from '../../../design/cardTheme';
import { tokens } from '../../../design/tokens';
import { t } from '../../../i18n';
import { useGameStore } from '../../../store/provider';
import { selectMatchDiscardSlots, selectMyHandSlots } from '../../../store/selectors';
import { PlayingCard } from '../../cards/PlayingCard';

const CARD_W = 64;
const CARD_H = Math.floor(CARD_W * 1.46);
const FACE_DOWN_CARD: Card = { suit: 'spades', rank: 1 };

type Props = {
  readonly catalog: Readonly<Record<string, Card>>;
  readonly onConfirm: (index: number) => void;
  readonly onCancel: () => void;
};

export function MatchDiscardFlow({ catalog, onConfirm, onCancel }: Props) {
  const slots = useGameStore(selectMyHandSlots);
  const legalSlots = useGameStore(selectMatchDiscardSlots);

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <Text style={styles.title}>{t('game.actionHint.pickOwnSlot')}</Text>
        <View style={styles.handRow}>
          {slots.map((slot) => {
            const isLegal = legalSlots.includes(slot.index);
            const card = slot.cardId ? catalog[slot.cardId] : null;
            return (
              <TouchableOpacity
                key={slot.index}
                onPress={() => isLegal && onConfirm(slot.index)}
                disabled={!isLegal}
                activeOpacity={0.8}
                style={[styles.slotBtn, !isLegal && styles.dimmed]}
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
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
          <Text style={styles.cancelText}>{t('game.action.skipPower')}</Text>
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
  },
  dimmed: {
    opacity: 0.35,
  },
  cancelBtn: {
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
