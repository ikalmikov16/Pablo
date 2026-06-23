/**
 * MatchDiscardFlow — overlay that lets the user pick which of their own
 * slots to match against the current discard top.
 *
 * Cards are rendered face-down (memory test). Legal slots are tappable;
 * other slots are dimmed and non-interactive.
 */

import React from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { tokens } from '../../../design/tokens';
import { textStyle } from '../../../design/typography';
import { t } from '../../../i18n';
import { useGameStore, useGameStoreShallow } from '../../../store/provider';
import { selectIsBusy, selectMatchDiscardSlots, selectMyHandSlots } from '../../../store/selectors';
import { CardSlotGrid, type CardSlot } from '../internal/CardSlotGrid';

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_WIDTH = SCREEN_W - tokens.space.xl * 2;

type Props = {
  readonly onConfirm: (index: number) => void;
  readonly onCancel: () => void;
};

export function MatchDiscardFlow({ onConfirm, onCancel }: Props) {
  const slots = useGameStoreShallow(selectMyHandSlots);
  const legalSlots = useGameStoreShallow(selectMatchDiscardSlots);
  const isBusy = useGameStore(selectIsBusy);

  const gridSlots: ReadonlyArray<CardSlot> = slots.map((s) => ({
    index: s.index,
    card: null,
  }));

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <Text style={styles.title}>{t('game.actionHint.pickOwnSlot')}</Text>
        <CardSlotGrid
          slots={gridSlots}
          gridWidth={GRID_WIDTH}
          legalIndices={legalSlots}
          onTap={(slot) => {
            if (!isBusy) onConfirm(slot.index);
          }}
        />
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
          <Text style={styles.cancelText}>{t('game.action.back')}</Text>
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
    ...tokens.shadow.floating,
  },
  title: {
    ...textStyle('md', 'semibold'),
    color: tokens.color.text.primary,
    textAlign: 'center',
  },
  cancelBtn: {
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
