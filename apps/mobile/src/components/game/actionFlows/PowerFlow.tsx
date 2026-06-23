/**
 * PowerFlow — overlay that lets the local player resolve a pending special
 * power (peek_self, peek_opponent, swap_blind) and shows the reveal
 * afterwards for the two peek powers.
 *
 * Mount semantics:
 *  - Visible whenever `selectPowerOverlayVisible` is true. That is true
 *    when either (a) a pending power belongs to the local player, or
 *    (b) `ui.lastPeekReveal` is set (we just dispatched a peek power
 *    and want to keep the reveal on screen even though the engine has
 *    already advanced the turn and cleared `pendingPower`).
 *
 * Sub-states:
 *  - peek_self     · pick stage: own hand in a 2×2 grid, all face-down.
 *                  · reveal stage: only the picked slot, animated face-up,
 *                    "Got it" dismisses.
 *  - peek_opponent · stage 1: pick which opponent (button row).
 *                  · stage 2: that opponent's hand in a 2×2 grid, face-down.
 *                  · reveal stage: same as peek_self but for the opponent slot.
 *  - swap_blind    · stage 1: own hand 2×2 (pick own slot).
 *                  · stage 2: pick opponent.
 *                  · stage 3: opponent hand 2×2 (face-down). Tap → submit.
 *
 * Cards are NEVER shown face-up in the pick stage — the player relies on
 * memory, exactly like the main hand grid.
 */

import React, { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Card, HandIndex, PlayerId } from '@pablo/engine';
import { tokens } from '../../../design/tokens';
import { textStyle } from '../../../design/typography';
import { t } from '../../../i18n';
import { useGameStore, useGameStoreShallow } from '../../../store/provider';
import {
  selectLastPeekReveal,
  selectMyHandSlots,
  selectOpponentEntries,
  selectPendingPower,
  selectSelf,
  selectView,
} from '../../../store/selectors';
import { CardSlotGrid, type CardSlot } from '../internal/CardSlotGrid';

const { width: SCREEN_W } = Dimensions.get('window');
/** The sheet itself spans the screen; the grid sits inside with horizontal padding. */
const GRID_WIDTH = SCREEN_W - tokens.space.xl * 2;

type Props = {
  readonly catalog: Readonly<Record<string, Card>>;
  readonly displayName: (id: PlayerId) => string;
  readonly onUsePeekSelf: (handIndex: HandIndex) => void;
  readonly onUsePeekOpponent: (target: PlayerId, handIndex: HandIndex) => void;
  readonly onUseSwapBlind: (selfIdx: HandIndex, target: PlayerId, targetIdx: HandIndex) => void;
  readonly onSkip: () => void;
  /** Fires when the player dismisses the reveal sheet. */
  readonly onDismissReveal: () => void;
};

export function PowerFlow({
  catalog,
  displayName,
  onUsePeekSelf,
  onUsePeekOpponent,
  onUseSwapBlind,
  onSkip,
  onDismissReveal,
}: Props) {
  const view = useGameStore(selectView);
  const power = useGameStore(selectPendingPower);
  const self = useGameStore(selectSelf);
  const slots = useGameStoreShallow(selectMyHandSlots);
  const opponents = useGameStoreShallow(selectOpponentEntries);
  const lastPeekReveal = useGameStore(selectLastPeekReveal);

  const [pickedOwnSlot, setPickedOwnSlot] = useState<HandIndex | null>(null);
  const [pickedOpponent, setPickedOpponent] = useState<PlayerId | null>(null);

  // Reset local stage state when the active power or its owner changes.
  // We KEY only on power identity, not its presence — if the user is in the
  // reveal stage, `power` may already be null while we still want to show
  // the reveal, and we don't want to reset the picked state in that window.
  const powerKey = power ? `${power.power}:${power.playerId}:${power.rank}` : null;
  useEffect(() => {
    setPickedOwnSlot(null);
    setPickedOpponent(null);
  }, [powerKey]);

  // ─── Reveal stage (peek_self / peek_opponent) ──────────────────────────────

  if (lastPeekReveal && self) {
    // Look up the just-peeked card from the view: the engine has populated
    // the peeker's knownCards for that target slot. While the new view is
    // still draining through the animation queue, `knownCards[handIndex]`
    // is undefined; we render a face-down card until it arrives.
    const targetEntry = view?.players.find((p) => p.id === lastPeekReveal.target) ?? null;
    const knownCardId = targetEntry?.knownCards[lastPeekReveal.handIndex] ?? null;
    const card = knownCardId ? catalog[knownCardId] : null;
    const targetLabel =
      lastPeekReveal.target === self
        ? t('game.actionHint.yourCard')
        : displayName(lastPeekReveal.target);
    const revealSlot: CardSlot = {
      index: lastPeekReveal.handIndex,
      card: card ?? null,
    };

    return (
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{targetLabel}</Text>
          <Text style={styles.hint}>{t('game.actionHint.memoriseRevealed')}</Text>
          <CardSlotGrid
            slots={[revealSlot]}
            gridWidth={GRID_WIDTH}
            maxCardWidth={140}
            faceUpFor={() => card !== null}
          />
          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={onDismissReveal}
            activeOpacity={0.8}
            disabled={card === null}
          >
            <Text style={styles.confirmText}>{t('game.peek.gotIt')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!power || power.playerId !== self) return null;

  // Convert HandSlot → CardSlot for the grid. The pick stage NEVER shows
  // peeked cards face-up, so we drop the `card` entirely — the grid will
  // render the face-down placeholder.
  const ownGridSlots: ReadonlyArray<CardSlot> = slots.map((s) => ({
    index: s.index,
    card: null,
  }));

  // ─── peek_self ─────────────────────────────────────────────────────────────

  if (power.power === 'peek_self') {
    return (
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('game.power.peek_self')}</Text>
          <Text style={styles.hint}>{t('game.actionHint.pickOwnSlot')}</Text>
          <CardSlotGrid
            slots={ownGridSlots}
            gridWidth={GRID_WIDTH}
            onTap={(slot) => onUsePeekSelf(slot.index)}
          />
          <TouchableOpacity style={styles.skipBtn} onPress={onSkip} activeOpacity={0.8}>
            <Text style={styles.skipText}>{t('game.action.skipPower')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── peek_opponent ─────────────────────────────────────────────────────────

  if (power.power === 'peek_opponent') {
    const opponentToPeek = pickedOpponent ? opponents.find((o) => o.id === pickedOpponent) : null;

    return (
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('game.power.peek_opponent')}</Text>

          {!opponentToPeek && (
            <>
              <Text style={styles.hint}>{t('game.actionHint.pickOpponent')}</Text>
              <View style={styles.opponentBtnRow}>
                {opponents.map((opp) => (
                  <TouchableOpacity
                    key={opp.id}
                    style={styles.opponentBtn}
                    onPress={() => setPickedOpponent(opp.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.opponentBtnText}>{displayName(opp.id)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {opponentToPeek && (
            <>
              <Text style={styles.hint}>
                {t('game.actionHint.pickSlotOf', { name: displayName(opponentToPeek.id) })}
              </Text>
              <CardSlotGrid
                slots={Array.from({ length: opponentToPeek.handSize }, (_, i) => ({
                  index: i,
                  card: null,
                }))}
                gridWidth={GRID_WIDTH}
                onTap={(slot) => onUsePeekOpponent(opponentToPeek.id, slot.index)}
              />
            </>
          )}

          <TouchableOpacity style={styles.skipBtn} onPress={onSkip} activeOpacity={0.8}>
            <Text style={styles.skipText}>{t('game.action.skipPower')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── swap_blind ────────────────────────────────────────────────────────────

  if (power.power === 'swap_blind') {
    const opponentToTarget = pickedOpponent ? opponents.find((o) => o.id === pickedOpponent) : null;

    return (
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('game.power.swap_blind')}</Text>

          {pickedOwnSlot === null && (
            <>
              <Text style={styles.hint}>{t('game.actionHint.pickOwnSlot')}</Text>
              <CardSlotGrid
                slots={ownGridSlots}
                gridWidth={GRID_WIDTH}
                onTap={(slot) => setPickedOwnSlot(slot.index)}
              />
            </>
          )}

          {pickedOwnSlot !== null && !opponentToTarget && (
            <>
              <Text style={styles.hint}>{t('game.actionHint.pickOpponent')}</Text>
              <View style={styles.opponentBtnRow}>
                {opponents.map((opp) => (
                  <TouchableOpacity
                    key={opp.id}
                    style={styles.opponentBtn}
                    onPress={() => setPickedOpponent(opp.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.opponentBtnText}>{displayName(opp.id)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {pickedOwnSlot !== null && opponentToTarget && (
            <>
              <Text style={styles.hint}>
                {t('game.actionHint.pickSlotOf', { name: displayName(opponentToTarget.id) })}
              </Text>
              <CardSlotGrid
                slots={Array.from({ length: opponentToTarget.handSize }, (_, i) => ({
                  index: i,
                  card: null,
                }))}
                gridWidth={GRID_WIDTH}
                onTap={(slot) => onUseSwapBlind(pickedOwnSlot, opponentToTarget.id, slot.index)}
              />
            </>
          )}

          <TouchableOpacity style={styles.skipBtn} onPress={onSkip} activeOpacity={0.8}>
            <Text style={styles.skipText}>{t('game.action.skipPower')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.color.surface.overlay,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 36,
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
  hint: {
    ...textStyle('sm'),
    color: tokens.color.text.secondary,
    textAlign: 'center',
  },
  opponentBtnRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: tokens.space.sm,
    flexWrap: 'wrap',
  },
  opponentBtn: {
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
    backgroundColor: tokens.color.accent.primary,
    borderRadius: tokens.radius.md,
  },
  opponentBtnText: {
    ...textStyle('sm', 'semibold'),
    color: tokens.color.text.inverse,
  },
  confirmBtn: {
    backgroundColor: tokens.color.accent.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    alignItems: 'center',
  },
  confirmText: {
    ...textStyle('sm', 'semibold'),
    color: tokens.color.text.inverse,
  },
  skipBtn: {
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    alignItems: 'center',
  },
  skipText: {
    ...textStyle('sm'),
    color: tokens.color.text.secondary,
  },
});
