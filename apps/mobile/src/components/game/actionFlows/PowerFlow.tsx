/**
 * PowerFlow — overlay that lets the local player resolve a pending special
 * power (peek_self, peek_opponent, swap_blind) or skip it.
 *
 * Visible whenever `pendingPower.playerId === self` and `status === 'playing'`.
 *
 * Sub-states:
 *  - peek_self:     pick one own slot → fires use_peek_self → briefly reveal → close.
 *  - peek_opponent: pick opponent then slot → fires use_peek_opponent → reveal → close.
 *  - swap_blind:    pick own slot then opponent slot → fires use_swap_blind → close.
 *
 * The "reveal" sub-state shows the picked card face-up for ~1.5 s (read from
 * the updated PlayerView, which the engine populates for the peeker only).
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Card, HandIndex, PlayerId } from '@pablo/engine';
import { defaultCardTheme } from '../../../design/cardTheme';
import { tokens } from '../../../design/tokens';
import { t } from '../../../i18n';
import { useGameStore } from '../../../store/provider';
import {
  selectMyHandSlots,
  selectOpponentEntries,
  selectPendingPower,
  selectSelf,
} from '../../../store/selectors';
import { PlayingCard } from '../../cards/PlayingCard';

const CARD_W = 64;
const CARD_H = Math.floor(CARD_W * 1.46);
const REVEAL_MS = 1500;
const FACE_DOWN_CARD: Card = { suit: 'spades', rank: 1 };

type Props = {
  readonly catalog: Readonly<Record<string, Card>>;
  readonly displayName: (id: PlayerId) => string;
  readonly onUsePeekSelf: (handIndex: HandIndex) => void;
  readonly onUsePeekOpponent: (target: PlayerId, handIndex: HandIndex) => void;
  readonly onUseSwapBlind: (selfIdx: HandIndex, target: PlayerId, targetIdx: HandIndex) => void;
  readonly onSkip: () => void;
};

export function PowerFlow({
  catalog,
  displayName,
  onUsePeekSelf,
  onUsePeekOpponent,
  onUseSwapBlind,
  onSkip,
}: Props) {
  const power = useGameStore(selectPendingPower);
  const self = useGameStore(selectSelf);
  const slots = useGameStore(selectMyHandSlots);
  const opponents = useGameStore(selectOpponentEntries);

  // Track what the user has picked so far for the active power.
  const [pickedOwnSlot, setPickedOwnSlot] = useState<HandIndex | null>(null);
  const [pickedOpponent, setPickedOpponent] = useState<PlayerId | null>(null);
  const [submittedAt, setSubmittedAt] = useState<number | null>(null);

  // Reset local state whenever the power changes (new pending power, or cleared).
  useEffect(() => {
    setPickedOwnSlot(null);
    setPickedOpponent(null);
    setSubmittedAt(null);
  }, [power?.power, power?.playerId, power?.rank]);

  // After a peek_self / peek_opponent submission, the engine populates knownCards.
  // We show the reveal for REVEAL_MS, then the parent closes us via store changes.
  // (When pendingPower transitions to null, this component unmounts.)

  if (!power || power.playerId !== self) return null;

  const isRevealing = submittedAt !== null;

  // ─── peek_self ─────────────────────────────────────────────────────────────

  if (power.power === 'peek_self') {
    return (
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('game.power.peek_self')}</Text>
          <Text style={styles.hint}>{t('game.actionHint.pickOwnSlot')}</Text>

          <View style={styles.handRow}>
            {slots.map((slot) => {
              const card = slot.cardId ? catalog[slot.cardId] : null;
              const showFace = isRevealing && card !== null;
              return (
                <TouchableOpacity
                  key={slot.index}
                  onPress={() => {
                    if (isRevealing) return;
                    setSubmittedAt(Date.now());
                    onUsePeekSelf(slot.index);
                  }}
                  activeOpacity={0.8}
                  disabled={isRevealing}
                  style={styles.slotBtn}
                >
                  <PlayingCard
                    card={card ?? FACE_DOWN_CARD}
                    faceUp={showFace || slot.faceUp}
                    theme={defaultCardTheme}
                    size={{ width: CARD_W, height: CARD_H }}
                    draggable={false}
                    flippable={false}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.skipBtn}
            onPress={onSkip}
            activeOpacity={0.8}
            disabled={isRevealing}
          >
            <Text style={styles.skipText}>{t('game.action.skipPower')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── peek_opponent ─────────────────────────────────────────────────────────

  if (power.power === 'peek_opponent') {
    // Stage 1: pick opponent. Stage 2: pick their slot.
    const opponentToPeek = pickedOpponent ? opponents.find((o) => o.id === pickedOpponent) : null;

    return (
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('game.power.peek_opponent')}</Text>

          {!opponentToPeek && (
            <>
              <Text style={styles.hint}>{t('game.actionHint.pickOpponentSlot')}</Text>
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
              <Text style={styles.hint}>{displayName(opponentToPeek.id)}</Text>
              <View style={styles.handRow}>
                {Array.from({ length: opponentToPeek.handSize }, (_, i) => {
                  const knownId = opponentToPeek.knownCards[i];
                  const card = knownId ? catalog[knownId] : null;
                  const showFace = isRevealing && card !== null;
                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => {
                        if (isRevealing) return;
                        setSubmittedAt(Date.now());
                        onUsePeekOpponent(opponentToPeek.id, i);
                      }}
                      activeOpacity={0.8}
                      disabled={isRevealing}
                      style={styles.slotBtn}
                    >
                      <PlayingCard
                        card={card ?? FACE_DOWN_CARD}
                        faceUp={showFace}
                        theme={defaultCardTheme}
                        size={{ width: CARD_W, height: CARD_H }}
                        draggable={false}
                        flippable={false}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          <TouchableOpacity
            style={styles.skipBtn}
            onPress={onSkip}
            activeOpacity={0.8}
            disabled={isRevealing}
          >
            <Text style={styles.skipText}>{t('game.action.skipPower')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── swap_blind ────────────────────────────────────────────────────────────

  if (power.power === 'swap_blind') {
    // Stage 1: pick own slot. Stage 2: pick opponent. Stage 3: pick opponent slot.
    const opponentToTarget = pickedOpponent ? opponents.find((o) => o.id === pickedOpponent) : null;

    return (
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('game.power.swap_blind')}</Text>

          {pickedOwnSlot === null && (
            <>
              <Text style={styles.hint}>{t('game.actionHint.pickOwnSlot')}</Text>
              <View style={styles.handRow}>
                {slots.map((slot) => {
                  const card = slot.cardId ? catalog[slot.cardId] : null;
                  return (
                    <TouchableOpacity
                      key={slot.index}
                      onPress={() => setPickedOwnSlot(slot.index)}
                      activeOpacity={0.8}
                      style={styles.slotBtn}
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
            </>
          )}

          {pickedOwnSlot !== null && !opponentToTarget && (
            <>
              <Text style={styles.hint}>{t('game.actionHint.pickOpponentSlot')}</Text>
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
              <Text style={styles.hint}>{displayName(opponentToTarget.id)}</Text>
              <View style={styles.handRow}>
                {Array.from({ length: opponentToTarget.handSize }, (_, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => {
                      onUseSwapBlind(pickedOwnSlot, opponentToTarget.id, i);
                    }}
                    activeOpacity={0.8}
                    style={styles.slotBtn}
                  >
                    <PlayingCard
                      card={FACE_DOWN_CARD}
                      faceUp={false}
                      theme={defaultCardTheme}
                      size={{ width: CARD_W, height: CARD_H }}
                      draggable={false}
                      flippable={false}
                    />
                  </TouchableOpacity>
                ))}
              </View>
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

// Keep REVEAL_MS referenced so future Phase 7 reveal-timing tweaks stay co-located.
void REVEAL_MS;

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
  },
  title: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.primary,
    textAlign: 'center',
  },
  hint: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
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
    color: tokens.color.text.inverse,
    fontWeight: tokens.font.weight.semibold,
    fontSize: tokens.font.size.sm,
  },
  skipBtn: {
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    alignItems: 'center',
  },
  skipText: {
    color: tokens.color.text.secondary,
    fontSize: tokens.font.size.sm,
  },
});
