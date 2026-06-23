/**
 * Button — the single themed button primitive for chrome screens (home,
 * lobby, new-game). Spring scale-on-press (worklet), light haptic tap, and
 * primary / secondary / ghost variants. All colors/space/radii from tokens.
 *
 * In-game chrome (ActionBar, flow sheets) keeps its own styling — this is for
 * the non-game screens.
 */

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { tokens } from '../../design/tokens';
import { textStyle } from '../../design/typography';
import { springFor } from '../../feedback/motion';
import { hapticTap } from '../../feedback/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export type ButtonProps = {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly fullWidth?: boolean;
  readonly style?: StyleProp<ViewStyle>;
};

const PRESS_SCALE = 0.96;

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = true,
  style,
}: ButtonProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const blocked = disabled || loading;

  function handlePress() {
    if (blocked) return;
    hapticTap();
    onPress();
  }

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(PRESS_SCALE, springFor('pulse'));
      }}
      onPressOut={() => {
        scale.value = withSpring(1, springFor('pulse'));
      }}
      style={[
        styles.base,
        VARIANT_CONTAINER[variant],
        variant === 'primary' && tokens.shadow.raised,
        fullWidth && styles.fullWidth,
        blocked && styles.disabled,
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={LOADER_COLOR[variant]} />
      ) : (
        <Text style={[styles.label, VARIANT_LABEL[variant]]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    ...textStyle('md', 'semibold'),
    textAlign: 'center',
  },
});

const VARIANT_CONTAINER: Record<ButtonVariant, ViewStyle> = {
  primary: {
    backgroundColor: tokens.color.accent.primary,
  },
  secondary: {
    backgroundColor: tokens.color.surface.card,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
};

const VARIANT_LABEL: Record<ButtonVariant, { color: string }> = {
  primary: { color: tokens.color.text.inverse },
  secondary: { color: tokens.color.text.primary },
  ghost: { color: tokens.color.text.secondary },
};

const LOADER_COLOR: Record<ButtonVariant, string> = {
  primary: tokens.color.text.inverse,
  secondary: tokens.color.accent.primary,
  ghost: tokens.color.text.secondary,
};
