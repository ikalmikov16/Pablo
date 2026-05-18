/**
 * EndOfRound overlay — shown when status === 'ended'.
 *
 * Flips every opponent's hand face-up with a stagger, shows per-player totals,
 * declares the winner(s), and offers Play again / Home.
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Card, PlayerId } from '@pablo/engine';
import { defaultCardTheme } from '../../design/cardTheme';
import { tokens } from '../../design/tokens';
import { t } from '../../i18n';
import { useGameStore, useGameStoreShallow } from '../../store/provider';
import { selectPlayers, selectSelf, selectView } from '../../store/selectors';
import { PlayingCard } from '../cards/PlayingCard';

const CARD_W = 52;
const CARD_H = Math.floor(CARD_W * 1.46);
const FACE_DOWN_CARD: Card = { suit: 'spades', rank: 1 };

type Props = {
  readonly catalog: Readonly<Record<string, Card>>;
  readonly displayName: (id: PlayerId) => string;
  readonly onPlayAgain: () => void;
  readonly onHome: () => void;
};

export function EndOfRound({ catalog, displayName, onPlayAgain, onHome }: Props) {
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

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <Text style={styles.title}>{t('result.title')}</Text>
        <Text style={styles.winnerLine}>{winnerLine}</Text>

        <Text style={styles.totalsLabel}>{t('result.totals')}</Text>

        <ScrollView style={styles.scoreList} contentContainerStyle={styles.scoreListContent}>
          {[...players]
            .sort((a, b) => (scores[a.id] ?? 0) - (scores[b.id] ?? 0))
            .map((p) => {
              const isWinner = winners.includes(p.id);
              return (
                <View key={p.id} style={[styles.scoreRow, isWinner && styles.winnerRow]}>
                  <Text style={[styles.scoreName, isWinner && styles.winnerText]}>
                    {p.id === self ? t('game.you') : displayName(p.id)}
                  </Text>

                  {/* Show revealed hand */}
                  <View style={styles.handReveal}>
                    {Array.from({ length: p.handSize }, (_, i) => {
                      const knownId = p.knownCards[i];
                      const card = knownId ? (catalog[knownId] ?? null) : null;
                      return (
                        <View key={i} style={styles.revealCard}>
                          <PlayingCard
                            card={card ?? FACE_DOWN_CARD}
                            faceUp={card !== null}
                            theme={defaultCardTheme}
                            size={{ width: CARD_W, height: CARD_H }}
                            draggable={false}
                            flippable={false}
                          />
                        </View>
                      );
                    })}
                  </View>

                  <Text style={[styles.scoreValue, isWinner && styles.winnerText]}>
                    {t('result.score', { score: scores[p.id] ?? 0 })}
                  </Text>
                </View>
              );
            })}
        </ScrollView>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onHome} activeOpacity={0.8}>
            <Text style={styles.secondaryBtnText}>{t('result.home')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={onPlayAgain} activeOpacity={0.8}>
            <Text style={styles.primaryBtnText}>{t('result.playAgain')}</Text>
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
  },
  title: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.primary,
    textAlign: 'center',
  },
  winnerLine: {
    fontSize: tokens.font.size.md,
    color: tokens.color.accent.primary,
    textAlign: 'center',
    fontWeight: tokens.font.weight.semibold,
  },
  totalsLabel: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
    fontWeight: tokens.font.weight.semibold,
    marginTop: tokens.space.sm,
  },
  scoreList: {
    maxHeight: 280,
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
    width: 80,
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.primary,
  },
  winnerText: {
    color: tokens.color.accent.primary,
    fontWeight: tokens.font.weight.semibold,
  },
  handReveal: {
    flex: 1,
    flexDirection: 'row',
    gap: tokens.space.xs,
    flexWrap: 'wrap',
  },
  revealCard: {
    borderRadius: tokens.radius.sm,
    overflow: 'hidden',
  },
  scoreValue: {
    width: 52,
    textAlign: 'right',
    fontSize: tokens.font.size.sm,
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
    color: tokens.color.text.inverse,
    fontWeight: tokens.font.weight.semibold,
    fontSize: tokens.font.size.md,
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
    color: tokens.color.text.secondary,
    fontSize: tokens.font.size.md,
  },
});
