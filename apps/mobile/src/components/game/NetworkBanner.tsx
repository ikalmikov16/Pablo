import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '../../design/tokens';
import { textStyle } from '../../design/typography';
import { t } from '../../i18n';
import { useGameStore } from '../../store/provider';
import { selectNetworkError } from '../../store/selectors';

export function NetworkBanner() {
  const visible = useGameStore(selectNetworkError);
  if (!visible) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{t('game.network.reconnecting')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: tokens.game.surface.networkBg,
    paddingVertical: tokens.space.xs,
    paddingHorizontal: tokens.space.md,
    alignItems: 'center',
  },
  text: {
    color: tokens.color.text.inverse,
    ...textStyle('sm', 'semibold'),
  },
});
