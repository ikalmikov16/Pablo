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
