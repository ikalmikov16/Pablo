/**
 * Fades table dim in/out during opponent choreography.
 */

import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '../../../design/tokens';
import { springFor, timingFor } from '../../../feedback/motion';

type Props = {
  readonly active: boolean;
};

export function TableDimOverlay({ active }: Props) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    const target = active ? tokens.game.choreography.tableDimOpacity : 0;
    if (active) {
      opacity.value = withSpring(target, springFor('gentle'));
    } else {
      opacity.value = withTiming(target, timingFor('reveal', 'brisk'));
    }
  }, [active, opacity]);

  const style = useAnimatedStyle(() => ({
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.color.surface.overlay,
    opacity: opacity.value,
    zIndex: 20,
  }));

  return <Animated.View style={style} pointerEvents="none" />;
}
