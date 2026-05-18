import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '../src/design/tokens';
import { t } from '../src/i18n';

export default function HomeScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('dev.home.title')}</Text>
      <Text style={styles.subtitle}>{t('dev.home.subtitle')}</Text>
      {/* Dev-only entry point — not compiled out, but hidden from production builds at runtime */}
      {__DEV__ && (
        <Link href="/dev/card-lab" style={styles.devLink}>
          <Text style={styles.devLinkText}>{t('dev.cardLab.openButton')}</Text>
        </Link>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.app,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space.lg,
  },
  title: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.primary,
  },
  subtitle: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
  },
  devLink: {
    marginTop: tokens.space.xl,
    paddingHorizontal: tokens.space.xl,
    paddingVertical: tokens.space.md,
    backgroundColor: tokens.color.accent.primary,
    borderRadius: tokens.radius.md,
  },
  devLinkText: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.inverse,
  },
});
