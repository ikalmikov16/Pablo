/**
 * Zustand game store. One instance per active game, mounted via GameStoreProvider.
 */

import type { GameEvent, PlayerId, PlayerView } from '@pablo/engine';
import { createStore } from 'zustand';

import { tokens } from '../design/tokens';
import { t } from '../i18n';
import { getAnchorSnapshot } from './anchorRegistry';
import { resolveDisplayName } from './displayName';
import { planFlights, type PlanFlightsOptions } from './flightPlanner';
import type { ChoreographyCue, Flight, ToastCue } from './flightTypes';
import { anchorKey } from './flightTypes';

export type UiState = {
  readonly endOfRoundVisible: boolean;
  readonly peekOverlayVisible: boolean;
  readonly peekJustHappened: boolean;
  readonly submitting: boolean;
  readonly networkError: boolean;
  readonly lastPeekReveal: {
    readonly target: PlayerId;
    readonly handIndex: number;
  } | null;
  readonly toast: { readonly message: string; readonly id: number } | null;
  /**
   * Persistent "last action" line shown in the AnnouncementBanner. Unlike
   * toasts it never auto-dismisses — it's the memory aid for what just
   * happened on the table.
   */
  readonly announcement: { readonly message: string; readonly id: number } | null;
};

export type AnimQueueState = {
  readonly pending: ReadonlyArray<ReadonlyArray<GameEvent>>;
};

export type ChoreographyUiState = {
  readonly spotlightKeys: ReadonlySet<string>;
  readonly actorFocusPlayerIds: ReadonlySet<string>;
  readonly discardPulse: boolean;
  readonly tableDimmed: boolean;
};

export type FlightQueueState = {
  readonly activeBatchId: string | null;
  readonly flights: ReadonlyArray<Flight>;
  readonly cues: ReadonlyArray<ChoreographyCue>;
};

export type GameStoreState = {
  readonly view: PlayerView | null;
  readonly version: number;
  /** Latched hand-grid layout during choreography; catches up when a batch ends. */
  readonly displayView: PlayerView | null;
  readonly displayVersion: number;
  readonly ui: UiState;
  readonly animQueue: AnimQueueState;
  readonly flightQueue: FlightQueueState;
  readonly choreography: ChoreographyUiState;
};

export type GameStoreActions = {
  receiveView(view: PlayerView, version: number): void;
  enqueueEvents(events: ReadonlyArray<GameEvent>): void;
  dequeueEvents(): void;
  removeFlight(id: string): void;
  disposeFlightTimers(): void;
  showToast(message: string): void;
  /** Pin a message to the persistent announcement line (no toast). */
  announce(message: string): void;
  dismissToast(): void;
  setPeekJustHappened(v: boolean): void;
  setLastPeekReveal(reveal: UiState['lastPeekReveal']): void;
  setSubmitting(v: boolean): void;
  setNetworkError(v: boolean): void;
};

export type GameStore = GameStoreState & GameStoreActions;

const defaultUi: UiState = {
  endOfRoundVisible: false,
  peekOverlayVisible: false,
  peekJustHappened: false,
  submitting: false,
  networkError: false,
  lastPeekReveal: null,
  toast: null,
  announcement: null,
};

function emptyChoreographyState(): ChoreographyUiState {
  return {
    spotlightKeys: new Set(),
    actorFocusPlayerIds: new Set(),
    discardPulse: false,
    tableDimmed: false,
  };
}

let toastSeq = 0;
let batchSeq = 0;

function isChoreographyActive(s: GameStoreState): boolean {
  return s.flightQueue.activeBatchId !== null || s.animQueue.pending.length > 0;
}

function syncDisplayFromViewIfIdle(
  set: (
    partial: Partial<GameStoreState> | ((s: GameStoreState) => Partial<GameStoreState>),
  ) => void,
  get: () => GameStore,
): void {
  const s = get();
  if (!s.view || isChoreographyActive(s)) return;
  if (s.displayView === s.view && s.displayVersion === s.version) return;
  set({ displayView: s.view, displayVersion: s.version });
}

function peekOverlayVisibleFor(view: PlayerView): boolean {
  const me = view.players.find((p) => p.id === view.self);
  const peekKnownCount = me ? Object.keys(me.knownCards).length : 0;
  return view.status === 'peek_phase' && peekKnownCount < view.rules.initialPeekCount;
}

export function createGameStore() {
  const scheduledTimers = new Set<ReturnType<typeof setTimeout>>();
  let batchCompleteTimer: ReturnType<typeof setTimeout> | null = null;
  let batchStartedAt = 0;
  let batchTotalDurationMs = 0;

  function trackTimer(handle: ReturnType<typeof setTimeout>): void {
    scheduledTimers.add(handle);
  }

  function clearAllTimers(): void {
    for (const handle of scheduledTimers) {
      clearTimeout(handle);
    }
    scheduledTimers.clear();
    if (batchCompleteTimer) {
      clearTimeout(batchCompleteTimer);
      batchCompleteTimer = null;
    }
  }

  return createStore<GameStore>()((set, get) => {
    function planOptions(): PlanFlightsOptions {
      const s = get();
      batchSeq += 1;
      return {
        batchId: `batch-${s.version}-${batchSeq}`,
        version: s.version,
        batchSeq,
      };
    }

    function resetChoreographyUi(): void {
      set({ choreography: emptyChoreographyState() });
    }

    function applyCueOn(cue: ChoreographyCue): void {
      set((s) => {
        if (cue.type === 'spotlight') {
          const spotlightKeys = new Set(s.choreography.spotlightKeys);
          spotlightKeys.add(anchorKey(cue.anchor));
          return { choreography: { ...s.choreography, spotlightKeys } };
        }
        if (cue.type === 'actorFocus') {
          const actorFocusPlayerIds = new Set(s.choreography.actorFocusPlayerIds);
          actorFocusPlayerIds.add(cue.playerId);
          return {
            choreography: {
              ...s.choreography,
              actorFocusPlayerIds,
              tableDimmed: true,
            },
          };
        }
        return { choreography: { ...s.choreography, discardPulse: true } };
      });
    }

    function applyCueOff(cue: ChoreographyCue): void {
      set((s) => {
        if (cue.type === 'spotlight') {
          const spotlightKeys = new Set(s.choreography.spotlightKeys);
          spotlightKeys.delete(anchorKey(cue.anchor));
          return { choreography: { ...s.choreography, spotlightKeys } };
        }
        if (cue.type === 'actorFocus') {
          const actorFocusPlayerIds = new Set(s.choreography.actorFocusPlayerIds);
          actorFocusPlayerIds.delete(cue.playerId);
          const tableDimmed = actorFocusPlayerIds.size > 0;
          return { choreography: { ...s.choreography, actorFocusPlayerIds, tableDimmed } };
        }
        return { choreography: { ...s.choreography, discardPulse: false } };
      });
    }

    function scheduleChoreography(cues: ReadonlyArray<ChoreographyCue>): void {
      for (const cue of cues) {
        trackTimer(
          setTimeout(() => {
            applyCueOn(cue);
          }, cue.delayMs),
        );
        trackTimer(
          setTimeout(() => {
            applyCueOff(cue);
          }, cue.delayMs + cue.durationMs),
        );
      }
    }

    function scheduleToasts(toasts: ReadonlyArray<ToastCue>): void {
      for (const toast of toasts) {
        trackTimer(
          setTimeout(() => {
            get().announce(toast.message);
          }, toast.delayMs),
        );
      }
    }

    function scheduleBatchCompletionHold(): void {
      const elapsed = Date.now() - batchStartedAt;
      const remaining = Math.max(0, batchTotalDurationMs - elapsed);
      if (batchCompleteTimer) {
        clearTimeout(batchCompleteTimer);
        scheduledTimers.delete(batchCompleteTimer);
      }
      batchCompleteTimer = setTimeout(() => {
        batchCompleteTimer = null;
        resetChoreographyUi();
        const latest = get();
        if (latest.view) {
          set({ displayView: latest.view, displayVersion: latest.version });
        }
        get().dequeueEvents();
      }, remaining);
      trackTimer(batchCompleteTimer);
    }

    function firePabloToasts(events: ReadonlyArray<GameEvent>): void {
      const view = get().view;
      if (!view) return;
      for (const event of events) {
        if (event.type === 'pablo_called') {
          get().announce(
            t('game.pablo.calledToast', { name: resolveDisplayName(view, event.playerId) }),
          );
        }
      }
    }

    function startNextBatchIfIdle() {
      const s = get();
      if (s.flightQueue.flights.length > 0 || batchCompleteTimer !== null) return;
      if (s.animQueue.pending.length === 0) {
        set({
          flightQueue: { activeBatchId: null, flights: [], cues: [] },
          choreography: emptyChoreographyState(),
        });
        return;
      }

      const batch = s.animQueue.pending[0]!;
      const view = s.view;
      if (!view) return;

      const options = planOptions();
      const plan = planFlights(batch, view, getAnchorSnapshot(), options);
      batchStartedAt = Date.now();
      batchTotalDurationMs = plan.totalDurationMs;

      resetChoreographyUi();
      scheduleChoreography(plan.cues);
      scheduleToasts(plan.toasts);

      if (plan.flights.length === 0) {
        set({
          flightQueue: { activeBatchId: options.batchId, flights: [], cues: plan.cues },
        });
        scheduleBatchCompletionHold();
        return;
      }

      set({
        flightQueue: {
          activeBatchId: options.batchId,
          flights: plan.flights,
          cues: plan.cues,
        },
      });
    }

    return {
      view: null,
      version: 0,
      displayView: null,
      displayVersion: 0,
      ui: defaultUi,
      animQueue: { pending: [] },
      flightQueue: { activeBatchId: null, flights: [], cues: [] },
      choreography: emptyChoreographyState(),

      receiveView(view, version) {
        set((s) => {
          const base = {
            view,
            version,
            ui: {
              ...s.ui,
              endOfRoundVisible: view.status === 'ended',
              peekOverlayVisible: peekOverlayVisibleFor(view),
              submitting: false,
              networkError: false,
            },
          };
          if (s.displayView === null) {
            return { ...base, displayView: view, displayVersion: version };
          }
          return base;
        });
        queueMicrotask(() => syncDisplayFromViewIfIdle(set, get));
      },

      enqueueEvents(events) {
        if (events.length === 0) return;

        firePabloToasts(events);

        set((s) => ({
          animQueue: { pending: [...s.animQueue.pending, events] },
        }));

        startNextBatchIfIdle();
      },

      dequeueEvents() {
        if (batchCompleteTimer) {
          clearTimeout(batchCompleteTimer);
          scheduledTimers.delete(batchCompleteTimer);
          batchCompleteTimer = null;
        }
        set((s) => ({
          animQueue: { pending: s.animQueue.pending.slice(1) },
          flightQueue: { activeBatchId: null, flights: [], cues: [] },
          choreography: emptyChoreographyState(),
        }));

        syncDisplayFromViewIfIdle(set, get);

        const hasMoreBatches = get().animQueue.pending.length > 0;
        if (hasMoreBatches) {
          const breath = setTimeout(() => {
            startNextBatchIfIdle();
          }, tokens.game.motion.breath);
          trackTimer(breath);
        } else {
          startNextBatchIfIdle();
        }
      },

      removeFlight(id) {
        set((s) => {
          const flights = s.flightQueue.flights.filter((f) => f.id !== id);
          if (flights.length === s.flightQueue.flights.length) return {};
          return { flightQueue: { ...s.flightQueue, flights } };
        });

        const { flights, activeBatchId } = get().flightQueue;
        if (flights.length === 0 && activeBatchId !== null) {
          scheduleBatchCompletionHold();
        }
      },

      disposeFlightTimers() {
        clearAllTimers();
        resetChoreographyUi();
      },

      showToast(message) {
        const id = toastSeq++;
        set((s) => ({ ui: { ...s.ui, toast: { message, id } } }));
      },

      announce(message) {
        const id = toastSeq++;
        set((s) => ({ ui: { ...s.ui, announcement: { message, id } } }));
      },

      dismissToast() {
        set((s) => ({ ui: { ...s.ui, toast: null } }));
      },

      setPeekJustHappened(v) {
        set((s) => ({ ui: { ...s.ui, peekJustHappened: v } }));
      },

      setLastPeekReveal(reveal) {
        set((s) => ({ ui: { ...s.ui, lastPeekReveal: reveal } }));
      },

      setSubmitting(v) {
        set((s) => ({ ui: { ...s.ui, submitting: v } }));
      },

      setNetworkError(v) {
        set((s) => ({ ui: { ...s.ui, networkError: v } }));
      },
    };
  });
}

export type GameStoreInstance = ReturnType<typeof createGameStore>;
