/**
 * Card design space — the card face is authored ONCE in fixed design units and
 * the whole Skia scene is scaled by `width / DESIGN_WIDTH`, so every rendered
 * size is mathematically the same drawing (no per-element rounding drift).
 *
 * There is exactly one face layout at every size: a jumbo corner index (rank
 * with the suit beneath it) plus one large center suit. Pablo cards live at
 * 44–120 px on the table, so the design is optimised for glanceable rank
 * reading, not for classic pip anatomy.
 */

import { tokens } from '../../../design/tokens';

const RADIUS_FRACTION = tokens.game.choreography.ringRadiusFraction;
export const CARD_ASPECT = 1.46;

/** All design constants below are in units of this width. */
export const DESIGN_WIDTH = 240;

/** On-screen corner radius — shared with slot rings (OwnHandGrid / OpponentSeat). */
export function radiusFor(width: number): number {
  return Math.max(4, Math.min(22, Math.round(width * RADIUS_FRACTION)));
}

/** Uniform scale from on-screen width to design units. */
export function cardScale(width: number): number {
  return width / DESIGN_WIDTH;
}

/**
 * Card anatomy in design units (240-wide card). Heights are used against the
 * derived design height `H / cardScale(W)` (≈350 at the standard 1.46 aspect).
 */
export const design = {
  borderStroke: 3,
  backInset: 18,
  zelligeTile: 54,
  /** Corner index font size — jumbo so the rank survives 48 px table cards. */
  rank: 80,
  /** Fixed centering column for the rank text + corner suit. */
  cornerColW: 100,
  cornerInsetX: 10,
  cornerInsetY: 4,
  cornerSuit: 40,
  /** Vertical center of the corner suit below the rank text. */
  cornerSuitCy: 4 + 80 * 1.18 + 20,
  centerSuit: 112,
  /** Center suit sits below the optical middle, clear of the jumbo index. */
  centerSuitYFrac: 0.62,
} as const;
