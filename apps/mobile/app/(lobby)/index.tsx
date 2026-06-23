import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../src/components/ui/Button';
import { tokens } from '../../src/design/tokens';
import { textStyle } from '../../src/design/typography';
import { t } from '../../src/i18n';

export default function LobbyHomeScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('lobby.title')}</Text>
        <Text style={styles.subtitle}>{t('lobby.subtitle')}</Text>

        <View style={styles.actions}>
          <Button label={t('lobby.hub.create')} onPress={() => router.push('/(lobby)/create')} />
          <Button
            label={t('lobby.hub.join')}
            variant="secondary"
            onPress={() => router.push('/(lobby)/join')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.app,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space.md,
    paddingHorizontal: tokens.space.xl,
  },
  title: {
    ...textStyle('xl', 'semibold'),
    color: tokens.color.text.primary,
  },
  subtitle: {
    ...textStyle('sm'),
    color: tokens.color.text.secondary,
    textAlign: 'center',
    marginBottom: tokens.space.lg,
  },
  actions: {
    width: '100%',
    gap: tokens.space.md,
  },
});
