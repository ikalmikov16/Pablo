import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '../../design/tokens';
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
    backgroundColor: tokens.game.accent.pabloOnTurn,
    paddingVertical: tokens.space.xs,
    paddingHorizontal: tokens.space.md,
    alignItems: 'center',
  },
  text: {
    color: tokens.color.text.inverse,
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.semibold,
  },
});
