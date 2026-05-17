/**
 * Pure data types for the Pablo engine.
 *
 * Canonical rules: docs/GAME_LOGIC.md
 *
 * Nothing in this file may import from React, React Native, Expo, Supabase,
 * or any Node-only API. The engine runs unmodified in the browser, RN, and Deno.
 */

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

/** 1=Ace, 2..10 face, 11=Jack, 12=Queen, 13=King */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export type Card = {
  readonly suit: Suit;
  readonly rank: Rank;
};

/** Stable identity for a card across a game (e.g. "H7", "SK"). */
export type CardId = string;

export type PlayerId = string;

/** 4 positions in the 2x2 grid: 0,1 top; 2,3 bottom. */
export type HandIndex = 0 | 1 | 2 | 3;

/** A player's hand is a fixed-size array of card ids (initialHandSize positions). */
export type Hand = ReadonlyArray<CardId>;

export type GameStatus = 'waiting' | 'playing' | 'final_turns' | 'ended';

/**
 * Powers a card can grant when discarded directly from a deck draw.
 *
 * - 'peek_self'      — secretly look at one of your own cards
 * - 'peek_opponent'  — secretly look at one of any opponent's cards
 * - 'swap_blind'     — swap one of your cards with an opponent's, neither seeing them
 *
 * Add more (e.g. 'swap_sighted') as future variants need them.
 */
export type SpecialPower = 'peek_self' | 'peek_opponent' | 'swap_blind';

/**
 * Per-card scoring override. Takes precedence over the rank-based value.
 * Example: King of Hearts worth 0 while other kings are worth 10.
 */
export type CardValueOverride = {
  readonly suit: Suit;
  readonly rank: Rank;
  readonly value: number;
};

export type GameRules = {
  /** Default value for kings (overridable per-card via `cardValueOverrides`). */
  readonly kingValue: number;
  readonly queenValue: number;
  readonly jackValue: number;
  /** Per-card overrides; higher precedence than the rank-based value. */
  readonly cardValueOverrides: ReadonlyArray<CardValueOverride>;
  /** Map of card rank to its special power. Ranks not listed grant no power. */
  readonly powers: Readonly<Partial<Record<Rank, SpecialPower>>>;
  readonly maxScore: number;
  readonly pabloPenalty: number;
  readonly initialHandSize: 4;
  readonly initialPeekCount: 0 | 1 | 2 | 3 | 4;
  readonly allowDrawDiscardAndDiscard: boolean;
};

export const DEFAULT_RULES: GameRules = {
  kingValue: 10,
  queenValue: 10,
  jackValue: 10,
  cardValueOverrides: [
    { suit: 'hearts', rank: 13, value: 0 },
  ],
  powers: {
    7: 'peek_self',
    8: 'peek_opponent',
    9: 'swap_blind',
  },
  maxScore: 100,
  pabloPenalty: 10,
  initialHandSize: 4,
  initialPeekCount: 2,
  allowDrawDiscardAndDiscard: false,
};

/** A card the current player has drawn but not yet placed/discarded. */
export type DrawnCard = {
  readonly playerId: PlayerId;
  readonly cardId: CardId;
  readonly from: 'deck' | 'discard';
};

export type GameState = {
  readonly id: string;
  readonly status: GameStatus;
  readonly seed: string;
  /** Map of cardId -> Card (52 entries at start, never mutates). */
  readonly cardCatalog: Readonly<Record<CardId, Card>>;
  /** Remaining cards in the draw pile; last element is the top. */
  readonly deck: ReadonlyArray<CardId>;
  /** Discard pile; last element is the top. */
  readonly discard: ReadonlyArray<CardId>;
  readonly players: ReadonlyArray<PlayerId>;
  readonly hands: Readonly<Record<PlayerId, Hand>>;
  /** Index into `players` whose turn it is. */
  readonly turnIndex: number;
  /** The card mid-turn (drawn but not yet placed). */
  readonly drawn: DrawnCard | null;
  readonly pabloCalledBy: PlayerId | null;
  /** When Pablo is called, every other player gets one more turn. */
  readonly finalTurnsRemaining: number;
  readonly scores: Readonly<Record<PlayerId, number>>;
  readonly roundNumber: number;
  readonly rules: GameRules;
};

export type Move =
  | { readonly type: 'draw_from_deck'; readonly playerId: PlayerId }
  | { readonly type: 'draw_from_discard'; readonly playerId: PlayerId }
  | { readonly type: 'swap_drawn'; readonly playerId: PlayerId; readonly handIndex: HandIndex }
  | { readonly type: 'discard_drawn'; readonly playerId: PlayerId }
  | {
      readonly type: 'use_peek_self';
      readonly playerId: PlayerId;
      readonly handIndex: HandIndex;
    }
  | {
      readonly type: 'use_peek_opponent';
      readonly playerId: PlayerId;
      readonly targetPlayer: PlayerId;
      readonly targetHandIndex: HandIndex;
    }
  | {
      readonly type: 'use_swap_blind';
      readonly playerId: PlayerId;
      readonly selfHandIndex: HandIndex;
      readonly targetPlayer: PlayerId;
      readonly targetHandIndex: HandIndex;
    }
  | { readonly type: 'skip_power'; readonly playerId: PlayerId }
  | { readonly type: 'call_pablo'; readonly playerId: PlayerId };

export type GameEvent =
  | { readonly type: 'card_drawn'; readonly playerId: PlayerId; readonly from: 'deck' | 'discard' }
  | { readonly type: 'card_swapped'; readonly playerId: PlayerId; readonly handIndex: HandIndex; readonly discardedCardId: CardId }
  | { readonly type: 'card_discarded'; readonly cardId: CardId; readonly playerId: PlayerId }
  | {
      readonly type: 'peeked';
      readonly playerId: PlayerId;
      readonly targetPlayer: PlayerId;
      readonly handIndex: HandIndex;
      readonly cardId: CardId;
    }
  | {
      readonly type: 'swapped_blind';
      readonly playerId: PlayerId;
      readonly selfHandIndex: HandIndex;
      readonly targetPlayer: PlayerId;
      readonly targetHandIndex: HandIndex;
    }
  | { readonly type: 'pablo_called'; readonly playerId: PlayerId }
  | { readonly type: 'turn_ended'; readonly nextPlayer: PlayerId }
  | { readonly type: 'deck_reshuffled' }
  | { readonly type: 'round_ended'; readonly scores: Readonly<Record<PlayerId, number>>; readonly winner: PlayerId };

export type MoveResult =
  | { readonly ok: true; readonly state: GameState; readonly events: ReadonlyArray<GameEvent> }
  | { readonly ok: false; readonly error: MoveError };

export type MoveError =
  | 'not_your_turn'
  | 'not_in_game'
  | 'must_draw_first'
  | 'already_drawn'
  | 'illegal_target'
  | 'power_not_available'
  | 'game_already_ended'
  | 'pablo_already_called'
  | 'discard_empty'
  | 'unknown_move';

/** What a single player is allowed to see. Computed server-side and sent to clients. */
export type PlayerView = {
  readonly self: PlayerId;
  readonly status: GameStatus;
  readonly roundNumber: number;
  readonly deckCount: number;
  readonly discardTopCardId: CardId | null;
  readonly currentPlayerId: PlayerId;
  readonly players: ReadonlyArray<PlayerViewEntry>;
  /** Card I'm currently holding mid-turn (only present if it's my turn and I've drawn). */
  readonly drawnCardId: CardId | null;
  readonly pabloCalledBy: PlayerId | null;
  readonly finalTurnsRemaining: number;
  readonly rules: GameRules;
};

export type PlayerViewEntry = {
  readonly id: PlayerId;
  readonly handSize: number;
  /** Map of handIndex -> cardId for cards this player is known (to me) to hold. */
  readonly knownCards: Readonly<Partial<Record<HandIndex, CardId>>>;
  readonly score: number;
  readonly isCurrentTurn: boolean;
};

export type RoundScore = {
  readonly perPlayerHand: Readonly<Record<PlayerId, number>>;
  readonly perPlayerRound: Readonly<Record<PlayerId, number>>;
  readonly cumulative: Readonly<Record<PlayerId, number>>;
  readonly winner: PlayerId;
  readonly pabloCallerWasLowest: boolean | null;
};
