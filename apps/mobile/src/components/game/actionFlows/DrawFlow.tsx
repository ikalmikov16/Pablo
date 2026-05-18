/**
 * DrawFlow — overlay shown right after `draw_from_deck` resolves.
 *
 * The player has three options for the drawn card:
 *  1. Discard it (and trigger any special power on rank 7/8/9).
 *  2. Swap it into one of their own slots.
 *  3. Match it against one of their own slots (rank-match drop).
 *
 * Both (2) and (3) require the player to choose *which* slot, so this
 * overlay has three stages:
 *  - 'main'        · drawn card preview + three action buttons.
 *  - 'pickingSwap' · own hand in a 2×2 grid (face-down). Tap a legal slot
 *                    to dispatch `swap_drawn` for that index.
 *  - 'pickingMatch' · same grid, but only `match_drawn`-legal slots are
 *                     tappable. Tap to dispatch.
 *
 * Cards are always face-down inside the slot picker (memory test); the
 * legality (`legalIndices`) and back affordance come from the shared
 * `CardSlotGrid` component.
 */

import React, { useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Card } from '@pablo/engine';
import { defaultCardTheme } from '../../../design/cardTheme';
import { tokens } from '../../../design/tokens';
import { t } from '../../../i18n';
import { useGameStore, useGameStoreShallow } from '../../../store/provider';
import {
  selectDrawnCardId,
  selectMatchDrawnSlots,
  selectMyHandSlots,
  selectSwapDrawnSlots,
} from '../../../store/selectors';
import { PlayingCard } from '../../cards/PlayingCard';
import { CardSlotGrid, type CardSlot } from '../internal/CardSlotGrid';

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_WIDTH = SCREEN_W - tokens.space.xl * 2;
const DRAWN_CARD_W = 72;
const DRAWN_CARD_H = Math.floor(DRAWN_CARD_W * 1.46);

type Stage = 'main' | 'pickingSwap' | 'pickingMatch';

type Props = {
  readonly catalog: Readonly<Record<string, Card>>;
  readonly onSwap: (index: number) => void;
  readonly onDiscard: () => void;
  readonly onMatchDrawn: (index: number) => void;
};

export function DrawFlow({ catalog, onSwap, onDiscard, onMatchDrawn }: Props) {
  const drawnCardId = useGameStore(selectDrawnCardId);
  const slots = useGameStoreShallow(selectMyHandSlots);
  const swapSlots = useGameStoreShallow(selectSwapDrawnSlots);
  const matchSlots = useGameStoreShallow(selectMatchDrawnSlots);

  const [stage, setStage] = useState<Stage>('main');

  const drawnCard = drawnCardId ? catalog[drawnCardId] : null;
  const gridSlots: ReadonlyArray<CardSlot> = slots.map((s) => ({
    index: s.index,
    card: null,
  }));

  // Drawn-card preview is the only element that legitimately shows a face,
  // so it's pulled out as a self-contained header inside the sheet.
  const drawnPreview = drawnCard ? (
    <View style={styles.drawnPreview}>
      <PlayingCard
        card={drawnCard}
        faceUp={true}
        theme={defaultCardTheme}
        size={{ width: DRAWN_CARD_W, height: DRAWN_CARD_H }}
        draggable={false}
        flippable={false}
      />
      <Text style={styles.drawnLabel}>{t('game.drawn.label')}</Text>
    </View>
  ) : null;

  if (stage === 'pickingSwap') {
    return (
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.hint}>{t('game.actionHint.pickSlotToSwap')}</Text>
          {drawnPreview}
          <CardSlotGrid
            slots={gridSlots}
            gridWidth={GRID_WIDTH}
            legalIndices={swapSlots}
            onTap={(slot) => onSwap(slot.index)}
          />
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => setStage('main')}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelText}>{t('game.action.back')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (stage === 'pickingMatch') {
    return (
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.hint}>{t('game.actionHint.pickSlotToMatch')}</Text>
          {drawnPreview}
          <CardSlotGrid
            slots={gridSlots}
            gridWidth={GRID_WIDTH}
            legalIndices={matchSlots}
            onTap={(slot) => onMatchDrawn(slot.index)}
          />
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => setStage('main')}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelText}>{t('game.action.back')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // 'main' stage
  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <Text style={styles.hint}>{t('game.actionHint.afterDraw')}</Text>
        {drawnPreview}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={onDiscard} activeOpacity={0.8}>
            <Text style={styles.actionText}>{t('game.action.discard')}</Text>
          </TouchableOpacity>

          {swapSlots.length > 0 && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setStage('pickingSwap')}
              activeOpacity={0.8}
            >
              <Text style={styles.actionText}>{t('game.action.swap')}</Text>
            </TouchableOpacity>
          )}

          {matchSlots.length > 0 && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.matchBtn]}
              onPress={() => setStage('pickingMatch')}
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
  cancelBtn: {
    alignSelf: 'stretch',
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
