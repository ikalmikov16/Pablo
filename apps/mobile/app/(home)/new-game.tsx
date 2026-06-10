import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '../../src/design/tokens';
import { t } from '../../src/i18n';
import { getMockClient } from '../../src/supabase/client';
import type { ClientErrorCode } from '../../src/supabase/types';

const client = getMockClient();

const BOT_OPTIONS: Array<{ count: 1 | 2 | 3; label: string }> = [
  { count: 1, label: t('home.botCount.one') },
  { count: 2, label: t('home.botCount.two') },
  { count: 3, label: t('home.botCount.three') },
];

export default function NewGameScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);

  async function start(count: 1 | 2 | 3) {
    setLoading(true);
    setError(null);
    try {
      await client.signIn();
      const roomResult = await client.createRoom({ maxPlayers: count + 1 });
      if (!roomResult.ok) {
        setError(roomResult.error);
        return;
      }
      const botsResult = await client.addBotsToRoom({ roomId: roomResult.data.id, count });
      if (!botsResult.ok) {
        setError(botsResult.error);
        return;
      }
      const gameResult = await client.startGame({ roomId: roomResult.data.id });
      if (!gameResult.ok) {
        setError(gameResult.error);
        return;
      }
      router.replace(`/(game)/${gameResult.data}?mode=offline`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>{t('home.botCount.title')}</Text>

      {error && <Text style={styles.error}>{t(`error.${error}`)}</Text>}

      {loading ? (
        <ActivityIndicator color={tokens.color.accent.primary} size="large" />
      ) : (
        <View style={styles.options}>
          {BOT_OPTIONS.map(({ count, label }) => (
            <TouchableOpacity
              key={count}
              style={styles.optionBtn}
              onPress={() => void start(count)}
              activeOpacity={0.8}
            >
              <Text style={styles.optionText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.app,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space.xl,
    paddingHorizontal: tokens.space.xl,
  },
  title: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.primary,
    textAlign: 'center',
  },
  options: {
    width: '100%',
    gap: tokens.space.md,
  },
  optionBtn: {
    backgroundColor: tokens.color.accent.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.lg,
    alignItems: 'center',
  },
  optionText: {
    color: tokens.color.text.inverse,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semibold,
  },
  error: {
    color: tokens.game.accent.pabloOnTurn,
    fontSize: tokens.font.size.sm,
    textAlign: 'center',
  },
});
