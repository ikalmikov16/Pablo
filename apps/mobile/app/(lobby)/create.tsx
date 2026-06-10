import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '../../src/design/tokens';
import { t } from '../../src/i18n';
import { usePabloClient } from '../../src/supabase/ClientProvider';
import type { ClientErrorCode } from '../../src/supabase/types';

const PLAYER_OPTIONS = [2, 3, 4] as const;

export default function CreateRoomScreen() {
  const client = usePabloClient();
  const [maxPlayers, setMaxPlayers] = useState<(typeof PLAYER_OPTIONS)[number]>(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      await client.signIn();
      const result = await client.createRoom({ maxPlayers });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(`/(lobby)/room/${result.data.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>{t('lobby.create.title')}</Text>
      <Text style={styles.subtitle}>{t('lobby.create.subtitle')}</Text>

      {error && <Text style={styles.error}>{t(`error.${error}`)}</Text>}

      <View style={styles.options}>
        {PLAYER_OPTIONS.map((count) => (
          <TouchableOpacity
            key={count}
            style={[styles.optionBtn, maxPlayers === count && styles.optionBtnActive]}
            onPress={() => setMaxPlayers(count)}
            activeOpacity={0.8}
          >
            <Text style={[styles.optionText, maxPlayers === count && styles.optionTextActive]}>
              {t('lobby.create.maxPlayers', { count })}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={tokens.color.accent.primary} size="large" />
      ) : (
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => void handleCreate()}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>{t('lobby.create.confirm')}</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.app,
    paddingHorizontal: tokens.space.xl,
    paddingTop: tokens.space.xxl,
    gap: tokens.space.md,
  },
  title: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
    textAlign: 'center',
  },
  options: {
    gap: tokens.space.sm,
    marginTop: tokens.space.lg,
  },
  optionBtn: {
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    alignItems: 'center',
  },
  optionBtnActive: {
    borderColor: tokens.color.accent.primary,
    backgroundColor: tokens.game.surface.winnerRowTint,
  },
  optionText: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text.primary,
  },
  optionTextActive: {
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.accent.primary,
  },
  primaryBtn: {
    marginTop: tokens.space.xl,
    backgroundColor: tokens.color.accent.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: tokens.color.text.inverse,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semibold,
  },
  error: {
    color: tokens.game.accent.pabloOnTurn,
    textAlign: 'center',
    fontSize: tokens.font.size.sm,
  },
});
