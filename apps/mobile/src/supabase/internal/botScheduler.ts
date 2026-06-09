/**
 * Bot scheduler — drives bot moves after each state change.
 *
 * After every applyAndFanout, `kick()` is called. It serialises bot moves:
 * one bot makes a move per tick until the human is up or the game ends.
 *
 * Tests inject a synchronous scheduler for deterministic results.
 */

import {
  type GameState,
  type PlayerId,
  applyMove,
  computePlayerView,
  legalMoves,
  makeRng,
} from '@pablo/engine';

type Rng = ReturnType<typeof makeRng>;
import type { Scheduler } from './clock';
import type { BotContext } from './bot';
import { decide, estimateOwnTotal } from './bot';
import { tokens } from '../../design/tokens';
import type { GameRecord } from './viewStore';
import { applyAndFanout } from './viewStore';
import { isBotId } from './room';

const {
  botOnTurnDelayMs: ON_TURN_DELAY_MS,
  botPeekDelayMs: PEEK_DELAY_MS,
  botOffTurnPabloBaseMs: OFF_TURN_PABLO_BASE_MS,
  botOffTurnPabloJitterMs: OFF_TURN_PABLO_JITTER_MS,
} = tokens.game.duration;

export type BotRngs = Readonly<Record<PlayerId, Rng>>;

export function makeBotRngs(state: GameState): BotRngs {
  const result: Record<PlayerId, Rng> = {};
  for (const p of state.players) {
    if (isBotId(p)) {
      result[p] = makeRng(`${state.seed}:bot:${p}`);
    }
  }
  return result;
}

export type BotScheduler = {
  kick(record: GameRecord, rngs: BotRngs): void;
  cancelAll(record: GameRecord): void;
};

function runBotMove(
  scheduler: Scheduler,
  record: GameRecord,
  rngs: BotRngs,
  delayMs: number,
  _botId: PlayerId,
  ctx: BotContext,
  legal: ReturnType<typeof legalMoves>,
): void {
  const decision = decide(ctx, legal);
  if (decision.kind === 'pass') return;
  const move =
    decision.kind === 'on_turn'
      ? decision.move
      : decision.kind === 'off_turn_pablo'
        ? decision.move
        : decision.kind === 'peek'
          ? decision.move
          : null;
  if (!move) return;

  // Completed-callback handles are not removed from pendingBotHandles individually;
  // cancelAll clears the entire set. clearTimeout on an expired timer is a no-op.
  const handle = scheduler.setTimeout(() => {
    const result = applyMove(record.state, move);
    if (result.ok) {
      applyAndFanout(record, result.state, result.events);
    }
    kickInternal(scheduler, record, rngs);
  }, delayMs);
  record.pendingBotHandles.add(handle);
}

function kickInternal(scheduler: Scheduler, record: GameRecord, rngs: BotRngs): void {
  const { state } = record;
  if (state.status === 'ended') return;

  // Peek phase: schedule the first bot that still needs to peek.
  if (state.status === 'peek_phase') {
    for (const playerId of state.players) {
      if (!isBotId(playerId)) continue;
      const legal = legalMoves(state, playerId);
      if (legal.length === 0) continue;
      const rng = rngs[playerId];
      if (!rng) continue;
      const view = computePlayerView(state, playerId);
      const ctx: BotContext = { view, self: playerId, rules: state.rules, rng };
      runBotMove(scheduler, record, rngs, PEEK_DELAY_MS, playerId, ctx, legal);
      return; // one at a time; re-kick chains the rest
    }
    return;
  }

  // Playing: current player is a bot → schedule their on-turn move.
  const currentPlayer = state.players[state.turnIndex];
  if (currentPlayer && isBotId(currentPlayer)) {
    const legal = legalMoves(state, currentPlayer);
    const rng = rngs[currentPlayer];
    if (rng) {
      const view = computePlayerView(state, currentPlayer);
      const ctx: BotContext = { view, self: currentPlayer, rules: state.rules, rng };
      runBotMove(scheduler, record, rngs, ON_TURN_DELAY_MS, currentPlayer, ctx, legal);
    }
    return;
  }

  // Human is up — check if any bot wants to call Pablo off-turn.
  if (state.pabloCalledBy !== null) return;
  if (state.drawn !== null) return;
  if (state.pendingPower !== null) return;

  type Candidate = { readonly playerId: PlayerId; readonly est: number; readonly idx: number };
  const candidates: Candidate[] = [];

  for (let i = 0; i < state.players.length; i++) {
    const playerId = state.players[i]!;
    if (!isBotId(playerId)) continue;
    if (playerId === currentPlayer) continue;
    const legal = legalMoves(state, playerId);
    if (!legal.some((l) => l.type === 'call_pablo')) continue;
    const rng = rngs[playerId];
    if (!rng) continue;
    const view = computePlayerView(state, playerId);
    const ctx: BotContext = { view, self: playerId, rules: state.rules, rng };
    const decision = decide(ctx, legal);
    if (decision.kind === 'off_turn_pablo') {
      candidates.push({ playerId, est: estimateOwnTotal(view, playerId), idx: i });
    }
  }

  if (candidates.length === 0) return;
  candidates.sort((a, b) => a.est - b.est || a.idx - b.idx);
  const winner = candidates[0]!;
  const jitter = rngs[winner.playerId]?.nextInt(OFF_TURN_PABLO_JITTER_MS) ?? 0;
  const delayMs = OFF_TURN_PABLO_BASE_MS + jitter;
  const move = { type: 'call_pablo' as const, playerId: winner.playerId };
  const handle = scheduler.setTimeout(() => {
    const result = applyMove(record.state, move);
    if (result.ok) {
      applyAndFanout(record, result.state, result.events);
    }
    kickInternal(scheduler, record, rngs);
  }, delayMs);
  record.pendingBotHandles.add(handle);
}

export function makeBotScheduler(scheduler: Scheduler): BotScheduler {
  return {
    kick(record: GameRecord, rngs: BotRngs): void {
      kickInternal(scheduler, record, rngs);
    },
    cancelAll(record: GameRecord): void {
      for (const handle of record.pendingBotHandles) {
        scheduler.clearTimeout(handle);
      }
      record.pendingBotHandles.clear();
    },
  };
}
