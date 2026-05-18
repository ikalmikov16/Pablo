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
  type HandIndex,
  type Move,
  type PlayerId,
  type PlayerView,
  type PlayerViewEntry,
  legalMoves as engineLegalMoves,
} from '@pablo/engine';
import type { GameStore, SlotSelection } from './gameStore';

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

export function selectMyHandSlots(s: GameStore): ReadonlyArray<HandSlot> {
  const v = s.view;
  if (!v) return [];
  const me = v.players.find((p) => p.id === v.self);
  if (!me) return [];
  return Array.from({ length: me.handSize }, (_, i) => {
    const known = me.knownCards[i] ?? null;
    return { index: i, cardId: known, faceUp: known !== null };
  });
}

export function selectMyHandSize(s: GameStore): number {
  const v = s.view;
  if (!v) return 0;
  return v.players.find((p) => p.id === v.self)?.handSize ?? 0;
}

export function selectOpponentEntries(s: GameStore): ReadonlyArray<PlayerViewEntry> {
  const v = s.view;
  if (!v) return [];
  return v.players.filter((p) => p.id !== v.self);
}

// ─── Action-bar selectors ─────────────────────────────────────────────────────

export type ActionBarItem = {
  readonly id: string;
  readonly move: Move | null; // null = composite action that opens a sub-flow
  readonly enabled: boolean;
};

/**
 * Returns the five turn-option items for the action bar, plus contextual
 * draw-resolved items when a card is in hand.
 */
export function selectActionBarItems(s: GameStore): ReadonlyArray<ActionBarItem> {
  const v = s.view;
  if (!v || v.status !== 'playing') return [];
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

/** All legal match_hand pairs for the local player. */
export function selectMatchHandPairs(s: GameStore): ReadonlyArray<[HandIndex, HandIndex]> {
  const v = s.view;
  if (!v) return [];
  const legal = getLegalMovesForPlayer(v, v.self);
  return legal
    .filter((m) => m.type === 'match_hand')
    .map((m) => {
      const mm = m as Extract<typeof m, { type: 'match_hand' }>;
      return [mm.handIndexA, mm.handIndexB] as [HandIndex, HandIndex];
    });
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
  return s.view?.drawnCardId ?? null;
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

export function selectPeekOverlayVisible(s: GameStore): boolean {
  const v = s.view;
  if (!v || v.status !== 'peek_phase') return false;
  const me = v.players.find((p) => p.id === v.self);
  if (!me) return false;
  return Object.keys(me.knownCards).length < v.rules.initialPeekCount;
}

// ─── Score / result selectors ─────────────────────────────────────────────────

export function selectPlayers(s: GameStore): ReadonlyArray<PlayerViewEntry> {
  return s.view?.players ?? [];
}

// ─── Version (for expectedVersion on applyMove calls) ────────────────────────

export function selectVersion(s: GameStore): number {
  return s.version;
}
