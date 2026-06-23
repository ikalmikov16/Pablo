/**
 * MatchHandFlow — modal that lets the user pick two of their own slots for
 * `match_hand`.
 *
 * Cards are rendered face-down here regardless of what the player has
 * peeked — the whole point of `match_hand` is to test the player's memory.
 * Surfacing peeked card faces in this overlay would give an unwanted hint.
 *
 * The grid is laid out via the shared `CardSlotGrid` so the slot order
 * (and tile size) matches the main hand exactly.
 */

import React, { useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { tokens } from '../../../design/tokens';
import { textStyle } from '../../../design/typography';
import { t } from '../../../i18n';
import { useGameStore, useGameStoreShallow } from '../../../store/provider';
import { selectIsBusy, selectMatchHandPairs, selectMyHandSlots } from '../../../store/selectors';
import { CardSlotGrid, type CardSlot } from '../internal/CardSlotGrid';

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_WIDTH = SCREEN_W - tokens.space.xl * 2;

type Props = {
  readonly onConfirm: (a: number, b: number) => void;
  readonly onCancel: () => void;
};

export function MatchHandFlow({ onConfirm, onCancel }: Props) {
  const slots = useGameStoreShallow(selectMyHandSlots);
  const legalPairs = useGameStoreShallow(selectMatchHandPairs);
  const isBusy = useGameStore(selectIsBusy);
  const [picks, setPicks] = useState<ReadonlyArray<number>>([]);

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

  // Slots are face-down regardless of peeked knowledge — memory test.
  const gridSlots: ReadonlyArray<CardSlot> = slots.map((s) => ({
    index: s.index,
    card: null,
  }));

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <Text style={styles.title}>{t('game.actionHint.pickTwoOwnSlots')}</Text>

        <CardSlotGrid
          slots={gridSlots}
          gridWidth={GRID_WIDTH}
          onTap={(slot) => toggle(slot.index)}
          selectedIndices={picks}
        />

        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
            <Text style={styles.cancelText}>{t('game.action.back')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmBtn, !isLegalPair && styles.disabled]}
            disabled={!isLegalPair || isBusy}
            onPress={() => !isBusy && picks.length === 2 && onConfirm(picks[0]!, picks[1]!)}
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
    ...tokens.shadow.floating,
  },
  title: {
    ...textStyle('md', 'semibold'),
    color: tokens.color.text.primary,
    textAlign: 'center',
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
    ...textStyle('sm', 'semibold'),
    color: tokens.color.text.inverse,
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
    ...textStyle('sm'),
    color: tokens.color.text.secondary,
  },
});
