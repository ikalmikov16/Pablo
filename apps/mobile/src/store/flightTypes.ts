/**
 * Flight animation types — shared by the anchor registry, planner, and UI layer.
 */

import type { CardId, PlayerId } from '@pablo/engine';

export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

export type AnchorId =
  | { readonly kind: 'deck' }
  | { readonly kind: 'discard' }
  | { readonly kind: 'drawn' }
  | { readonly kind: 'ownSlot'; readonly index: number }
  | { readonly kind: 'opponentSlot'; readonly playerId: PlayerId; readonly index: number }
  | { readonly kind: 'opponentSeat'; readonly playerId: PlayerId };

export type FlightEmphasis = 'normal' | 'discardReadable' | 'hiddenSwap';

export type Flight = {
  readonly id: string;
  readonly batchId: string;
  readonly fromAnchor: AnchorId;
  readonly toAnchor: AnchorId;
  readonly fromCoords: Rect;
  readonly toCoords: Rect;
  readonly cardId: CardId | null;
  readonly faceUp: boolean;
  readonly durationMs: number;
  readonly delayMs: number;
  readonly emphasis: FlightEmphasis;
  readonly zRank: number;
  readonly liftEnabled: boolean;
  readonly flipMidFlight: boolean;
};

export type ChoreographyCue =
  | {
      readonly type: 'spotlight';
      readonly anchor: AnchorId;
      readonly delayMs: number;
      readonly durationMs: number;
      readonly tone: 'swap' | 'discard' | 'match' | 'penalty';
    }
  | {
      readonly type: 'actorFocus';
      readonly playerId: PlayerId;
      readonly delayMs: number;
      readonly durationMs: number;
    }
  | {
      readonly type: 'discardPulse';
      readonly delayMs: number;
      readonly durationMs: number;
    };

export type ToastCue = {
  readonly id: string;
  readonly delayMs: number;
  readonly message: string;
};

export type FlightPlan = {
  readonly flights: ReadonlyArray<Flight>;
  readonly cues: ReadonlyArray<ChoreographyCue>;
  readonly toasts: ReadonlyArray<ToastCue>;
  readonly totalDurationMs: number;
};

export const EMPTY_FLIGHT_PLAN: FlightPlan = {
  flights: [],
  cues: [],
  toasts: [],
  totalDurationMs: 0,
};

export function anchorKey(id: AnchorId): string {
  switch (id.kind) {
    case 'deck':
      return 'deck';
    case 'discard':
      return 'discard';
    case 'drawn':
      return 'drawn';
    case 'ownSlot':
      return `own:${id.index}`;
    case 'opponentSlot':
      return `opp:${id.playerId}:${id.index}`;
    case 'opponentSeat':
      return `seat:${id.playerId}`;
  }
}

export function destinationKeysFromFlights(flights: ReadonlyArray<Flight>): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const f of flights) {
    keys.add(anchorKey(f.toAnchor));
  }
  return keys;
}

export function sourceKeysFromFlights(flights: ReadonlyArray<Flight>): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const f of flights) {
    if (f.fromAnchor.kind === 'ownSlot' || f.fromAnchor.kind === 'opponentSlot') {
      keys.add(anchorKey(f.fromAnchor));
    }
  }
  return keys;
}

export function computeFlightPlanDuration(
  flights: ReadonlyArray<Flight>,
  cues: ReadonlyArray<ChoreographyCue>,
  toasts: ReadonlyArray<ToastCue>,
): number {
  let max = 0;
  for (const f of flights) {
    max = Math.max(max, f.delayMs + f.durationMs);
  }
  for (const c of cues) {
    max = Math.max(max, c.delayMs + c.durationMs);
  }
  for (const t of toasts) {
    max = Math.max(max, t.delayMs);
  }
  return max;
}
