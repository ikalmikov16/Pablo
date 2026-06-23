/**
 * AnnouncementBanner — persistent "last action" line under the top bar.
 *
 * Unlike toasts it never auto-dismisses: it always shows the most recent
 * table action ("Cambia discarded 7 of hearts", "Pablito mismatched — penalty
 * card!") so players who looked away can catch up at a glance. Each new
 * announcement slides in to draw the eye.
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
import { springFor, timingFor } from '../../feedback/motion';
import { useGameStore } from '../../store/provider';
import { selectAnnouncement } from '../../store/selectors';

const ENTER_SLIDE_Y = -8;

export function AnnouncementBanner() {
  const announcement = useGameStore(selectAnnouncement);

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(ENTER_SLIDE_Y);

  useEffect(() => {
    if (!announcement) return;
    opacity.value = 0;
    translateY.value = ENTER_SLIDE_Y;
    opacity.value = withTiming(1, timingFor('reveal', 'brisk'));
    translateY.value = withSpring(0, springFor('banner'));
  }, [announcement, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!announcement) return null;

  return (
    <Animated.View style={[styles.strip, animStyle]} pointerEvents="none">
      <Text style={styles.text} numberOfLines={1}>
        {announcement.message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  strip: {
    alignSelf: 'center',
    backgroundColor: tokens.game.surface.announcementBg,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.xs,
    marginTop: tokens.space.xs,
    maxWidth: '92%',
    ...tokens.shadow.raised,
  },
  text: {
    ...textStyle('xs', 'semibold'),
    color: tokens.color.text.primary,
    textAlign: 'center',
  },
});
