import { Link } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '../../src/design/tokens';
import { t } from '../../src/i18n';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('home.title')}</Text>
        <Text style={styles.subtitle}>{t('home.subtitle')}</Text>

        <Link href="/(home)/new-game" asChild>
          <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.8}>
            <Text style={styles.primaryBtnText}>{t('home.playVsBots')}</Text>
          </TouchableOpacity>
        </Link>

        {__DEV__ && (
          <Link href="/dev/card-lab" asChild>
            <TouchableOpacity style={styles.devBtn} activeOpacity={0.7}>
              <Text style={styles.devBtnText}>{t('dev.cardLab.openButton')}</Text>
            </TouchableOpacity>
          </Link>
        )}
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
    gap: tokens.space.lg,
    paddingHorizontal: tokens.space.xl,
  },
  title: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.primary,
  },
  subtitle: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
    textAlign: 'center',
  },
  primaryBtn: {
    backgroundColor: tokens.color.accent.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.xxl,
    marginTop: tokens.space.lg,
  },
  primaryBtnText: {
    color: tokens.color.text.inverse,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semibold,
  },
  devBtn: {
    marginTop: tokens.space.xl,
    paddingHorizontal: tokens.space.xl,
    paddingVertical: tokens.space.sm,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    borderRadius: tokens.radius.md,
  },
  devBtnText: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
  },
});
