import type { GameState, HandIndex, Move, PlayerId } from './types';

/**
 * Return the list of legal moves for `playerId` in the current state.
 *
 * Used by the UI to enable/disable controls and by bot opponents.
 * Returns an empty array if it is not this player's turn, or if the game
 * has ended.
 */
export function legalMoves(state: GameState, playerId: PlayerId): ReadonlyArray<Move> {
  if (state.status === 'ended') return [];
  if (state.players[state.turnIndex] !== playerId) return [];

  const moves: Move[] = [];
  const handSize = state.rules.initialHandSize;

  // -- Power-pending phase: must resolve or skip the power. --
  if (state.pendingPower !== null) {
    const { power } = state.pendingPower;

    if (power === 'peek_self') {
      for (let i = 0; i < handSize; i++) {
        moves.push({ type: 'use_peek_self', playerId, handIndex: i as HandIndex });
      }
    }

    if (power === 'peek_opponent') {
      for (const opponent of state.players) {
        if (opponent === playerId) continue;
        for (let i = 0; i < handSize; i++) {
          moves.push({
            type: 'use_peek_opponent',
            playerId,
            targetPlayer: opponent,
            targetHandIndex: i as HandIndex,
          });
        }
      }
    }

    if (power === 'swap_blind') {
      for (let selfIdx = 0; selfIdx < handSize; selfIdx++) {
        for (const opponent of state.players) {
          if (opponent === playerId) continue;
          for (let oppIdx = 0; oppIdx < handSize; oppIdx++) {
            moves.push({
              type: 'use_swap_blind',
              playerId,
              selfHandIndex: selfIdx as HandIndex,
              targetPlayer: opponent,
              targetHandIndex: oppIdx as HandIndex,
            });
          }
        }
      }
    }

    moves.push({ type: 'skip_power', playerId });
    return moves;
  }

  // -- Card in hand (drawn but not yet placed). --
  if (state.drawn !== null) {
    for (let i = 0; i < handSize; i++) {
      moves.push({ type: 'swap_drawn', playerId, handIndex: i as HandIndex });
    }
    // Can only discard the drawn card if it came from the deck,
    // or if the rule allows drawing from discard and re-discarding.
    if (state.drawn.from === 'deck' || state.rules.allowDrawDiscardAndDiscard) {
      moves.push({ type: 'discard_drawn', playerId });
    }
    return moves;
  }

  // -- Fresh turn: draw options + call Pablo. --
  moves.push({ type: 'draw_from_deck', playerId });
  if (state.discard.length > 0) {
    moves.push({ type: 'draw_from_discard', playerId });
  }
  if (state.pabloCalledBy === null) {
    moves.push({ type: 'call_pablo', playerId });
  }

  return moves;
}
