import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '../../design/tokens';
import { t } from '../../i18n';

type Props = {
  readonly memberId: string;
  readonly isHost: boolean;
  readonly isSelf: boolean;
};

export function MemberRow({ memberId, isHost, isSelf }: Props) {
  const name = isSelf ? t('game.you') : t('game.playerShort', { id: memberId.slice(0, 8) });
  const initial = name.charAt(0).toUpperCase();
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={[styles.avatar, isSelf && styles.avatarSelf]}>
          <Text style={[styles.avatarText, isSelf && styles.avatarTextSelf]}>{initial}</Text>
        </View>
        <Text style={styles.name}>{name}</Text>
      </View>
      {isHost && <Text style={styles.host}>{t('lobby.room.hostBadge')}</Text>}
    </View>
  );
}

const AVATAR_SIZE = 32;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border.subtle,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.sm,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.game.surface.slotSelected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSelf: {
    backgroundColor: tokens.color.accent.primary,
  },
  avatarText: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.accent.primary,
  },
  avatarTextSelf: {
    color: tokens.color.text.inverse,
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
