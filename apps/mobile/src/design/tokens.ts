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
  /** Game-specific surfaces, accents, and timing. */
  game: {
    surface: {
      table: '#F1ECDD',
      actionBar: '#FFFFFF',
      actionBarBorder: '#E5E5E0',
      slotEmpty: 'rgba(0,0,0,0.04)',
      slotSelected: 'rgba(45,106,79,0.18)',
      currentTurnTint: 'rgba(45,106,79,0.06)',
      winnerRowTint: 'rgba(45,106,79,0.08)',
      deckBadgeBg: 'rgba(0,0,0,0.55)',
      toastBg: 'rgba(30,30,30,0.88)',
    },
    accent: {
      pabloOnTurn: '#B23A48',
      pabloOffTurn: '#D88C9A',
      penaltyTint: 'rgba(178,58,72,0.12)',
      powerActive: '#C77D08',
      pabloSubText: 'rgba(255,255,255,0.8)',
    },
    duration: {
      /** Delay between receiving an event batch and promoting the new view. */
      eventDrain: 300,
      /** Toast auto-dismiss duration. */
      toast: 1800,
      /** Toast fade-in/out duration. */
      toastFade: 200,
    },
    size: {
      /** Width of the mini cards in opponent rows. */
      miniCard: 44,
      /** Toast bottom inset and max width. */
      toastBottom: 100,
      toastMaxWidth: 280,
    },
    shake: { offset: 6 },
  } as const,
} as const;

export type Tokens = typeof tokens;
