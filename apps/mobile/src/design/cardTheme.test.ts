import { describe, expect, it } from 'bun:test';
import {
  cardThemes,
  classicLightCardTheme,
  defaultCardTheme,
  midnightCardTheme,
  nextTheme,
  zelligeCardTheme,
} from './cardTheme';

describe('cardThemes registry', () => {
  it('contains exactly three themes in registry order', () => {
    expect(cardThemes).toHaveLength(3);
    expect(cardThemes[0]!.id).toBe('zellige');
    expect(cardThemes[1]!.id).toBe('classic-light');
    expect(cardThemes[2]!.id).toBe('midnight');
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
  it('cycles zellige → classic-light → midnight → zellige', () => {
    expect(nextTheme(zelligeCardTheme).id).toBe('classic-light');
    expect(nextTheme(classicLightCardTheme).id).toBe('midnight');
    expect(nextTheme(midnightCardTheme).id).toBe('zellige');
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
  it('points at classic-light', () => {
    expect(defaultCardTheme.id).toBe('classic-light');
    expect(defaultCardTheme.back.pattern).toBe('plain');
  });
});

describe('classicLightCardTheme', () => {
  it('has a light card face and plain back', () => {
    expect(classicLightCardTheme.face.palette.bg).toBe('#FFFFFF');
    expect(classicLightCardTheme.back.pattern).toBe('plain');
  });
});

describe('midnightCardTheme', () => {
  it('has a dark card face', () => {
    expect(midnightCardTheme.face.palette.bg).not.toBe('#FFFFFF');
  });

  it('has gold accent on the border', () => {
    expect(midnightCardTheme.border.color).toBe('#C9A84C');
  });
});

describe('zelligeCardTheme', () => {
  it('uses the zellige back pattern and warm face', () => {
    expect(zelligeCardTheme.back.pattern).toBe('zellige');
    expect(zelligeCardTheme.face.palette.bg).toBe('#FFFDF7');
    expect(zelligeCardTheme.back.palette.accent).toBe('#C9A227');
  });
});
