/**
 * Proportional card dimensions — one source of truth for PlayingCard and slot rings.
 */

import { tokens } from '../../../design/tokens';

const RADIUS_FRACTION = tokens.game.choreography.ringRadiusFraction;

export function radiusFor(width: number): number {
  return Math.max(4, Math.min(22, Math.round(width * RADIUS_FRACTION)));
}

export function sizesFor(width: number) {
  return {
    rank: Math.round(width * 0.18),
    suitSmall: Math.round(width * 0.12),
    centerSuit: Math.round(width * 0.45),
    cornerInsetX: Math.max(4, Math.round(width * 0.07)),
    cornerInsetY: Math.max(4, Math.round(width * 0.06)),
    borderStroke: Math.max(1, Math.round(width * 0.012)),
    backInset: Math.max(4, Math.round(width * RADIUS_FRACTION)),
    radius: radiusFor(width),
  };
}

/** Snapshot of derived sizes for tests. */
export function sizesSnapshot(width: number) {
  const s = sizesFor(width);
  return {
    width,
    radius: s.radius,
    rank: s.rank,
    suitSmall: s.suitSmall,
    centerSuit: s.centerSuit,
    borderStroke: s.borderStroke,
    backInset: s.backInset,
  };
}
