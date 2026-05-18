import type { CardId, GameEvent, GameState, Move, MoveResult, PlayerId, RoundScore } from './types';
import { makeRng, shuffle } from './internal/rng';
import { clearSlotForAll, setKnowledge, swapKnowledge } from './internal/knowledge';
import { scoreRound } from './score';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentPlayer(state: GameState): PlayerId {
  return state.players[state.turnIndex]!;
}

function assertCurrentPlayer(state: GameState, playerId: PlayerId): MoveResult | null {
  if (state.status === 'ended') return { ok: false, error: 'game_already_ended' };
  if (!state.players.includes(playerId)) return { ok: false, error: 'not_in_game' };
  if (currentPlayer(state) !== playerId) return { ok: false, error: 'not_your_turn' };
  return null;
}

/**
 * Finalise a round inside applyMove: compute the round score, push the
 * `round_ended` event, and write the round score into `state.scores` so the
 * projection reflects the result.
 */
function finaliseRound(
  state: GameState,
  events: GameEvent[],
): { state: GameState; roundScore: RoundScore } {
  const ended: GameState = { ...state, status: 'ended', drawn: null, pendingPower: null };
  const roundScore = scoreRound(ended);
  events.push({
    type: 'round_ended',
    scores: roundScore.perPlayerRound,
    winner: roundScore.winner,
  });
  return {
    state: { ...ended, scores: roundScore.perPlayerRound },
    roundScore,
  };
}

/** Advance turn index. Decrements finalTurnsRemaining and ends the round if it hits 0. */
function advanceTurn(state: GameState, events: GameEvent[]): GameState {
  const nextIndex = (state.turnIndex + 1) % state.players.length;
  const nextPlayer = state.players[nextIndex]!;

  if (state.status === 'final_turns') {
    const remaining = state.finalTurnsRemaining - 1;
    if (remaining <= 0) {
      return finaliseRound({ ...state, turnIndex: nextIndex, finalTurnsRemaining: 0 }, events)
        .state;
    }
    events.push({ type: 'turn_ended', nextPlayer });
    return {
      ...state,
      turnIndex: nextIndex,
      finalTurnsRemaining: remaining,
      drawn: null,
      pendingPower: null,
    };
  }

  events.push({ type: 'turn_ended', nextPlayer });
  return {
    ...state,
    turnIndex: nextIndex,
    drawn: null,
    pendingPower: null,
  };
}

/**
 * Try to draw from the deck. If the deck is empty, reshuffles the discard
 * (minus its top card) back into the deck. If still empty, ends the round.
 */
function drawTopOfDeck(
  state: GameState,
  events: GameEvent[],
): { cardId: CardId; state: GameState } | { roundEnded: true; state: GameState } {
  let s = state;

  if (s.deck.length === 0) {
    if (s.discard.length <= 1) {
      const { state: finalState } = finaliseRound(s, events);
      return { roundEnded: true, state: finalState };
    }
    const reshuffleCount = s.reshuffleCount + 1;
    const subSeed = `${s.seed}:rs${reshuffleCount}`;
    const rng = makeRng(subSeed);
    const topDiscard = s.discard[s.discard.length - 1]!;
    const toReshuffle = s.discard.slice(0, s.discard.length - 1);
    const newDeck = shuffle(toReshuffle, rng);
    events.push({ type: 'deck_reshuffled' });
    s = {
      ...s,
      deck: newDeck,
      discard: [topDiscard],
      reshuffleCount,
    };

    if (s.deck.length === 0) {
      const { state: finalState } = finaliseRound(s, events);
      return { roundEnded: true, state: finalState };
    }
  }

  const newDeck = s.deck.slice();
  const cardId = newDeck.pop()!;
  return { cardId, state: { ...s, deck: newDeck } };
}

/** Exhaustiveness helper — fails to typecheck if `Move` gains a new variant we forgot. */
function unreachable(_x: never): MoveResult {
  return { ok: false, error: 'unknown_move' };
}

// ---------------------------------------------------------------------------
// applyMove
// ---------------------------------------------------------------------------

export function applyMove(state: GameState, move: Move): MoveResult {
  const events: GameEvent[] = [];

  switch (move.type) {
    case 'draw_from_deck': {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard) return guard;
      if (state.drawn !== null) return { ok: false, error: 'already_drawn' };
      if (state.pendingPower !== null) return { ok: false, error: 'power_pending' };

      const result = drawTopOfDeck(state, events);
      if ('roundEnded' in result) return { ok: true, state: result.state, events };

      const nextState: GameState = {
        ...result.state,
        drawn: { playerId: move.playerId, cardId: result.cardId, from: 'deck' },
      };
      events.push({ type: 'card_drawn', playerId: move.playerId, from: 'deck' });
      return { ok: true, state: nextState, events };
    }

    case 'draw_from_discard': {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard) return guard;
      if (state.drawn !== null) return { ok: false, error: 'already_drawn' };
      if (state.pendingPower !== null) return { ok: false, error: 'power_pending' };
      if (state.discard.length === 0) return { ok: false, error: 'discard_empty' };

      const newDiscard = state.discard.slice(0, -1);
      const cardId = state.discard[state.discard.length - 1]!;
      const nextState: GameState = {
        ...state,
        discard: newDiscard,
        drawn: { playerId: move.playerId, cardId, from: 'discard' },
      };
      events.push({ type: 'card_drawn', playerId: move.playerId, from: 'discard' });
      return { ok: true, state: nextState, events };
    }

    case 'swap_drawn': {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard) return guard;
      if (state.drawn === null) return { ok: false, error: 'must_draw_first' };
      if (state.pendingPower !== null) return { ok: false, error: 'power_pending' };

      const { handIndex } = move;
      const oldHand = state.hands[move.playerId]!;
      const displacedCardId = oldHand[handIndex]!;
      const drawnCardId = state.drawn.cardId;

      const newHand = oldHand.slice();
      newHand[handIndex] = drawnCardId;

      let knownCards = clearSlotForAll(state.knownCards, move.playerId, handIndex);
      knownCards = setKnowledge(knownCards, move.playerId, move.playerId, handIndex, drawnCardId);

      events.push({
        type: 'card_swapped',
        playerId: move.playerId,
        handIndex,
        discardedCardId: displacedCardId,
      });

      const nextState = advanceTurn(
        {
          ...state,
          hands: { ...state.hands, [move.playerId]: newHand },
          discard: [...state.discard, displacedCardId],
          knownCards,
          drawn: null,
        },
        events,
      );
      return { ok: true, state: nextState, events };
    }

    case 'discard_drawn': {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard) return guard;
      if (state.drawn === null) return { ok: false, error: 'must_draw_first' };
      if (state.pendingPower !== null) return { ok: false, error: 'power_pending' };
      if (state.drawn.from === 'discard' && !state.rules.allowDrawDiscardAndDiscard) {
        return { ok: false, error: 'must_swap_after_discard_draw' };
      }

      const drawnCardId = state.drawn.cardId;
      const card = state.cardCatalog[drawnCardId]!;
      const power = state.rules.powers[card.rank];

      events.push({ type: 'card_discarded', cardId: drawnCardId, playerId: move.playerId });

      const withDiscard: GameState = {
        ...state,
        drawn: null,
        discard: [...state.discard, drawnCardId],
      };

      if (power !== undefined) {
        events.push({ type: 'power_activated', rank: card.rank, power, playerId: move.playerId });
        return {
          ok: true,
          state: {
            ...withDiscard,
            pendingPower: { rank: card.rank, power, playerId: move.playerId },
          },
          events,
        };
      }

      const nextState = advanceTurn(withDiscard, events);
      return { ok: true, state: nextState, events };
    }

    case 'use_peek_self': {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard) return guard;
      if (state.pendingPower === null) return { ok: false, error: 'no_power_to_resolve' };
      if (state.pendingPower.power !== 'peek_self')
        return { ok: false, error: 'power_not_available' };

      const { handIndex } = move;
      const cardId = state.hands[move.playerId]?.[handIndex];
      if (cardId === undefined) return { ok: false, error: 'illegal_target' };

      const knownCards = setKnowledge(
        state.knownCards,
        move.playerId,
        move.playerId,
        handIndex,
        cardId,
      );

      events.push({
        type: 'peeked',
        playerId: move.playerId,
        targetPlayer: move.playerId,
        handIndex,
        cardId,
      });

      const nextState = advanceTurn({ ...state, knownCards, pendingPower: null }, events);
      return { ok: true, state: nextState, events };
    }

    case 'use_peek_opponent': {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard) return guard;
      if (state.pendingPower === null) return { ok: false, error: 'no_power_to_resolve' };
      if (state.pendingPower.power !== 'peek_opponent')
        return { ok: false, error: 'power_not_available' };
      if (move.targetPlayer === move.playerId) return { ok: false, error: 'illegal_target' };
      if (!state.players.includes(move.targetPlayer)) return { ok: false, error: 'illegal_target' };

      const { targetHandIndex } = move;
      const cardId = state.hands[move.targetPlayer]?.[targetHandIndex];
      if (cardId === undefined) return { ok: false, error: 'illegal_target' };

      const knownCards = setKnowledge(
        state.knownCards,
        move.playerId,
        move.targetPlayer,
        targetHandIndex,
        cardId,
      );

      events.push({
        type: 'peeked',
        playerId: move.playerId,
        targetPlayer: move.targetPlayer,
        handIndex: targetHandIndex,
        cardId,
      });

      const nextState = advanceTurn({ ...state, knownCards, pendingPower: null }, events);
      return { ok: true, state: nextState, events };
    }

    case 'use_swap_blind': {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard) return guard;
      if (state.pendingPower === null) return { ok: false, error: 'no_power_to_resolve' };
      if (state.pendingPower.power !== 'swap_blind')
        return { ok: false, error: 'power_not_available' };
      if (move.targetPlayer === move.playerId) return { ok: false, error: 'illegal_target' };
      if (!state.players.includes(move.targetPlayer)) return { ok: false, error: 'illegal_target' };

      const { selfHandIndex, targetHandIndex } = move;
      const selfCard = state.hands[move.playerId]?.[selfHandIndex];
      const targetCard = state.hands[move.targetPlayer]?.[targetHandIndex];
      if (selfCard === undefined || targetCard === undefined)
        return { ok: false, error: 'illegal_target' };

      const newSelfHand = state.hands[move.playerId]!.slice();
      const newTargetHand = state.hands[move.targetPlayer]!.slice();
      newSelfHand[selfHandIndex] = targetCard;
      newTargetHand[targetHandIndex] = selfCard;

      const knownCards = swapKnowledge(
        state.knownCards,
        move.playerId,
        selfHandIndex,
        move.targetPlayer,
        targetHandIndex,
      );

      events.push({
        type: 'swapped_blind',
        playerId: move.playerId,
        selfHandIndex,
        targetPlayer: move.targetPlayer,
        targetHandIndex,
      });

      const nextState = advanceTurn(
        {
          ...state,
          hands: {
            ...state.hands,
            [move.playerId]: newSelfHand,
            [move.targetPlayer]: newTargetHand,
          },
          knownCards,
          pendingPower: null,
        },
        events,
      );
      return { ok: true, state: nextState, events };
    }

    case 'skip_power': {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard) return guard;
      if (state.pendingPower === null) return { ok: false, error: 'no_power_to_resolve' };

      const nextState = advanceTurn({ ...state, pendingPower: null }, events);
      return { ok: true, state: nextState, events };
    }

    case 'call_pablo': {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard) return guard;
      if (state.drawn !== null) return { ok: false, error: 'already_drawn' };
      if (state.pendingPower !== null) return { ok: false, error: 'power_pending' };
      if (state.pabloCalledBy !== null) return { ok: false, error: 'pablo_already_called' };

      const finalTurnsRemaining = state.players.length - 1;
      const nextIndex = (state.turnIndex + 1) % state.players.length;
      const nextPlayer = state.players[nextIndex]!;

      events.push({ type: 'pablo_called', playerId: move.playerId });
      events.push({ type: 'final_turns_started', pabloCalledBy: move.playerId });

      if (finalTurnsRemaining === 0) {
        // Degenerate case (1-player game; impossible in valid play).
        const { state: finalState } = finaliseRound(
          { ...state, pabloCalledBy: move.playerId, finalTurnsRemaining: 0 },
          events,
        );
        return { ok: true, state: finalState, events };
      }

      events.push({ type: 'turn_ended', nextPlayer });
      return {
        ok: true,
        state: {
          ...state,
          status: 'final_turns',
          pabloCalledBy: move.playerId,
          finalTurnsRemaining,
          turnIndex: nextIndex,
          drawn: null,
          pendingPower: null,
        },
        events,
      };
    }

    default:
      return unreachable(move);
  }
}
