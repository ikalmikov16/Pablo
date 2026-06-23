/**
 * EndOfRound overlay — shown when status === 'ended'.
 *
 * Shows every player's full hand face-up (via ended-state PlayerView projection),
 * per-player totals, winner(s), and Play again / Home.
 */

import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import type { Card, PlayerId } from '@pablo/engine';
import { tokens } from '../../design/tokens';
import { textStyle } from '../../design/typography';
import { END_ROUND_ROW_STAGGER_MS, springFor } from '../../feedback/motion';
import { t } from '../../i18n';
import { useGameStore, useGameStoreShallow } from '../../store/provider';
import { selectPlayers, selectSelf, selectView } from '../../store/selectors';
import { CardSlotGrid } from './internal/CardSlotGrid';

const CARD_W = tokens.game.size.endRoundCard;
const FACE_DOWN_CARD: Card = { suit: 'spades', rank: 1 };

type Props = {
  readonly catalog: Readonly<Record<string, Card>>;
  readonly displayName: (id: PlayerId) => string;
  readonly onPlayAgain: () => void;
  readonly onHome: () => void;
  readonly showPlayAgain?: boolean;
  readonly playAgainLabel?: string;
  readonly waitingMessage?: string | null;
};

/** Winner rows pop once after their staggered entrance so the result lands. */
function WinnerPop({
  index,
  children,
}: {
  readonly index: number;
  readonly children: React.ReactNode;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withDelay(
      index * END_ROUND_ROW_STAGGER_MS + tokens.game.motion.duration.normal,
      withSequence(withSpring(1.05, springFor('pulse')), withSpring(1, springFor('settle'))),
    );
  }, [index, scale]);

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={popStyle}>{children}</Animated.View>;
}

export function EndOfRound({
  catalog,
  displayName,
  onPlayAgain,
  onHome,
  showPlayAgain = true,
  playAgainLabel,
  waitingMessage = null,
}: Props) {
  const players = useGameStoreShallow(selectPlayers);
  const self = useGameStore(selectSelf);
  const view = useGameStore(selectView);

  const scores =
    view?.status === 'ended' ? Object.fromEntries(players.map((p) => [p.id, p.score])) : {};

  const lowest = Math.min(...Object.values(scores));
  const winners = players.filter((p) => scores[p.id] === lowest).map((p) => p.id);

  const winnerNames = winners
    .map((id) => (id === self ? t('game.you') : displayName(id)))
    .join(', ');

  const winnerLine =
    winners.length === 1
      ? t('result.winners.single', { name: winnerNames })
      : t('result.winners.tie', { names: winnerNames });

  const sheetScale = useSharedValue(0.94);
  const sheetOpacity = useSharedValue(0);

  useEffect(() => {
    sheetScale.value = withSpring(1, springFor('settle'));
    sheetOpacity.value = withSpring(1, springFor('gentle'));
  }, [sheetOpacity, sheetScale]);

  const sheetAnimStyle = useAnimatedStyle(() => ({
    opacity: sheetOpacity.value,
    transform: [{ scale: sheetScale.value }],
  }));

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.sheet, sheetAnimStyle]}>
        <Text style={styles.title}>{t('result.title')}</Text>
        <Text style={styles.winnerLine}>{winnerLine}</Text>

        <Text style={styles.totalsLabel}>{t('result.totals')}</Text>

        <ScrollView style={styles.scoreList} contentContainerStyle={styles.scoreListContent}>
          {[...players]
            .sort((a, b) => (scores[a.id] ?? 0) - (scores[b.id] ?? 0))
            .map((p, rowIndex) => {
              const isWinner = winners.includes(p.id);
              const slots = Array.from({ length: p.handSize }, (_, index) => {
                const cardId = p.knownCards[index];
                return {
                  index,
                  card: cardId ? (catalog[cardId] ?? FACE_DOWN_CARD) : null,
                };
              });
              const cols = slots.length <= 4 ? 2 : slots.length <= 6 ? 3 : 4;
              const gridWidth = cols * CARD_W + (cols - 1) * tokens.game.table.handGap;

              const row = (
                <View style={[styles.scoreRow, isWinner && styles.winnerRow]}>
                  <Text style={[styles.scoreName, isWinner && styles.winnerText]}>
                    {p.id === self ? t('game.you') : displayName(p.id)}
                  </Text>

                  <View style={styles.handReveal}>
                    <CardSlotGrid
                      slots={slots}
                      gridWidth={gridWidth}
                      cardWidth={CARD_W}
                      gap={tokens.game.table.handGap}
                      faceUpFor={() => true}
                    />
                  </View>

                  <Text style={[styles.scoreValue, isWinner && styles.winnerText]}>
                    {t('result.score', { score: scores[p.id] ?? 0 })}
                  </Text>
                </View>
              );

              return (
                <Animated.View
                  key={p.id}
                  entering={FadeInDown.delay(rowIndex * END_ROUND_ROW_STAGGER_MS).springify()}
                >
                  {isWinner ? <WinnerPop index={rowIndex}>{row}</WinnerPop> : row}
                </Animated.View>
              );
            })}
        </ScrollView>

        {waitingMessage && <Text style={styles.waiting}>{waitingMessage}</Text>}

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onHome} activeOpacity={0.8}>
            <Text style={styles.secondaryBtnText}>{t('result.home')}</Text>
          </TouchableOpacity>
          {showPlayAgain && (
            <TouchableOpacity style={styles.primaryBtn} onPress={onPlayAgain} activeOpacity={0.8}>
              <Text style={styles.primaryBtnText}>{playAgainLabel ?? t('result.playAgain')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.color.surface.overlay,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 40,
  },
  sheet: {
    backgroundColor: tokens.color.surface.card,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    padding: tokens.space.xl,
    paddingBottom: tokens.space.xxl,
    width: '100%',
    gap: tokens.space.md,
    maxHeight: '85%',
    ...tokens.shadow.floating,
  },
  title: {
    ...textStyle('lg', 'semibold'),
    color: tokens.color.text.primary,
    textAlign: 'center',
  },
  winnerLine: {
    ...textStyle('md', 'semibold'),
    color: tokens.color.accent.primary,
    textAlign: 'center',
  },
  totalsLabel: {
    ...textStyle('sm', 'semibold'),
    color: tokens.color.text.secondary,
    marginTop: tokens.space.sm,
  },
  scoreList: {
    maxHeight: tokens.game.size.endRoundListMaxHeight,
  },
  scoreListContent: {
    gap: tokens.space.sm,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.sm,
    paddingVertical: tokens.space.xs,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border.subtle,
  },
  winnerRow: {
    backgroundColor: tokens.game.surface.winnerRowTint,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space.xs,
  },
  scoreName: {
    ...textStyle('sm'),
    width: tokens.game.size.endRoundNameWidth,
    color: tokens.color.text.primary,
  },
  winnerText: {
    ...textStyle('sm', 'semibold'),
    color: tokens.color.accent.primary,
  },
  handReveal: {
    flex: 1,
    alignItems: 'center',
  },
  scoreValue: {
    ...textStyle('sm'),
    width: tokens.game.size.endRoundScoreWidth,
    textAlign: 'right',
    color: tokens.color.text.secondary,
  },
  waiting: {
    ...textStyle('sm'),
    textAlign: 'center',
    color: tokens.color.text.secondary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: tokens.space.sm,
    marginTop: tokens.space.sm,
  },
  primaryBtn: {
    flex: 2,
    backgroundColor: tokens.color.accent.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    ...textStyle('md', 'semibold'),
    color: tokens.color.text.inverse,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    alignItems: 'center',
  },
  secondaryBtnText: {
    ...textStyle('md'),
    color: tokens.color.text.secondary,
  },
});
