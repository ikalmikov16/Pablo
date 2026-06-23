/**
 * Typography helper — the single way components produce text styles.
 *
 * Custom font families register one name per weight; RN does not synthesize
 * fontWeight reliably, so callers pick the weight via the family key.
 */
import { tokens } from './tokens';

type SizeKey = keyof typeof tokens.font.size;
type WeightKey = keyof typeof tokens.font.family;

export function textStyle(size: SizeKey, weight: WeightKey = 'regular') {
  return {
    fontFamily: tokens.font.family[weight],
    fontSize: tokens.font.size[size],
    letterSpacing:
      size === 'display' || size === 'xl' || size === 'lg'
        ? tokens.font.letterSpacing.tight
        : tokens.font.letterSpacing.normal,
  } as const;
}
