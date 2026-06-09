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

import React, { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import type { Card } from '@pablo/engine';
import { defaultCardTheme } from '../../../design/cardTheme';
import { PlayingCard } from '../../cards/PlayingCard';
import { tokens } from '../../../design/tokens';
import { DRAW_FLOW_SHEET_OFFSCREEN, springFor } from '../../../feedback/motion';
import { t } from '../../../i18n';
import { useGameStore, useGameStoreShallow } from '../../../store/provider';
import {
  selectDrawnCardId,
  selectIsAnimating,
  selectMatchDrawnSlots,
  selectMyHandSlots,
  selectSwapDrawnSlots,
  selectView,
} from '../../../store/selectors';
import { CardSlotGrid, type CardSlot } from '../internal/CardSlotGrid';

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_WIDTH = SCREEN_W - tokens.space.xl * 2;
const CARD_ASPECT = 1.46;
const DECK_W = tokens.game.size.deckCard;
const DECK_H = Math.floor(DECK_W * CARD_ASPECT);
const DRAWN_W = tokens.game.size.drawnFlowCard;
const DRAWN_H = Math.floor(DRAWN_W * CARD_ASPECT);
const HERO_INTRO_SCALE = DECK_W / DRAWN_W;
const FACE_DOWN_CARD: Card = { suit: 'spades', rank: 1 };

type Stage = 'main' | 'pickingSwap' | 'pickingMatch';

type Props = {
  readonly onSwap: (index: number) => void;
  readonly onDiscard: () => void;
  readonly onMatchDrawn: (index: number) => void;
};

function DrawnCardHero() {
  const view = useGameStore(selectView);
  const drawnCardId = useGameStore(selectDrawnCardId);
  const card = drawnCardId && view ? (view.catalog[drawnCardId] ?? FACE_DOWN_CARD) : FACE_DOWN_CARD;
  const introScale = useSharedValue(HERO_INTRO_SCALE);

  useEffect(() => {
    introScale.value = withSpring(1, springFor('settle'));
  }, [introScale]);

  const heroCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: introScale.value }],
  }));

  return (
    <View style={styles.cardHero}>
      <Text style={styles.cardLabel}>{t('game.drawn.yourCard')}</Text>
      <View style={[styles.cardFrame, styles.cardFrameSized]}>
        <Animated.View style={heroCardStyle}>
          <PlayingCard
            card={card}
            faceUp={true}
            theme={defaultCardTheme}
            size={{ width: DRAWN_W, height: DRAWN_H }}
            draggable={false}
            flippable={false}
            suppressFlipAnimation
          />
        </Animated.View>
      </View>
    </View>
  );
}

function AnimatedSheet({ children }: { readonly children: React.ReactNode }) {
  const translateY = useSharedValue(DRAW_FLOW_SHEET_OFFSCREEN);

  useEffect(() => {
    translateY.value = withSpring(0, springFor('settle'));
  }, [translateY]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.sheet, sheetStyle]}>{children}</Animated.View>
    </View>
  );
}

export function DrawFlow({ onSwap, onDiscard, onMatchDrawn }: Props) {
  const slots = useGameStoreShallow(selectMyHandSlots);
  const swapSlots = useGameStoreShallow(selectSwapDrawnSlots);
  const matchSlots = useGameStoreShallow(selectMatchDrawnSlots);
  const isAnimating = useGameStore(selectIsAnimating);

  const [stage, setStage] = useState<Stage>('main');

  const gridSlots: ReadonlyArray<CardSlot> = slots.map((s) => ({
    index: s.index,
    card: null,
  }));

  const guard = (fn: () => void) => {
    if (isAnimating) return;
    fn();
  };

  if (stage === 'pickingSwap') {
    return (
      <AnimatedSheet>
        <Text style={styles.hint}>{t('game.actionHint.pickSlotToSwap')}</Text>
        <CardSlotGrid
          slots={gridSlots}
          gridWidth={GRID_WIDTH}
          legalIndices={swapSlots}
          onTap={(slot) => guard(() => onSwap(slot.index))}
        />
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => setStage('main')}
          activeOpacity={0.8}
        >
          <Text style={styles.cancelText}>{t('game.action.back')}</Text>
        </TouchableOpacity>
      </AnimatedSheet>
    );
  }

  if (stage === 'pickingMatch') {
    return (
      <AnimatedSheet>
        <Text style={styles.hint}>{t('game.actionHint.pickSlotToMatch')}</Text>
        <CardSlotGrid
          slots={gridSlots}
          gridWidth={GRID_WIDTH}
          legalIndices={matchSlots}
          onTap={(slot) => guard(() => onMatchDrawn(slot.index))}
        />
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => setStage('main')}
          activeOpacity={0.8}
        >
          <Text style={styles.cancelText}>{t('game.action.back')}</Text>
        </TouchableOpacity>
      </AnimatedSheet>
    );
  }

  // 'main' stage
  return (
    <AnimatedSheet>
      <DrawnCardHero />
      <Text style={styles.hint}>{t('game.actionHint.afterDraw')}</Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => guard(onDiscard)}
          activeOpacity={0.8}
        >
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
    </AnimatedSheet>
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
    paddingTop: tokens.space.lg,
    width: '100%',
    gap: tokens.space.md,
    alignItems: 'center',
  },
  cardHero: {
    alignItems: 'center',
    gap: tokens.space.xs,
    marginBottom: tokens.space.xs,
  },
  cardLabel: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cardFrame: {
    borderRadius: tokens.radius.lg,
    padding: tokens.space.sm,
    backgroundColor: tokens.game.surface.currentTurnTint,
    ...tokens.shadow.card,
  },
  cardFrameSized: {
    width: DRAWN_W + tokens.space.sm * 2,
    height: DRAWN_H + tokens.space.sm * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
    textAlign: 'center',
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
