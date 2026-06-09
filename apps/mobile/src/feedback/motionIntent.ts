/**
 * Pure motion-intent helpers (no Reanimated import — safe in Bun unit tests).
 */

import { tokens } from '../design/tokens';

export type MotionIntent = 'snap' | 'carry' | 'reveal' | 'drift';

/** Pick motion curve for a choreographed card flight. */
export function flightMotionIntent(flight: {
  readonly emphasis: 'normal' | 'discardReadable' | 'hiddenSwap';
  readonly durationMs: number;
  readonly toAnchor?: { readonly kind: string };
}): MotionIntent {
  if (flight.emphasis === 'hiddenSwap') return 'drift';
  if (flight.emphasis === 'discardReadable') return 'reveal';
  if (flight.toAnchor?.kind === 'drawn') return 'carry';
  if (flight.durationMs <= tokens.game.motion.duration.normal) return 'snap';
  return 'carry';
}
