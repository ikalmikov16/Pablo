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
      app: '#F6F0E4',
      card: '#FFFDF7',
      overlay: 'rgba(9,40,36,0.5)',
    },
    text: {
      primary: '#221C14',
      secondary: '#6E6354',
      inverse: '#FFFDF7',
    },
    accent: {
      primary: '#C2552F',
      primaryPressed: '#9C3F20',
      highlight: '#C9A227',
    },
    border: {
      subtle: '#E7DEC9',
      strong: '#A89A7E',
    },
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const,
  radius: { sm: 6, md: 10, lg: 16, xl: 20, pill: 999 } as const,
  font: {
    size: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, display: 40 } as const,
    family: {
      regular: 'Outfit_400Regular',
      semibold: 'Outfit_600SemiBold',
      bold: 'Outfit_700Bold',
    },
    letterSpacing: { tight: -0.3, normal: 0, wide: 0.6 } as const,
  },
  shadow: {
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 4,
    },
    raised: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    floating: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
      elevation: 8,
    },
  },
  /** Game-specific surfaces, accents, and timing. */
  game: {
    surface: {
      table: '#0E4F47',
      actionBar: '#FFFDF7',
      actionBarBorder: '#E7DEC9',
      slotEmpty: 'rgba(255,253,247,0.08)',
      slotGhostBorder: 'rgba(201,162,39,0.55)',
      slotSelected: 'rgba(201,162,39,0.22)',
      currentTurnTint: 'rgba(201,162,39,0.10)',
      /** Peak of the active-seat breathing pulse. */
      currentTurnTintStrong: 'rgba(201,162,39,0.26)',
      winnerRowTint: 'rgba(201,162,39,0.12)',
      deckBadgeBg: 'rgba(9,40,36,0.72)',
      toastBg: 'rgba(20,16,10,0.9)',
      announcementBg: 'rgba(255,253,247,0.92)',
      /** Dashed empty-discard border on felt. */
      feltOutline: 'rgba(255,253,247,0.25)',
      /** Felt gradient outer stop + edge vignette. */
      tableEdge: '#093832',
      /** Opponent seat plate background. */
      seatPlate: 'rgba(255,253,247,0.92)',
      /** Network reconnect banner — decoupled from Pablo alarm red. */
      networkBg: 'rgba(20,16,10,0.92)',
    },
    avatar: {
      palette: ['#14554B', '#C2552F', '#C9A227', '#6B6B2E', '#243B36'] as const,
    },
    text: {
      onFelt: '#F2E9D5',
      onFeltMuted: 'rgba(242,233,213,0.65)',
    },
    accent: {
      pabloOnTurn: '#A93226',
      pabloOffTurn: '#D98E79',
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
      /** Max width for the local player's hand grid. */
      ownCardMax: 68,
      /** Opponent hand cards when 1–2 opponents are seated. */
      opponentCardMd: 52,
      /** Opponent hand cards when three opponents share the top row. */
      opponentCardSm: 48,
      /** Deck / discard pile card width at table centre. */
      deckCard: 88,
      /** Cards inside the peek overlay grid. */
      peekCard: 80,
      /** Drawn-card hero in the draw-flow sheet (larger than table landing zone). */
      drawnFlowCard: 120,
      /** Cards in the end-of-round score sheet. */
      endRoundCard: 44,
      /** Toast bottom inset and max width. */
      toastBottom: 100,
      toastMaxWidth: 280,
      /** End-of-round score sheet column widths and list cap. */
      endRoundNameWidth: 80,
      endRoundScoreWidth: 52,
      endRoundListMaxHeight: 280,
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
      /** Height of the opponent seat header plate (avatar + name). */
      seatHeaderHeight: 36,
      /** Space reserved under the deck card for the count badge row. */
      deckBadgeRowHeight: 28,
    },
    shake: { offset: 6 },
    choreography: {
      tableDimOpacity: 0.22,
      spotlightBorderWidth: 3,
      spotlightBorderColor: '#C9A227',
      /** Fully-transparent variant of spotlightBorderColor for interpolation endpoints. */
      spotlightBorderTransparent: 'rgba(201,162,39,0)',
      /** Match PlayingCard corner radius (W × this fraction, clamped in cardSizes). */
      ringRadiusFraction: 0.075,
    },
  } as const,
} as const;

export type Tokens = typeof tokens;
