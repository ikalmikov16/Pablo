/**
 * PabloBanner — shown when pabloCalledBy is set.
 * Slides in from the top; stays until round ends.
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { BANNER_OFFSCREEN_Y, springFor } from '../../feedback/motion';
import { tokens } from '../../design/tokens';
import { t } from '../../i18n';
import { resolveDisplayName } from '../../store/displayName';
import { useGameStore } from '../../store/provider';
import { selectCurrentPlayerId, selectPabloCalledBy, selectView } from '../../store/selectors';

export function PabloBanner() {
  const view = useGameStore(selectView);
  const pabloCalledBy = useGameStore(selectPabloCalledBy);
  const currentPlayer = useGameStore(selectCurrentPlayerId);

  const translateY = useSharedValue(BANNER_OFFSCREEN_Y);

  useEffect(() => {
    translateY.value = withSpring(pabloCalledBy ? 0 : BANNER_OFFSCREEN_Y, springFor('banner'));
  }, [pabloCalledBy, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!pabloCalledBy || !view) return null;

  const isOnTurn = pabloCalledBy === currentPlayer;
  const callerName = resolveDisplayName(view, pabloCalledBy);
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
