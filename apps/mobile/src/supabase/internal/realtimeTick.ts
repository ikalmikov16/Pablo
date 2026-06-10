import type { GameEvent, PlayerView } from '@pablo/engine';

import type { ClientResult } from '../types';

export type TickPumpDeps = {
  readonly getPlayerView: (
    gameId: string,
  ) => Promise<ClientResult<{ readonly view: PlayerView; readonly version: number }>>;
  readonly getEventsSince: (
    gameId: string,
    sinceVersion: number,
  ) => Promise<
    ClientResult<{ readonly events: ReadonlyArray<GameEvent>; readonly currentVersion: number }>
  >;
};

type ViewCallback = (view: PlayerView, version: number) => void;
type EventsCallback = (events: ReadonlyArray<GameEvent>) => void;

/**
 * Per-game tick pump: on each broadcast tick, fetches view then events in order.
 * Coalesces concurrent ticks and re-pumps when event version races ahead of view.
 *
 * The first successful sync snaps `lastSeenVersion` to the current version
 * *without* replaying history, so reconnecting into an in-progress match shows
 * the current state immediately instead of animating every past move. Only
 * deltas that arrive after the initial sync are emitted to event subscribers.
 */
export class GameTickPump {
  private readonly viewSubs = new Set<ViewCallback>();
  private readonly eventSubs = new Set<EventsCallback>();
  private lastSeenVersion = 0;
  private initialized = false;
  private pumping = false;
  private dirty = false;
  private disposed = false;

  constructor(
    private readonly gameId: string,
    private readonly deps: TickPumpDeps,
  ) {}

  subscribeView(onChange: ViewCallback): () => void {
    this.viewSubs.add(onChange);
    this.schedulePump();
    return () => {
      this.viewSubs.delete(onChange);
    };
  }

  subscribeEvents(onChange: EventsCallback): () => void {
    this.eventSubs.add(onChange);
    return () => {
      this.eventSubs.delete(onChange);
    };
  }

  onTick(): void {
    if (this.disposed) return;
    this.schedulePump();
  }

  dispose(): void {
    this.disposed = true;
    this.viewSubs.clear();
    this.eventSubs.clear();
  }

  get hasSubscribers(): boolean {
    return this.viewSubs.size > 0 || this.eventSubs.size > 0;
  }

  private schedulePump(): void {
    if (this.disposed) return;
    if (this.pumping) {
      this.dirty = true;
      return;
    }
    void this.pump();
  }

  private async pump(): Promise<void> {
    this.pumping = true;
    try {
      do {
        this.dirty = false;

        const viewResult = await this.deps.getPlayerView(this.gameId);
        if (!viewResult.ok) break;

        const { view, version: viewVersion } = viewResult.data;
        for (const cb of this.viewSubs) {
          cb(view, viewVersion);
        }

        const eventsResult = await this.deps.getEventsSince(this.gameId, this.lastSeenVersion);
        if (!eventsResult.ok) break;

        const { events, currentVersion } = eventsResult.data;

        if (currentVersion > viewVersion) {
          this.dirty = true;
          continue;
        }

        if (this.initialized) {
          if (events.length > 0) {
            for (const cb of this.eventSubs) {
              cb(events);
            }
          }
        } else {
          // First sync: adopt the current version as the baseline without
          // replaying the historical events the catch-up fetch returned.
          this.initialized = true;
        }
        this.lastSeenVersion = currentVersion;
      } while (this.dirty && !this.disposed);
    } finally {
      this.pumping = false;
      if (this.dirty && !this.disposed) {
        void this.pump();
      }
    }
  }
}
