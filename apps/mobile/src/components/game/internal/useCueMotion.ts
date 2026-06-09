/**
 * Animated on/off for choreography cues (spotlight ring, actor focus).
 */

import { useEffect } from 'react';
import { withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import { springFor, timingFor } from '../../../feedback/motion';

export function useSpotlightRing(active: boolean, ringOpacity: SharedValue<number>): void {
  useEffect(() => {
    if (active) {
      ringOpacity.value = withSpring(1, springFor('pulse'));
    } else {
      ringOpacity.value = withTiming(0, timingFor('reveal', 'brisk'));
    }
  }, [active, ringOpacity]);
}

export function useActorFocusIntensity(active: boolean, intensity: SharedValue<number>): void {
  useEffect(() => {
    if (active) {
      intensity.value = withSpring(1, springFor('gentle'));
    } else {
      intensity.value = withTiming(0, timingFor('reveal', 'brisk'));
    }
  }, [active, intensity]);
}
