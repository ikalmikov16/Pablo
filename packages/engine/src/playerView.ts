import type { GameState, PlayerId, PlayerView, PlayerViewEntry } from './types';

/**
 * Project a full GameState into what `playerId` is allowed to see.
 *
 * Hidden information:
 *  - The exact deck order and cards (only deckCount is returned).
 *  - Opponent hand cards that playerId has not peeked or learned via powers
 *    (except when status === 'ended', when every hand is fully revealed).
 *  - Penalty cards are face-down even to their owner (no knownCards entry).
 *
 * Visible information:
 *  - knownCards[self] for every player — peek reveals + power reveals.
 *  - The top of the discard pile.
 *  - The drawn card, but only to the player who drew it.
 *  - All public game scalars (status, turn, Pablo caller, pending power, etc.).
 *  - Full 52-card catalog (fixed public knowledge).
 */
export function computePlayerView(state: GameState, playerId: PlayerId): PlayerView {
  if (!state.players.includes(playerId)) {
    throw new Error(`computePlayerView: unknown player "${playerId}"`);
  }

  const currentPlayerInTurn = state.players[state.turnIndex]!;
  const myKnowledge = state.knownCards[playerId] ?? {};

  const players: PlayerViewEntry[] = state.players.map((id) => {
    const hand = state.hands[id] ?? [];
    const theirKnowledge = myKnowledge[id] ?? {};

    // Public progress flag for the peek phase. Derived from the player's own
    // self-knowledge count — never from indices — so nothing private leaks.
    const ownPeekCount = Object.keys(state.knownCards[id]?.[id] ?? {}).length;
    const hasPeeked = state.status !== 'peek_phase' || ownPeekCount >= state.rules.initialPeekCount;

    const knownCards: Partial<Record<number, string>> = {};
    if (state.status === 'ended') {
      hand.forEach((cardId, idx) => {
        knownCards[idx] = cardId;
      });
    } else {
      // Include only knowledge entries where the cardId still matches the actual
      // hand slot (guards against stale knowledge after swaps, slot reindexing,
      // or penalty-card appends that shifted higher indices).
      for (const [indexStr, cardId] of Object.entries(theirKnowledge)) {
        const idx = Number(indexStr);
        if (hand[idx] === cardId) {
          knownCards[idx] = cardId;
        }
      }
    }

    return {
      id,
      handSize: hand.length,
      knownCards,
      score: state.scores[id] ?? 0,
      isCurrentTurn: id === currentPlayerInTurn,
      hasPeeked,
    };
  });

  const discardTop = state.discard.length > 0 ? state.discard[state.discard.length - 1]! : null;

  const isMyDraw = state.drawn !== null && state.drawn.playerId === playerId;
  const drawnCardId = isMyDraw ? state.drawn!.cardId : null;
  const drawnFrom = isMyDraw ? state.drawn!.from : null;

  return {
    self: playerId,
    status: state.status,
    deckCount: state.deck.length,
    discardTopCardId: discardTop,
    currentPlayerId: currentPlayerInTurn,
    players,
    drawnCardId,
    drawnFrom,
    pabloCalledBy: state.pabloCalledBy,
    pendingPower: state.pendingPower,
    catalog: state.cardCatalog,
    rules: state.rules,
  };
}
