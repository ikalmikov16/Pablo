import type { GameState, Move, PlayerId } from './types';

/**
 * Return the list of legal moves for `playerId` in the current state.
 *
 * Used by the UI to enable/disable controls and by bot opponents.
 *
 * Key changes from Phase 2:
 *  - Handles peek_phase (choose_peek enumerations).
 *  - Off-turn call_pablo: any non-current player in a 'playing' idle state
 *    may call Pablo while pabloCalledBy===null, drawn===null,
 *    and pendingPower===null.
 *  - Hand sizes are read from state (variable, not fixed 4).
 *  - No draw_from_discard.
 *  - New move types: match_drawn, match_hand, match_discard.
 */
export function legalMoves(state: GameState, playerId: PlayerId): ReadonlyArray<Move> {
  if (state.status === 'ended') return [];

  // ------------------------------------------------------------------
  // Peek phase: choose_peek for players who haven't peeked yet.
  // ------------------------------------------------------------------
  if (state.status === 'peek_phase') {
    if (!state.players.includes(playerId)) return [];
    const myKnowledge = state.knownCards[playerId]?.[playerId] ?? {};
    const alreadyPeekedCount = Object.keys(myKnowledge).length;
    const peekCount = state.rules.initialPeekCount;
    if (alreadyPeekedCount >= peekCount) return []; // already peeked the quota

    const hand = state.hands[playerId]!;
    const indices = Array.from({ length: hand.length }, (_, i) => i);

    // The atomic `choose_peek` is only legal when the player hasn't peeked
    // any cards yet (i.e. fresh hand). For partial peeks, only individual
    // `peek_one` moves are legal — the engine doesn't accept a `choose_peek`
    // that would overlap existing knowledge.
    const moves: Move[] = [];

    if (alreadyPeekedCount === 0) {
      for (const combo of combinations(indices, peekCount)) {
        moves.push({ type: 'choose_peek', playerId, indices: combo });
      }
    }

    // Incremental `peek_one` is always legal until the quota fills, for any
    // slot the player doesn't yet know.
    for (const idx of indices) {
      if (myKnowledge[idx] !== undefined) continue;
      moves.push({ type: 'peek_one', playerId, handIndex: idx });
    }

    return moves;
  }

  // ------------------------------------------------------------------
  // Playing phase.
  // ------------------------------------------------------------------
  const isCurrentPlayer = state.players[state.turnIndex] === playerId;
  const hand = state.hands[playerId] ?? [];
  const handSize = hand.length;

  // Power-pending: only the current player may resolve or skip.
  if (state.pendingPower !== null) {
    if (!isCurrentPlayer) return [];

    const { power } = state.pendingPower;
    const moves: Move[] = [];

    if (power === 'peek_self') {
      for (let i = 0; i < handSize; i++) {
        moves.push({ type: 'use_peek_self', playerId, handIndex: i });
      }
    }

    if (power === 'peek_opponent') {
      for (const opponent of state.players) {
        if (opponent === playerId) continue;
        const oppHandSize = (state.hands[opponent] ?? []).length;
        for (let i = 0; i < oppHandSize; i++) {
          moves.push({
            type: 'use_peek_opponent',
            playerId,
            targetPlayer: opponent,
            targetHandIndex: i,
          });
        }
      }
    }

    if (power === 'swap_blind') {
      for (let selfIdx = 0; selfIdx < handSize; selfIdx++) {
        for (const opponent of state.players) {
          if (opponent === playerId) continue;
          const oppHandSize = (state.hands[opponent] ?? []).length;
          for (let oppIdx = 0; oppIdx < oppHandSize; oppIdx++) {
            moves.push({
              type: 'use_swap_blind',
              playerId,
              selfHandIndex: selfIdx,
              targetPlayer: opponent,
              targetHandIndex: oppIdx,
            });
          }
        }
      }
    }

    moves.push({ type: 'skip_power', playerId });
    return moves;
  }

  // Mid-draw: only the current player may resolve. Off-turn Pablo is blocked.
  if (state.drawn !== null) {
    if (!isCurrentPlayer) return [];

    const moves: Move[] = [];
    for (let i = 0; i < handSize; i++) {
      moves.push({ type: 'swap_drawn', playerId, handIndex: i });
    }
    moves.push({ type: 'discard_drawn', playerId });
    for (let i = 0; i < handSize; i++) {
      moves.push({ type: 'match_drawn', playerId, handIndex: i });
    }
    return moves;
  }

  // Idle: current player gets turn moves; non-current gets off-turn Pablo.
  if (isCurrentPlayer) {
    const moves: Move[] = [];

    moves.push({ type: 'draw_from_deck', playerId });

    // match_hand: all unordered pairs of own slots.
    for (let a = 0; a < handSize - 1; a++) {
      for (let b = a + 1; b < handSize; b++) {
        moves.push({ type: 'match_hand', playerId, handIndexA: a, handIndexB: b });
      }
    }

    // match_discard: one per slot (only if discard is non-empty).
    if (state.discard.length > 0) {
      for (let i = 0; i < handSize; i++) {
        moves.push({ type: 'match_discard', playerId, handIndex: i });
      }
    }

    if (state.pabloCalledBy === null) {
      moves.push({ type: 'call_pablo', playerId });
    }

    return moves;
  }

  // Non-current player in idle state: only off-turn call_pablo.
  if (!state.players.includes(playerId)) return [];
  if (state.pabloCalledBy === null) {
    return [{ type: 'call_pablo', playerId }];
  }
  return [];
}

/** Generate all k-combinations from an array (order within each combo is preserved). */
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first!, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}
