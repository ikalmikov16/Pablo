/**
 * Card Lab — dev-only screen (gated behind __DEV__ at the entry point).
 *
 * Layout:
 *  1. Top bar — title + theme-cycle button.
 *  2. Interactive zone — one draggable + flippable card, hint text.
 *  3. Variants grid — read-only thumbnails across permutations (suits × themes × face state).
 *     Acts as an in-app Storybook without the dependency.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Card } from '@pablo/engine';
import { PlayingCard } from '../../src/components/cards/PlayingCard';
import type { CardTheme } from '../../src/design/cardTheme';
import { nextTheme, defaultCardTheme } from '../../src/design/cardTheme';
import { tokens } from '../../src/design/tokens';
import { t } from '../../src/i18n';

// ---------------------------------------------------------------------------
// Fixture cards — plain literals, no engine state. (Hard rule #6)
// ---------------------------------------------------------------------------
const ACE_HEARTS: Card = { suit: 'hearts', rank: 1 };
const SEVEN_CLUBS: Card = { suit: 'clubs', rank: 7 }; // power card
const KING_HEARTS: Card = { suit: 'hearts', rank: 13 }; // K♥ = 0 value
const TEN_SPADES: Card = { suit: 'spades', rank: 10 };
const QUEEN_DIAMONDS: Card = { suit: 'diamonds', rank: 12 };
const TWO_CLUBS: Card = { suit: 'clubs', rank: 2 };

const VARIANT_CARDS: Card[] = [ACE_HEARTS, SEVEN_CLUBS, KING_HEARTS, TEN_SPADES];

const THUMBNAIL_SIZE = { width: 72, height: 104 };

export default function CardLabScreen() {
  const router = useRouter();
  const [theme, setTheme] = useState<CardTheme>(defaultCardTheme);
  const [showFaceUp, setShowFaceUp] = useState(true);

  function cycleTheme() {
    setTheme((prev) => nextTheme(prev));
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* ── Top bar ── */}
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
        {/* ── Interactive card ── */}
        <View style={styles.interactiveZone}>
          <PlayingCard
            card={QUEEN_DIAMONDS}
            faceUp={showFaceUp}
            theme={theme}
            draggable
            flippable
            onFlip={setShowFaceUp}
          />
          <Text style={styles.hintText}>{t('dev.cardLab.tapToFlip')}</Text>
        </View>

        {/* ── Variants grid ── */}
        <View style={styles.variantsSection}>
          <Text style={styles.variantsTitle}>{t('dev.cardLab.variantsTitle')}</Text>
          {/* Row per card, 2 themes × 2 face states = 4 thumbnails */}
          {VARIANT_CARDS.map((card) => (
            <VariantRow key={`${card.suit}-${card.rank}`} card={card} theme={theme} />
          ))}
          {/* Two Clubs face-down × 2, to verify back motif scales at thumbnail size */}
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
      {/* Face up */}
      <PlayingCard
        card={card}
        faceUp={true}
        theme={theme}
        size={THUMBNAIL_SIZE}
        draggable={false}
        flippable={false}
      />
      {/* Face down */}
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
    fontSize: tokens.font.size.lg,
    color: tokens.color.accent.primary,
  },
  screenTitle: {
    flex: 1,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semibold,
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
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.semibold,
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
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
  },
  variantsSection: {
    paddingHorizontal: tokens.space.xl,
    gap: tokens.space.lg,
  },
  variantsTitle: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.secondary,
    marginBottom: tokens.space.sm,
  },
  variantRow: {
    flexDirection: 'row',
    gap: tokens.space.md,
    flexWrap: 'wrap',
  },
});
