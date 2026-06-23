import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { tokens } from '../../design/tokens';
import { textStyle } from '../../design/typography';
import { t } from '../../i18n';
import { Avatar } from '../ui/Avatar';

type Props = {
  readonly memberId: string;
  readonly name: string;
  readonly isHost: boolean;
  readonly isSelf: boolean;
  readonly onEdit?: () => void;
};

export function MemberRow({ memberId, name, isHost, isSelf, onEdit }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Avatar name={name} seedId={memberId} size={AVATAR_SIZE} />
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <View style={styles.right}>
        {isHost && <Text style={styles.host}>{t('lobby.room.hostBadge')}</Text>}
        {isSelf && onEdit && (
          <TouchableOpacity onPress={onEdit} activeOpacity={0.7} hitSlop={HIT_SLOP}>
            <Text style={styles.edit}>{t('lobby.room.editName')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const AVATAR_SIZE = 32;
const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

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
    flexShrink: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.md,
  },
  name: {
    ...textStyle('md'),
    color: tokens.color.text.primary,
    flexShrink: 1,
  },
  host: {
    ...textStyle('xs', 'semibold'),
    color: tokens.color.accent.primary,
  },
  edit: {
    ...textStyle('sm', 'semibold'),
    color: tokens.color.accent.primary,
  },
});
