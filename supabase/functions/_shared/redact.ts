/**
 * Per-player event redaction.
 *
 * This module is PURE TypeScript — no Deno APIs, no Supabase imports.
 * It runs under both Deno (edge functions) and Bun (unit tests).
 *
 * Redaction table (from docs/SCHEMA.md "Hidden-info contract"):
 *   - peeked where event.playerId !== viewerUid: replace cardId with null
 *   - peek_one_chosen where event.playerId !== viewerUid: replace cardId
 *     AND handIndex with null (initial-peek picks are private — both the
 *     card identity and the chosen index; see GAME_LOGIC.md "Peek phase")
 *   - all other event types: pass through unchanged
 */

import type { CardId, GameEvent } from '@pablo/engine';

type PeekedEvent = Extract<GameEvent, { readonly type: 'peeked' }>;
type PeekOneChosenEvent = Extract<GameEvent, { readonly type: 'peek_one_chosen' }>;

/** A peeked event whose cardId has been redacted for a non-peeking viewer. */
export type RedactedPeekedEvent = Omit<PeekedEvent, 'cardId'> & {
  readonly cardId: CardId | null;
};

/** A peek_one_chosen event fully redacted for a non-peeking viewer. */
export type RedactedPeekOneChosenEvent = Omit<PeekOneChosenEvent, 'cardId' | 'handIndex'> & {
  readonly cardId: CardId | null;
  readonly handIndex: number | null;
};

export type MaybeRedactedEvent =
  | Exclude<GameEvent, PeekedEvent | PeekOneChosenEvent>
  | RedactedPeekedEvent
  | RedactedPeekOneChosenEvent;

/**
 * Returns a copy of the event list with private peek payloads stripped for
 * any peek event where the peeker is not the viewer.
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
    if (event.type === 'peek_one_chosen' && event.playerId !== viewerUid) {
      return { ...event, cardId: null, handIndex: null };
    }
    return event as MaybeRedactedEvent;
  });
}
