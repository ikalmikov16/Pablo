/**
 * Unit tests for the pure card helper functions.
 * No React, no Skia, no Reanimated — only plain data transforms.
 */
import { describe, expect, it } from 'bun:test';
import {
  classicLightCardTheme,
  defaultCardTheme,
  midnightCardTheme,
  zelligeCardTheme,
} from '../../design/cardTheme';
import { isRedSuit, rankLabel, suitColor, suitGlyph } from './internal/cardHelpers';
import { DESIGN_WIDTH, cardScale, design, radiusFor } from './internal/cardSizes';

describe('card design space', () => {
  it('radiusFor clamps and scales at 44 / 88 / 220 px', () => {
    expect(radiusFor(44)).toBe(4);
    expect(radiusFor(88)).toBe(7);
    expect(radiusFor(220)).toBe(17);
  });

  it('cardScale is the identity at DESIGN_WIDTH and linear elsewhere', () => {
    expect(cardScale(DESIGN_WIDTH)).toBe(1);
    expect(cardScale(120)).toBe(0.5);
    expect(cardScale(48)).toBeCloseTo(0.2);
  });

  it('corner column centers in the left half of the card', () => {
    const center = design.cornerInsetX + design.cornerColW / 2;
    expect(center).toBeLessThan(DESIGN_WIDTH / 2);
  });

  it('corner suit sits below the rank text block', () => {
    expect(design.cornerSuitCy).toBeGreaterThan(design.cornerInsetY + design.rank);
  });

  it('center suit fits inside the card width with margins', () => {
    expect(design.centerSuit).toBeLessThan(DESIGN_WIDTH - design.borderStroke * 2);
    expect(design.centerSuitYFrac).toBeGreaterThan(0.5);
    expect(design.centerSuitYFrac).toBeLessThan(1);
  });
});

describe('suitGlyph', () => {
  it('returns ♥ for hearts', () => expect(suitGlyph('hearts')).toBe('♥'));
  it('returns ♦ for diamonds', () => expect(suitGlyph('diamonds')).toBe('♦'));
  it('returns ♣ for clubs', () => expect(suitGlyph('clubs')).toBe('♣'));
  it('returns ♠ for spades', () => expect(suitGlyph('spades')).toBe('♠'));
});

describe('rankLabel', () => {
  it('maps 1 → A', () => expect(rankLabel(1)).toBe('A'));
  it('maps 11 → J', () => expect(rankLabel(11)).toBe('J'));
  it('maps 12 → Q', () => expect(rankLabel(12)).toBe('Q'));
  it('maps 13 → K', () => expect(rankLabel(13)).toBe('K'));
  it('maps 10 → "10"', () => expect(rankLabel(10)).toBe('10'));
  it('maps 7 → "7"', () => expect(rankLabel(7)).toBe('7'));
  it('maps 2 → "2"', () => expect(rankLabel(2)).toBe('2'));
});

describe('isRedSuit', () => {
  it('hearts is red', () => expect(isRedSuit('hearts')).toBe(true));
  it('diamonds is red', () => expect(isRedSuit('diamonds')).toBe(true));
  it('clubs is not red', () => expect(isRedSuit('clubs')).toBe(false));
  it('spades is not red', () => expect(isRedSuit('spades')).toBe(false));
});

describe('suitColor', () => {
  it('returns the red palette color for hearts', () => {
    expect(suitColor('hearts', classicLightCardTheme)).toBe(classicLightCardTheme.face.palette.red);
  });

  it('returns the black palette color for spades', () => {
    expect(suitColor('spades', classicLightCardTheme)).toBe(
      classicLightCardTheme.face.palette.black,
    );
  });

  it('returns different colors for different themes', () => {
    const classicRed = suitColor('hearts', classicLightCardTheme);
    const midnightRed = suitColor('hearts', midnightCardTheme);
    expect(classicRed).not.toBe(midnightRed);
  });

  it('red and black colors differ within the same theme', () => {
    const red = suitColor('hearts', zelligeCardTheme);
    const black = suitColor('spades', zelligeCardTheme);
    expect(red).not.toBe(black);
  });

  it('default theme resolves classic-light palette slots', () => {
    expect(suitColor('hearts', defaultCardTheme)).toBe(classicLightCardTheme.face.palette.red);
    expect(suitColor('clubs', defaultCardTheme)).toBe(classicLightCardTheme.face.palette.black);
  });
});
