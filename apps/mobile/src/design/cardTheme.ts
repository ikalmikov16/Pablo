/**
 * CardTheme — describes the visual identity of a single playing card.
 *
 * Adding a new look means appending an entry to `cardThemes` below, NOT
 * touching the <PlayingCard> component. See .cursor/rules/cards.mdc.
 */

export type SuitGlyphStyle = 'classic' | 'minimal' | 'arabesque';
export type BackPatternStyle = 'plain' | 'zellige' | 'leather';
export type CornerLayout = 'tight' | 'spacious';

export type CardThemePalette = {
  /** Card body / background color */
  readonly bg: string;
  /** Color used for red suits (hearts, diamonds) */
  readonly red: string;
  /** Color used for black suits (clubs, spades) */
  readonly black: string;
  /** Subtle border color */
  readonly border: string;
};

export type CardBackTheme = {
  readonly pattern: BackPatternStyle;
  readonly palette: {
    readonly primary: string;
    readonly secondary: string;
    readonly accent: string;
  };
};

export type CardFaceTheme = {
  readonly suitGlyphs: SuitGlyphStyle;
  readonly cornerLayout: CornerLayout;
  readonly palette: CardThemePalette;
};

export type CardTheme = {
  readonly id: string;
  readonly name: string;
  readonly back: CardBackTheme;
  readonly face: CardFaceTheme;
  readonly border: {
    readonly width: number;
    readonly radius: number;
    readonly color: string;
  };
};

/** Zellige identity — teal field, gold stars, warm face. App default. */
export const zelligeCardTheme: CardTheme = {
  id: 'zellige',
  name: 'Zellige',
  back: {
    pattern: 'zellige',
    palette: {
      primary: '#0B3B34',
      secondary: '#14554B',
      accent: '#C9A227',
    },
  },
  face: {
    suitGlyphs: 'classic',
    cornerLayout: 'spacious',
    palette: {
      bg: '#FFFDF7',
      red: '#B3402A',
      black: '#243B36',
      border: '#E0D5BC',
    },
  },
  border: {
    width: 1,
    radius: 12,
    color: '#D9CDB2',
  },
};

/** Clean, minimal baseline — renders via the plain back path. */
export const classicLightCardTheme: CardTheme = {
  id: 'classic-light',
  name: 'Classic',
  back: {
    pattern: 'plain',
    palette: {
      primary: '#2D6A4F',
      secondary: '#1B4332',
      accent: '#D8F3DC',
    },
  },
  face: {
    suitGlyphs: 'classic',
    cornerLayout: 'spacious',
    palette: {
      bg: '#FFFFFF',
      red: '#C0392B',
      black: '#1A1A1A',
      border: '#E5E5E0',
    },
  },
  border: {
    width: 1,
    radius: 12,
    color: '#E5E5E0',
  },
};

/** Dark surface, gold accents — plain back regression theme. */
export const midnightCardTheme: CardTheme = {
  id: 'midnight',
  name: 'Midnight',
  back: {
    pattern: 'plain',
    palette: {
      primary: '#1A1033',
      secondary: '#2E1F5E',
      accent: '#C9A84C',
    },
  },
  face: {
    suitGlyphs: 'minimal',
    cornerLayout: 'spacious',
    palette: {
      bg: '#12102A',
      red: '#E05A5A',
      black: '#D4C8FF',
      border: '#2E1F5E',
    },
  },
  border: {
    width: 1,
    radius: 12,
    color: '#C9A84C',
  },
};

/** All themes the app knows about. New themes: add here, no component changes. */
export const cardThemes: ReadonlyArray<CardTheme> = [
  zelligeCardTheme,
  classicLightCardTheme,
  midnightCardTheme,
];

/** Active app theme — one-line rollout for every `defaultCardTheme` consumer. */
export const defaultCardTheme: CardTheme = classicLightCardTheme;

/** Cycle to the next theme in the registry. */
export function nextTheme(current: CardTheme): CardTheme {
  const idx = cardThemes.findIndex((t) => t.id === current.id);
  return cardThemes[(idx + 1) % cardThemes.length]!;
}
