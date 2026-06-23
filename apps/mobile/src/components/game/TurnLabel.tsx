/**
 * TurnLabel — animated turn indicator pill in the top bar.
 *
 * "Your turn" gets the accent treatment plus a soft breathing pulse so the
 * player can't miss it; opponent turns render as a quiet neutral pill. Each
 * label change slides the new text in so turn handoffs read as motion.
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '../../design/tokens';
import { textStyle } from '../../design/typography';
import { springFor, timingFor } from '../../feedback/motion';

const ENTER_SLIDE_Y = 6;
const PULSE_SCALE = 1.04;

type Props = {
  readonly label: string;
  readonly isMyTurn: boolean;
};

export function TurnLabel({ label, isMyTurn }: Props) {
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    opacity.value = 0;
    translateY.value = ENTER_SLIDE_Y;
    opacity.value = withTiming(1, timingFor('reveal', 'brisk'));
    translateY.value = withSpring(0, springFor('banner'));
  }, [label, opacity, translateY]);

  useEffect(() => {
    if (isMyTurn) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(PULSE_SCALE, timingFor('drift', 'deliberate')),
          withTiming(1, timingFor('drift', 'deliberate')),
        ),
        -1,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, timingFor('drift', 'quick'));
    }
    return () => cancelAnimation(pulse);
  }, [isMyTurn, pulse]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: pulse.value }],
  }));

  return (
    <View style={styles.row}>
      <Animated.View
        style={[
          styles.pill,
          isMyTurn ? styles.pillActive : styles.pillIdle,
          isMyTurn && styles.pillActiveShadow,
          animStyle,
        ]}
      >
        <Text
          style={[styles.text, isMyTurn ? styles.textActive : styles.textIdle]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.xs,
    maxWidth: '90%',
  },
  pillActive: {
    backgroundColor: tokens.color.accent.primary,
  },
  pillActiveShadow: {
    ...tokens.shadow.raised,
  },
  pillIdle: {
    // slotEmpty is a felt-side tint (light-on-teal) and vanishes on the white
    // top bar; the sand border tone doubles as a quiet chrome-side pill bg.
    backgroundColor: tokens.color.border.subtle,
  },
  text: {
    ...textStyle('sm', 'semibold'),
  },
  textActive: {
    color: tokens.color.text.inverse,
  },
  textIdle: {
    color: tokens.color.text.primary,
  },
});
