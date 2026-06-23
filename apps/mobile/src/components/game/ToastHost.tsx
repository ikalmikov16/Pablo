/**
 * ToastHost — displays short-lived messages (match fail reasons, etc.).
 *
 * Auto-dismisses after `tokens.game.duration.toast` ms. The message key is
 * passed through t() so no raw strings appear in the UI.
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '../../design/tokens';
import { textStyle } from '../../design/typography';
import { springFor, timingFor, TOAST_SLIDE_Y } from '../../feedback/motion';
import { t } from '../../i18n';
import { useGameStore } from '../../store/provider';
import { selectToast } from '../../store/selectors';

export function ToastHost() {
  const toast = useGameStore(selectToast);
  const dismissToast = useGameStore((s) => s.dismissToast);

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(TOAST_SLIDE_Y);

  useEffect(() => {
    if (!toast) {
      opacity.value = withTiming(0, timingFor('reveal', 'quick'));
      translateY.value = withTiming(TOAST_SLIDE_Y, timingFor('reveal', 'quick'));
      return;
    }
    opacity.value = withSpring(1, springFor('banner'));
    translateY.value = withSpring(0, springFor('banner'));
    const timer = setTimeout(() => {
      dismissToast();
    }, tokens.game.duration.toast);
    return () => clearTimeout(timer);
  }, [toast, opacity, translateY, dismissToast]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!toast) return null;

  return (
    <Animated.View style={[styles.toast, animStyle]} pointerEvents="none">
      <Text style={styles.text}>{t(toast.message)}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: tokens.game.size.toastBottom,
    alignSelf: 'center',
    backgroundColor: tokens.game.surface.toastBg,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.sm,
    maxWidth: tokens.game.size.toastMaxWidth,
    ...tokens.shadow.floating,
    zIndex: 50,
  },
  text: {
    color: tokens.color.text.inverse,
    ...textStyle('sm'),
    textAlign: 'center',
  },
});
