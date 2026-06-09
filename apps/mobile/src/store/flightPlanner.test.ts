import { beforeEach, describe, expect, test } from 'bun:test';
import {
  DEFAULT_RULES,
  applyMove,
  computePlayerView,
  legalMoves,
  newGame,
  type GameEvent,
  type PlayerView,
} from '@pablo/engine';

import { tokens } from '../design/tokens';
import { getAnchorSnapshot, registerAnchor, resetAnchorRegistryForTests } from './anchorRegistry';
import {
  applyFlightStagger,
  collectDiscardToastCards,
  planFlights,
  resetFlightIdSeqForTests,
} from './flightPlanner';
import type { Flight } from './flightTypes';
import type { Rect } from './flightTypes';

const HUMAN = 'human';
const BOT = 'bot:1';

const R: Rect = { x: 10, y: 20, w: 52, h: 76 };

function registerStandardAnchors(view: PlayerView) {
  resetAnchorRegistryForTests();
  registerAnchor({ kind: 'deck' }, R);
  registerAnchor({ kind: 'discard' }, { ...R, x: 80 });
  registerAnchor({ kind: 'drawn' }, { ...R, x: 140 });
  const self = view.players.find((p) => p.id === view.self);
  const ownSize = self?.handSize ?? 4;
  for (let i = 0; i < ownSize; i++) {
    registerAnchor({ kind: 'ownSlot', index: i }, { ...R, x: 200 + i * 60 });
  }
  for (const p of view.players) {
    if (p.id === view.self) continue;
    registerAnchor({ kind: 'opponentSeat', playerId: p.id }, { ...R, x: 400 });
    for (let i = 0; i < p.handSize; i++) {
      registerAnchor(
        { kind: 'opponentSlot', playerId: p.id, index: i },
        {
          ...R,
          x: 500 + i * 60,
        },
      );
    }
  }
}

function playingGame() {
  let state = newGame({
    id: 'g1',
    players: [HUMAN, BOT],
    seed: 'flight-test',
    rules: DEFAULT_RULES,
  });
  for (const p of state.players) {
    const peek = legalMoves(state, p).find((m) => m.type === 'choose_peek');
    if (peek) {
      const r = applyMove(state, peek);
      if (r.ok) state = r.state;
    }
  }
  return state;
}

function viewAfter(state: ReturnType<typeof playingGame>, move: Parameters<typeof applyMove>[1]) {
  const result = applyMove(state, move);
  if (!result.ok) throw new Error('move failed');
  const view = computePlayerView(result.state, HUMAN);
  registerStandardAnchors(view);
  return { view, events: result.events };
}

beforeEach(() => {
  resetFlightIdSeqForTests();
});

describe('collectDiscardToastCards', () => {
  test('dedupes card_swapped and card_discarded for same card', () => {
    const batch: ReadonlyArray<GameEvent> = [
      {
        type: 'card_swapped',
        playerId: HUMAN,
        handIndex: 0,
        discardedCardId: 'c-old',
      },
      { type: 'card_discarded', cardId: 'c-old', playerId: HUMAN },
    ];
    const cards = collectDiscardToastCards(batch);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.cardId).toBe('c-old');
  });
});

describe('planFlights', () => {
  test('self card_drawn flies deck to drawn face-up', () => {
    const state = playingGame();
    const draw = legalMoves(state, HUMAN).find((m) => m.type === 'draw_from_deck');
    if (!draw) throw new Error('no draw');
    const { view, events } = viewAfter(state, draw);
    const plan = planFlights(events, view, getAnchorSnapshot(), {
      batchId: 'batch-1',
      version: 1,
      batchSeq: 1,
    });
    expect(plan.flights).toHaveLength(1);
    expect(plan.flights[0]?.fromAnchor).toEqual({ kind: 'deck' });
    expect(plan.flights[0]?.toAnchor).toEqual({ kind: 'drawn' });
    expect(plan.flights[0]?.faceUp).toBe(true);
    expect(plan.flights[0]?.durationMs).toBe(tokens.game.duration.flightFast);
    expect(plan.flights[0]?.flipMidFlight).toBe(true);
    expect(plan.flights[0]?.liftEnabled).toBe(true);
  });

  test('applyFlightStagger offsets co-scheduled flights', () => {
    const flights: Flight[] = [
      {
        id: 'a',
        batchId: 'b',
        fromAnchor: { kind: 'deck' },
        toAnchor: { kind: 'discard' },
        fromCoords: R,
        toCoords: R,
        cardId: null,
        faceUp: false,
        durationMs: 320,
        delayMs: 100,
        emphasis: 'normal',
        zRank: 1,
        liftEnabled: true,
        flipMidFlight: false,
      },
      {
        id: 'b',
        batchId: 'b',
        fromAnchor: { kind: 'deck' },
        toAnchor: { kind: 'discard' },
        fromCoords: R,
        toCoords: R,
        cardId: null,
        faceUp: false,
        durationMs: 320,
        delayMs: 100,
        emphasis: 'normal',
        zRank: 2,
        liftEnabled: true,
        flipMidFlight: false,
      },
    ];
    const staggered = applyFlightStagger(flights);
    expect(staggered[0]?.delayMs).toBe(100);
    expect(staggered[1]?.delayMs).toBe(100 + tokens.game.motion.stagger);
  });

  test('match_failed has no flight; penalty is delayed', () => {
    let state = playingGame();
    const draw = legalMoves(state, HUMAN).find((m) => m.type === 'draw_from_deck');
    if (!draw) throw new Error('no draw');
    let r = applyMove(state, draw);
    if (!r.ok) throw new Error('draw failed');
    state = r.state;
    const drawnId = state.drawn!.cardId;
    const drawnRank = state.cardCatalog[drawnId]!.rank;

    const hand = state.hands[HUMAN]!;
    let targetIdx = 0;
    for (let i = 0; i < hand.length; i++) {
      if (state.cardCatalog[hand[i]!]!.rank !== drawnRank) {
        targetIdx = i;
        break;
      }
    }

    r = applyMove(state, {
      type: 'match_drawn',
      playerId: HUMAN,
      handIndex: targetIdx,
    });
    if (!r.ok) throw new Error('match failed');
    expect(r.events.some((e) => e.type === 'match_failed')).toBe(true);
    expect(r.events.some((e) => e.type === 'penalty_card_dealt')).toBe(true);
    const view = computePlayerView(r.state, HUMAN);
    registerStandardAnchors(view);
    const plan = planFlights(r.events, view, getAnchorSnapshot(), {
      batchId: 'batch-2',
      version: 2,
      batchSeq: 2,
    });
    const penalty = plan.flights.find((f) => f.toAnchor.kind === 'ownSlot');
    expect(penalty).toBeDefined();
    expect(penalty?.faceUp).toBe(false);
    expect(penalty?.delayMs).toBe(tokens.game.duration.flightShakeMs);
    expect(
      plan.flights.some((f) => f.fromAnchor.kind === 'ownSlot' && f.toAnchor.kind === 'discard'),
    ).toBe(false);
  });

  test('swapped_blind stays face-down', () => {
    let state = playingGame();
    const draw = legalMoves(state, HUMAN).find((m) => m.type === 'draw_from_deck');
    if (!draw) throw new Error('no draw');
    let r = applyMove(state, draw);
    if (!r.ok) throw new Error('draw');
    state = r.state;
    const discard = legalMoves(state, HUMAN).find((m) => m.type === 'discard_drawn');
    if (!discard) throw new Error('no discard');
    r = applyMove(state, discard);
    if (!r.ok) throw new Error('discard');
    state = r.state;
    if (state.pendingPower?.power !== 'swap_blind') return;

    const swap = legalMoves(state, HUMAN).find((m) => m.type === 'use_swap_blind');
    if (!swap || swap.type !== 'use_swap_blind') throw new Error('no swap');

    r = applyMove(state, swap);
    if (!r.ok) throw new Error('swap');
    const view = computePlayerView(r.state, HUMAN);
    registerStandardAnchors(view);
    const plan = planFlights(r.events, view, getAnchorSnapshot(), {
      batchId: 'batch-3',
      version: 3,
      batchSeq: 3,
    });
    expect(plan.flights.length).toBeGreaterThanOrEqual(2);
    expect(plan.flights.every((f) => f.faceUp === false)).toBe(true);
    expect(plan.flights[0]?.durationMs).toBe(tokens.game.duration.flightSlow);
  });

  test('no-flight events return empty', () => {
    const state = playingGame();
    const view = computePlayerView(state, HUMAN);
    registerStandardAnchors(view);
    const batch: ReadonlyArray<GameEvent> = [
      { type: 'pablo_called', playerId: BOT },
      { type: 'turn_ended', nextPlayer: HUMAN },
    ];
    const plan = planFlights(batch, view, getAnchorSnapshot(), {
      batchId: 'batch-4',
      version: 4,
      batchSeq: 4,
    });
    expect(plan.flights).toHaveLength(0);
  });

  test('opponent swap_discard stages actor focus, spotlight, readable discard, and delayed toast', () => {
    let state = playingGame();
    const humanDraw = legalMoves(state, HUMAN).find((m) => m.type === 'draw_from_deck');
    if (!humanDraw) throw new Error('no human draw');
    let r = applyMove(state, humanDraw);
    if (!r.ok) throw new Error('human draw');
    state = r.state;
    const humanDiscard = legalMoves(state, HUMAN).find((m) => m.type === 'discard_drawn');
    if (!humanDiscard) throw new Error('no human discard');
    r = applyMove(state, humanDiscard);
    if (!r.ok) throw new Error('human discard');
    state = r.state;

    const draw = legalMoves(state, BOT).find((m) => m.type === 'draw_from_deck');
    if (!draw) throw new Error('no bot draw');
    r = applyMove(state, draw);
    if (!r.ok) throw new Error('bot draw');
    state = r.state;
    const handIdx = 0;
    const swap = legalMoves(state, BOT).find(
      (m) => m.type === 'swap_drawn' && m.handIndex === handIdx,
    );
    if (!swap || swap.type !== 'swap_drawn') throw new Error('no swap');
    r = applyMove(state, swap);
    if (!r.ok) throw new Error('swap failed');
    const view = computePlayerView(r.state, HUMAN);
    registerStandardAnchors(view);
    const plan = planFlights(r.events, view, getAnchorSnapshot(), {
      batchId: 'batch-swap',
      version: 5,
      batchSeq: 5,
    });
    expect(plan.flights.some((f) => f.emphasis === 'discardReadable')).toBe(true);
    expect(plan.cues.some((c) => c.type === 'actorFocus' && c.playerId === BOT)).toBe(true);
    expect(plan.cues.some((c) => c.type === 'spotlight')).toBe(true);
    expect(plan.toasts.length).toBeGreaterThanOrEqual(1);
    expect(plan.totalDurationMs).toBeGreaterThan(tokens.game.duration.flightFast);
  });
});
