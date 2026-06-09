/**
 * Central motion vocabulary — curves, springs, and timing helpers.
 *
 * Components import from here instead of configuring Reanimated directly.
 */

import { Easing, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';

import { tokens } from '../design/tokens';

export type { MotionIntent } from './motionIntent';
export { flightMotionIntent } from './motionIntent';

import type { MotionIntent } from './motionIntent';
export type MotionDurationKey = keyof typeof tokens.game.motion.duration;
export type MotionSpringKey = keyof typeof tokens.game.motion.spring;

const { curve, duration, spring } = tokens.game.motion;

function bezier(points: readonly [number, number, number, number]) {
  return Easing.bezier(points[0], points[1], points[2], points[3]);
}

export const easings = {
  snap: bezier(curve.snap),
  carry: bezier(curve.carry),
  reveal: bezier(curve.reveal),
  drift: bezier(curve.drift),
} as const;

export function easingFor(intent: MotionIntent) {
  return easings[intent];
}

export function timingFor(
  intent: MotionIntent,
  durationKey: MotionDurationKey,
  overrides?: Partial<WithTimingConfig>,
): WithTimingConfig {
  return {
    duration: duration[durationKey],
    easing: easingFor(intent),
    ...overrides,
  };
}

export function springFor(
  preset: MotionSpringKey,
  overrides?: Partial<WithSpringConfig>,
): WithSpringConfig {
  const base = spring[preset];
  return {
    damping: overrides?.damping ?? base.damping,
    stiffness: overrides?.stiffness ?? base.stiffness,
    mass: overrides?.mass ?? base.mass,
  };
}

/** Card tap / prop-driven flip in PlayingCard. */
export const CARD_FLIP_TIMING = timingFor('reveal', 'brisk');

/** Pablo banner off-screen offset (px). */
export const BANNER_OFFSCREEN_Y = -80;

/** Toast entrance slide (px). */
export const TOAST_SLIDE_Y = 12;

/** Draw-flow sheet off-screen offset (fraction of screen handled in component). */
export const DRAW_FLOW_SHEET_OFFSCREEN = 400;

/** End-of-round row stagger step (ms). */
export const END_ROUND_ROW_STAGGER_MS = tokens.game.motion.stagger;

/** Hidden inbound card scale-emerge duration (ms). */
export const HIDDEN_EMERGE_MS = tokens.game.motion.duration.quick;
