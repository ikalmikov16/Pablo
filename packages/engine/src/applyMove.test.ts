import { describe, expect, it } from 'bun:test';
import { applyMove } from './applyMove';
import { newGame } from './newGame';
import type { CardId, GameState, Rank } from './types';

function makeGame(players = ['alice', 'bob'], seed = 'test'): GameState {
  return newGame({ id: 'test', players, seed });
}

function drawFromDeck(state: GameState, playerId: string): GameState {
  const result = applyMove(state, { type: 'draw_from_deck', playerId });
  if (!result.ok) throw new Error(`drawFromDeck failed: ${result.error}`);
  return result.state;
}

/**
 * Find a card in the deck with the given rank, or fall back to picking one
 * from someone's hand and swapping it into the deck. Guarantees the returned
 * cardId exists in the returned state.deck exactly once.
 */
function placeRankOnDeckTop(state: GameState, rank: Rank): { state: GameState; cardId: CardId } {
  const inDeck = state.deck.find((id) => state.cardCatalog[id]!.rank === rank);
  if (inDeck) {
    const deck = state.deck.filter((id) => id !== inDeck).concat([inDeck]);
    return { state: { ...state, deck }, cardId: inDeck };
  }
  // Card isn't in the deck — must be in a hand or discard. Swap it in.
  for (const player of state.players) {
    const hand = state.hands[player]!;
    for (let i = 0; i < hand.length; i++) {
      const id = hand[i]!;
      if (state.cardCatalog[id]!.rank === rank) {
        // Put the bottom-of-deck card into the hand at this slot,
        // and the desired card on top of the deck.
        const bottomOfDeck = state.deck[0]!;
        const newHand = hand.slice();
        newHand[i] = bottomOfDeck;
        const newDeck = state.deck.slice(1).concat([id]);
        return {
          state: { ...state, deck: newDeck, hands: { ...state.hands, [player]: newHand } },
          cardId: id,
        };
      }
    }
  }
  throw new Error(`placeRankOnDeckTop: no card of rank ${rank} in the game`);
}

describe('applyMove — draw_from_deck', () => {
  it('sets drawn card and does not advance turn', () => {
    const state = makeGame();
    const player = state.players[0]!;
    const result = applyMove(state, { type: 'draw_from_deck', playerId: player });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.drawn).not.toBeNull();
    expect(result.state.drawn?.playerId).toBe(player);
    expect(result.state.drawn?.from).toBe('deck');
    expect(result.state.turnIndex).toBe(0);
    expect(result.state.deck.length).toBe(state.deck.length - 1);
  });

  it('returns already_drawn when drawn is not null', () => {
    const state = makeGame();
    const player = state.players[0]!;
    const withDraw = drawFromDeck(state, player);
    const result = applyMove(withDraw, { type: 'draw_from_deck', playerId: player });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('already_drawn');
  });

  it('returns not_your_turn for wrong player', () => {
    const state = makeGame();
    const result = applyMove(state, { type: 'draw_from_deck', playerId: 'bob' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('not_your_turn');
  });

  it('returns not_in_game for unknown player', () => {
    const state = makeGame();
    const result = applyMove(state, { type: 'draw_from_deck', playerId: 'nobody' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('not_in_game');
  });

  it('returns game_already_ended when status is ended', () => {
    const state = { ...makeGame(), status: 'ended' as const };
    const result = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('game_already_ended');
  });

  it('emits card_drawn event', () => {
    const state = makeGame();
    const result = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.some((e) => e.type === 'card_drawn')).toBe(true);
  });

  it('returns power_pending when pendingPower is set', () => {
    const state = {
      ...makeGame(),
      pendingPower: { rank: 7 as const, power: 'peek_self' as const, playerId: 'alice' },
    };
    const result = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('power_pending');
  });
});

describe('applyMove — draw_from_discard', () => {
  it('pulls the top of the discard into drawn', () => {
    const state = makeGame();
    const player = state.players[0]!;
    const topCard = state.discard[state.discard.length - 1]!;
    const result = applyMove(state, { type: 'draw_from_discard', playerId: player });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.drawn?.cardId).toBe(topCard);
    expect(result.state.drawn?.from).toBe('discard');
    expect(result.state.discard.length).toBe(0);
  });

  it('returns discard_empty when pile is empty', () => {
    const state = { ...makeGame(), discard: [] };
    const result = applyMove(state, { type: 'draw_from_discard', playerId: 'alice' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('discard_empty');
  });

  it('returns already_drawn if already holding a card', () => {
    const state = makeGame();
    const withDraw = drawFromDeck(state, 'alice');
    const result = applyMove(withDraw, { type: 'draw_from_discard', playerId: 'alice' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('already_drawn');
  });
});

describe('applyMove — swap_drawn', () => {
  it('replaces the hand slot, ends turn, displaced card on top of discard', () => {
    const state = makeGame();
    const player = state.players[0]!;
    const originalHandSlot0 = state.hands[player]![0]!;
    const withDraw = drawFromDeck(state, player);
    const drawnCard = withDraw.drawn!.cardId;

    const result = applyMove(withDraw, { type: 'swap_drawn', playerId: player, handIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.hands[player]![0]).toBe(drawnCard);
    expect(result.state.discard[result.state.discard.length - 1]).toBe(originalHandSlot0);
    expect(result.state.drawn).toBeNull();
    expect(result.state.turnIndex).toBe(1);
  });

  it('updates knownCards: drawer now knows the card they swapped in', () => {
    const state = makeGame();
    const player = state.players[0]!;
    const withDraw = drawFromDeck(state, player);
    const drawnCard = withDraw.drawn!.cardId;

    const result = applyMove(withDraw, { type: 'swap_drawn', playerId: player, handIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.knownCards[player]?.[player]?.[0]).toBe(drawnCard);
  });

  it('clears all knowers stale knowledge of the swapped slot', () => {
    // Seed bob's knowledge of alice slot 0.
    const state = makeGame(['alice', 'bob']);
    const aliceSlot0 = state.hands['alice']![0]!;
    const stateWithKnowledge: GameState = {
      ...state,
      knownCards: {
        ...state.knownCards,
        bob: {
          ...state.knownCards['bob'],
          alice: { 0: aliceSlot0 },
        },
      },
    };

    const withDraw = drawFromDeck(stateWithKnowledge, 'alice');
    const result = applyMove(withDraw, { type: 'swap_drawn', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Bob's stale knowledge of alice[0] should be cleared.
    expect(result.state.knownCards['bob']?.['alice']?.[0]).toBeUndefined();
  });

  it('returns must_draw_first when no card is drawn', () => {
    const state = makeGame();
    const result = applyMove(state, { type: 'swap_drawn', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('must_draw_first');
  });
});

describe('applyMove — discard_drawn', () => {
  it('discards the drawn card and ends the turn (no power card)', () => {
    // Draw a card that has no power (Ace or 2–6, or 10/J/Q/K).
    // The easiest approach: find a game where the top deck card has no power.
    let state = makeGame();
    let withDraw: GameState | null = null;

    // Try up to 52 cards to find one without a power.
    for (let attempt = 0; attempt < 52; attempt++) {
      const drawn = drawFromDeck(state, 'alice');
      const card = state.cardCatalog[drawn.drawn!.cardId]!;
      const power = state.rules.powers[card.rank];
      if (power === undefined) {
        withDraw = drawn;
        break;
      }
      // Discard it and try the next.
      const swapped = applyMove(drawn, { type: 'swap_drawn', playerId: 'alice', handIndex: 0 });
      if (!swapped.ok) break;
      // After alice's turn comes bob's — go back to alice.
      state = applyMove(swapped.state, { type: 'draw_from_deck', playerId: 'bob' }).ok
        ? (() => {
            const r = applyMove(swapped.state, { type: 'draw_from_deck', playerId: 'bob' });
            return r.ok
              ? applyMove(r.state, { type: 'swap_drawn', playerId: 'bob', handIndex: 0 }).ok
                ? (() => {
                    const r2 = applyMove(r.state, {
                      type: 'swap_drawn',
                      playerId: 'bob',
                      handIndex: 0,
                    });
                    return r2.ok ? r2.state : state;
                  })()
                : state
              : state;
          })()
        : state;
    }

    if (!withDraw) return; // all drawn cards had powers — extremely unlikely

    const result = applyMove(withDraw, { type: 'discard_drawn', playerId: 'alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.drawn).toBeNull();
    expect(result.state.pendingPower).toBeNull();
    expect(result.state.turnIndex).toBe(1);
  });

  it('sets pendingPower when a power card is discarded from deck draw', () => {
    const { state: stateWith7, cardId: sevenCard } = placeRankOnDeckTop(makeGame(), 7);
    const withDraw = drawFromDeck(stateWith7, 'alice');
    expect(withDraw.drawn?.cardId).toBe(sevenCard);

    const result = applyMove(withDraw, { type: 'discard_drawn', playerId: 'alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pendingPower?.power).toBe('peek_self');
    expect(result.state.drawn).toBeNull();
    expect(result.state.turnIndex).toBe(0); // turn NOT advanced yet
  });

  it('returns must_swap_after_discard_draw when drawn from discard', () => {
    const state = makeGame();
    const withDraw = applyMove(state, { type: 'draw_from_discard', playerId: 'alice' });
    expect(withDraw.ok).toBe(true);
    if (!withDraw.ok) return;
    const result = applyMove(withDraw.state, { type: 'discard_drawn', playerId: 'alice' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('must_swap_after_discard_draw');
  });

  it('allows discard of discard-drawn card when allowDrawDiscardAndDiscard=true', () => {
    const state = newGame({
      id: 't',
      players: ['alice', 'bob'],
      seed: 's',
      rules: { allowDrawDiscardAndDiscard: true },
    });
    // draw from discard
    const withDraw = applyMove(state, { type: 'draw_from_discard', playerId: 'alice' });
    expect(withDraw.ok).toBe(true);
    if (!withDraw.ok) return;
    const drawn = withDraw.state;
    const drawnCard = drawn.cardCatalog[drawn.drawn!.cardId]!;
    const power = drawn.rules.powers[drawnCard.rank];
    if (power !== undefined) return; // skip if it happens to have a power — separate test
    const result = applyMove(drawn, { type: 'discard_drawn', playerId: 'alice' });
    expect(result.ok).toBe(true);
  });

  it('does NOT activate power when swapping in a power card (only discard activates)', () => {
    const { state: stateWith7 } = placeRankOnDeckTop(makeGame(), 7);
    const withDraw = drawFromDeck(stateWith7, 'alice');
    const result = applyMove(withDraw, { type: 'swap_drawn', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pendingPower).toBeNull();
  });
});

describe('applyMove — use_peek_self (power)', () => {
  function stateWithPeekSelfPower(): GameState {
    const { state: withSeven } = placeRankOnDeckTop(makeGame(), 7);
    const withDraw = drawFromDeck(withSeven, 'alice');
    const discardResult = applyMove(withDraw, { type: 'discard_drawn', playerId: 'alice' });
    if (!discardResult.ok) throw new Error('setup failed');
    return discardResult.state;
  }

  it('updates knownCards[self][self][index] and ends turn', () => {
    const state = stateWithPeekSelfPower();
    const result = applyMove(state, { type: 'use_peek_self', playerId: 'alice', handIndex: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cardId = state.hands['alice']![1];
    expect(result.state.knownCards['alice']?.['alice']?.[1]).toBe(cardId);
    expect(result.state.pendingPower).toBeNull();
    expect(result.state.turnIndex).toBe(1);
  });

  it('returns power_not_available when wrong power is pending', () => {
    const state = stateWithPeekSelfPower();
    const stateWithWrongPower: GameState = {
      ...state,
      pendingPower: { rank: 8, power: 'peek_opponent', playerId: 'alice' },
    };
    const result = applyMove(stateWithWrongPower, {
      type: 'use_peek_self',
      playerId: 'alice',
      handIndex: 0,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('power_not_available');
  });

  it('returns no_power_to_resolve when no power is pending', () => {
    const state = makeGame();
    const result = applyMove(state, { type: 'use_peek_self', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('no_power_to_resolve');
  });
});

describe('applyMove — use_peek_opponent (power)', () => {
  function stateWithPeekOpponentPower(): GameState {
    const { state: withEight } = placeRankOnDeckTop(makeGame(), 8);
    const withDraw = drawFromDeck(withEight, 'alice');
    const discardResult = applyMove(withDraw, { type: 'discard_drawn', playerId: 'alice' });
    if (!discardResult.ok) throw new Error('setup failed');
    return discardResult.state;
  }

  it('updates knownCards[self][opponent][index] and ends turn', () => {
    const state = stateWithPeekOpponentPower();
    const result = applyMove(state, {
      type: 'use_peek_opponent',
      playerId: 'alice',
      targetPlayer: 'bob',
      targetHandIndex: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cardId = state.hands['bob']![0];
    expect(result.state.knownCards['alice']?.['bob']?.[0]).toBe(cardId);
    expect(result.state.pendingPower).toBeNull();
    expect(result.state.turnIndex).toBe(1);
  });

  it('returns illegal_target when targeting self', () => {
    const state = stateWithPeekOpponentPower();
    const result = applyMove(state, {
      type: 'use_peek_opponent',
      playerId: 'alice',
      targetPlayer: 'alice',
      targetHandIndex: 0,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('illegal_target');
  });

  it('returns illegal_target for unknown target player', () => {
    const state = stateWithPeekOpponentPower();
    const result = applyMove(state, {
      type: 'use_peek_opponent',
      playerId: 'alice',
      targetPlayer: 'nobody',
      targetHandIndex: 0,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('illegal_target');
  });
});

describe('applyMove — use_swap_blind (power)', () => {
  function stateWithSwapBlindPower(): GameState {
    const { state: withNine } = placeRankOnDeckTop(makeGame(), 9);
    const withDraw = drawFromDeck(withNine, 'alice');
    const discardResult = applyMove(withDraw, { type: 'discard_drawn', playerId: 'alice' });
    if (!discardResult.ok) throw new Error('setup failed');
    return discardResult.state;
  }

  it('swaps the cards and applies symmetric knowledge transfer', () => {
    const state = stateWithSwapBlindPower();
    const aliceCard = state.hands['alice']![0]!;
    const bobCard = state.hands['bob']![1]!;

    const result = applyMove(state, {
      type: 'use_swap_blind',
      playerId: 'alice',
      selfHandIndex: 0,
      targetPlayer: 'bob',
      targetHandIndex: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.hands['alice']![0]).toBe(bobCard);
    expect(result.state.hands['bob']![1]).toBe(aliceCard);
    expect(result.state.pendingPower).toBeNull();
    expect(result.state.turnIndex).toBe(1);
  });

  it('transfers knowledge: if alice knew her slot 0, she now knows bob slot 1 holds it', () => {
    const state = stateWithSwapBlindPower();
    const aliceCard = state.hands['alice']![0]!;
    // Seed: alice knows her own slot 0.
    const stateWithKnowledge: GameState = {
      ...state,
      knownCards: {
        ...state.knownCards,
        alice: {
          ...state.knownCards['alice'],
          alice: { ...state.knownCards['alice']?.['alice'], 0: aliceCard },
        },
      },
    };

    const result = applyMove(stateWithKnowledge, {
      type: 'use_swap_blind',
      playerId: 'alice',
      selfHandIndex: 0,
      targetPlayer: 'bob',
      targetHandIndex: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // After swap, alice knew slot 0 → now knows bob[1] holds it.
    expect(result.state.knownCards['alice']?.['bob']?.[1]).toBe(aliceCard);
    // alice no longer knows her own slot 0 (she sent it to bob).
    expect(result.state.knownCards['alice']?.['alice']?.[0]).toBeUndefined();
  });

  it('returns illegal_target for self-swap', () => {
    const state = stateWithSwapBlindPower();
    const result = applyMove(state, {
      type: 'use_swap_blind',
      playerId: 'alice',
      selfHandIndex: 0,
      targetPlayer: 'alice',
      targetHandIndex: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('illegal_target');
  });
});

describe('applyMove — skip_power', () => {
  it('clears pendingPower and ends turn', () => {
    const state: GameState = {
      ...makeGame(),
      pendingPower: { rank: 7, power: 'peek_self', playerId: 'alice' },
    };
    const result = applyMove(state, { type: 'skip_power', playerId: 'alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pendingPower).toBeNull();
    expect(result.state.turnIndex).toBe(1);
  });

  it('returns no_power_to_resolve when no power is pending', () => {
    const state = makeGame();
    const result = applyMove(state, { type: 'skip_power', playerId: 'alice' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('no_power_to_resolve');
  });
});

describe('applyMove — call_pablo', () => {
  it('sets pabloCalledBy, status=final_turns, finalTurnsRemaining=n-1, advances turn', () => {
    const state = makeGame(['alice', 'bob', 'carol']);
    const result = applyMove(state, { type: 'call_pablo', playerId: 'alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pabloCalledBy).toBe('alice');
    expect(result.state.status).toBe('final_turns');
    expect(result.state.finalTurnsRemaining).toBe(2);
    expect(result.state.turnIndex).toBe(1);
  });

  it('returns pablo_already_called if pablo was already called', () => {
    // turnIndex=1 makes it bob's turn; pabloCalledBy already set by alice.
    const state = {
      ...makeGame(),
      pabloCalledBy: 'alice',
      status: 'final_turns' as const,
      finalTurnsRemaining: 1,
      turnIndex: 1,
    };
    const result = applyMove(state, { type: 'call_pablo', playerId: 'bob' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('pablo_already_called');
  });

  it('returns already_drawn when a card is in hand', () => {
    const state = makeGame();
    const withDraw = drawFromDeck(state, 'alice');
    const result = applyMove(withDraw, { type: 'call_pablo', playerId: 'alice' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('already_drawn');
  });

  it('final_turns countdown: ends round when finalTurnsRemaining reaches 0', () => {
    const state = makeGame(['alice', 'bob']);
    // Alice calls Pablo.
    const pablo = applyMove(state, { type: 'call_pablo', playerId: 'alice' });
    expect(pablo.ok).toBe(true);
    if (!pablo.ok) return;
    expect(pablo.state.finalTurnsRemaining).toBe(1);

    // Bob draws and swaps (uses up his final turn).
    const bobDraw = drawFromDeck(pablo.state, 'bob');
    const bobSwap = applyMove(bobDraw, { type: 'swap_drawn', playerId: 'bob', handIndex: 0 });
    expect(bobSwap.ok).toBe(true);
    if (!bobSwap.ok) return;
    expect(bobSwap.state.status).toBe('ended');
    expect(bobSwap.events.some((e) => e.type === 'round_ended')).toBe(true);
  });
});

describe('applyMove — immutability and determinism', () => {
  it('never mutates the input state', () => {
    const state = makeGame();
    const frozen = JSON.parse(JSON.stringify(state));
    applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(JSON.stringify(state)).toBe(JSON.stringify(frozen));
  });

  it('same move sequence on same seed produces equal states', () => {
    const s1 = makeGame();
    const s2 = makeGame();
    const r1 = applyMove(s1, { type: 'draw_from_deck', playerId: 'alice' });
    const r2 = applyMove(s2, { type: 'draw_from_deck', playerId: 'alice' });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.state.drawn).toEqual(r2.state.drawn);
    expect(r1.state.deck).toEqual(r2.state.deck);
  });

  it('turn advance wraps around correctly', () => {
    const state = makeGame(['alice', 'bob', 'carol']);
    let s = state;
    const players = ['alice', 'bob', 'carol', 'alice', 'bob'] as const;
    for (const p of players) {
      s = drawFromDeck(s, p);
      const result = applyMove(s, { type: 'swap_drawn', playerId: p, handIndex: 0 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      s = result.state;
    }
    // After 5 turns (5 % 3 = 2), should be carol's turn (index 2).
    expect(s.turnIndex).toBe(2);
  });
});

describe('applyMove — unknown_move', () => {
  it('returns unknown_move for an unrecognised move type', () => {
    const state = makeGame();
    // @ts-expect-error testing unknown move type
    const result = applyMove(state, { type: 'teleport', playerId: 'alice' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('unknown_move');
  });
});

describe('applyMove — round-end scores in state', () => {
  it('writes the round score into state.scores when the round ends via final_turns', () => {
    const state = makeGame(['alice', 'bob']);
    const pablo = applyMove(state, { type: 'call_pablo', playerId: 'alice' });
    if (!pablo.ok) throw new Error('pablo failed');
    const bobDraw = drawFromDeck(pablo.state, 'bob');
    let next = applyMove(bobDraw, { type: 'swap_drawn', playerId: 'bob', handIndex: 0 });
    if (next.ok && next.state.pendingPower !== null) {
      next = applyMove(next.state, { type: 'skip_power', playerId: 'bob' });
    }
    if (!next.ok) throw new Error('swap failed');
    expect(next.state.status).toBe('ended');
    // state.scores should now be the perPlayerRound scores (not all zeros).
    const total = (next.state.scores['alice'] ?? 0) + (next.state.scores['bob'] ?? 0);
    expect(total).toBeGreaterThan(0);
  });

  it('writes the round score into state.scores when the round ends via deck exhaustion', () => {
    const base = makeGame();
    const state: GameState = { ...base, deck: [], discard: [base.discard[0]!] };
    const result = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    if (!result.ok) throw new Error('draw failed');
    expect(result.state.status).toBe('ended');
    const total = (result.state.scores['alice'] ?? 0) + (result.state.scores['bob'] ?? 0);
    expect(total).toBeGreaterThan(0);
  });
});
