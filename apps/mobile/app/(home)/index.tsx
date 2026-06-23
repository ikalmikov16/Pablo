import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Card } from '@pablo/engine';

import { PlayingCard } from '../../src/components/cards/PlayingCard';
import { Button } from '../../src/components/ui/Button';
import { defaultCardTheme } from '../../src/design/cardTheme';
import { tokens } from '../../src/design/tokens';
import { textStyle } from '../../src/design/typography';
import { t } from '../../src/i18n';
import { getRealClient } from '../../src/supabase/client';

const FAN_CARD: Card = { suit: 'spades', rank: 1 };
const FAN_SIZE = { width: 88, height: 128 };
const FAN_LAYOUT = [
  { rotate: '-16deg', translateX: 46, translateY: 14 },
  { rotate: '0deg', translateX: 0, translateY: -6 },
  { rotate: '16deg', translateX: -46, translateY: 14 },
] as const;

function CardFan() {
  return (
    <View style={styles.fan} pointerEvents="none">
      {FAN_LAYOUT.map((pose, i) => (
        <View
          key={i}
          style={[
            styles.fanCard,
            {
              transform: [
                { translateX: pose.translateX },
                { translateY: pose.translateY },
                { rotate: pose.rotate },
              ],
            },
          ]}
        >
          <PlayingCard
            card={FAN_CARD}
            faceUp={false}
            theme={defaultCardTheme}
            size={FAN_SIZE}
            draggable={false}
            flippable={false}
          />
        </View>
      ))}
    </View>
  );
}

export default function HomeScreen() {
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    let active = true;
    // Never let a slow/unreachable backend block the offline "vs bots" path:
    // reveal the home UI after a short grace period. A late reconnection can
    // still navigate via router.replace.
    const fallback = setTimeout(() => {
      if (active) setResolving(false);
    }, 2500);
    void (async () => {
      try {
        const client = getRealClient();
        const signInResult = await client.signIn();
        if (!active || !signInResult.ok) {
          if (active) setResolving(false);
          return;
        }
        const sessionResult = await client.getActiveSession();
        if (!active) return;
        if (sessionResult.ok && sessionResult.data) {
          const { gameId, roomId } = sessionResult.data;
          router.replace(`/(game)/${gameId}?mode=online&roomId=${roomId}`);
          return;
        }
      } catch {
        // Supabase env not configured — skip reconnection resolver.
      }
      if (active) setResolving(false);
    })();
    return () => {
      active = false;
      clearTimeout(fallback);
    };
  }, []);

  if (resolving) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={tokens.color.accent.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <CardFan />
          <Text style={styles.wordmark}>{t('home.title')}</Text>
          <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
        </View>

        <View style={styles.actions}>
          <Button label={t('home.playOnline')} onPress={() => router.push('/(lobby)')} />
          <Button
            label={t('home.playVsBots')}
            variant="secondary"
            onPress={() => router.push('/(home)/new-game')}
          />
          {__DEV__ && (
            <Button
              label={t('dev.cardLab.openButton')}
              variant="ghost"
              onPress={() => router.push('/dev/card-lab')}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.app,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space.xxl,
    paddingHorizontal: tokens.space.xl,
  },
  hero: {
    alignItems: 'center',
    gap: tokens.space.sm,
  },
  fan: {
    height: 150,
    width: 220,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: tokens.space.lg,
  },
  fanCard: {
    position: 'absolute',
    ...tokens.shadow.card,
  },
  wordmark: {
    ...textStyle('display', 'bold'),
    color: tokens.color.text.primary,
  },
  subtitle: {
    ...textStyle('sm'),
    color: tokens.color.text.secondary,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    gap: tokens.space.md,
  },
});
