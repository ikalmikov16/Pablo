import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '../../design/tokens';
import { t } from '../../i18n';

type Props = {
  readonly code: string;
};

export function RoomCodeBadge({ code }: Props) {
  return (
    <View style={styles.badge}>
      <Text style={styles.label}>{t('lobby.room.codeLabel')}</Text>
      <Text style={styles.code}>{code}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    gap: tokens.space.xs,
    paddingVertical: tokens.space.lg,
  },
  label: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
  },
  code: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.semibold,
    letterSpacing: 4,
    color: tokens.color.text.primary,
  },
});
