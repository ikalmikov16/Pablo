/**
 * PabloBanner — shown when pabloCalledBy is set.
 * Slides in from the top; stays until round ends.
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { tokens } from '../../design/tokens';
import { t } from '../../i18n';
import { useGameStore } from '../../store/provider';
import { selectCurrentPlayerId, selectPabloCalledBy, selectSelf } from '../../store/selectors';

type Props = {
  readonly displayName: (id: string) => string;
};

export function PabloBanner({ displayName }: Props) {
  const pabloCalledBy = useGameStore(selectPabloCalledBy);
  const self = useGameStore(selectSelf);
  const currentPlayer = useGameStore(selectCurrentPlayerId);

  const translateY = useSharedValue(-80);

  useEffect(() => {
    translateY.value = withTiming(pabloCalledBy ? 0 : -80, { duration: 350 });
  }, [pabloCalledBy, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!pabloCalledBy) return null;

  const isOnTurn = pabloCalledBy === currentPlayer;
  const callerName = pabloCalledBy === self ? t('game.you') : displayName(pabloCalledBy);
  const subline = isOnTurn
    ? t('game.pablo.sublineOnTurn')
    : t('game.pablo.sublineOffTurn', { name: callerName });

  return (
    <Animated.View style={[styles.banner, animStyle]}>
      <Text style={styles.title}>{t('game.pablo.banner', { name: callerName })}</Text>
      <Text style={styles.sub}>{subline}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: tokens.game.accent.pabloOnTurn,
    paddingVertical: tokens.space.sm,
    paddingHorizontal: tokens.space.lg,
    alignItems: 'center',
    zIndex: 20,
  },
  title: {
    color: tokens.color.text.inverse,
    fontWeight: tokens.font.weight.semibold,
    fontSize: tokens.font.size.md,
  },
  sub: {
    color: tokens.game.accent.pabloSubText,
    fontSize: tokens.font.size.xs,
    marginTop: 2,
  },
});
