/**
 * In-memory game state container: holds the authoritative GameState for a
 * mock game, dispatches per-player views, and delivers event batches.
 *
 * This module is the only place inside the mockClient that holds GameState.
 * Bot heuristics receive PlayerView only (via computePlayerView), never this.
 */

import {
  type GameEvent,
  type GameState,
  type PlayerId,
  type PlayerView,
  computePlayerView,
} from '@pablo/engine';

export type GameRecord = {
  state: GameState;
  version: number;
  readonly idempotency: Map<string, number>;
  readonly viewSubs: Map<PlayerId, Set<(v: PlayerView, version: number) => void>>;
  readonly eventSubs: Set<(events: ReadonlyArray<GameEvent>) => void>;
  readonly pendingBotHandles: Set<unknown>;
};

export function makeGameRecord(initial: GameState): GameRecord {
  return {
    state: initial,
    version: 0,
    idempotency: new Map(),
    viewSubs: new Map(),
    eventSubs: new Set(),
    pendingBotHandles: new Set(),
  };
}

/**
 * Apply a new state + events to the record, fan out views and events to all
 * subscribers. Called by both the human `applyMove` path and the bot loop.
 */
export function applyAndFanout(
  record: GameRecord,
  next: GameState,
  events: ReadonlyArray<GameEvent>,
): void {
  record.state = next;
  record.version += 1;

  // Fan out per-player views with the new version number
  for (const [playerId, callbacks] of record.viewSubs.entries()) {
    const view = computePlayerView(next, playerId);
    for (const cb of callbacks) {
      cb(view, record.version);
    }
  }

  // Fan out events
  if (events.length > 0) {
    for (const cb of record.eventSubs) {
      cb(events);
    }
  }
}
