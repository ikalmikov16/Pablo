/**
 * ToastHost — displays short-lived messages (match fail reasons, etc.).
 *
 * Auto-dismisses after `tokens.game.duration.toast` ms. The message key is
 * passed through t() so no raw strings appear in the UI.
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { tokens } from '../../design/tokens';
import { t } from '../../i18n';
import { useGameStore } from '../../store/provider';
import { selectToast } from '../../store/selectors';

export function ToastHost() {
  const toast = useGameStore(selectToast);
  const dismissToast = useGameStore((s) => s.dismissToast);

  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!toast) {
      opacity.value = withTiming(0, { duration: tokens.game.duration.toastFade });
      return;
    }
    opacity.value = withTiming(1, { duration: tokens.game.duration.toastFade });
    const timer = setTimeout(() => {
      dismissToast();
    }, tokens.game.duration.toast);
    return () => clearTimeout(timer);
  }, [toast, opacity, dismissToast]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

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
    zIndex: 50,
  },
  text: {
    color: tokens.color.text.inverse,
    fontSize: tokens.font.size.sm,
    textAlign: 'center',
  },
});
