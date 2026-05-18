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

/** Stable identity for a card across a game (e.g. "07H", "13S"). */
export type CardId = string;

export type PlayerId = string;

/**
 * Variable-size slot index. Hands can grow and shrink during play, so this is
 * a plain non-negative integer rather than the fixed `0|1|2|3` literal union
 * from Phase 2. Callers must validate: index >= 0 && index < hand.length.
 */
export type HandIndex = number;

/** A player's hand is a variable-length array of card ids. */
export type Hand = ReadonlyArray<CardId>;

export type GameStatus = 'peek_phase' | 'playing' | 'ended';

/**
 * Powers a card can grant when discarded directly from a deck draw (move #1).
 * Powers ONLY activate via move #1. Discarding any other way never triggers them.
 */
export type SpecialPower = 'peek_self' | 'peek_opponent' | 'swap_blind';

/**
 * Per-card scoring override. Takes precedence over the rank-based value.
 * Example: King of Hearts worth 0 while other kings are worth 10.
 * Does NOT affect rank matching.
 */
export type CardValueOverride = {
  readonly suit: Suit;
  readonly rank: Rank;
  readonly value: number;
};

export type GameRules = {
  readonly kingValue: number;
  readonly queenValue: number;
  readonly jackValue: number;
  /** Per-card overrides; higher precedence than the rank-based value. */
  readonly cardValueOverrides: ReadonlyArray<CardValueOverride>;
  /** Map of card rank to its special power. Ranks not listed grant no power. */
  readonly powers: Readonly<Partial<Record<Rank, SpecialPower>>>;
  readonly initialHandSize: number;
  readonly initialPeekCount: number;
  /** A matching play that would drop a hand below this size fails with a penalty. */
  readonly minHandSize: number;
  /** Number of penalty cards issued on a failed matching claim. */
  readonly penaltyCardOnFail: number;
};

export const DEFAULT_RULES: GameRules = {
  kingValue: 10,
  queenValue: 10,
  jackValue: 10,
  cardValueOverrides: [{ suit: 'hearts', rank: 13, value: 0 }],
  powers: {
    7: 'peek_self',
    8: 'peek_opponent',
    9: 'swap_blind',
  },
  initialHandSize: 4,
  initialPeekCount: 2,
  minHandSize: 2,
  penaltyCardOnFail: 1,
};

/** A card the current player has drawn from the deck and not yet resolved. */
export type DrawnCard = {
  readonly playerId: PlayerId;
  readonly cardId: CardId;
  readonly from: 'deck';
};

export type MatchKind = 'drawn' | 'hand' | 'discard';

export type MatchFailReason = 'wrong_rank' | 'min_hand_size';

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
  /** Index into `players` whose turn it is. Unused during peek_phase. */
  readonly turnIndex: number;
  /** The card mid-turn (drawn from deck, not yet placed). */
  readonly drawn: DrawnCard | null;
  readonly pabloCalledBy: PlayerId | null;
  /** Per-player scores; written by finaliseRound at game end. */
  readonly scores: Readonly<Record<PlayerId, number>>;
  readonly rules: GameRules;
  /**
   * Per-player knowledge: knownCards[knower][target][handIndex] = cardId.
   * Tracks every card a player has privately seen (choose_peek, 7/8/9 powers).
   * Keys are plain numbers (HandIndex widened from fixed 0|1|2|3).
   * Updated as moves are applied; lives inside GameState for serializability.
   */
  readonly knownCards: Readonly<
    Record<PlayerId, Readonly<Record<PlayerId, Readonly<Partial<Record<number, CardId>>>>>>
  >;
  /**
   * Set while a special power is pending resolution (between the discard that
   * activates it and the use_power/skip_power move that resolves it).
   */
  readonly pendingPower: Readonly<{ rank: Rank; power: SpecialPower; playerId: PlayerId }> | null;
  /** How many times the discard pile has been reshuffled into the deck this game. */
  readonly reshuffleCount: number;
};

export type Move =
  | {
      readonly type: 'choose_peek';
      readonly playerId: PlayerId;
      /** Must be exactly rules.initialPeekCount unique in-range indices. */
      readonly indices: ReadonlyArray<HandIndex>;
    }
  /**
   * Incremental version of `choose_peek` for UI flows that reveal cards
   * one tap at a time. Repeatedly calling `peek_one` accumulates the
   * player's peeked indices until they hit `rules.initialPeekCount`, at
   * which point the player is considered done peeking. The status flips
   * to `playing` once every player has peeked their quota. Bots still
   * use the atomic `choose_peek` move; `peek_one` is purely additive.
   */
  | {
      readonly type: 'peek_one';
      readonly playerId: PlayerId;
      readonly handIndex: HandIndex;
    }
  | { readonly type: 'draw_from_deck'; readonly playerId: PlayerId }
  | { readonly type: 'swap_drawn'; readonly playerId: PlayerId; readonly handIndex: HandIndex }
  | { readonly type: 'discard_drawn'; readonly playerId: PlayerId }
  | {
      /** Move #3: draw-and-match. Must have drawn first. */
      readonly type: 'match_drawn';
      readonly playerId: PlayerId;
      readonly handIndex: HandIndex;
    }
  | {
      /** Move #4: hand-match (no draw, claim two of own slots are same rank). */
      readonly type: 'match_hand';
      readonly playerId: PlayerId;
      readonly handIndexA: HandIndex;
      readonly handIndexB: HandIndex;
    }
  | {
      /** Move #5: discard-match (no draw, claim one slot matches discard top). */
      readonly type: 'match_discard';
      readonly playerId: PlayerId;
      readonly handIndex: HandIndex;
    }
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
  /**
   * Legal for ANY player while pabloCalledBy===null, drawn===null,
   * pendingPower===null, and status==='playing'.
   * On-turn: round ends immediately.
   * Off-turn: sets pabloCalledBy; round ends the moment the turn pointer
   * next reaches the caller (their turn is skipped).
   */
  | { readonly type: 'call_pablo'; readonly playerId: PlayerId };

export type GameEvent =
  | { readonly type: 'card_drawn'; readonly playerId: PlayerId; readonly from: 'deck' }
  | {
      readonly type: 'card_swapped';
      readonly playerId: PlayerId;
      readonly handIndex: HandIndex;
      readonly discardedCardId: CardId;
    }
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
  | {
      readonly type: 'round_ended';
      readonly scores: Readonly<Record<PlayerId, number>>;
      /** Multi-element when multiple players tie for the lowest hand. */
      readonly winners: ReadonlyArray<PlayerId>;
    }
  | {
      readonly type: 'power_activated';
      readonly rank: Rank;
      readonly power: SpecialPower;
      readonly playerId: PlayerId;
    }
  /** Emitted when a player completes their initial peek choice. */
  | { readonly type: 'peek_chosen'; readonly playerId: PlayerId }
  /**
   * Emitted for every individual `peek_one` move. Distinct from `peek_chosen`,
   * which fires once when the player completes the full atomic `choose_peek`.
   */
  | {
      readonly type: 'peek_one_chosen';
      readonly playerId: PlayerId;
      readonly handIndex: HandIndex;
      readonly cardId: CardId;
    }
  /** Emitted once when the last player peeks and status flips to 'playing'. */
  | { readonly type: 'peek_phase_ended' }
  | {
      readonly type: 'match_succeeded';
      readonly playerId: PlayerId;
      readonly kind: MatchKind;
      readonly slotIndices: ReadonlyArray<HandIndex>;
      readonly discardedCardIds: ReadonlyArray<CardId>;
    }
  | {
      readonly type: 'match_failed';
      readonly playerId: PlayerId;
      readonly kind: MatchKind;
      readonly slotIndices: ReadonlyArray<HandIndex>;
      readonly reason: MatchFailReason;
    }
  | { readonly type: 'penalty_card_dealt'; readonly playerId: PlayerId };

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
  | 'power_pending'
  | 'no_power_to_resolve'
  | 'game_already_ended'
  | 'pablo_already_called'
  /** call_pablo attempted while drawn !== null or pendingPower !== null. */
  | 'pablo_blocked'
  | 'discard_empty'
  | 'not_peek_phase'
  | 'peek_phase_active'
  | 'already_peeked'
  | 'invalid_peek_count'
  | 'duplicate_indices'
  | 'invalid_hand_index'
  | 'same_index'
  | 'unknown_move';

/** What a single player is allowed to see. Computed server-side and sent to clients. */
export type PlayerView = {
  readonly self: PlayerId;
  readonly status: GameStatus;
  readonly deckCount: number;
  readonly discardTopCardId: CardId | null;
  readonly currentPlayerId: PlayerId;
  readonly players: ReadonlyArray<PlayerViewEntry>;
  /** Card I drew this turn (only set if it's my turn and I've drawn). */
  readonly drawnCardId: CardId | null;
  readonly drawnFrom: 'deck' | null;
  readonly pabloCalledBy: PlayerId | null;
  /** Public info: everyone sees when a power is pending. */
  readonly pendingPower: GameState['pendingPower'];
  /** Full 52-card catalog for rendering any revealed card. */
  readonly catalog: Readonly<Record<CardId, Card>>;
  readonly rules: GameRules;
};

export type PlayerViewEntry = {
  readonly id: PlayerId;
  readonly handSize: number;
  /** Map of handIndex -> cardId for cards this player is known (to me) to hold. */
  readonly knownCards: Readonly<Partial<Record<number, CardId>>>;
  readonly score: number;
  readonly isCurrentTurn: boolean;
};

export type RoundScore = {
  readonly perPlayerHand: Readonly<Record<PlayerId, number>>;
  /** All players tied for the lowest hand value. Multi-element on tie. */
  readonly winners: ReadonlyArray<PlayerId>;
};
