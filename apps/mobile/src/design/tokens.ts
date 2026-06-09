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
      slotGhostBorder: 'rgba(45,106,79,0.4)',
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
    motion: {
      duration: {
        instant: 80,
        quick: 140,
        brisk: 220,
        normal: 320,
        slow: 520,
        heavy: 780,
        deliberate: 1100,
      },
      curve: {
        snap: [0.32, 0.72, 0.0, 1.0],
        carry: [0.45, 0.05, 0.55, 0.95],
        reveal: [0.16, 1.0, 0.3, 1.0],
        drift: [0.4, 0.0, 0.6, 1.0],
      } as const,
      spring: {
        settle: { damping: 18, stiffness: 220, mass: 1 },
        pulse: { damping: 14, stiffness: 280, mass: 1 },
        banner: { damping: 22, stiffness: 180, mass: 1 },
        gentle: { damping: 24, stiffness: 140, mass: 1 },
      } as const,
      breath: 180,
      stagger: 70,
      lift: { peakScale: 1.05, peakShadow: 0.18 },
    },
    duration: {
      /** Legacy placeholder drain (Package B uses flight completion). */
      eventDrain: 300,
      /** Actor focus before an opponent swap (ms). */
      swapFocusMs: 220,
      /** Target-slot spotlight before swap exchange (ms). */
      swapSpotlightMs: 320,
      /** Self swap exchange leg duration (ms). */
      selfSwapExchangeMs: 780,
      /** Opponent swap exchange leg duration (ms). */
      opponentSwapExchangeMs: 780,
      /** Delay before hidden inbound card follows discard leg (ms). */
      swapInboundLagMs: 140,
      /** Post-exchange settle / pulse (ms). */
      swapSettleMs: 320,
      /** Lone discard flight (ms). */
      discardReadableMs: 520,
      /** Match discard flight (ms). */
      matchDiscardMs: 520,
      /** Opponent lone-discard actor focus (ms). */
      opponentDiscardFocusMs: 220,
      /** Standard card flight duration (ms). */
      flightFast: 320,
      /** Cross-table blind-swap flight duration (ms). */
      flightSlow: 520,
      /** Slot shake + penalty-flight lead-in (ms). */
      flightShakeMs: 220,
      /** Discard toast visibility (ms). */
      flightDiscardToastMs: 1500,
      /** Pause before a bot acts on its turn (lets flights finish on the human device). */
      botOnTurnDelayMs: 2200,
      /** Pause between bot peek picks in the opening phase. */
      botPeekDelayMs: 600,
      /** Base pause before an off-turn Pablo call. */
      botOffTurnPabloBaseMs: 1800,
      /** Random extra pause added to off-turn Pablo (0 … this value). */
      botOffTurnPabloJitterMs: 700,
      /** Toast auto-dismiss duration. */
      toast: 1800,
      /** Toast fade-in/out duration. */
      toastFade: 140,
    },
    zIndex: {
      /** Card-flight overlay — above flows, below toasts. */
      flightOverlay: 45,
    },
    size: {
      /** Width of the mini cards in opponent rows (legacy; prefer opponentCardMd). */
      miniCard: 44,
      /** Max width for the local player's hand grid. */
      ownCardMax: 68,
      /** Opponent hand cards when 1–2 opponents are seated. */
      opponentCardMd: 52,
      /** Opponent hand cards when three opponents share the top row. */
      opponentCardSm: 48,
      /** Deck / discard pile card width at table centre. */
      deckCard: 88,
      /** Drawn-card hero in the draw-flow sheet (larger than table landing zone). */
      drawnFlowCard: 120,
      /** Cards in the end-of-round score sheet. */
      endRoundCard: 44,
      /** Toast bottom inset and max width. */
      toastBottom: 100,
      toastMaxWidth: 280,
    },
    table: {
      /** Inset from the table container edge to the outermost seat box. */
      seatPadding: 8,
      /** Gap between cards inside one player's 2×2 hand. */
      handGap: 4,
      /** Gap between adjacent opponent seat boxes in the top row. */
      seatGap: 24,
      /** Gap between name block and card grid inside a seat. */
      nameGap: 4,
      /** Vertical gap between opponent / deck / self bands. */
      deckGap: 8,
      /** Approximate height of the opponent name line (for layout math). */
      nameLineHeight: 18,
    },
    shake: { offset: 6 },
    choreography: {
      tableDimOpacity: 0.22,
      spotlightBorderWidth: 3,
      spotlightBorderColor: '#2D6A4F',
      /** Match PlayingCard corner radius (W × this fraction, clamped in cardSizes). */
      ringRadiusFraction: 0.075,
    },
  } as const,
} as const;

export type Tokens = typeof tokens;
