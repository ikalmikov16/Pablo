/**
 * Unit tests for the pure card helper functions.
 * No React, no Skia, no Reanimated — only plain data transforms.
 */
import { describe, expect, it } from 'bun:test';
import { defaultCardTheme, midnightCardTheme } from '../../design/cardTheme';
import { isRedSuit, rankLabel, suitColor, suitGlyph } from './internal/cardHelpers';

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
    expect(suitColor('hearts', defaultCardTheme)).toBe(defaultCardTheme.face.palette.red);
  });

  it('returns the black palette color for spades', () => {
    expect(suitColor('spades', defaultCardTheme)).toBe(defaultCardTheme.face.palette.black);
  });

  it('returns different colors for different themes', () => {
    const classicRed = suitColor('hearts', defaultCardTheme);
    const midnightRed = suitColor('hearts', midnightCardTheme);
    expect(classicRed).not.toBe(midnightRed);
  });

  it('red and black colors differ within the same theme', () => {
    const red = suitColor('hearts', defaultCardTheme);
    const black = suitColor('spades', defaultCardTheme);
    expect(red).not.toBe(black);
  });
});
