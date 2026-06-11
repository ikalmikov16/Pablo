/**
 * Memory-critical choreography helpers — staged cues, flights, and delayed toasts.
 */

import type { CardId, GameEvent, PlayerId, PlayerView } from '@pablo/engine';

import { rankLabel } from '../components/cards/internal/cardHelpers';
import { t } from '../i18n';
import { tokens } from '../design/tokens';
import { formatCardIdLabel } from './cardLabel';
import { resolveDisplayName } from './displayName';
import type { AnchorId, ChoreographyCue, Flight, ToastCue } from './flightTypes';

const {
  swapFocusMs,
  swapSpotlightMs,
  selfSwapExchangeMs,
  opponentSwapExchangeMs,
  swapInboundLagMs,
  swapSettleMs,
  discardReadableMs,
  matchDiscardMs,
  opponentDiscardFocusMs,
  flightShakeMs,
} = tokens.game.duration;

export type FlightPushFn = (
  from: AnchorId,
  to: AnchorId,
  cardId: CardId | null,
  faceUp: boolean,
  durationMs: number,
  delayMs: number,
  emphasis: Flight['emphasis'],
  zRank: number,
) => void;

function ownSlot(index: number): AnchorId {
  return { kind: 'ownSlot', index };
}

function opponentSlot(playerId: PlayerId, index: number): AnchorId {
  return { kind: 'opponentSlot', playerId, index };
}

function opponentSeat(playerId: PlayerId): AnchorId {
  return { kind: 'opponentSeat', playerId };
}

function toastName(view: PlayerView, playerId: PlayerId): string {
  return resolveDisplayName(view, playerId);
}

function cardLabel(view: PlayerView, cardId: CardId): string {
  return formatCardIdLabel(view.catalog, cardId);
}

export function planSelfSwap(
  push: FlightPushFn,
  cues: ChoreographyCue[],
  toasts: ToastCue[],
  view: PlayerView,
  batchId: string,
  event: Extract<GameEvent, { type: 'card_swapped' }>,
  swappedInId: CardId | undefined,
): void {
  const slot = ownSlot(event.handIndex);
  const exchangeStart = swapSpotlightMs;

  cues.push({
    type: 'spotlight',
    anchor: slot,
    delayMs: 0,
    durationMs: swapSpotlightMs + selfSwapExchangeMs,
    tone: 'swap',
  });

  push(
    { kind: 'drawn' },
    slot,
    swappedInId ?? null,
    swappedInId !== undefined,
    selfSwapExchangeMs,
    exchangeStart,
    swappedInId !== undefined ? 'normal' : 'hiddenSwap',
    1,
  );
  push(
    slot,
    { kind: 'discard' },
    event.discardedCardId,
    true,
    selfSwapExchangeMs,
    exchangeStart,
    'discardReadable',
    2,
  );

  cues.push({
    type: 'discardPulse',
    delayMs: exchangeStart + selfSwapExchangeMs,
    durationMs: swapSettleMs,
  });

  const name = toastName(view, event.playerId);
  const card = cardLabel(view, event.discardedCardId);
  toasts.push({
    id: `${batchId}:swap:${event.playerId}`,
    delayMs: exchangeStart + selfSwapExchangeMs,
    message: t('game.flight.swapDiscardToast', { name, card }),
  });
}

export function planOpponentSwap(
  push: FlightPushFn,
  cues: ChoreographyCue[],
  toasts: ToastCue[],
  view: PlayerView,
  batchId: string,
  event: Extract<GameEvent, { type: 'card_swapped' }>,
): void {
  const { playerId, handIndex, discardedCardId } = event;
  const slot = opponentSlot(playerId, handIndex);
  const exchangeStart = swapFocusMs + swapSpotlightMs;

  cues.push({
    type: 'actorFocus',
    playerId,
    delayMs: 0,
    durationMs: swapFocusMs,
  });
  cues.push({
    type: 'spotlight',
    anchor: slot,
    delayMs: swapFocusMs,
    durationMs: swapSpotlightMs + opponentSwapExchangeMs + swapSettleMs,
    tone: 'swap',
  });

  push(
    slot,
    { kind: 'discard' },
    discardedCardId,
    true,
    opponentSwapExchangeMs,
    exchangeStart,
    'discardReadable',
    2,
  );
  push(
    opponentSeat(playerId),
    slot,
    null,
    false,
    opponentSwapExchangeMs,
    exchangeStart + swapInboundLagMs,
    'hiddenSwap',
    1,
  );

  cues.push({
    type: 'discardPulse',
    delayMs: exchangeStart + opponentSwapExchangeMs,
    durationMs: swapSettleMs,
  });

  const name = toastName(view, playerId);
  const card = cardLabel(view, discardedCardId);
  toasts.push({
    id: `${batchId}:swap:${playerId}`,
    delayMs: exchangeStart + opponentSwapExchangeMs,
    message: t('game.flight.swapDiscardToast', { name, card }),
  });
}

export function planLoneDiscard(
  push: FlightPushFn,
  cues: ChoreographyCue[],
  toasts: ToastCue[],
  view: PlayerView,
  batchId: string,
  event: Extract<GameEvent, { type: 'card_discarded' }>,
  self: boolean,
): void {
  const { playerId, cardId } = event;
  const name = toastName(view, playerId);
  const card = cardLabel(view, cardId);

  if (self) {
    push(
      { kind: 'drawn' },
      { kind: 'discard' },
      cardId,
      true,
      discardReadableMs,
      0,
      'discardReadable',
      1,
    );
    cues.push({
      type: 'discardPulse',
      delayMs: discardReadableMs,
      durationMs: swapSettleMs,
    });
    toasts.push({
      id: `${batchId}:discard:${cardId}`,
      delayMs: discardReadableMs,
      message: t('game.flight.discardToast', { name, card }),
    });
  } else {
    cues.push({
      type: 'actorFocus',
      playerId,
      delayMs: 0,
      durationMs: opponentDiscardFocusMs,
    });
    push(
      opponentSeat(playerId),
      { kind: 'discard' },
      cardId,
      true,
      discardReadableMs,
      opponentDiscardFocusMs,
      'discardReadable',
      1,
    );
    cues.push({
      type: 'discardPulse',
      delayMs: opponentDiscardFocusMs + discardReadableMs,
      durationMs: swapSettleMs,
    });
    toasts.push({
      id: `${batchId}:discard:${cardId}`,
      delayMs: opponentDiscardFocusMs + discardReadableMs,
      message: t('game.flight.discardToast', { name, card }),
    });
  }
}

export function planMatchDiscardToasts(
  toasts: ToastCue[],
  view: PlayerView,
  batchId: string,
  eventIndex: number,
  event: Extract<GameEvent, { type: 'match_succeeded' }>,
  toastDelayMs: number,
): void {
  const name = toastName(view, event.playerId);
  const [cardA, cardB] = event.discardedCardIds;
  const cat = view.catalog;

  if (event.kind === 'hand' && cardA && cardB) {
    const rankA = cat[cardA]?.rank;
    const rankB = cat[cardB]?.rank;
    if (rankA !== undefined && rankA === rankB) {
      toasts.push({
        id: `${batchId}:match:${eventIndex}:pair`,
        delayMs: toastDelayMs,
        message: t('game.flight.matchDiscardPairToast', {
          name,
          rank: rankLabel(rankA),
        }),
      });
      return;
    }
    toasts.push({
      id: `${batchId}:match:${eventIndex}:a`,
      delayMs: toastDelayMs,
      message: t('game.flight.matchDiscardToast', { name, card: cardLabel(view, cardA) }),
    });
    toasts.push({
      id: `${batchId}:match:${eventIndex}:b`,
      delayMs: toastDelayMs,
      message: t('game.flight.matchDiscardToast', { name, card: cardLabel(view, cardB) }),
    });
    return;
  }

  const cardId = event.discardedCardIds[0];
  if (!cardId) return;
  toasts.push({
    id: `${batchId}:match:${eventIndex}`,
    delayMs: toastDelayMs,
    message: t('game.flight.matchDiscardToast', { name, card: cardLabel(view, cardId) }),
  });
}

// ─── Announcement toasts for events that previously had no text feedback ─────

export function planMatchFailedToast(
  toasts: ToastCue[],
  view: PlayerView,
  batchId: string,
  eventIndex: number,
  event: Extract<GameEvent, { type: 'match_failed' }>,
): void {
  const name = toastName(view, event.playerId);
  toasts.push({
    id: `${batchId}:matchfail:${eventIndex}`,
    delayMs: flightShakeMs,
    message:
      event.reason === 'min_hand_size'
        ? t('game.flight.matchFailMinHand', { name })
        : t('game.flight.matchFailWrongRank', { name }),
  });
}

export function planPowerActivatedFeedback(
  cues: ChoreographyCue[],
  toasts: ToastCue[],
  view: PlayerView,
  batchId: string,
  eventIndex: number,
  event: Extract<GameEvent, { type: 'power_activated' }>,
): void {
  toasts.push({
    id: `${batchId}:power:${eventIndex}`,
    delayMs: 0,
    message: t('game.flight.powerToast', {
      name: toastName(view, event.playerId),
      power: t(`game.power.${event.power}`),
    }),
  });

  // Pull the eye to the seat that just unlocked a power.
  if (event.playerId !== view.self) {
    cues.push({
      type: 'actorFocus',
      playerId: event.playerId,
      delayMs: 0,
      durationMs: swapFocusMs,
    });
  }
}

/**
 * Announce power peeks by other players, with a spotlight on the targeted
 * slot so the eye lands where the information leaked. The local player
 * already sees their own reveal overlay, so self-acting events are silent.
 */
export function planPeekedFeedback(
  cues: ChoreographyCue[],
  toasts: ToastCue[],
  view: PlayerView,
  batchId: string,
  eventIndex: number,
  event: Extract<GameEvent, { type: 'peeked' }>,
): void {
  if (event.playerId === view.self) return;
  const name = toastName(view, event.playerId);
  const message =
    event.targetPlayer === event.playerId
      ? t('game.flight.peekSelfToast', { name })
      : event.targetPlayer === view.self
        ? t('game.flight.peekYourCardToast', { name })
        : t('game.flight.peekOpponentToast', {
            name,
            target: toastName(view, event.targetPlayer),
          });
  toasts.push({ id: `${batchId}:peeked:${eventIndex}`, delayMs: 0, message });

  cues.push({
    type: 'spotlight',
    anchor:
      event.targetPlayer === view.self
        ? ownSlot(event.handIndex)
        : opponentSlot(event.targetPlayer, event.handIndex),
    delayMs: 0,
    durationMs: swapSpotlightMs + swapSettleMs,
    tone: 'swap',
  });
}

export function planBlindSwapToast(
  toasts: ToastCue[],
  view: PlayerView,
  batchId: string,
  eventIndex: number,
  event: Extract<GameEvent, { type: 'swapped_blind' }>,
  delayMs: number,
): void {
  const name = toastName(view, event.playerId);
  const message =
    event.targetPlayer === view.self
      ? t('game.flight.blindSwapYouToast', { name })
      : t('game.flight.blindSwapToast', {
          name,
          target: toastName(view, event.targetPlayer),
        });
  toasts.push({ id: `${batchId}:blindswap:${eventIndex}`, delayMs, message });
}

export function planReshuffledFeedback(
  cues: ChoreographyCue[],
  toasts: ToastCue[],
  batchId: string,
  eventIndex: number,
): void {
  toasts.push({
    id: `${batchId}:reshuffle:${eventIndex}`,
    delayMs: 0,
    message: t('game.flight.reshuffledToast'),
  });
  cues.push({ type: 'discardPulse', delayMs: 0, durationMs: swapSettleMs });
}

export function addMatchSpotlights(
  cues: ChoreographyCue[],
  self: boolean,
  playerId: PlayerId,
  slotIndices: ReadonlyArray<number>,
  delayMs: number,
  durationMs: number,
): void {
  for (const index of slotIndices) {
    cues.push({
      type: 'spotlight',
      anchor: self ? ownSlot(index) : opponentSlot(playerId, index),
      delayMs,
      durationMs,
      tone: 'match',
    });
  }
}

export { flightShakeMs, matchDiscardMs, discardReadableMs };
