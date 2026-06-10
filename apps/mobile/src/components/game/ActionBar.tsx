/**
 * ActionBar — surfaces the five turn options contextually.
 *
 * While idle: Draw, Match in hand, Match discard, Call Pablo.
 * After drawing: Swap, Discard, Match (drawn).
 * While power pending: just Skip.
 *
 * No game logic here — enabled state comes from selectors.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { tokens } from '../../design/tokens';
import { t } from '../../i18n';
import { useGameStore, useGameStoreShallow } from '../../store/provider';
import { selectActionBarItems, selectIsBusy } from '../../store/selectors';
import type { ActionBarItem } from '../../store/selectors';

type Props = {
  /** Called when a composite action is chosen (match_hand, match_discard, swap_drawn, match_drawn). */
  readonly onCompositeAction: (id: string) => void;
  /** Called when a discrete move is ready to dispatch. */
  readonly onDispatchMove: (item: ActionBarItem) => void;
};

const LABELS: Readonly<Record<string, string>> = {
  draw_from_deck: t('game.action.draw'),
  match_hand: t('game.action.matchHand'),
  match_discard: t('game.action.matchDiscard'),
  call_pablo: t('game.action.callPablo'),
  swap_drawn: t('game.action.swap'),
  discard_drawn: t('game.action.discard'),
  match_drawn: t('game.action.match'),
  skip_power: t('game.action.skipPower'),
};

export function ActionBar({ onCompositeAction, onDispatchMove }: Props) {
  const items = useGameStoreShallow(selectActionBarItems);
  const isBusy = useGameStore(selectIsBusy);

  if (items.length === 0) return null;

  return (
    <View style={styles.bar}>
      {items.map((item) => {
        const isPablo = item.id === 'call_pablo';
        return (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.btn,
              isPablo && styles.btnPablo,
              isPablo && !item.enabled && styles.btnPabloDisabled,
              !isPablo && !item.enabled && styles.btnDisabled,
            ]}
            disabled={!item.enabled || isBusy}
            activeOpacity={0.75}
            onPress={() => {
              if (item.move) {
                onDispatchMove(item);
              } else {
                onCompositeAction(item.id);
              }
            }}
          >
            <Text style={[styles.btnText, !item.enabled && !isPablo && styles.btnTextDisabled]}>
              {LABELS[item.id] ?? item.id}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: tokens.game.surface.actionBar,
    borderTopWidth: 1,
    borderTopColor: tokens.game.surface.actionBarBorder,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    gap: tokens.space.sm,
  },
  btn: {
    flex: 1,
    backgroundColor: tokens.color.accent.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    alignItems: 'center',
  },
  btnDisabled: {
    backgroundColor: tokens.color.border.subtle,
  },
  btnPablo: {
    backgroundColor: tokens.game.accent.pabloOnTurn,
  },
  btnPabloDisabled: {
    backgroundColor: tokens.game.accent.pabloOffTurn,
  },
  btnText: {
    color: tokens.color.text.inverse,
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.semibold,
  },
  btnTextDisabled: {
    color: tokens.color.text.secondary,
  },
});
