import { describe, expect, test } from 'bun:test';

import { tokens } from './tokens';
import { textStyle } from './typography';

describe('textStyle', () => {
  test('maps each weight key to the matching font family', () => {
    expect(textStyle('md', 'regular').fontFamily).toBe(tokens.font.family.regular);
    expect(textStyle('md', 'semibold').fontFamily).toBe(tokens.font.family.semibold);
    expect(textStyle('md', 'bold').fontFamily).toBe(tokens.font.family.bold);
  });

  test('defaults to regular weight', () => {
    expect(textStyle('sm').fontFamily).toBe(tokens.font.family.regular);
  });

  test('uses tight letter-spacing for the display sizes (lg, xl, display)', () => {
    expect(textStyle('display').letterSpacing).toBe(tokens.font.letterSpacing.tight);
    expect(textStyle('xl').letterSpacing).toBe(tokens.font.letterSpacing.tight);
    expect(textStyle('lg').letterSpacing).toBe(tokens.font.letterSpacing.tight);
    expect(textStyle('md').letterSpacing).toBe(tokens.font.letterSpacing.normal);
    expect(textStyle('sm').letterSpacing).toBe(tokens.font.letterSpacing.normal);
    expect(textStyle('xs').letterSpacing).toBe(tokens.font.letterSpacing.normal);
  });

  test('font sizes are monotonic across size keys', () => {
    const sizes = (['xs', 'sm', 'md', 'lg', 'xl', 'display'] as const).map(
      (k) => textStyle(k).fontSize,
    );
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!).toBeGreaterThan(sizes[i - 1]!);
    }
  });
});
