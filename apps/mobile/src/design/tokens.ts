/**
 * Semantic design tokens for the Pablo mobile app.
 *
 * Rules:
 *  - Every value is accessed by name, never as a raw hex / magic number in components.
 *  - Tokens describe app chrome (backgrounds, text, buttons, borders).
 *  - Card surfaces are owned by CardTheme, not these tokens.
 *  - Adding a token: append. Renaming: TS catches all callsites.
 */
export const tokens = {
  color: {
    surface: {
      app: '#FAFAF7',
      card: '#FFFFFF',
      overlay: 'rgba(0,0,0,0.45)',
    },
    text: {
      primary: '#1A1A1A',
      secondary: '#666666',
      inverse: '#FFFFFF',
    },
    accent: {
      primary: '#2D6A4F',
      primaryPressed: '#1B4332',
    },
    border: {
      subtle: '#E5E5E0',
      strong: '#9C9C95',
    },
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const,
  radius: { sm: 6, md: 10, lg: 16, xl: 20, pill: 999 } as const,
  font: {
    size: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28 } as const,
    weight: { regular: '400' as const, semibold: '600' as const },
  },
  shadow: {
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 4,
    },
  },
  /** Animation durations in ms — use with Reanimated withTiming/withSpring. */
  duration: { fast: 150, normal: 250, slow: 450 } as const,
} as const;

export type Tokens = typeof tokens;
