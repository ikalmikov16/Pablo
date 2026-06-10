import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '../../src/design/tokens';
import { t } from '../../src/i18n';
import { usePabloClient } from '../../src/supabase/ClientProvider';
import type { ClientErrorCode } from '../../src/supabase/types';

export default function JoinRoomScreen() {
  const client = usePabloClient();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);

  async function handleJoin() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      await client.signIn();
      const result = await client.joinRoom({ code: trimmed });
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
      <Text style={styles.title}>{t('lobby.join.title')}</Text>
      <Text style={styles.subtitle}>{t('lobby.join.subtitle')}</Text>

      <TextInput
        style={styles.input}
        value={code}
        onChangeText={(v) => setCode(v.toUpperCase())}
        placeholder={t('lobby.join.placeholder')}
        placeholderTextColor={tokens.color.text.secondary}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
      />

      {error && <Text style={styles.error}>{t(`error.${error}`)}</Text>}

      {loading ? (
        <ActivityIndicator color={tokens.color.accent.primary} size="large" />
      ) : (
        <TouchableOpacity
          style={[styles.primaryBtn, !code.trim() && styles.primaryBtnDisabled]}
          onPress={() => void handleJoin()}
          disabled={!code.trim()}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>{t('lobby.join.confirm')}</Text>
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
  input: {
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
    fontSize: tokens.font.size.xl,
    letterSpacing: 4,
    textAlign: 'center',
    color: tokens.color.text.primary,
    marginTop: tokens.space.lg,
  },
  primaryBtn: {
    marginTop: tokens.space.xl,
    backgroundColor: tokens.color.accent.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    alignItems: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.5,
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
