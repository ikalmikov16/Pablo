/**
 * PeekOverlay — prompts the local player to peek at their initial cards
 * one tap at a time.
 *
 * Flow:
 *  1. The overlay shows the local hand as face-down cards in a grid.
 *  2. Each tap dispatches `peek_one` to the engine, which adds that slot
 *     to the player's `knownCards`. The store updates → the overlay
 *     re-renders → `PlayingCard` animates the flip via its prop-driven
 *     flip animation. The tapped card now shows face-up for the rest of
 *     this overlay.
 *  3. After the player has tapped `initialPeekCount` cards, the "Got it"
 *     button is enabled. Tapping it dismisses the overlay.
 *
 * Bots resolve their peek automatically via the bot scheduler; while
 * waiting for them we show a "waiting" line. The overlay also stays
 * mounted across the `peek_phase → playing` status transition (via
 * `ui.peekJustHappened` in the store) so the player has a beat to
 * memorise their cards.
 */

import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Card, Move } from '@pablo/engine';
import { defaultCardTheme } from '../../design/cardTheme';
import { tokens } from '../../design/tokens';
import { t } from '../../i18n';
import { useGameStore, useGameStoreShallow } from '../../store/provider';
import {
  selectMyHandSlots,
  selectPeekRequired,
  selectPlayers,
  selectSelf,
} from '../../store/selectors';
import { PlayingCard } from '../cards/PlayingCard';

const CARD_W = 80;
const CARD_H = Math.floor(CARD_W * 1.46);
const FACE_DOWN_CARD: Card = { suit: 'spades', rank: 1 };

/**
 * Lay the hand out in a fixed-column grid (mirrors `HandGrid.gridLayoutFor`).
 * Default v1 hand is 4 cards → 2×2; larger hands cap at 4 columns.
 */
function colsFor(handSize: number): number {
  if (handSize <= 4) return 2;
  if (handSize <= 6) return 3;
  return 4;
}

function chunk<T>(arr: ReadonlyArray<T>, size: number): ReadonlyArray<ReadonlyArray<T>> {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

type Props = {
  readonly catalog: Readonly<Record<string, Card>>;
  /** Fires for every individual tap; the parent dispatches `peek_one`. */
  readonly onPeekOne: (move: Move) => void;
  /** Fires when the player taps "Got it" to dismiss the overlay. */
  readonly onDismiss: () => void;
};

export function PeekOverlay({ catalog, onPeekOne, onDismiss }: Props) {
  const slots = useGameStoreShallow(selectMyHandSlots);
  const peekRequired = useGameStore(selectPeekRequired);
  const players = useGameStoreShallow(selectPlayers);
  const self = useGameStore(selectSelf);

  // The "real" peek count is what the engine has acknowledged: i.e. how many
  // of the local player's slots have a known cardId. We don't double-count
  // optimistic taps because the dispatch round-trip is fast and the engine
  // is the source of truth.
  const peekedCount = useMemo(() => slots.filter((slot) => slot.cardId !== null).length, [slots]);
  const canDismiss = peekedCount >= peekRequired;

  const botsRemaining = players.filter(
    (p) => p.id !== self && Object.keys(p.knownCards).length < peekRequired,
  ).length;

  const handleTap = useCallback(
    (slotIndex: number, alreadyKnown: boolean) => {
      if (canDismiss || alreadyKnown || !self) return;
      onPeekOne({ type: 'peek_one', playerId: self, handIndex: slotIndex });
    },
    [canDismiss, self, onPeekOne],
  );

  const rows = chunk(slots, colsFor(slots.length));

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>
          {canDismiss
            ? t('game.peek.memorise')
            : t('game.peek.instruction', { count: peekRequired })}
        </Text>

        <View style={styles.handGrid}>
          {rows.map((row, rowIdx) => (
            <View key={rowIdx} style={styles.handRow}>
              {row.map((slot) => {
                const known = slot.cardId !== null;
                const cardData = known ? catalog[slot.cardId!] : null;
                return (
                  <View key={slot.index} style={styles.slotBtn}>
                    <PlayingCard
                      card={cardData ?? FACE_DOWN_CARD}
                      // Face-up exactly when the engine has acknowledged a
                      // peek for this slot. The flip is animated by
                      // PlayingCard's `faceUp` effect.
                      faceUp={known}
                      theme={defaultCardTheme}
                      size={{ width: CARD_W, height: CARD_H }}
                      draggable={false}
                      flippable={false}
                      onTap={() => handleTap(slot.index, known)}
                    />
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        {botsRemaining > 0 && (
          <Text style={styles.waiting}>
            {botsRemaining === 1
              ? t('game.peek.waitingForBots', { remaining: botsRemaining })
              : t('game.peek.waitingForBotsPlural', { remaining: botsRemaining })}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.confirmBtn, !canDismiss && styles.confirmDisabled]}
          disabled={!canDismiss}
          onPress={onDismiss}
          activeOpacity={0.8}
        >
          <Text style={styles.confirmText}>{t('game.peek.gotIt')}</Text>
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
  handGrid: {
    gap: tokens.space.sm,
    alignItems: 'center',
  },
  handRow: {
    flexDirection: 'row',
    gap: tokens.space.sm,
    justifyContent: 'center',
  },
  slotBtn: {
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
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
