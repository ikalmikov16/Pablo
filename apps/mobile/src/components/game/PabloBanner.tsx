/**
 * PabloBanner — shown when pabloCalledBy is set.
 * Slides in from the top; stays until round ends.
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BANNER_OFFSCREEN_Y, springFor } from '../../feedback/motion';
import { tokens } from '../../design/tokens';
import { textStyle } from '../../design/typography';
import { t } from '../../i18n';
import { resolveDisplayName } from '../../store/displayName';
import { useGameStore } from '../../store/provider';
import { selectCurrentPlayerId, selectPabloCalledBy, selectView } from '../../store/selectors';

export function PabloBanner() {
  const view = useGameStore(selectView);
  const pabloCalledBy = useGameStore(selectPabloCalledBy);
  const currentPlayer = useGameStore(selectCurrentPlayerId);
  const insets = useSafeAreaInsets();

  // The banner now fills the top inset, so it must travel further to hide.
  const hiddenY = BANNER_OFFSCREEN_Y - insets.top;
  const translateY = useSharedValue(hiddenY);

  useEffect(() => {
    translateY.value = withSpring(pabloCalledBy ? 0 : hiddenY, springFor('banner'));
  }, [pabloCalledBy, hiddenY, translateY]);

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
    <Animated.View style={[styles.banner, { paddingTop: insets.top + tokens.space.sm }, animStyle]}>
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
    ...textStyle('md', 'semibold'),
  },
  sub: {
    color: tokens.game.accent.pabloSubText,
    ...textStyle('xs'),
  },
});
