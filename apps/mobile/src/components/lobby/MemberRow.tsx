import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '../../design/tokens';
import { t } from '../../i18n';

type Props = {
  readonly memberId: string;
  readonly isHost: boolean;
  readonly isSelf: boolean;
};

function shortId(id: string): string {
  return id.slice(0, 8);
}

export function MemberRow({ memberId, isHost, isSelf }: Props) {
  const name = isSelf ? t('game.you') : shortId(memberId);
  return (
    <View style={styles.row}>
      <Text style={styles.name}>{name}</Text>
      {isHost && <Text style={styles.host}>{t('lobby.room.hostBadge')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border.subtle,
  },
  name: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text.primary,
  },
  host: {
    fontSize: tokens.font.size.xs,
    color: tokens.color.accent.primary,
    fontWeight: tokens.font.weight.semibold,
  },
});
