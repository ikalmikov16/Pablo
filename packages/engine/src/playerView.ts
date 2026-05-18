import type { GameState, HandIndex, PlayerId, PlayerView, PlayerViewEntry } from './types';

/**
 * Project a full GameState into what `playerId` is allowed to see.
 *
 * Hidden information:
 *  - The exact deck order and cards (only `deckCount` is returned).
 *  - Opponent hand cards that `playerId` has not peeked.
 *
 * Visible information:
 *  - Everything in `knownCards[playerId]` — initial peek + power reveals.
 *  - The top of the discard pile.
 *  - The drawn card, but only to the player who drew it.
 *  - All public game scalars (status, turn, Pablo caller, etc.).
 */
export function computePlayerView(state: GameState, playerId: PlayerId): PlayerView {
  if (!state.players.includes(playerId)) {
    throw new Error(`computePlayerView: unknown player "${playerId}"`);
  }

  const currentPlayer = state.players[state.turnIndex]!;
  const myKnowledge = state.knownCards[playerId] ?? {};

  const players: PlayerViewEntry[] = state.players.map((id) => {
    const hand = state.hands[id] ?? [];
    const theirKnowledge = myKnowledge[id] ?? {};

    // Build a knownCards map: only include slots that (a) are in the knowledge
    // map AND (b) the card id still matches the actual hand (guards against
    // stale knowledge after a swap).
    const knownCards: Partial<Record<HandIndex, string>> = {};
    for (const [indexStr, cardId] of Object.entries(theirKnowledge)) {
      const idx = Number(indexStr) as HandIndex;
      if (hand[idx] === cardId) {
        knownCards[idx] = cardId;
      }
    }

    return {
      id,
      handSize: hand.length,
      knownCards,
      score: state.scores[id] ?? 0,
      isCurrentTurn: id === currentPlayer,
    };
  });

  const discardTop = state.discard.length > 0 ? state.discard[state.discard.length - 1]! : null;

  const drawnCardId =
    state.drawn !== null && state.drawn.playerId === playerId ? state.drawn.cardId : null;

  return {
    self: playerId,
    status: state.status,
    roundNumber: state.roundNumber,
    deckCount: state.deck.length,
    discardTopCardId: discardTop,
    currentPlayerId: currentPlayer,
    players,
    drawnCardId,
    pabloCalledBy: state.pabloCalledBy,
    finalTurnsRemaining: state.finalTurnsRemaining,
    rules: state.rules,
  };
}
