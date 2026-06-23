/**
 * Initial-in-circle avatar — shared by opponent seats (Package 3) and lobby
 * rows (Package 4).
 */

import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '../../design/tokens';
import { textStyle } from '../../design/typography';
import { avatarColor } from './internal/avatarColor';

const DEFAULT_SIZE = 24;

export { avatarColor } from './internal/avatarColor';

export type AvatarProps = {
  readonly name: string;
  readonly seedId: string;
  readonly size?: number;
};

export function Avatar({ name, seedId, size = DEFAULT_SIZE }: AvatarProps) {
  const initial = name.charAt(0).toUpperCase();
  const bg = avatarColor(seedId);
  const fontSize = Math.max(10, Math.round(size * 0.45));

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      ]}
    >
      <Text style={[styles.initial, { fontSize }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    ...textStyle('sm', 'semibold'),
    color: tokens.color.text.inverse,
  },
});
