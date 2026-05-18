import type {
  CardId,
  GameEvent,
  GameState,
  MatchFailReason,
  Move,
  MoveResult,
  PlayerId,
} from './types';
import {
  clearOwnSlot,
  clearSlotForAll,
  reindexKnowledgeForPlayer,
  setKnowledge,
  swapKnowledge,
} from './internal/knowledge';
import { removeSlots } from './internal/hand';
import { reshuffleDiscardIntoDeck } from './internal/reshuffle';
import { finaliseRound } from './internal/finalise';
import { drawPenaltyCard } from './internal/penalty';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentPlayer(state: GameState): PlayerId {
  return state.players[state.turnIndex]!;
}

/**
 * Guard: status must be 'playing'. Returns an error result if not.
 * Covers game_already_ended and peek_phase_active.
 */
function assertPlaying(state: GameState): MoveResult | null {
  if (state.status === 'ended') return { ok: false, error: 'game_already_ended' };
  if (state.status === 'peek_phase') return { ok: false, error: 'peek_phase_active' };
  return null;
}

/**
 * Guard: status must be 'playing' AND playerId must be the current player.
 */
function assertCurrentPlayer(state: GameState, playerId: PlayerId): MoveResult | null {
  const guard = assertPlaying(state);
  if (guard) return guard;
  if (!state.players.includes(playerId)) return { ok: false, error: 'not_in_game' };
  if (currentPlayer(state) !== playerId) return { ok: false, error: 'not_your_turn' };
  return null;
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
    s = reshuffleDiscardIntoDeck(s, events);
    if (s.deck.length === 0) {
      const { state: finalState } = finaliseRound(s, events);
      return { roundEnded: true, state: finalState };
    }
  }

  const newDeck = s.deck.slice();
  const cardId = newDeck.pop()!;
  return { cardId, state: { ...s, deck: newDeck } };
}

/**
 * Advance the turn pointer. Checks whether the next player is the off-turn
 * Pablo caller — if so, finalises the round (skipping their turn).
 */
function advanceTurn(state: GameState, events: GameEvent[]): GameState {
  const nextIndex = (state.turnIndex + 1) % state.players.length;
  const nextPlayer = state.players[nextIndex]!;

  if (state.pabloCalledBy !== null && nextPlayer === state.pabloCalledBy) {
    return finaliseRound(
      { ...state, turnIndex: nextIndex, drawn: null, pendingPower: null },
      events,
    ).state;
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
 * Apply penalty cards for a failed matching claim.
 * Returns { state, roundEnded }. When roundEnded=true, the caller must
 * return immediately without calling advanceTurn.
 */
function applyPenalties(
  state: GameState,
  recipient: PlayerId,
  events: GameEvent[],
): { state: GameState; roundEnded: boolean } {
  let s = state;
  for (let i = 0; i < state.rules.penaltyCardOnFail; i++) {
    const result = drawPenaltyCard(s, recipient, events);
    s = result.state;
    if (result.roundEnded) return { state: s, roundEnded: true };
  }
  return { state: s, roundEnded: false };
}

/** Exhaustiveness helper — fails to typecheck if Move gains a new variant. */
function unreachable(_x: never): MoveResult {
  return { ok: false, error: 'unknown_move' };
}

// ---------------------------------------------------------------------------
// applyMove
// ---------------------------------------------------------------------------

export function applyMove(state: GameState, move: Move): MoveResult {
  const events: GameEvent[] = [];

  switch (move.type) {
    // -----------------------------------------------------------------------
    // Peek phase
    // -----------------------------------------------------------------------

    case 'choose_peek': {
      if (state.status === 'ended') return { ok: false, error: 'game_already_ended' };
      if (state.status === 'playing') return { ok: false, error: 'not_peek_phase' };
      if (!state.players.includes(move.playerId)) return { ok: false, error: 'not_in_game' };

      // Has this player already peeked?
      const myKnowledge = state.knownCards[move.playerId]?.[move.playerId] ?? {};
      if (Object.keys(myKnowledge).length > 0) return { ok: false, error: 'already_peeked' };

      const { indices } = move;
      if (indices.length !== state.rules.initialPeekCount) {
        return { ok: false, error: 'invalid_peek_count' };
      }

      const hand = state.hands[move.playerId]!;
      for (const idx of indices) {
        if (idx < 0 || idx >= hand.length) return { ok: false, error: 'invalid_hand_index' };
      }

      const unique = new Set(indices);
      if (unique.size !== indices.length) return { ok: false, error: 'duplicate_indices' };

      let knownCards = state.knownCards;
      for (const idx of indices) {
        knownCards = setKnowledge(knownCards, move.playerId, move.playerId, idx, hand[idx]!);
      }

      events.push({ type: 'peek_chosen', playerId: move.playerId });

      // Check if all players have now peeked.
      const allPeeked = state.players.every(
        (p) => Object.keys(knownCards[p]?.[p] ?? {}).length >= state.rules.initialPeekCount,
      );

      let newState: GameState = { ...state, knownCards };
      if (allPeeked) {
        newState = { ...newState, status: 'playing' };
        events.push({ type: 'peek_phase_ended' });
      }

      return { ok: true, state: newState, events };
    }

    // -----------------------------------------------------------------------
    // Draw phase
    // -----------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // Post-draw moves
    // -----------------------------------------------------------------------

    case 'swap_drawn': {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard) return guard;
      if (state.drawn === null) return { ok: false, error: 'must_draw_first' };
      if (state.pendingPower !== null) return { ok: false, error: 'power_pending' };

      const { handIndex } = move;
      const oldHand = state.hands[move.playerId]!;
      if (handIndex < 0 || handIndex >= oldHand.length) {
        return { ok: false, error: 'invalid_hand_index' };
      }

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

    // -----------------------------------------------------------------------
    // Matching plays
    // -----------------------------------------------------------------------

    case 'match_drawn': {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard) return guard;
      if (state.drawn === null) return { ok: false, error: 'must_draw_first' };
      if (state.pendingPower !== null) return { ok: false, error: 'power_pending' };

      const { handIndex } = move;
      const hand = state.hands[move.playerId]!;
      if (handIndex < 0 || handIndex >= hand.length) {
        return { ok: false, error: 'invalid_hand_index' };
      }

      const drawnCardId = state.drawn.cardId;
      const drawnRank = state.cardCatalog[drawnCardId]!.rank;
      const targetCardId = hand[handIndex]!;
      const targetRank = state.cardCatalog[targetCardId]!.rank;

      const rankMatches = drawnRank === targetRank;
      const minSizeOk = hand.length - 1 >= state.rules.minHandSize;

      if (rankMatches && minSizeOk) {
        // SUCCESS: both cards go to the discard pile, hand shrinks by 1.
        const { newHand, indexMap } = removeSlots(hand, [handIndex]);
        const knownCards = reindexKnowledgeForPlayer(state.knownCards, move.playerId, indexMap);

        events.push({ type: 'card_discarded', cardId: drawnCardId, playerId: move.playerId });
        events.push({ type: 'card_discarded', cardId: targetCardId, playerId: move.playerId });
        events.push({
          type: 'match_succeeded',
          playerId: move.playerId,
          kind: 'drawn',
          slotIndices: [handIndex],
          discardedCardIds: [drawnCardId, targetCardId],
        });

        const nextState = advanceTurn(
          {
            ...state,
            hands: { ...state.hands, [move.playerId]: newHand },
            discard: [...state.discard, drawnCardId, targetCardId],
            knownCards,
            drawn: null,
          },
          events,
        );
        return { ok: true, state: nextState, events };
      }

      // FAILURE: drawn card joins hand; penalty card(s) appended.
      const reason: MatchFailReason = rankMatches ? 'min_hand_size' : 'wrong_rank';

      // Append drawn card to hand at slot N. Player saw it, so they know what's there.
      const slotN = hand.length;
      let knownCards = setKnowledge(
        state.knownCards,
        move.playerId,
        move.playerId,
        slotN,
        drawnCardId,
      );

      // Clear self-knowledge of targeted slot only when the rank was wrong
      // (player demonstrated they remembered incorrectly).
      if (reason === 'wrong_rank') {
        knownCards = clearOwnSlot(knownCards, move.playerId, handIndex);
      }

      events.push({
        type: 'match_failed',
        playerId: move.playerId,
        kind: 'drawn',
        slotIndices: [handIndex],
        reason,
      });

      let workingState: GameState = {
        ...state,
        hands: { ...state.hands, [move.playerId]: [...hand, drawnCardId] },
        knownCards,
        drawn: null,
      };

      const penaltyResult = applyPenalties(workingState, move.playerId, events);
      workingState = penaltyResult.state;
      if (penaltyResult.roundEnded) return { ok: true, state: workingState, events };

      const nextState = advanceTurn(workingState, events);
      return { ok: true, state: nextState, events };
    }

    case 'match_hand': {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard) return guard;
      if (state.drawn !== null) return { ok: false, error: 'already_drawn' };
      if (state.pendingPower !== null) return { ok: false, error: 'power_pending' };

      const { handIndexA, handIndexB } = move;
      if (handIndexA === handIndexB) return { ok: false, error: 'same_index' };

      const hand = state.hands[move.playerId]!;
      if (handIndexA < 0 || handIndexA >= hand.length) {
        return { ok: false, error: 'invalid_hand_index' };
      }
      if (handIndexB < 0 || handIndexB >= hand.length) {
        return { ok: false, error: 'invalid_hand_index' };
      }

      const cardA = hand[handIndexA]!;
      const cardB = hand[handIndexB]!;
      const rankA = state.cardCatalog[cardA]!.rank;
      const rankB = state.cardCatalog[cardB]!.rank;

      const rankMatches = rankA === rankB;
      const minSizeOk = hand.length - 2 >= state.rules.minHandSize;

      if (rankMatches && minSizeOk) {
        // SUCCESS: both slots removed, hand shrinks by 2.
        const sortedIndices = [handIndexA, handIndexB].sort((a, b) => a - b);
        const { newHand, indexMap } = removeSlots(hand, sortedIndices);
        const knownCards = reindexKnowledgeForPlayer(state.knownCards, move.playerId, indexMap);

        events.push({ type: 'card_discarded', cardId: cardA, playerId: move.playerId });
        events.push({ type: 'card_discarded', cardId: cardB, playerId: move.playerId });
        events.push({
          type: 'match_succeeded',
          playerId: move.playerId,
          kind: 'hand',
          slotIndices: [handIndexA, handIndexB],
          discardedCardIds: [cardA, cardB],
        });

        const nextState = advanceTurn(
          {
            ...state,
            hands: { ...state.hands, [move.playerId]: newHand },
            discard: [...state.discard, cardA, cardB],
            knownCards,
          },
          events,
        );
        return { ok: true, state: nextState, events };
      }

      // FAILURE: both slots stay, penalty card appended.
      const reason: MatchFailReason = rankMatches ? 'min_hand_size' : 'wrong_rank';

      let knownCards = state.knownCards;
      if (reason === 'wrong_rank') {
        knownCards = clearOwnSlot(knownCards, move.playerId, handIndexA);
        knownCards = clearOwnSlot(knownCards, move.playerId, handIndexB);
      }

      events.push({
        type: 'match_failed',
        playerId: move.playerId,
        kind: 'hand',
        slotIndices: [handIndexA, handIndexB],
        reason,
      });

      let workingState: GameState = { ...state, knownCards };
      const penaltyResult = applyPenalties(workingState, move.playerId, events);
      workingState = penaltyResult.state;
      if (penaltyResult.roundEnded) return { ok: true, state: workingState, events };

      const nextState = advanceTurn(workingState, events);
      return { ok: true, state: nextState, events };
    }

    case 'match_discard': {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard) return guard;
      if (state.drawn !== null) return { ok: false, error: 'already_drawn' };
      if (state.pendingPower !== null) return { ok: false, error: 'power_pending' };
      if (state.discard.length === 0) return { ok: false, error: 'discard_empty' };

      const { handIndex } = move;
      const hand = state.hands[move.playerId]!;
      if (handIndex < 0 || handIndex >= hand.length) {
        return { ok: false, error: 'invalid_hand_index' };
      }

      const discardTopId = state.discard[state.discard.length - 1]!;
      const topRank = state.cardCatalog[discardTopId]!.rank;
      const targetCardId = hand[handIndex]!;
      const targetRank = state.cardCatalog[targetCardId]!.rank;

      const rankMatches = topRank === targetRank;
      const minSizeOk = hand.length - 1 >= state.rules.minHandSize;

      if (rankMatches && minSizeOk) {
        // SUCCESS: slot removed; hand card becomes new discard top.
        const { newHand, indexMap } = removeSlots(hand, [handIndex]);
        const knownCards = reindexKnowledgeForPlayer(state.knownCards, move.playerId, indexMap);

        events.push({ type: 'card_discarded', cardId: targetCardId, playerId: move.playerId });
        events.push({
          type: 'match_succeeded',
          playerId: move.playerId,
          kind: 'discard',
          slotIndices: [handIndex],
          discardedCardIds: [targetCardId],
        });

        const nextState = advanceTurn(
          {
            ...state,
            hands: { ...state.hands, [move.playerId]: newHand },
            discard: [...state.discard, targetCardId],
            knownCards,
          },
          events,
        );
        return { ok: true, state: nextState, events };
      }

      // FAILURE: slot stays, penalty card appended.
      const reason: MatchFailReason = rankMatches ? 'min_hand_size' : 'wrong_rank';

      let knownCards = state.knownCards;
      if (reason === 'wrong_rank') {
        knownCards = clearOwnSlot(knownCards, move.playerId, handIndex);
      }

      events.push({
        type: 'match_failed',
        playerId: move.playerId,
        kind: 'discard',
        slotIndices: [handIndex],
        reason,
      });

      let workingState: GameState = { ...state, knownCards };
      const penaltyResult = applyPenalties(workingState, move.playerId, events);
      workingState = penaltyResult.state;
      if (penaltyResult.roundEnded) return { ok: true, state: workingState, events };

      const nextState = advanceTurn(workingState, events);
      return { ok: true, state: nextState, events };
    }

    // -----------------------------------------------------------------------
    // Power resolution
    // -----------------------------------------------------------------------

    case 'use_peek_self': {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard) return guard;
      if (state.pendingPower === null) return { ok: false, error: 'no_power_to_resolve' };
      if (state.pendingPower.power !== 'peek_self') {
        return { ok: false, error: 'power_not_available' };
      }

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
      if (state.pendingPower.power !== 'peek_opponent') {
        return { ok: false, error: 'power_not_available' };
      }
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
      if (state.pendingPower.power !== 'swap_blind') {
        return { ok: false, error: 'power_not_available' };
      }
      if (move.targetPlayer === move.playerId) return { ok: false, error: 'illegal_target' };
      if (!state.players.includes(move.targetPlayer)) return { ok: false, error: 'illegal_target' };

      const { selfHandIndex, targetHandIndex } = move;
      const selfCard = state.hands[move.playerId]?.[selfHandIndex];
      const targetCard = state.hands[move.targetPlayer]?.[targetHandIndex];
      if (selfCard === undefined || targetCard === undefined) {
        return { ok: false, error: 'illegal_target' };
      }

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

    // -----------------------------------------------------------------------
    // Pablo
    // -----------------------------------------------------------------------

    case 'call_pablo': {
      const playingGuard = assertPlaying(state);
      if (playingGuard) return playingGuard;
      if (!state.players.includes(move.playerId)) return { ok: false, error: 'not_in_game' };
      if (state.pabloCalledBy !== null) return { ok: false, error: 'pablo_already_called' };
      if (state.drawn !== null) return { ok: false, error: 'pablo_blocked' };
      if (state.pendingPower !== null) return { ok: false, error: 'pablo_blocked' };

      events.push({ type: 'pablo_called', playerId: move.playerId });

      const isOnTurn = state.players[state.turnIndex] === move.playerId;

      if (isOnTurn) {
        // On-turn Pablo: round ends immediately.
        const { state: finalState } = finaliseRound(
          { ...state, pabloCalledBy: move.playerId },
          events,
        );
        return { ok: true, state: finalState, events };
      }

      // Off-turn Pablo: record the caller, current player continues.
      // advanceTurn will detect the caller as next player and finalise.
      return {
        ok: true,
        state: { ...state, pabloCalledBy: move.playerId },
        events,
      };
    }

    default:
      return unreachable(move);
  }
}
