/**
 * Zustand game store. One instance per active game, mounted via GameStoreProvider.
 *
 * Shape:
 *  - `view`        — the most recently delivered PlayerView (source of truth for rendering)
 *  - `pendingView` — the next view, held back until the animation queue drains
 *  - `version`     — the game version corresponding to `view`
 *  - `uiState`     — ephemeral UI state (selected slot, drag in flight, dismissed toasts)
 *  - `animQueue`   — events waiting to be consumed by the animation layer
 *
 * Components MUST use selectors from selectors.ts; never call useGameStore() directly.
 */

import type { GameEvent, PlayerId, PlayerView } from '@pablo/engine';
import { createStore } from 'zustand';

export type SlotSelection =
  | { readonly kind: 'none' }
  | { readonly kind: 'one'; readonly index: number }
  | { readonly kind: 'two'; readonly indexA: number; readonly indexB: number };

export type UiState = {
  /** Current slot selection for match-hand / match-discard flows. */
  readonly selection: SlotSelection;
  /** True while a drag gesture is in flight (blocks tap-based flows). */
  readonly dragInFlight: boolean;
  /** Indices the local player has tapped to peek in the peek overlay. */
  readonly peekPicks: ReadonlyArray<number>;
  /** Whether the EndOfRound overlay is visible. */
  readonly endOfRoundVisible: boolean;
  /** Whether the peek overlay is visible. */
  readonly peekOverlayVisible: boolean;
  /**
   * True from the moment the local player has tapped the required number of
   * peek picks (and we've dispatched `choose_peek`) until they tap "Got it"
   * to close the reveal. Used to keep the PeekOverlay mounted across the
   * status transition from `peek_phase` → `playing` so the player has a
   * chance to memorise their cards.
   */
  readonly peekJustHappened: boolean;
  /**
   * Set immediately after the local player dispatches `use_peek_self` or
   * `use_peek_opponent` (the 7- and 8-card powers).
   *
   * The engine resolves those powers in one go: it populates the peeker's
   * `knownCards` for that slot and `advanceTurn()`s, which clears
   * `pendingPower`. Without this flag, `PowerFlow` would unmount the moment
   * the new view promotes, giving the player no chance to see the card
   * they just peeked.
   *
   * Cleared when the player taps "Got it" on the reveal sheet. The reveal
   * UI reads the card itself out of `view.players[target].knownCards`, so
   * this state only needs to track *which* slot we're revealing.
   */
  readonly lastPeekReveal: {
    readonly target: PlayerId;
    readonly handIndex: number;
  } | null;
  /** Active toast message to show (null when none). */
  readonly toast: { readonly message: string; readonly id: number } | null;
};

export type AnimQueueState = {
  /** Events waiting to be animated, in arrival order. */
  readonly pending: ReadonlyArray<ReadonlyArray<GameEvent>>;
};

export type GameStoreState = {
  readonly view: PlayerView | null;
  /** Next view delivered by subscribePlayerView — held until animator drains. */
  readonly pendingView: PlayerView | null;
  readonly version: number;
  readonly ui: UiState;
  readonly animQueue: AnimQueueState;
};

export type GameStoreActions = {
  /** Called by the subscribePlayerView callback. */
  receiveView(view: PlayerView, version: number): void;
  /** Called by the animator when it has drained the current event batch. */
  promoteView(): void;
  /** Called by subscribeGameEvents callback. */
  enqueueEvents(events: ReadonlyArray<GameEvent>): void;
  /** Called by the animator after processing one batch. */
  dequeueEvents(): void;
  setSelection(sel: SlotSelection): void;
  clearSelection(): void;
  setDragInFlight(v: boolean): void;
  addPeekPick(index: number): void;
  clearPeekPicks(): void;
  showToast(message: string): void;
  dismissToast(): void;
  setEndOfRoundVisible(v: boolean): void;
  setPeekOverlayVisible(v: boolean): void;
  setPeekJustHappened(v: boolean): void;
  setLastPeekReveal(reveal: UiState['lastPeekReveal']): void;
};

export type GameStore = GameStoreState & GameStoreActions;

const defaultUi: UiState = {
  selection: { kind: 'none' },
  dragInFlight: false,
  peekPicks: [],
  endOfRoundVisible: false,
  peekOverlayVisible: false,
  peekJustHappened: false,
  lastPeekReveal: null,
  toast: null,
};

let toastSeq = 0;

export function createGameStore() {
  return createStore<GameStore>()((set) => ({
    view: null,
    pendingView: null,
    version: 0,
    ui: defaultUi,
    animQueue: { pending: [] },

    receiveView(view, version) {
      set((s) => {
        // If there's an active anim queue, hold new view as pending.
        if (s.animQueue.pending.length > 0 || s.pendingView !== null) {
          return { pendingView: view, version };
        }
        return { view, version, pendingView: null };
      });
    },

    promoteView() {
      set((s) => {
        if (s.pendingView === null) return {};
        const next = s.pendingView;
        const me = next.players.find((p) => p.id === next.self);
        const peekKnownCount = me ? Object.keys(me.knownCards).length : 0;
        return {
          view: next,
          pendingView: null,
          ui: {
            ...s.ui,
            endOfRoundVisible: next.status === 'ended',
            peekOverlayVisible:
              next.status === 'peek_phase' && peekKnownCount < next.rules.initialPeekCount,
          },
        };
      });
    },

    enqueueEvents(events) {
      set((s) => ({
        animQueue: { pending: [...s.animQueue.pending, events] },
      }));
    },

    dequeueEvents() {
      set((s) => {
        const pending = s.animQueue.pending.slice(1);
        // If queue is now empty, promote the pending view.
        if (pending.length === 0 && s.pendingView !== null) {
          return {
            animQueue: { pending },
            view: s.pendingView,
            pendingView: null,
            ui: {
              ...s.ui,
              endOfRoundVisible: s.pendingView.status === 'ended',
            },
          };
        }
        return { animQueue: { pending } };
      });
    },

    setSelection(sel) {
      set((s) => ({ ui: { ...s.ui, selection: sel } }));
    },

    clearSelection() {
      set((s) => ({ ui: { ...s.ui, selection: { kind: 'none' } } }));
    },

    setDragInFlight(v) {
      set((s) => ({ ui: { ...s.ui, dragInFlight: v } }));
    },

    addPeekPick(index) {
      set((s) => {
        if (s.ui.peekPicks.includes(index)) return {};
        return { ui: { ...s.ui, peekPicks: [...s.ui.peekPicks, index] } };
      });
    },

    clearPeekPicks() {
      set((s) => ({ ui: { ...s.ui, peekPicks: [] } }));
    },

    showToast(message) {
      const id = toastSeq++;
      set((s) => ({ ui: { ...s.ui, toast: { message, id } } }));
    },

    dismissToast() {
      set((s) => ({ ui: { ...s.ui, toast: null } }));
    },

    setEndOfRoundVisible(v) {
      set((s) => ({ ui: { ...s.ui, endOfRoundVisible: v } }));
    },

    setPeekOverlayVisible(v) {
      set((s) => ({ ui: { ...s.ui, peekOverlayVisible: v } }));
    },

    setPeekJustHappened(v) {
      set((s) => ({ ui: { ...s.ui, peekJustHappened: v } }));
    },

    setLastPeekReveal(reveal) {
      set((s) => ({ ui: { ...s.ui, lastPeekReveal: reveal } }));
    },
  }));
}

export type GameStoreInstance = ReturnType<typeof createGameStore>;
