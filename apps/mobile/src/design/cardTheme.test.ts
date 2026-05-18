import { describe, expect, it } from 'bun:test';
import { cardThemes, defaultCardTheme, midnightCardTheme, nextTheme } from './cardTheme';

describe('cardThemes registry', () => {
  it('contains exactly two themes: classic-light and midnight', () => {
    expect(cardThemes).toHaveLength(2);
    expect(cardThemes[0]!.id).toBe('classic-light');
    expect(cardThemes[1]!.id).toBe('midnight');
  });

  it('all theme ids are unique', () => {
    const ids = cardThemes.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every theme has required face palette keys', () => {
    for (const theme of cardThemes) {
      expect(typeof theme.face.palette.bg).toBe('string');
      expect(typeof theme.face.palette.red).toBe('string');
      expect(typeof theme.face.palette.black).toBe('string');
      expect(typeof theme.face.palette.border).toBe('string');
    }
  });

  it('every theme has required back palette keys', () => {
    for (const theme of cardThemes) {
      expect(typeof theme.back.palette.primary).toBe('string');
      expect(typeof theme.back.palette.secondary).toBe('string');
      expect(typeof theme.back.palette.accent).toBe('string');
    }
  });

  it('every theme has a positive border radius', () => {
    for (const theme of cardThemes) {
      expect(theme.border.radius).toBeGreaterThan(0);
    }
  });

  it('every theme has a non-empty name', () => {
    for (const theme of cardThemes) {
      expect(theme.name.length).toBeGreaterThan(0);
    }
  });
});

describe('nextTheme', () => {
  it('cycles from classic-light to midnight', () => {
    expect(nextTheme(defaultCardTheme).id).toBe('midnight');
  });

  it('cycles from midnight back to classic-light', () => {
    expect(nextTheme(midnightCardTheme).id).toBe('classic-light');
  });

  it('is a full cycle: applying nextTheme N times returns to start', () => {
    let current = defaultCardTheme;
    for (let i = 0; i < cardThemes.length; i++) {
      current = nextTheme(current);
    }
    expect(current.id).toBe(defaultCardTheme.id);
  });
});

describe('defaultCardTheme', () => {
  it('has a light card face', () => {
    expect(defaultCardTheme.face.palette.bg).toBe('#FFFFFF');
  });
});

describe('midnightCardTheme', () => {
  it('has a dark card face', () => {
    // Midnight bg is darker than default — crude but sufficient check.
    expect(midnightCardTheme.face.palette.bg).not.toBe('#FFFFFF');
  });

  it('has gold accent on the border', () => {
    expect(midnightCardTheme.border.color).toBe('#C9A84C');
  });
});
