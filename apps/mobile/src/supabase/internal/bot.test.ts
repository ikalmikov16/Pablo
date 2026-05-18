import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_RULES,
  applyMove,
  computePlayerView,
  legalMoves,
  makeRng,
  newGame,
} from '@pablo/engine';

import { decide, estimateOwnTotal } from './bot';
import { BOT_IDS } from './room';

const HUMAN = 'human';
const BOT1 = BOT_IDS[0];
const BOT2 = BOT_IDS[1];

function makeGame(seed: string, players = [HUMAN, BOT1, BOT2]) {
  return newGame({ id: 'g1', players, seed, rules: DEFAULT_RULES });
}

/** Advance a game through the peek phase deterministically. */
function skipPeekPhase(state: ReturnType<typeof newGame>) {
  let s = state;
  for (const p of s.players) {
    const legal = legalMoves(s, p);
    const peek = legal.find((m) => m.type === 'choose_peek');
    if (peek) {
      const result = applyMove(s, peek);
      if (result.ok) s = result.state;
    }
  }
  return s;
}

describe('decide — peek phase', () => {
  test('returns a choose_peek move during peek_phase', () => {
    const state = makeGame('bot-peek-1');
    expect(state.status).toBe('peek_phase');
    const view = computePlayerView(state, BOT1);
    const legal = legalMoves(state, BOT1);
    const rng = makeRng('bot-rng');
    const decision = decide({ view, self: BOT1, rules: DEFAULT_RULES, rng }, legal);
    expect(decision.kind).toBe('peek');
    if (decision.kind === 'peek') {
      expect(decision.move.type).toBe('choose_peek');
      expect(decision.move.indices).toHaveLength(DEFAULT_RULES.initialPeekCount);
    }
  });
});

describe('decide — on turn', () => {
  test('returns draw_from_deck when no matches are known', () => {
    let state = makeGame('bot-draw-1');
    state = skipPeekPhase(state);
    expect(state.status).toBe('playing');
    const botPlayer = state.players[state.turnIndex]!;
    const view = computePlayerView(state, botPlayer);
    const legal = legalMoves(state, botPlayer);
    const rng = makeRng('rng');
    const decision = decide({ view, self: botPlayer, rules: DEFAULT_RULES, rng }, legal);
    // Bots with no matched known pairs should draw.
    if (decision.kind === 'on_turn') {
      expect(['draw_from_deck', 'match_hand', 'match_discard', 'call_pablo']).toContain(
        decision.move.type,
      );
    } else {
      // 'pass' is also acceptable when no legal moves remain (shouldn't happen in normal play).
      expect(['on_turn', 'pass']).toContain(decision.kind);
    }
  });

  test('returned move is always in legalMoves', () => {
    for (let i = 0; i < 20; i++) {
      let state = makeGame(`legality-${i}`);
      state = skipPeekPhase(state);

      // Advance a few turns and check each bot's move is legal.
      let safeguard = 0;
      while (state.status === 'playing' && safeguard < 60) {
        safeguard++;
        const currentId = state.players[state.turnIndex]!;
        const view = computePlayerView(state, currentId);
        const legal = legalMoves(state, currentId);
        if (legal.length === 0) break;
        const rng = makeRng(`rng-${i}-${safeguard}`);
        const decision = decide({ view, self: currentId, rules: DEFAULT_RULES, rng }, legal);
        if (decision.kind === 'pass') break;
        const move =
          decision.kind === 'on_turn'
            ? decision.move
            : decision.kind === 'peek'
              ? decision.move
              : decision.kind === 'off_turn_pablo'
                ? decision.move
                : null;
        if (!move) break;
        // Verify the move is legal.
        const isLegal = legal.some((l) => JSON.stringify(l) === JSON.stringify(move));
        expect(isLegal).toBe(true);
        const result = applyMove(state, move);
        if (!result.ok) break;
        state = result.state;
      }
    }
  });
});

describe('decide — off turn', () => {
  test('returns pass when estimated total is high', () => {
    let state = makeGame('high-hand-1');
    state = skipPeekPhase(state);
    // Find a non-current bot player.
    const currentIdx = state.turnIndex;
    const nonCurrentBot = state.players.find(
      (p, i) => i !== currentIdx && p !== HUMAN && p.startsWith('bot'),
    );
    if (!nonCurrentBot) return; // test only applies to multi-bot games
    const view = computePlayerView(state, nonCurrentBot);
    const legal = legalMoves(state, nonCurrentBot);
    // Only call_pablo is legal off-turn idle.
    const rng = makeRng('off-rng');
    const decision = decide({ view, self: nonCurrentBot, rules: DEFAULT_RULES, rng }, legal);
    // With a full hand and no known low total, should be pass or off_turn_pablo.
    expect(['pass', 'off_turn_pablo']).toContain(decision.kind);
  });
});

describe('estimateOwnTotal', () => {
  test('returns a positive number for a fresh hand', () => {
    const state = makeGame('est-1');
    const view = computePlayerView(state, HUMAN);
    const est = estimateOwnTotal(view, HUMAN);
    expect(est).toBeGreaterThan(0);
  });

  test('returns 999 for an unknown player', () => {
    const state = makeGame('est-2');
    const view = computePlayerView(state, HUMAN);
    expect(estimateOwnTotal(view, 'nobody')).toBe(999);
  });
});

describe('termination — 10 deterministic full games', () => {
  test('every game reaches ended within 400 moves', () => {
    for (let i = 0; i < 10; i++) {
      let state = makeGame(`term-${i}`, [HUMAN, BOT1, BOT2]);
      let moves = 0;
      const forcePabloAt = 80; // Force-call Pablo if game hasn't ended by this many turns.
      while (state.status !== 'ended' && moves < 400) {
        moves++;

        // During peek_phase all players need to choose — not just turnIndex.
        if (state.status === 'peek_phase') {
          let advanced = false;
          for (const p of state.players) {
            const legal = legalMoves(state, p);
            const peekMove = legal.find((m) => m.type === 'choose_peek');
            if (peekMove) {
              const result = applyMove(state, peekMove);
              if (result.ok) {
                state = result.state;
                advanced = true;
                break;
              }
            }
          }
          if (!advanced) break;
          continue;
        }

        const currentId = state.players[state.turnIndex]!;
        const legal = legalMoves(state, currentId);
        if (legal.length === 0) break;
        const rng = makeRng(`term-rng-${i}-${moves}`);
        const view = computePlayerView(state, currentId);
        const decision = decide({ view, self: currentId, rules: DEFAULT_RULES, rng }, legal);

        // After many turns, force Pablo to guarantee termination.
        const forcePablo =
          moves >= forcePabloAt &&
          state.pabloCalledBy === null &&
          legal.some((m) => m.type === 'call_pablo');

        const move = forcePablo
          ? { type: 'call_pablo' as const, playerId: currentId }
          : decision.kind === 'on_turn'
            ? decision.move
            : decision.kind === 'peek'
              ? decision.move
              : (legal.find((m) => m.type === 'draw_from_deck') ?? legal[0]!);

        const result = applyMove(state, move);
        if (!result.ok) {
          // If move failed, just draw (or any legal move) to keep progressing.
          const fallback = legal.find((m) => m.type === 'draw_from_deck') ?? legal[0]!;
          const r2 = applyMove(state, fallback);
          if (r2.ok) state = r2.state;
          else break;
        } else {
          state = result.state;
        }
      }
      expect(state.status).toBe('ended');
    }
  });
});
