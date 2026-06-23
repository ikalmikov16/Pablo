import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../src/components/ui/Button';
import { tokens } from '../../src/design/tokens';
import { textStyle } from '../../src/design/typography';
import { t } from '../../src/i18n';
import { loadCachedName, saveCachedName } from '../../src/store/nameCache';
import { usePabloClient } from '../../src/supabase/ClientProvider';
import type { ClientErrorCode } from '../../src/supabase/types';

const NAME_MAX_LENGTH = 20;

export default function CreateRoomScreen() {
  const client = usePabloClient();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);

  useEffect(() => {
    let active = true;
    void loadCachedName().then((cached) => {
      if (active && cached) setName(cached);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const auth = await client.signIn();
      if (!auth.ok) {
        setError(auth.error);
        return;
      }
      const trimmed = name.trim();
      if (trimmed) {
        await client.setDisplayName(trimmed);
        await saveCachedName(trimmed);
      }
      const result = await client.createRoom({});
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

      <Text style={styles.label}>{t('lobby.name.label')}</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={t('lobby.name.placeholder')}
        placeholderTextColor={tokens.color.text.secondary}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={NAME_MAX_LENGTH}
        returnKeyType="done"
      />

      {error && <Text style={styles.error}>{t(`error.${error}`)}</Text>}

      <Button
        label={t('lobby.create.confirm')}
        onPress={() => void handleCreate()}
        loading={loading}
        style={styles.confirm}
      />
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
    ...textStyle('lg', 'semibold'),
    color: tokens.color.text.primary,
    textAlign: 'center',
  },
  subtitle: {
    ...textStyle('sm'),
    color: tokens.color.text.secondary,
    textAlign: 'center',
  },
  label: {
    ...textStyle('sm', 'semibold'),
    color: tokens.color.text.secondary,
    marginTop: tokens.space.lg,
  },
  input: {
    ...textStyle('md'),
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
    color: tokens.color.text.primary,
  },
  confirm: {
    marginTop: tokens.space.xl,
  },
  error: {
    ...textStyle('sm'),
    color: tokens.game.accent.pabloOnTurn,
    textAlign: 'center',
  },
});
