import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '../../design/tokens';
import { textStyle } from '../../design/typography';
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
    alignSelf: 'center',
    alignItems: 'center',
    gap: tokens.space.sm,
    paddingVertical: tokens.space.xl,
    paddingHorizontal: tokens.space.xxl,
    backgroundColor: tokens.color.surface.card,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    ...tokens.shadow.raised,
  },
  label: {
    ...textStyle('xs', 'semibold'),
    color: tokens.color.text.secondary,
    letterSpacing: tokens.font.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  code: {
    ...textStyle('display', 'bold'),
    letterSpacing: 6,
    color: tokens.color.text.primary,
  },
});
