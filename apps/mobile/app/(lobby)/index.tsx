import { Link } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '../../src/design/tokens';
import { t } from '../../src/i18n';

export default function LobbyHomeScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('lobby.title')}</Text>
        <Text style={styles.subtitle}>{t('lobby.subtitle')}</Text>

        <Link href="/(lobby)/create" asChild>
          <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.8}>
            <Text style={styles.primaryBtnText}>{t('lobby.hub.create')}</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/(lobby)/join" asChild>
          <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.8}>
            <Text style={styles.secondaryBtnText}>{t('lobby.hub.join')}</Text>
          </TouchableOpacity>
        </Link>
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
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.primary,
  },
  subtitle: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
    textAlign: 'center',
    marginBottom: tokens.space.lg,
  },
  primaryBtn: {
    width: '100%',
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
  secondaryBtn: {
    width: '100%',
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: tokens.color.text.primary,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semibold,
  },
});
