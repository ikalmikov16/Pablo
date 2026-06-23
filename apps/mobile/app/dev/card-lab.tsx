/**
 * Card Lab — dev-only screen (gated behind __DEV__ at the entry point).
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Card } from '@pablo/engine';
import { PlayingCard } from '../../src/components/cards/PlayingCard';
import type { CardTheme } from '../../src/design/cardTheme';
import { defaultCardTheme, nextTheme } from '../../src/design/cardTheme';
import { tokens } from '../../src/design/tokens';
import { textStyle } from '../../src/design/typography';
import { t } from '../../src/i18n';

const ACE_HEARTS: Card = { suit: 'hearts', rank: 1 };
const TWO_CLUBS: Card = { suit: 'clubs', rank: 2 };
const FIVE_DIAMONDS: Card = { suit: 'diamonds', rank: 5 };
const EIGHT_SPADES: Card = { suit: 'spades', rank: 8 };
const TEN_HEARTS: Card = { suit: 'hearts', rank: 10 };
const JACK_CLUBS: Card = { suit: 'clubs', rank: 11 };
const QUEEN_DIAMONDS: Card = { suit: 'diamonds', rank: 12 };
const KING_HEARTS: Card = { suit: 'hearts', rank: 13 };

const VARIANT_CARDS: Card[] = [ACE_HEARTS, TWO_CLUBS, KING_HEARTS, TEN_HEARTS];
const RANK_STRIP: Card[] = [
  ACE_HEARTS,
  TWO_CLUBS,
  FIVE_DIAMONDS,
  EIGHT_SPADES,
  TEN_HEARTS,
  JACK_CLUBS,
  QUEEN_DIAMONDS,
  KING_HEARTS,
];

const THUMBNAIL_SIZE = { width: 72, height: 104 };
const LARGE_SIZE = { width: 220, height: 320 };
/** Wide enough to exercise the standard (full-anatomy) layout mode. */
const STRIP_SIZE = { width: 140, height: 204 };

/** Real in-game widths from tokens — the legibility acceptance surface. */
const GAME_SIZES: ReadonlyArray<{ card: Card; width: number }> = [
  { card: TEN_HEARTS, width: tokens.game.size.drawnFlowCard },
  { card: QUEEN_DIAMONDS, width: tokens.game.size.deckCard },
  { card: EIGHT_SPADES, width: tokens.game.size.peekCard },
  { card: ACE_HEARTS, width: tokens.game.size.ownCardMax },
  { card: KING_HEARTS, width: tokens.game.size.opponentCardMd },
  { card: FIVE_DIAMONDS, width: tokens.game.size.endRoundCard },
];

function gameSize(width: number) {
  return { width, height: Math.floor(width * 1.46) };
}

export default function CardLabScreen() {
  const router = useRouter();
  const [theme, setTheme] = useState<CardTheme>(defaultCardTheme);
  const [showFaceUp, setShowFaceUp] = useState(true);

  function cycleTheme() {
    setTheme((prev) => nextTheme(prev));
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Text style={styles.backBtnText}>←</Text>
        </Pressable>
        <Text style={styles.screenTitle}>{t('dev.cardLab.title')}</Text>
        <Pressable onPress={cycleTheme} style={styles.themeBtn}>
          <Text style={styles.themeBtnText}>
            {t('dev.cardLab.themeButton', { name: theme.name })}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.interactiveZone}>
          <PlayingCard
            card={QUEEN_DIAMONDS}
            faceUp={showFaceUp}
            theme={theme}
            size={LARGE_SIZE}
            draggable
            flippable
            onFlip={setShowFaceUp}
          />
          <Text style={styles.hintText}>{t('dev.cardLab.tapToFlip')}</Text>
        </View>

        <View style={styles.variantsSection}>
          <Text style={styles.variantsTitle}>{t('dev.cardLab.rankStrip')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.stripRow}>
              {RANK_STRIP.map((card) => (
                <PlayingCard
                  key={`rank-${card.suit}-${card.rank}`}
                  card={card}
                  faceUp={true}
                  theme={theme}
                  size={STRIP_SIZE}
                  draggable={false}
                  flippable={false}
                />
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={styles.variantsSection}>
          <Text style={styles.variantsTitle}>{t('dev.cardLab.gameSizes')}</Text>
          <View style={styles.feltTile}>
            <View style={styles.gameSizeRow}>
              {GAME_SIZES.map(({ card, width }) => (
                <PlayingCard
                  key={`game-${card.suit}-${card.rank}-${width}`}
                  card={card}
                  faceUp={true}
                  theme={theme}
                  size={gameSize(width)}
                  draggable={false}
                  flippable={false}
                />
              ))}
            </View>
          </View>
        </View>

        <View style={styles.variantsSection}>
          <Text style={styles.variantsTitle}>{t('dev.cardLab.variantsTitle')}</Text>
          {VARIANT_CARDS.map((card) => (
            <VariantRow key={`${card.suit}-${card.rank}`} card={card} theme={theme} />
          ))}
          <View style={styles.variantRow}>
            <PlayingCard
              card={TWO_CLUBS}
              faceUp={false}
              theme={theme}
              size={THUMBNAIL_SIZE}
              draggable={false}
              flippable={false}
            />
            <PlayingCard
              card={TWO_CLUBS}
              faceUp={false}
              theme={theme}
              size={THUMBNAIL_SIZE}
              draggable={false}
              flippable={false}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function VariantRow({ card, theme }: { card: Card; theme: CardTheme }) {
  return (
    <View style={styles.variantRow}>
      <PlayingCard
        card={card}
        faceUp={true}
        theme={theme}
        size={THUMBNAIL_SIZE}
        draggable={false}
        flippable={false}
      />
      <PlayingCard
        card={card}
        faceUp={false}
        theme={theme}
        size={THUMBNAIL_SIZE}
        draggable={false}
        flippable={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: tokens.color.surface.app,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border.subtle,
    gap: tokens.space.sm,
  },
  backBtn: {
    padding: tokens.space.xs,
  },
  backBtnText: {
    ...textStyle('lg'),
    color: tokens.color.accent.primary,
  },
  screenTitle: {
    flex: 1,
    ...textStyle('md', 'semibold'),
    color: tokens.color.text.primary,
    textAlign: 'center',
  },
  themeBtn: {
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.xs,
    backgroundColor: tokens.color.accent.primary,
    borderRadius: tokens.radius.pill,
  },
  themeBtnText: {
    ...textStyle('xs', 'semibold'),
    color: tokens.color.text.inverse,
  },
  scrollContent: {
    paddingBottom: tokens.space.xxl,
  },
  interactiveZone: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: tokens.space.xxl,
    gap: tokens.space.xl,
  },
  hintText: {
    ...textStyle('sm'),
    color: tokens.color.text.secondary,
  },
  variantsSection: {
    paddingHorizontal: tokens.space.xl,
    gap: tokens.space.lg,
  },
  variantsTitle: {
    ...textStyle('md', 'semibold'),
    color: tokens.color.text.secondary,
    marginBottom: tokens.space.sm,
  },
  feltTile: {
    backgroundColor: tokens.game.surface.table,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.md,
  },
  variantRow: {
    flexDirection: 'row',
    gap: tokens.space.md,
    flexWrap: 'wrap',
  },
  stripRow: {
    flexDirection: 'row',
    gap: tokens.space.md,
  },
  gameSizeRow: {
    flexDirection: 'row',
    gap: tokens.space.md,
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
});
