/**
 * Deterministic avatar palette pick — pure data, no React.
 */

import { tokens } from '../../../design/tokens';

/** FNV-1a 32-bit — same algorithm as pileDecor for consistency. */
function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Stable palette pick from a player / member id. */
export function avatarColor(seedId: string): string {
  const palette = tokens.game.avatar.palette;
  return palette[fnv1a(seedId) % palette.length]!;
}
