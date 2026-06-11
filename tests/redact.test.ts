/**
 * Unit tests for the per-player event redaction helper.
 * Pure bun test — no Deno, no Supabase.
 */

import { describe, expect, test } from 'bun:test';
import type { GameEvent } from '@pablo/engine';
import { redactEventsFor } from '../supabase/functions/_shared/redact.ts';

const VIEWER = 'player-A';
const OTHER = 'player-B';

const peekedByViewer: GameEvent = {
  type: 'peeked',
  playerId: VIEWER,
  targetPlayer: OTHER,
  handIndex: 0,
  cardId: '07H',
};

const peekedByOther: GameEvent = {
  type: 'peeked',
  playerId: OTHER,
  targetPlayer: VIEWER,
  handIndex: 1,
  cardId: '13S',
};

describe('redactEventsFor', () => {
  test('peeked by viewer passes through with cardId intact', () => {
    const result = redactEventsFor(VIEWER, [peekedByViewer]);
    expect(result).toHaveLength(1);
    const ev = result[0] as typeof peekedByViewer;
    expect(ev.cardId).toBe('07H');
  });

  test('peeked by other gets cardId replaced with null', () => {
    const result = redactEventsFor(VIEWER, [peekedByOther]);
    expect(result).toHaveLength(1);
    const ev = result[0] as { cardId: unknown };
    expect(ev.cardId).toBeNull();
  });

  test('card_drawn passes through unchanged', () => {
    const ev: GameEvent = { type: 'card_drawn', playerId: OTHER, from: 'deck' };
    const result = redactEventsFor(VIEWER, [ev]);
    expect(result[0]).toEqual(ev);
  });

  test('card_discarded passes through unchanged', () => {
    const ev: GameEvent = { type: 'card_discarded', cardId: '05D', playerId: OTHER };
    const result = redactEventsFor(VIEWER, [ev]);
    expect(result[0]).toEqual(ev);
  });

  test('card_swapped passes through unchanged', () => {
    const ev: GameEvent = {
      type: 'card_swapped',
      playerId: OTHER,
      handIndex: 0,
      discardedCardId: '03C',
    };
    const result = redactEventsFor(VIEWER, [ev]);
    expect(result[0]).toEqual(ev);
  });

  test('pablo_called passes through unchanged', () => {
    const ev: GameEvent = { type: 'pablo_called', playerId: OTHER };
    const result = redactEventsFor(VIEWER, [ev]);
    expect(result[0]).toEqual(ev);
  });

  test('turn_ended passes through unchanged', () => {
    const ev: GameEvent = { type: 'turn_ended', nextPlayer: VIEWER };
    const result = redactEventsFor(VIEWER, [ev]);
    expect(result[0]).toEqual(ev);
  });

  test('deck_reshuffled passes through unchanged', () => {
    const ev: GameEvent = { type: 'deck_reshuffled' };
    const result = redactEventsFor(VIEWER, [ev]);
    expect(result[0]).toEqual(ev);
  });

  test('round_ended passes through unchanged', () => {
    const ev: GameEvent = {
      type: 'round_ended',
      scores: { [VIEWER]: 5, [OTHER]: 10 },
      winners: [VIEWER],
    };
    const result = redactEventsFor(VIEWER, [ev]);
    expect(result[0]).toEqual(ev);
  });

  test('power_activated passes through unchanged', () => {
    const ev: GameEvent = { type: 'power_activated', rank: 7, power: 'peek_self', playerId: OTHER };
    const result = redactEventsFor(VIEWER, [ev]);
    expect(result[0]).toEqual(ev);
  });

  test('peek_chosen passes through unchanged', () => {
    const ev: GameEvent = { type: 'peek_chosen', playerId: OTHER };
    const result = redactEventsFor(VIEWER, [ev]);
    expect(result[0]).toEqual(ev);
  });

  test('peek_one_chosen by viewer passes through with cardId and handIndex intact', () => {
    const ev: GameEvent = {
      type: 'peek_one_chosen',
      playerId: VIEWER,
      handIndex: 2,
      cardId: '09D',
    };
    const result = redactEventsFor(VIEWER, [ev]);
    const out = result[0] as { cardId: unknown; handIndex: unknown };
    expect(out.cardId).toBe('09D');
    expect(out.handIndex).toBe(2);
  });

  test('peek_one_chosen by other gets cardId AND handIndex replaced with null', () => {
    const ev: GameEvent = {
      type: 'peek_one_chosen',
      playerId: OTHER,
      handIndex: 3,
      cardId: '11C',
    };
    const result = redactEventsFor(VIEWER, [ev]);
    const out = result[0] as {
      type: string;
      playerId: string;
      cardId: unknown;
      handIndex: unknown;
    };
    expect(out.type).toBe('peek_one_chosen');
    expect(out.playerId).toBe(OTHER);
    expect(out.cardId).toBeNull();
    expect(out.handIndex).toBeNull();
  });

  test('peek_phase_ended passes through unchanged', () => {
    const ev: GameEvent = { type: 'peek_phase_ended' };
    const result = redactEventsFor(VIEWER, [ev]);
    expect(result[0]).toEqual(ev);
  });

  test('match_succeeded passes through unchanged', () => {
    const ev: GameEvent = {
      type: 'match_succeeded',
      playerId: OTHER,
      kind: 'drawn',
      slotIndices: [0],
      discardedCardIds: ['07H'],
    };
    const result = redactEventsFor(VIEWER, [ev]);
    expect(result[0]).toEqual(ev);
  });

  test('match_failed passes through unchanged', () => {
    const ev: GameEvent = {
      type: 'match_failed',
      playerId: OTHER,
      kind: 'discard',
      slotIndices: [1],
      reason: 'wrong_rank',
    };
    const result = redactEventsFor(VIEWER, [ev]);
    expect(result[0]).toEqual(ev);
  });

  test('penalty_card_dealt passes through unchanged', () => {
    const ev: GameEvent = { type: 'penalty_card_dealt', playerId: VIEWER };
    const result = redactEventsFor(VIEWER, [ev]);
    expect(result[0]).toEqual(ev);
  });

  test('swapped_blind passes through unchanged', () => {
    const ev: GameEvent = {
      type: 'swapped_blind',
      playerId: OTHER,
      selfHandIndex: 0,
      targetPlayer: VIEWER,
      targetHandIndex: 2,
    };
    const result = redactEventsFor(VIEWER, [ev]);
    expect(result[0]).toEqual(ev);
  });

  test('order of events is preserved', () => {
    const events: GameEvent[] = [
      peekedByViewer,
      peekedByOther,
      { type: 'turn_ended', nextPlayer: OTHER },
      peekedByViewer,
    ];
    const result = redactEventsFor(VIEWER, events);
    expect(result).toHaveLength(4);
    // viewer's own peeked events: cardId preserved
    expect((result[0] as { cardId: unknown }).cardId).toBe('07H');
    expect((result[3] as { cardId: unknown }).cardId).toBe('07H');
    // other's peeked event: redacted
    expect((result[1] as { cardId: unknown }).cardId).toBeNull();
    // non-peeked event: unchanged
    expect(result[2]).toEqual({ type: 'turn_ended', nextPlayer: OTHER });
  });

  test('input array is not mutated', () => {
    const events: GameEvent[] = [peekedByOther];
    const original = JSON.stringify(events);
    redactEventsFor(VIEWER, events);
    expect(JSON.stringify(events)).toBe(original);
  });
});
