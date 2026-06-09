/**
 * Pure flight planner — maps one engine event batch to overlay flights and choreography.
 */

import type { CardId, GameEvent, PlayerId, PlayerView } from '@pablo/engine';

import { tokens } from '../design/tokens';
import {
  addMatchSpotlights,
  flightShakeMs,
  matchDiscardMs,
  planLoneDiscard,
  planMatchDiscardToasts,
  planOpponentSwap,
  planSelfSwap,
  type FlightPushFn,
} from './flightChoreography';
import { getAnchorRect, type AnchorSnapshot } from './anchorRegistry';
import {
  anchorKey,
  computeFlightPlanDuration,
  EMPTY_FLIGHT_PLAN,
  type AnchorId,
  type ChoreographyCue,
  type Flight,
  type FlightEmphasis,
  type FlightPlan,
  type Rect,
  type ToastCue,
} from './flightTypes';

export type PlanFlightsOptions = {
  readonly batchId: string;
  readonly version: number;
  readonly batchSeq: number;
};

const { flightFast, flightSlow } = tokens.game.duration;

let flightSeq = 0;

/** Reset deterministic flight id counter (tests only). */
export function resetFlightIdSeqForTests(): void {
  flightSeq = 0;
}

function isSelf(view: PlayerView, playerId: PlayerId): boolean {
  return playerId === view.self;
}

function selfEntry(view: PlayerView) {
  return view.players.find((p) => p.id === view.self);
}

function handSize(view: PlayerView, playerId: PlayerId): number {
  return view.players.find((p) => p.id === playerId)?.handSize ?? 0;
}

function ownSlot(index: number): AnchorId {
  return { kind: 'ownSlot', index };
}

function opponentSlot(playerId: PlayerId, index: number): AnchorId {
  return { kind: 'opponentSlot', playerId, index };
}

function opponentSeat(playerId: PlayerId): AnchorId {
  return { kind: 'opponentSeat', playerId };
}

function rectOrNull(snapshot: AnchorSnapshot, id: AnchorId): Rect | null {
  return getAnchorRect(snapshot, id);
}

function isValidRect(r: Rect | null): r is Rect {
  if (!r) return false;
  return (
    Number.isFinite(r.x) &&
    Number.isFinite(r.y) &&
    Number.isFinite(r.w) &&
    Number.isFinite(r.h) &&
    r.w > 0 &&
    r.h > 0
  );
}

function nextFlightId(
  batchId: string,
  eventIndex: number,
  flightIndex: number,
  from: AnchorId,
  to: AnchorId,
): string {
  flightSeq += 1;
  return `${batchId}:${eventIndex}:${flightIndex}:${anchorKey(from)}:${anchorKey(to)}:${flightSeq}`;
}

type FlightPresentation = {
  readonly liftEnabled?: boolean;
  readonly flipMidFlight?: boolean;
};

function defaultPresentation(emphasis: FlightEmphasis): {
  readonly liftEnabled: boolean;
  readonly flipMidFlight: boolean;
} {
  return {
    liftEnabled: emphasis !== 'hiddenSwap',
    flipMidFlight: false,
  };
}

function makeFlight(
  snapshot: AnchorSnapshot,
  batchId: string,
  eventIndex: number,
  flightIndex: number,
  from: AnchorId,
  to: AnchorId,
  cardId: CardId | null,
  faceUp: boolean,
  durationMs: number,
  delayMs: number,
  emphasis: FlightEmphasis,
  zRank: number,
  presentation?: FlightPresentation,
): Flight | null {
  const fromCoords = rectOrNull(snapshot, from);
  const toCoords = rectOrNull(snapshot, to);
  if (!isValidRect(fromCoords) || !isValidRect(toCoords)) return null;

  const defaults = defaultPresentation(emphasis);

  return {
    id: nextFlightId(batchId, eventIndex, flightIndex, from, to),
    batchId,
    fromAnchor: from,
    toAnchor: to,
    fromCoords,
    toCoords,
    cardId,
    faceUp,
    durationMs,
    delayMs,
    emphasis,
    zRank,
    liftEnabled: presentation?.liftEnabled ?? defaults.liftEnabled,
    flipMidFlight: presentation?.flipMidFlight ?? defaults.flipMidFlight,
  };
}

function pushFlight(
  out: Flight[],
  snapshot: AnchorSnapshot,
  batchId: string,
  eventIndex: number,
  flightIndex: number,
  from: AnchorId,
  to: AnchorId,
  cardId: CardId | null,
  faceUp: boolean,
  durationMs: number,
  delayMs: number,
  emphasis: FlightEmphasis = 'normal',
  zRank = 0,
  presentation?: FlightPresentation,
): void {
  const f = makeFlight(
    snapshot,
    batchId,
    eventIndex,
    flightIndex,
    from,
    to,
    cardId,
    faceUp,
    durationMs,
    delayMs,
    emphasis,
    zRank,
    presentation,
  );
  if (f) out.push(f);
}

/** Separate co-scheduled flights so the eye can read each leg. */
export function applyFlightStagger(flights: ReadonlyArray<Flight>): Flight[] {
  const step = tokens.game.motion.stagger;
  const byDelay = new Map<number, Flight[]>();

  for (const flight of flights) {
    const group = byDelay.get(flight.delayMs) ?? [];
    group.push(flight);
    byDelay.set(flight.delayMs, group);
  }

  const out: Flight[] = [];
  for (const group of byDelay.values()) {
    const sorted = [...group].sort((a, b) => a.zRank - b.zRank || a.id.localeCompare(b.id));
    sorted.forEach((flight, index) => {
      out.push({ ...flight, delayMs: flight.delayMs + index * step });
    });
  }

  return out.sort((a, b) => a.delayMs - b.delayMs || a.zRank - b.zRank);
}

/** Distinct discarded cards in a batch (legacy helper for tests). */
export function collectDiscardToastCards(
  batch: ReadonlyArray<GameEvent>,
): ReadonlyArray<{ readonly playerId: PlayerId; readonly cardId: CardId }> {
  const seen = new Set<string>();
  const out: { playerId: PlayerId; cardId: CardId }[] = [];

  function add(playerId: PlayerId, cardId: CardId) {
    if (seen.has(cardId)) return;
    seen.add(cardId);
    out.push({ playerId, cardId });
  }

  for (const event of batch) {
    if (event.type === 'card_discarded') {
      add(event.playerId, event.cardId);
    } else if (event.type === 'card_swapped') {
      add(event.playerId, event.discardedCardId);
    } else if (event.type === 'match_succeeded') {
      for (const cardId of event.discardedCardIds) {
        add(event.playerId, cardId);
      }
    }
  }

  return out;
}

function batchHasMatchFailedFor(batch: ReadonlyArray<GameEvent>, playerId: PlayerId): boolean {
  return batch.some((e) => e.type === 'match_failed' && e.playerId === playerId);
}

function discardFlightsFromMatch(
  out: Flight[],
  snapshot: AnchorSnapshot,
  batchId: string,
  eventIndex: number,
  startFlightIndex: number,
  view: PlayerView,
  event: Extract<GameEvent, { type: 'match_succeeded' }>,
  exchangeDelayMs: number,
): number {
  let fi = startFlightIndex;
  const { playerId, kind, slotIndices, discardedCardIds } = event;
  const self = isSelf(view, playerId);

  if (kind === 'hand') {
    const [a, b] = slotIndices;
    const [cardA, cardB] = discardedCardIds;
    if (self) {
      pushFlight(
        out,
        snapshot,
        batchId,
        eventIndex,
        fi++,
        ownSlot(a),
        { kind: 'discard' },
        cardA,
        true,
        matchDiscardMs,
        exchangeDelayMs,
        'discardReadable',
        1,
      );
      pushFlight(
        out,
        snapshot,
        batchId,
        eventIndex,
        fi++,
        ownSlot(b),
        { kind: 'discard' },
        cardB,
        true,
        matchDiscardMs,
        exchangeDelayMs,
        'discardReadable',
        1,
      );
    } else {
      pushFlight(
        out,
        snapshot,
        batchId,
        eventIndex,
        fi++,
        opponentSlot(playerId, a),
        { kind: 'discard' },
        cardA,
        true,
        matchDiscardMs,
        exchangeDelayMs,
        'discardReadable',
        1,
      );
      pushFlight(
        out,
        snapshot,
        batchId,
        eventIndex,
        fi++,
        opponentSlot(playerId, b),
        { kind: 'discard' },
        cardB,
        true,
        matchDiscardMs,
        exchangeDelayMs,
        'discardReadable',
        1,
      );
    }
    return fi;
  }

  if (kind === 'drawn') {
    const slotIndex = slotIndices[0]!;
    const [drawnCardId, slotCardId] = discardedCardIds;
    if (self) {
      pushFlight(
        out,
        snapshot,
        batchId,
        eventIndex,
        fi++,
        { kind: 'drawn' },
        { kind: 'discard' },
        drawnCardId,
        true,
        matchDiscardMs,
        exchangeDelayMs,
        'discardReadable',
        1,
      );
      pushFlight(
        out,
        snapshot,
        batchId,
        eventIndex,
        fi++,
        ownSlot(slotIndex),
        { kind: 'discard' },
        slotCardId,
        true,
        matchDiscardMs,
        exchangeDelayMs,
        'discardReadable',
        1,
      );
    } else {
      pushFlight(
        out,
        snapshot,
        batchId,
        eventIndex,
        fi++,
        opponentSeat(playerId),
        { kind: 'discard' },
        drawnCardId,
        true,
        matchDiscardMs,
        exchangeDelayMs,
        'discardReadable',
        1,
      );
      pushFlight(
        out,
        snapshot,
        batchId,
        eventIndex,
        fi++,
        opponentSlot(playerId, slotIndex),
        { kind: 'discard' },
        slotCardId,
        true,
        matchDiscardMs,
        exchangeDelayMs,
        'discardReadable',
        1,
      );
    }
    return fi;
  }

  const slotIndex = slotIndices[0]!;
  const cardId = discardedCardIds[0]!;
  if (self) {
    pushFlight(
      out,
      snapshot,
      batchId,
      eventIndex,
      fi++,
      ownSlot(slotIndex),
      { kind: 'discard' },
      cardId,
      true,
      matchDiscardMs,
      exchangeDelayMs,
      'discardReadable',
      1,
    );
  } else {
    pushFlight(
      out,
      snapshot,
      batchId,
      eventIndex,
      fi++,
      opponentSlot(playerId, slotIndex),
      { kind: 'discard' },
      cardId,
      true,
      matchDiscardMs,
      exchangeDelayMs,
      'discardReadable',
      1,
    );
  }
  return fi;
}

function planSwappedBlind(
  out: Flight[],
  snapshot: AnchorSnapshot,
  batchId: string,
  eventIndex: number,
  view: PlayerView,
  event: Extract<GameEvent, { type: 'swapped_blind' }>,
): void {
  const { playerId, selfHandIndex, targetPlayer, targetHandIndex } = event;
  const actorIsSelf = isSelf(view, playerId);
  const targetIsSelf = targetPlayer === view.self;

  if (actorIsSelf) {
    pushFlight(
      out,
      snapshot,
      batchId,
      eventIndex,
      0,
      ownSlot(selfHandIndex),
      opponentSlot(targetPlayer, targetHandIndex),
      null,
      false,
      flightSlow,
      0,
      'hiddenSwap',
      0,
    );
    pushFlight(
      out,
      snapshot,
      batchId,
      eventIndex,
      1,
      opponentSlot(targetPlayer, targetHandIndex),
      ownSlot(selfHandIndex),
      null,
      false,
      flightSlow,
      0,
      'hiddenSwap',
      0,
    );
    return;
  }

  if (targetIsSelf) {
    pushFlight(
      out,
      snapshot,
      batchId,
      eventIndex,
      0,
      opponentSlot(playerId, selfHandIndex),
      ownSlot(targetHandIndex),
      null,
      false,
      flightSlow,
      0,
      'hiddenSwap',
      0,
    );
    pushFlight(
      out,
      snapshot,
      batchId,
      eventIndex,
      1,
      ownSlot(targetHandIndex),
      opponentSlot(playerId, selfHandIndex),
      null,
      false,
      flightSlow,
      0,
      'hiddenSwap',
      0,
    );
    return;
  }

  pushFlight(
    out,
    snapshot,
    batchId,
    eventIndex,
    0,
    opponentSlot(playerId, selfHandIndex),
    opponentSlot(targetPlayer, targetHandIndex),
    null,
    false,
    flightSlow,
    0,
    'hiddenSwap',
    0,
  );
  pushFlight(
    out,
    snapshot,
    batchId,
    eventIndex,
    1,
    opponentSlot(targetPlayer, targetHandIndex),
    opponentSlot(playerId, selfHandIndex),
    null,
    false,
    flightSlow,
    0,
    'hiddenSwap',
    0,
  );
}

/**
 * Plan flights, choreography cues, and delayed toasts for one event batch.
 */
export function planFlights(
  batch: ReadonlyArray<GameEvent>,
  view: PlayerView,
  snapshot: AnchorSnapshot,
  options: PlanFlightsOptions,
): FlightPlan {
  if (batch.length === 0) return EMPTY_FLIGHT_PLAN;

  const { batchId } = options;
  const out: Flight[] = [];
  const cues: ChoreographyCue[] = [];
  const toasts: ToastCue[] = [];
  const discardHandled = new Set<CardId>();

  for (let eventIndex = 0; eventIndex < batch.length; eventIndex++) {
    const event = batch[eventIndex]!;

    switch (event.type) {
      case 'card_drawn': {
        if (isSelf(view, event.playerId)) {
          const cardId = view.drawnCardId;
          pushFlight(
            out,
            snapshot,
            batchId,
            eventIndex,
            0,
            { kind: 'deck' },
            { kind: 'drawn' },
            cardId,
            true,
            flightFast,
            0,
            'normal',
            0,
            { flipMidFlight: true, liftEnabled: true },
          );
        } else {
          pushFlight(
            out,
            snapshot,
            batchId,
            eventIndex,
            0,
            { kind: 'deck' },
            opponentSeat(event.playerId),
            null,
            false,
            flightFast,
            0,
          );
        }
        break;
      }

      case 'card_swapped': {
        discardHandled.add(event.discardedCardId);
        let fi = 0;
        const push: FlightPushFn = (
          from,
          to,
          cardId,
          faceUp,
          durationMs,
          delayMs,
          emphasis,
          zRank,
        ) => {
          pushFlight(
            out,
            snapshot,
            batchId,
            eventIndex,
            fi++,
            from,
            to,
            cardId,
            faceUp,
            durationMs,
            delayMs,
            emphasis,
            zRank,
          );
        };
        if (isSelf(view, event.playerId)) {
          const me = selfEntry(view);
          const swappedInId = me?.knownCards[event.handIndex];
          planSelfSwap(push, cues, toasts, view, batchId, event, swappedInId);
        } else {
          planOpponentSwap(push, cues, toasts, view, batchId, event);
        }
        break;
      }

      case 'card_discarded': {
        if (discardHandled.has(event.cardId)) break;
        discardHandled.add(event.cardId);
        let fi = 0;
        const push: FlightPushFn = (
          from,
          to,
          cardId,
          faceUp,
          durationMs,
          delayMs,
          emphasis,
          zRank,
        ) => {
          pushFlight(
            out,
            snapshot,
            batchId,
            eventIndex,
            fi++,
            from,
            to,
            cardId,
            faceUp,
            durationMs,
            delayMs,
            emphasis,
            zRank,
          );
        };
        planLoneDiscard(push, cues, toasts, view, batchId, event, isSelf(view, event.playerId));
        break;
      }

      case 'match_succeeded': {
        for (const id of event.discardedCardIds) {
          discardHandled.add(id);
        }
        const self = isSelf(view, event.playerId);
        const spotlightMs = tokens.game.duration.swapSpotlightMs;
        addMatchSpotlights(
          cues,
          self,
          event.playerId,
          event.slotIndices,
          0,
          spotlightMs + matchDiscardMs,
        );
        discardFlightsFromMatch(out, snapshot, batchId, eventIndex, 0, view, event, spotlightMs);
        cues.push({
          type: 'discardPulse',
          delayMs: spotlightMs + matchDiscardMs,
          durationMs: tokens.game.duration.swapSettleMs,
        });
        planMatchDiscardToasts(
          toasts,
          view,
          batchId,
          eventIndex,
          event,
          spotlightMs + matchDiscardMs,
        );
        break;
      }

      case 'penalty_card_dealt': {
        const destIndex = handSize(view, event.playerId) - 1;
        const delay = batchHasMatchFailedFor(batch, event.playerId) ? flightShakeMs : 0;
        if (isSelf(view, event.playerId)) {
          pushFlight(
            out,
            snapshot,
            batchId,
            eventIndex,
            0,
            { kind: 'deck' },
            ownSlot(destIndex),
            null,
            false,
            flightFast,
            delay,
          );
        } else {
          pushFlight(
            out,
            snapshot,
            batchId,
            eventIndex,
            0,
            { kind: 'deck' },
            opponentSlot(event.playerId, destIndex),
            null,
            false,
            flightFast,
            delay,
          );
        }
        break;
      }

      case 'swapped_blind':
        planSwappedBlind(out, snapshot, batchId, eventIndex, view, event);
        break;

      default:
        break;
    }
  }

  const flights = applyFlightStagger(out);
  const totalDurationMs = computeFlightPlanDuration(flights, cues, toasts);
  return { flights, cues, toasts, totalDurationMs };
}
