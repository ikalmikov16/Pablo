/**
 * Pure selectors over GameStore state.
 *
 * Hard rules (ui.mdc):
 *  - Selectors may call engine functions (e.g. legalMoves) but must NOT
 *    implement any game logic themselves.
 *  - Components import these selectors; they never call useGameStore() directly.
 *  - All selectors are pure functions of their arguments — no side effects.
 */

import {
  type GameEvent,
  type HandIndex,
  type Move,
  type PlayerId,
  type PlayerView,
  type PlayerViewEntry,
  legalMoves as engineLegalMoves,
} from '@pablo/engine';
import type { GameStore, SlotSelection } from './gameStore';
import { anchorKey, type AnchorId } from './flightTypes';
import { destinationKeysFromFlights, sourceKeysFromFlights, type Flight } from './flightTypes';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a synthetic GameState-like object that satisfies `legalMoves`.
 * We can't call legalMoves directly on a PlayerView because legalMoves takes
 * a GameState; however we need to surface legal-move data to the UI layer
 * without holding GameState in the store.
 *
 * Solution: we keep a lightweight re-export — the mock client passes `view`
 * and the selectors build a synthetic minimal GameState from it. This is the
 * ONLY place that does this transformation; all other code sees only PlayerView.
 *
 * NOTE: This synthetic state omits hidden data (deck, opponent cards) because
 * the client legitimately doesn't have it. `legalMoves` only needs public fields
 * for the local player's turn checks: status, currentPlayerId, drawn, pendingPower,
 * pabloCalledBy, hands (handSize only), rules. We fake the hands with empty arrays
 * of the right length, which is enough for legalMoves' index-range guards.
 */
function syntheticStateForLegalMoves(view: PlayerView, _forPlayer: PlayerId) {
  const hands: Record<PlayerId, ReadonlyArray<string>> = {};
  for (const p of view.players) {
    hands[p.id] = Array<string>(p.handSize).fill('?');
  }
  return {
    id: 'synthetic',
    status: view.status,
    seed: '',
    cardCatalog: view.catalog,
    deck: [],
    discard: view.discardTopCardId ? [view.discardTopCardId] : [],
    players: view.players.map((p) => p.id),
    hands,
    turnIndex: view.players.findIndex((p) => p.id === view.currentPlayerId),
    drawn: view.drawnCardId
      ? { playerId: view.currentPlayerId, cardId: view.drawnCardId, from: 'deck' as const }
      : null,
    pabloCalledBy: view.pabloCalledBy,
    scores: Object.fromEntries(view.players.map((p) => [p.id, p.score])),
    rules: view.rules,
    knownCards: Object.fromEntries(
      view.players.map((p) => [
        p.id,
        Object.fromEntries(view.players.map((q) => [q.id, p.id === q.id ? p.knownCards : {}])),
      ]),
    ),
    pendingPower: view.pendingPower,
    reshuffleCount: 0,
  };
}

export function getLegalMovesForPlayer(view: PlayerView, playerId: PlayerId): ReadonlyArray<Move> {
  const state = syntheticStateForLegalMoves(view, playerId);
  return engineLegalMoves(state as Parameters<typeof engineLegalMoves>[0], playerId);
}

// ─── View-level selectors ─────────────────────────────────────────────────────

export function selectView(s: GameStore): PlayerView | null {
  return s.view;
}

function resolveDisplayView(s: GameStore): PlayerView | null {
  return s.displayView ?? s.view;
}

export function selectDisplayView(s: GameStore): PlayerView | null {
  return resolveDisplayView(s);
}

export function selectSelf(s: GameStore): PlayerId | null {
  return s.view?.self ?? null;
}

export function selectStatus(s: GameStore): PlayerView['status'] | null {
  return s.view?.status ?? null;
}

export function selectCurrentPlayerId(s: GameStore): PlayerId | null {
  return s.view?.currentPlayerId ?? null;
}

export function selectIsMyTurn(s: GameStore): boolean {
  const v = s.view;
  if (!v) return false;
  return v.currentPlayerId === v.self && v.status === 'playing';
}

export function selectPabloCalledBy(s: GameStore): PlayerId | null {
  return s.view?.pabloCalledBy ?? null;
}

// ─── Hand / slot selectors ────────────────────────────────────────────────────

export type HandSlot = {
  readonly index: number;
  readonly cardId: string | null; // known card id, or null if face-down
  readonly faceUp: boolean;
};

/**
 * Many UI-shaped selectors below (hand slots, action items, legal pairs) build
 * arrays of freshly allocated objects. React 18's `useSyncExternalStore` (which
 * Zustand v5 uses internally) calls the selector multiple times per render and
 * requires the result to be reference-stable; Zustand's `useShallow` only
 * helps if the *elements* compare equal via `Object.is`, which fresh objects
 * never do.
 *
 * The fix: cache the derived value against the `PlayerView` it was computed
 * from in a `WeakMap`. Two calls with the same `view` get the same array
 * back; when the view ref changes (i.e. the store received a new view) the
 * cache key changes too and the value is recomputed. Memory is reclaimed
 * automatically when views are garbage-collected.
 */
const EMPTY_HAND_SLOTS: ReadonlyArray<HandSlot> = [];
const handSlotsCache = new WeakMap<PlayerView, ReadonlyArray<HandSlot>>();

function handSlotsForView(v: PlayerView): ReadonlyArray<HandSlot> {
  const cached = handSlotsCache.get(v);
  if (cached) return cached;
  const me = v.players.find((p) => p.id === v.self);
  const result: ReadonlyArray<HandSlot> = me
    ? Array.from({ length: me.handSize }, (_, i) => {
        const known = me.knownCards[i] ?? null;
        return { index: i, cardId: known, faceUp: known !== null };
      })
    : EMPTY_HAND_SLOTS;
  handSlotsCache.set(v, result);
  return result;
}

export function selectMyHandSlots(s: GameStore): ReadonlyArray<HandSlot> {
  const v = s.view;
  if (!v) return EMPTY_HAND_SLOTS;
  return handSlotsForView(v);
}

export function selectMyHandSlotsDisplay(s: GameStore): ReadonlyArray<HandSlot> {
  const v = resolveDisplayView(s);
  if (!v) return EMPTY_HAND_SLOTS;
  return handSlotsForView(v);
}

export function selectMyHandSize(s: GameStore): number {
  const v = s.view;
  if (!v) return 0;
  return v.players.find((p) => p.id === v.self)?.handSize ?? 0;
}

const EMPTY_OPPONENTS: ReadonlyArray<PlayerViewEntry> = [];
const opponentEntriesCache = new WeakMap<PlayerView, ReadonlyArray<PlayerViewEntry>>();

function opponentEntriesForView(v: PlayerView): ReadonlyArray<PlayerViewEntry> {
  const cached = opponentEntriesCache.get(v);
  if (cached) return cached;
  const result = v.players.filter((p) => p.id !== v.self);
  opponentEntriesCache.set(v, result);
  return result;
}

export function selectOpponentEntries(s: GameStore): ReadonlyArray<PlayerViewEntry> {
  const v = s.view;
  if (!v) return EMPTY_OPPONENTS;
  return opponentEntriesForView(v);
}

export function selectOpponentEntriesDisplay(s: GameStore): ReadonlyArray<PlayerViewEntry> {
  const v = resolveDisplayView(s);
  if (!v) return EMPTY_OPPONENTS;
  return opponentEntriesForView(v);
}

// ─── Action-bar selectors ─────────────────────────────────────────────────────

export type ActionBarItem = {
  readonly id: string;
  readonly move: Move | null; // null = composite action that opens a sub-flow
  readonly enabled: boolean;
};

const EMPTY_ACTION_BAR: ReadonlyArray<ActionBarItem> = [];
const actionBarCache = new WeakMap<PlayerView, ReadonlyArray<ActionBarItem>>();

/**
 * Returns the five turn-option items for the action bar, plus contextual
 * draw-resolved items when a card is in hand.
 */
export function selectActionBarItems(s: GameStore): ReadonlyArray<ActionBarItem> {
  const v = s.view;
  if (!v || v.status !== 'playing') return EMPTY_ACTION_BAR;
  const cached = actionBarCache.get(v);
  if (cached) return cached;
  const result = computeActionBarItems(v);
  actionBarCache.set(v, result);
  return result;
}

function computeActionBarItems(v: PlayerView): ReadonlyArray<ActionBarItem> {
  const legal = getLegalMovesForPlayer(v, v.self);
  const legalTypes = new Set(legal.map((m) => m.type));

  const isMyTurn = v.currentPlayerId === v.self;
  const hasDrawn = v.drawnCardId !== null;
  const hasPendingPower = v.pendingPower !== null;

  // While power is pending, only power-resolution actions.
  if (hasPendingPower) {
    return [
      {
        id: 'skip_power',
        move: { type: 'skip_power', playerId: v.self },
        enabled: legalTypes.has('skip_power'),
      },
    ];
  }

  // After drawing, contextual sub-menu.
  if (hasDrawn && isMyTurn) {
    return [
      { id: 'swap_drawn', move: null, enabled: legalTypes.has('swap_drawn') },
      {
        id: 'discard_drawn',
        move: { type: 'discard_drawn', playerId: v.self },
        enabled: legalTypes.has('discard_drawn'),
      },
      { id: 'match_drawn', move: null, enabled: legalTypes.has('match_drawn') },
    ];
  }

  // Idle turn options.
  return [
    {
      id: 'draw_from_deck',
      move: { type: 'draw_from_deck', playerId: v.self },
      enabled: isMyTurn && legalTypes.has('draw_from_deck'),
    },
    { id: 'match_hand', move: null, enabled: isMyTurn && legalTypes.has('match_hand') },
    { id: 'match_discard', move: null, enabled: isMyTurn && legalTypes.has('match_discard') },
    {
      id: 'call_pablo',
      move: { type: 'call_pablo', playerId: v.self },
      enabled: legalTypes.has('call_pablo'),
    },
  ];
}

export function selectCanDraw(s: GameStore): boolean {
  const v = s.view;
  if (!v) return false;
  const legal = getLegalMovesForPlayer(v, v.self);
  return legal.some((m) => m.type === 'draw_from_deck');
}

export function selectCanCallPablo(s: GameStore): boolean {
  const v = s.view;
  if (!v) return false;
  const legal = getLegalMovesForPlayer(v, v.self);
  return legal.some((m) => m.type === 'call_pablo');
}

const EMPTY_HAND_PAIRS: ReadonlyArray<readonly [HandIndex, HandIndex]> = [];
const matchHandPairsCache = new WeakMap<
  PlayerView,
  ReadonlyArray<readonly [HandIndex, HandIndex]>
>();

/** All legal match_hand pairs for the local player. */
export function selectMatchHandPairs(s: GameStore): ReadonlyArray<readonly [HandIndex, HandIndex]> {
  const v = s.view;
  if (!v) return EMPTY_HAND_PAIRS;
  const cached = matchHandPairsCache.get(v);
  if (cached) return cached;
  const legal = getLegalMovesForPlayer(v, v.self);
  const result: ReadonlyArray<readonly [HandIndex, HandIndex]> = legal
    .filter((m) => m.type === 'match_hand')
    .map((m) => {
      const mm = m as Extract<typeof m, { type: 'match_hand' }>;
      return [mm.handIndexA, mm.handIndexB] as const;
    });
  matchHandPairsCache.set(v, result);
  return result;
}

/** All legal match_discard slot indices for the local player. */
export function selectMatchDiscardSlots(s: GameStore): ReadonlyArray<HandIndex> {
  const v = s.view;
  if (!v) return [];
  const legal = getLegalMovesForPlayer(v, v.self);
  return legal
    .filter((m) => m.type === 'match_discard')
    .map((m) => (m as Extract<typeof m, { type: 'match_discard' }>).handIndex);
}

/** All legal swap_drawn slot indices. */
export function selectSwapDrawnSlots(s: GameStore): ReadonlyArray<HandIndex> {
  const v = s.view;
  if (!v) return [];
  const legal = getLegalMovesForPlayer(v, v.self);
  return legal
    .filter((m) => m.type === 'swap_drawn')
    .map((m) => (m as Extract<typeof m, { type: 'swap_drawn' }>).handIndex);
}

/** All legal match_drawn slot indices. */
export function selectMatchDrawnSlots(s: GameStore): ReadonlyArray<HandIndex> {
  const v = s.view;
  if (!v) return [];
  const legal = getLegalMovesForPlayer(v, v.self);
  return legal
    .filter((m) => m.type === 'match_drawn')
    .map((m) => (m as Extract<typeof m, { type: 'match_drawn' }>).handIndex);
}

// ─── Pending-power selectors ──────────────────────────────────────────────────

export function selectPendingPower(s: GameStore): PlayerView['pendingPower'] {
  return s.view?.pendingPower ?? null;
}

/** True when a power is pending AND the local player is the one resolving it. */
export function selectIsLocalPowerPending(s: GameStore): boolean {
  const v = s.view;
  if (!v || !v.pendingPower) return false;
  return v.pendingPower.playerId === v.self;
}

export function selectLastPeekReveal(s: GameStore): GameStore['ui']['lastPeekReveal'] {
  return s.ui.lastPeekReveal;
}

/**
 * The PowerFlow overlay stays mounted while EITHER:
 *  - a pending power belongs to the local player (pick phase), or
 *  - a power-triggered peek reveal is being shown (the engine has
 *    already advanced the turn, but we keep the overlay open until the
 *    player taps "Got it" on the reveal card).
 */
export function selectPowerOverlayVisible(s: GameStore): boolean {
  return selectIsLocalPowerPending(s) || s.ui.lastPeekReveal !== null;
}

// ─── Peek-phase selectors ─────────────────────────────────────────────────────

export function selectIsPeekPhase(s: GameStore): boolean {
  return s.view?.status === 'peek_phase';
}

export function selectPeekRequired(s: GameStore): number {
  return s.view?.rules.initialPeekCount ?? 0;
}

export function selectHasLocalPlayerPeeked(s: GameStore): boolean {
  const v = s.view;
  if (!v) return false;
  const me = v.players.find((p) => p.id === v.self);
  if (!me) return false;
  return Object.keys(me.knownCards).length >= v.rules.initialPeekCount;
}

export function selectPeekPicks(s: GameStore): ReadonlyArray<number> {
  return s.ui.peekPicks;
}

// ─── Discard / deck selectors ─────────────────────────────────────────────────

export function selectDiscardTopCardId(s: GameStore): string | null {
  return s.view?.discardTopCardId ?? null;
}

export function selectDeckCount(s: GameStore): number {
  return s.view?.deckCount ?? 0;
}

export function selectDrawnCardId(s: GameStore): string | null {
  return resolveDisplayView(s)?.drawnCardId ?? null;
}

// ─── UI state selectors ───────────────────────────────────────────────────────

export function selectSelection(s: GameStore): SlotSelection {
  return s.ui.selection;
}

export function selectToast(s: GameStore): GameStore['ui']['toast'] {
  return s.ui.toast;
}

export function selectEndOfRoundVisible(s: GameStore): boolean {
  return s.ui.endOfRoundVisible || s.view?.status === 'ended';
}

/**
 * The peek overlay has two phases for the local player:
 *  1. Pick phase  — `status === 'peek_phase'` and the player hasn't peeked yet.
 *  2. Reveal phase — the player has just submitted their peek (so their
 *     `knownCards` are populated); we keep the overlay mounted so they can
 *     memorise their cards even after the engine flips status to `playing`.
 *     This phase lasts until the player taps "Got it", which clears
 *     `ui.peekJustHappened`.
 */
export function selectPeekOverlayVisible(s: GameStore): boolean {
  const v = s.view;
  if (!v) return false;
  const me = v.players.find((p) => p.id === v.self);
  if (!me) return false;
  const peekedEnough = Object.keys(me.knownCards).length >= v.rules.initialPeekCount;
  if (v.status === 'peek_phase' && !peekedEnough) return true;
  if (peekedEnough && s.ui.peekJustHappened) return true;
  return false;
}

// ─── Score / result selectors ─────────────────────────────────────────────────

const EMPTY_PLAYERS: ReadonlyArray<PlayerViewEntry> = [];
export function selectPlayers(s: GameStore): ReadonlyArray<PlayerViewEntry> {
  return s.view?.players ?? EMPTY_PLAYERS;
}

// ─── Version (for expectedVersion on applyMove calls) ────────────────────────

export function selectVersion(s: GameStore): number {
  return s.version;
}

// ─── Flight animation selectors ───────────────────────────────────────────────

export function selectIsAnimating(s: GameStore): boolean {
  return s.animQueue.pending.length > 0;
}

export function selectActiveFlights(s: GameStore) {
  return s.flightQueue.flights;
}

const EMPTY_DEST_KEYS: ReadonlySet<string> = new Set();
const EMPTY_SHAKE_SLOTS: readonly number[] = [];
const destKeysByFlights = new WeakMap<ReadonlyArray<Flight>, ReadonlySet<string>>();
const sourceKeysByFlights = new WeakMap<ReadonlyArray<Flight>, ReadonlySet<string>>();
const shakeSlotsByBatch = new WeakMap<
  ReadonlyArray<GameEvent>,
  Map<PlayerId, ReadonlyArray<number>>
>();

/** Stable empty set / arrays — required for useSyncExternalStore referential equality. */
export function selectDestinationAnchorKeys(s: GameStore): ReadonlySet<string> {
  const flights = s.flightQueue.flights;
  if (flights.length === 0) return EMPTY_DEST_KEYS;
  const cached = destKeysByFlights.get(flights);
  if (cached) return cached;
  const keys = destinationKeysFromFlights(flights);
  destKeysByFlights.set(flights, keys);
  return keys;
}

const EMPTY_SOURCE_KEYS: ReadonlySet<string> = new Set();

export function selectSourceAnchorKeys(s: GameStore): ReadonlySet<string> {
  const flights = s.flightQueue.flights;
  if (flights.length === 0) return EMPTY_SOURCE_KEYS;
  const cached = sourceKeysByFlights.get(flights);
  if (cached) return cached;
  const keys = sourceKeysFromFlights(flights);
  sourceKeysByFlights.set(flights, keys);
  return keys;
}

/** Event batch currently being animated (front of queue). */
export function selectCurrentEventBatch(s: GameStore): ReadonlyArray<GameEvent> {
  return s.animQueue.pending[0] ?? [];
}

/** Hand slot indices that should shake for `playerId` in the active batch. */
export function selectMatchFailedShakeSlots(
  s: GameStore,
  playerId: PlayerId,
): ReadonlyArray<number> {
  const batch = s.animQueue.pending[0];
  if (!batch) return EMPTY_SHAKE_SLOTS;

  let byPlayer = shakeSlotsByBatch.get(batch);
  if (!byPlayer) {
    byPlayer = new Map();
    shakeSlotsByBatch.set(batch, byPlayer);
  }
  const cached = byPlayer.get(playerId);
  if (cached) return cached;

  const indices: number[] = [];
  for (const event of batch) {
    if (event.type === 'match_failed' && event.playerId === playerId) {
      indices.push(...event.slotIndices);
    }
  }
  const result = indices.length === 0 ? EMPTY_SHAKE_SLOTS : indices;
  byPlayer.set(playerId, result);
  return result;
}

const EMPTY_SPOTLIGHT_KEYS: ReadonlySet<string> = new Set();
const EMPTY_ACTOR_FOCUS: ReadonlySet<string> = new Set();

export function selectSpotlightAnchorKeys(s: GameStore): ReadonlySet<string> {
  const keys = s.choreography.spotlightKeys;
  return keys.size === 0 ? EMPTY_SPOTLIGHT_KEYS : keys;
}

export function selectActorFocusPlayerIds(s: GameStore): ReadonlySet<string> {
  const ids = s.choreography.actorFocusPlayerIds;
  return ids.size === 0 ? EMPTY_ACTOR_FOCUS : ids;
}

export function selectDiscardPulse(s: GameStore): boolean {
  return s.choreography.discardPulse;
}

export function selectIsTableDimmed(s: GameStore): boolean {
  return s.choreography.tableDimmed;
}

export function selectSlotIsSpotlighted(s: GameStore, id: AnchorId): boolean {
  return s.choreography.spotlightKeys.has(anchorKey(id));
}
