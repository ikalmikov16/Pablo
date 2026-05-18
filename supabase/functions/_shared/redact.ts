/**
 * Per-player event redaction.
 *
 * This module is PURE TypeScript — no Deno APIs, no Supabase imports.
 * It runs under both Deno (edge functions) and Bun (unit tests).
 *
 * Redaction table (from docs/SCHEMA.md "Hidden-info contract"):
 *   - peeked where event.playerId !== viewerUid: replace cardId with null
 *   - all other event types: pass through unchanged
 */

import type { CardId, GameEvent } from '@pablo/engine';

type PeekedEvent = Extract<GameEvent, { readonly type: 'peeked' }>;

/** A peeked event whose cardId has been redacted for a non-peeking viewer. */
export type RedactedPeekedEvent = Omit<PeekedEvent, 'cardId'> & {
  readonly cardId: CardId | null;
};

export type MaybeRedactedEvent = Exclude<GameEvent, PeekedEvent> | RedactedPeekedEvent;

/**
 * Returns a copy of the event list with `peeked.cardId` stripped for
 * any peeked event where the peeker is not the viewer.
 *
 * The input array is never mutated.
 */
export function redactEventsFor(
  viewerUid: string,
  events: ReadonlyArray<GameEvent>,
): ReadonlyArray<MaybeRedactedEvent> {
  return events.map((event): MaybeRedactedEvent => {
    if (event.type === 'peeked' && event.playerId !== viewerUid) {
      return { ...event, cardId: null };
    }
    return event as MaybeRedactedEvent;
  });
}
