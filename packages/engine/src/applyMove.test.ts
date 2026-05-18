import { describe, expect, it } from 'bun:test';
import { applyMove } from './applyMove';
import { newGame } from './newGame';
import type { CardId, GameState, Rank } from './types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeGame(players = ['alice', 'bob'], seed = 'test'): GameState {
  return newGame({ id: 'test', players, seed });
}

/** Advance all players through the peek phase with fixed first-N indices. */
function advancePastPeek(state: GameState): GameState {
  let s = state;
  for (const p of state.players) {
    const peekCount = state.rules.initialPeekCount;
    const indices = Array.from({ length: peekCount }, (_, i) => i);
    const result = applyMove(s, { type: 'choose_peek', playerId: p, indices });
    if (!result.ok) throw new Error(`advancePastPeek failed for ${p}: ${result.error}`);
    s = result.state;
  }
  return s;
}

function makePlayingGame(players = ['alice', 'bob'], seed = 'test'): GameState {
  return advancePastPeek(makeGame(players, seed));
}

function drawFromDeck(state: GameState, playerId: string): GameState {
  const result = applyMove(state, { type: 'draw_from_deck', playerId });
  if (!result.ok) throw new Error(`drawFromDeck failed: ${result.error}`);
  return result.state;
}

/**
 * Arrange the deck so that a card with the given rank is on top.
 * Returns the modified state and the cardId that will be drawn.
 */
function placeRankOnDeckTop(state: GameState, rank: Rank): { state: GameState; cardId: CardId } {
  const inDeck = state.deck.find((id) => state.cardCatalog[id]!.rank === rank);
  if (inDeck) {
    const deck = state.deck.filter((id) => id !== inDeck).concat([inDeck]);
    return { state: { ...state, deck }, cardId: inDeck };
  }
  for (const player of state.players) {
    const hand = state.hands[player]!;
    for (let i = 0; i < hand.length; i++) {
      const id = hand[i]!;
      if (state.cardCatalog[id]!.rank === rank) {
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

/**
 * Arrange hand[player] so that slot `slotIndex` has the same rank as
 * `rankToMatch`. Returns the rearranged state.
 */
function placeRankInHandSlot(
  state: GameState,
  player: string,
  slotIndex: number,
  rankToMatch: Rank,
): GameState {
  const hand = state.hands[player]!;
  // Find a card of the desired rank anywhere in the game.
  const target = Object.entries(state.cardCatalog).find(([, c]) => c.rank === rankToMatch);
  if (!target) throw new Error(`no card of rank ${rankToMatch}`);
  const [targetId] = target;

  // Swap the target into the hand slot, placing whatever was there into its origin.
  const existing = hand[slotIndex]!;
  const newHand = hand.slice();
  newHand[slotIndex] = targetId!;

  // Find where targetId currently lives.
  if (state.deck.includes(targetId!)) {
    const newDeck = state.deck.map((id) => (id === targetId ? existing : id));
    return { ...state, deck: newDeck, hands: { ...state.hands, [player]: newHand } };
  }
  for (const p of state.players) {
    const h = state.hands[p]!;
    const idx = h.indexOf(targetId!);
    if (idx !== -1) {
      const nh = h.slice();
      nh[idx] = existing;
      return {
        ...state,
        hands: { ...state.hands, [p]: nh, [player]: newHand },
      };
    }
  }
  const discardIdx = state.discard.indexOf(targetId!);
  if (discardIdx !== -1) {
    const newDiscard = state.discard.slice();
    newDiscard[discardIdx] = existing;
    return { ...state, discard: newDiscard, hands: { ...state.hands, [player]: newHand } };
  }
  throw new Error(`placeRankInHandSlot: could not locate ${targetId}`);
}

// ---------------------------------------------------------------------------
// choose_peek
// ---------------------------------------------------------------------------

describe('applyMove — choose_peek', () => {
  it('happy path: sets knowledge for chosen indices, emits peek_chosen', () => {
    const state = makeGame();
    const hand = state.hands['alice']!;
    const result = applyMove(state, {
      type: 'choose_peek',
      playerId: 'alice',
      indices: [0, 2],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.knownCards['alice']?.['alice']?.[0]).toBe(hand[0]);
    expect(result.state.knownCards['alice']?.['alice']?.[2]).toBe(hand[2]);
    expect(result.events.some((e) => e.type === 'peek_chosen')).toBe(true);
    // Status stays peek_phase until everyone has peeked.
    expect(result.state.status).toBe('peek_phase');
  });

  it('last player peeking transitions to playing + emits peek_phase_ended', () => {
    const state = makeGame(['alice', 'bob']);
    const afterAlice = applyMove(state, {
      type: 'choose_peek',
      playerId: 'alice',
      indices: [0, 1],
    });
    expect(afterAlice.ok).toBe(true);
    if (!afterAlice.ok) return;

    const afterBob = applyMove(afterAlice.state, {
      type: 'choose_peek',
      playerId: 'bob',
      indices: [2, 3],
    });
    expect(afterBob.ok).toBe(true);
    if (!afterBob.ok) return;
    expect(afterBob.state.status).toBe('playing');
    expect(afterBob.events.some((e) => e.type === 'peek_phase_ended')).toBe(true);
  });

  it('peek_phase_ended fires AFTER peek_chosen in the same applyMove call', () => {
    const state = makeGame(['alice', 'bob']);
    const afterAlice = applyMove(state, {
      type: 'choose_peek',
      playerId: 'alice',
      indices: [0, 1],
    });
    if (!afterAlice.ok) return;

    const afterBob = applyMove(afterAlice.state, {
      type: 'choose_peek',
      playerId: 'bob',
      indices: [2, 3],
    });
    if (!afterBob.ok) return;
    const peekChosenIdx = afterBob.events.findIndex((e) => e.type === 'peek_chosen');
    const phaseEndedIdx = afterBob.events.findIndex((e) => e.type === 'peek_phase_ended');
    expect(peekChosenIdx).toBeGreaterThanOrEqual(0);
    expect(phaseEndedIdx).toBeGreaterThan(peekChosenIdx);
  });

  it('peek_phase_ended does NOT fire on non-final peeks (3-player game)', () => {
    const state = makeGame(['alice', 'bob', 'carol']);
    const afterAlice = applyMove(state, {
      type: 'choose_peek',
      playerId: 'alice',
      indices: [0, 1],
    });
    if (!afterAlice.ok) return;
    expect(afterAlice.events.some((e) => e.type === 'peek_phase_ended')).toBe(false);
    expect(afterAlice.state.status).toBe('peek_phase');

    const afterBob = applyMove(afterAlice.state, {
      type: 'choose_peek',
      playerId: 'bob',
      indices: [0, 1],
    });
    if (!afterBob.ok) return;
    expect(afterBob.events.some((e) => e.type === 'peek_phase_ended')).toBe(false);
    expect(afterBob.state.status).toBe('peek_phase');
  });

  it('peek_chosen event carries only playerId, not the indices (privacy)', () => {
    const state = makeGame();
    const result = applyMove(state, {
      type: 'choose_peek',
      playerId: 'alice',
      indices: [0, 2],
    });
    if (!result.ok) return;
    const peekChosen = result.events.find((e) => e.type === 'peek_chosen');
    expect(peekChosen?.type).toBe('peek_chosen');
    if (peekChosen?.type !== 'peek_chosen') return;
    expect(peekChosen.playerId).toBe('alice');
    // Defensively assert the event has no leaky fields.
    expect(Object.keys(peekChosen).sort()).toEqual(['playerId', 'type']);
  });

  it('returns already_peeked when called twice for the same player', () => {
    const state = makeGame();
    const first = applyMove(state, { type: 'choose_peek', playerId: 'alice', indices: [0, 1] });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyMove(first.state, {
      type: 'choose_peek',
      playerId: 'alice',
      indices: [2, 3],
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toBe('already_peeked');
  });

  it('returns invalid_peek_count when wrong number of indices', () => {
    const state = makeGame();
    const result = applyMove(state, { type: 'choose_peek', playerId: 'alice', indices: [0] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_peek_count');
  });

  it('returns duplicate_indices when indices are not unique', () => {
    const state = makeGame();
    const result = applyMove(state, { type: 'choose_peek', playerId: 'alice', indices: [1, 1] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('duplicate_indices');
  });

  it('returns invalid_hand_index for out-of-range index', () => {
    const state = makeGame();
    const result = applyMove(state, { type: 'choose_peek', playerId: 'alice', indices: [0, 99] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_hand_index');
  });

  it('returns not_peek_phase when called after game started', () => {
    const state = makePlayingGame();
    const result = applyMove(state, { type: 'choose_peek', playerId: 'alice', indices: [0, 1] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('not_peek_phase');
  });

  it('returns not_in_game for unknown player', () => {
    const state = makeGame();
    const result = applyMove(state, { type: 'choose_peek', playerId: 'nobody', indices: [0, 1] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('not_in_game');
  });

  it('returns game_already_ended when game is ended', () => {
    const state = { ...makePlayingGame(), status: 'ended' as const };
    const result = applyMove(state, { type: 'choose_peek', playerId: 'alice', indices: [0, 1] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('game_already_ended');
  });
});

// ---------------------------------------------------------------------------
// peek_one — incremental peek
// ---------------------------------------------------------------------------

describe('applyMove — peek_one', () => {
  it('happy path: adds one known card and emits peek_one_chosen', () => {
    const state = makeGame();
    const hand = state.hands['alice']!;
    const result = applyMove(state, { type: 'peek_one', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.knownCards['alice']?.['alice']?.[0]).toBe(hand[0]);
    const ev = result.events.find((e) => e.type === 'peek_one_chosen');
    expect(ev).toBeDefined();
    if (ev && ev.type === 'peek_one_chosen') {
      expect(ev.handIndex).toBe(0);
      expect(ev.cardId).toBe(hand[0]!);
    }
    expect(result.state.status).toBe('peek_phase');
  });

  it('two incremental peeks for the same player finishes their quota (emits peek_chosen on the final one)', () => {
    let s = makeGame();
    const first = applyMove(s, { type: 'peek_one', playerId: 'alice', handIndex: 0 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.events.some((e) => e.type === 'peek_chosen')).toBe(false);
    s = first.state;
    const second = applyMove(s, { type: 'peek_one', playerId: 'alice', handIndex: 2 });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.events.some((e) => e.type === 'peek_chosen')).toBe(true);
    expect(Object.keys(second.state.knownCards['alice']?.['alice'] ?? {})).toHaveLength(2);
  });

  it('transitions to playing when every player has hit their quota via mixed move types', () => {
    let s = makeGame(['alice', 'bob']);
    // alice peeks incrementally
    const a1 = applyMove(s, { type: 'peek_one', playerId: 'alice', handIndex: 0 });
    if (!a1.ok) throw new Error('a1 failed');
    const a2 = applyMove(a1.state, { type: 'peek_one', playerId: 'alice', handIndex: 1 });
    if (!a2.ok) throw new Error('a2 failed');
    s = a2.state;
    expect(s.status).toBe('peek_phase');
    // bob uses atomic choose_peek
    const b = applyMove(s, { type: 'choose_peek', playerId: 'bob', indices: [0, 1] });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.state.status).toBe('playing');
    expect(b.events.some((e) => e.type === 'peek_phase_ended')).toBe(true);
  });

  it('rejects a third peek_one for the same player', () => {
    let s = makeGame();
    const r1 = applyMove(s, { type: 'peek_one', playerId: 'alice', handIndex: 0 });
    if (!r1.ok) throw new Error('r1 failed');
    s = r1.state;
    const r2 = applyMove(s, { type: 'peek_one', playerId: 'alice', handIndex: 1 });
    if (!r2.ok) throw new Error('r2 failed');
    s = r2.state;
    const third = applyMove(s, { type: 'peek_one', playerId: 'alice', handIndex: 2 });
    expect(third.ok).toBe(false);
    if (third.ok) return;
    expect(third.error).toBe('already_peeked');
  });

  it('rejects peeking the same slot twice', () => {
    const state = makeGame();
    const first = applyMove(state, { type: 'peek_one', playerId: 'alice', handIndex: 0 });
    if (!first.ok) throw new Error('first failed');
    const second = applyMove(first.state, {
      type: 'peek_one',
      playerId: 'alice',
      handIndex: 0,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toBe('duplicate_indices');
  });

  it('rejects out-of-range hand index', () => {
    const result = applyMove(makeGame(), { type: 'peek_one', playerId: 'alice', handIndex: 99 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_hand_index');
  });

  it('rejects unknown player', () => {
    const result = applyMove(makeGame(), { type: 'peek_one', playerId: 'nobody', handIndex: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('not_in_game');
  });

  it('rejects peek_one when status is playing', () => {
    const result = applyMove(makePlayingGame(), {
      type: 'peek_one',
      playerId: 'alice',
      handIndex: 0,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('not_peek_phase');
  });
});

// ---------------------------------------------------------------------------
// draw_from_deck
// ---------------------------------------------------------------------------

describe('applyMove — draw_from_deck', () => {
  it('sets drawn card and does not advance turn', () => {
    const state = makePlayingGame();
    const player = state.players[0]!;
    const result = applyMove(state, { type: 'draw_from_deck', playerId: player });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.drawn).not.toBeNull();
    expect(result.state.drawn?.from).toBe('deck');
    expect(result.state.turnIndex).toBe(0);
    expect(result.state.deck.length).toBe(state.deck.length - 1);
  });

  it('returns peek_phase_active when called during peek_phase', () => {
    const state = makeGame();
    const result = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('peek_phase_active');
  });

  it('returns already_drawn when drawn is not null', () => {
    const state = makePlayingGame();
    const withDraw = drawFromDeck(state, 'alice');
    const result = applyMove(withDraw, { type: 'draw_from_deck', playerId: 'alice' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('already_drawn');
  });

  it('returns not_your_turn for wrong player', () => {
    const state = makePlayingGame();
    const result = applyMove(state, { type: 'draw_from_deck', playerId: 'bob' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('not_your_turn');
  });

  it('returns game_already_ended when status is ended', () => {
    const state = { ...makePlayingGame(), status: 'ended' as const };
    const result = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('game_already_ended');
  });

  it('emits card_drawn event', () => {
    const state = makePlayingGame();
    const result = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.some((e) => e.type === 'card_drawn')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// swap_drawn
// ---------------------------------------------------------------------------

describe('applyMove — swap_drawn', () => {
  it('replaces hand slot, ends turn, displaced card on top of discard', () => {
    const state = makePlayingGame();
    const originalSlot0 = state.hands['alice']![0]!;
    const withDraw = drawFromDeck(state, 'alice');
    const drawnCard = withDraw.drawn!.cardId;

    const result = applyMove(withDraw, { type: 'swap_drawn', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.hands['alice']![0]).toBe(drawnCard);
    expect(result.state.discard[result.state.discard.length - 1]).toBe(originalSlot0);
    expect(result.state.drawn).toBeNull();
    expect(result.state.turnIndex).toBe(1);
  });

  it('updates knownCards: drawer knows the swapped-in card', () => {
    const state = makePlayingGame();
    const withDraw = drawFromDeck(state, 'alice');
    const drawnCard = withDraw.drawn!.cardId;
    const result = applyMove(withDraw, { type: 'swap_drawn', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.knownCards['alice']?.['alice']?.[0]).toBe(drawnCard);
  });

  it('clears stale knowledge of swapped slot for all knowers', () => {
    const state = makePlayingGame();
    const aliceSlot0 = state.hands['alice']![0]!;
    const stateWithKnowledge: GameState = {
      ...state,
      knownCards: {
        ...state.knownCards,
        bob: { ...state.knownCards['bob'], alice: { 0: aliceSlot0 } },
      },
    };
    const withDraw = drawFromDeck(stateWithKnowledge, 'alice');
    const result = applyMove(withDraw, { type: 'swap_drawn', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.knownCards['bob']?.['alice']?.[0]).toBeUndefined();
  });

  it('returns invalid_hand_index for out-of-range slot', () => {
    const state = makePlayingGame();
    const withDraw = drawFromDeck(state, 'alice');
    const result = applyMove(withDraw, { type: 'swap_drawn', playerId: 'alice', handIndex: 99 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_hand_index');
  });

  it('returns must_draw_first when no card is drawn', () => {
    const state = makePlayingGame();
    const result = applyMove(state, { type: 'swap_drawn', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('must_draw_first');
  });
});

// ---------------------------------------------------------------------------
// discard_drawn
// ---------------------------------------------------------------------------

describe('applyMove — discard_drawn', () => {
  it('discards the drawn card and ends turn (no power)', () => {
    let state = makePlayingGame();
    // Find a non-power card on deck top.
    for (let i = 0; i < 52; i++) {
      const deckTop = state.deck[state.deck.length - 1]!;
      const card = state.cardCatalog[deckTop]!;
      if (!state.rules.powers[card.rank]) break;
      // Rotate deck to skip power cards.
      state = { ...state, deck: [deckTop, ...state.deck.slice(0, -1)] };
    }
    const withDraw = drawFromDeck(state, 'alice');
    const card = state.cardCatalog[withDraw.drawn!.cardId]!;
    if (state.rules.powers[card.rank]) return; // Couldn't find non-power; skip.

    const result = applyMove(withDraw, { type: 'discard_drawn', playerId: 'alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.drawn).toBeNull();
    expect(result.state.pendingPower).toBeNull();
    expect(result.state.turnIndex).toBe(1);
  });

  it('sets pendingPower when a power card (7) is discarded', () => {
    const state = makePlayingGame();
    const { state: stateWith7, cardId: sevenCard } = placeRankOnDeckTop(state, 7);
    const withDraw = drawFromDeck(stateWith7, 'alice');
    expect(withDraw.drawn?.cardId).toBe(sevenCard);

    const result = applyMove(withDraw, { type: 'discard_drawn', playerId: 'alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pendingPower?.power).toBe('peek_self');
    expect(result.state.drawn).toBeNull();
    expect(result.state.turnIndex).toBe(0); // turn NOT advanced
  });

  it('power does NOT activate when swapping in a power card', () => {
    const state = makePlayingGame();
    const { state: stateWith7 } = placeRankOnDeckTop(state, 7);
    const withDraw = drawFromDeck(stateWith7, 'alice');
    const result = applyMove(withDraw, { type: 'swap_drawn', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pendingPower).toBeNull();
  });

  it('returns must_draw_first when no card is drawn', () => {
    const state = makePlayingGame();
    const result = applyMove(state, { type: 'discard_drawn', playerId: 'alice' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('must_draw_first');
  });
});

// ---------------------------------------------------------------------------
// match_drawn (move #3)
// ---------------------------------------------------------------------------

describe('applyMove — match_drawn', () => {
  it('success: hand shrinks by 1, both cards discarded, match_succeeded event', () => {
    let state = makePlayingGame();
    // Make alice hand slot 1 have rank R, then put rank R on deck top.
    const deckTopId = state.deck[state.deck.length - 1]!;
    const deckTopRank = state.cardCatalog[deckTopId]!.rank;
    state = placeRankInHandSlot(state, 'alice', 1, deckTopRank);

    const originalHandSize = state.hands['alice']!.length;
    const withDraw = drawFromDeck(state, 'alice');

    const result = applyMove(withDraw, { type: 'match_drawn', playerId: 'alice', handIndex: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.hands['alice']!.length).toBe(originalHandSize - 1);
    expect(result.events.some((e) => e.type === 'match_succeeded')).toBe(true);
    expect(result.state.drawn).toBeNull();
  });

  it('fail wrong_rank: hand grows by 2 (drawn + penalty), clear targeted slot knowledge', () => {
    let state = makePlayingGame();
    const deckTopId = state.deck[state.deck.length - 1]!;
    const deckTopRank = state.cardCatalog[deckTopId]!.rank;

    // Put a DIFFERENT rank in slot 2.
    const differentRank = ((deckTopRank % 13) + 1) as Rank;
    state = placeRankInHandSlot(state, 'alice', 2, differentRank);

    // Seed alice's knowledge of slot 2 so we can verify it's cleared.
    state = {
      ...state,
      knownCards: {
        ...state.knownCards,
        alice: {
          ...state.knownCards['alice'],
          alice: { ...state.knownCards['alice']?.['alice'], 2: state.hands['alice']![2]! },
        },
      },
    };

    const originalHandSize = state.hands['alice']!.length;
    const withDraw = drawFromDeck(state, 'alice');

    const result = applyMove(withDraw, { type: 'match_drawn', playerId: 'alice', handIndex: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.hands['alice']!.length).toBe(originalHandSize + 2);
    expect(result.events.some((e) => e.type === 'match_failed')).toBe(true);
    expect(result.events.some((e) => e.type === 'penalty_card_dealt')).toBe(true);
    // Targeted slot knowledge cleared.
    expect(result.state.knownCards['alice']?.['alice']?.[2]).toBeUndefined();
  });

  it('fail wrong_rank: drawer knows the drawn card at new slot N', () => {
    let state = makePlayingGame();
    const deckTopId = state.deck[state.deck.length - 1]!;
    const deckTopRank = state.cardCatalog[deckTopId]!.rank;
    const differentRank = ((deckTopRank % 13) + 1) as Rank;
    state = placeRankInHandSlot(state, 'alice', 0, differentRank);

    const withDraw = drawFromDeck(state, 'alice');
    const drawnCardId = withDraw.drawn!.cardId;
    const originalHandSize = state.hands['alice']!.length;

    const result = applyMove(withDraw, { type: 'match_drawn', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Slot N was originalHandSize (before drawn was appended).
    expect(result.state.knownCards['alice']?.['alice']?.[originalHandSize]).toBe(drawnCardId);
  });

  it('fail min_hand_size: hand grows by 2, targeted slot knowledge preserved', () => {
    let state = makePlayingGame();
    // Reduce alice's hand to minHandSize (2).
    const aliceHand2 = state.hands['alice']!.slice(0, 2);
    state = { ...state, hands: { ...state.hands, alice: aliceHand2 } };

    // Put the matching rank in slot 0.
    const deckTopId = state.deck[state.deck.length - 1]!;
    const deckTopRank = state.cardCatalog[deckTopId]!.rank;
    state = placeRankInHandSlot(state, 'alice', 0, deckTopRank);

    // Seed knowledge of slot 0.
    state = {
      ...state,
      knownCards: {
        ...state.knownCards,
        alice: {
          ...state.knownCards['alice'],
          alice: { 0: state.hands['alice']![0]! },
        },
      },
    };

    const withDraw = drawFromDeck(state, 'alice');

    const result = applyMove(withDraw, { type: 'match_drawn', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Hand was 2, grew by 2 → now 4.
    expect(result.state.hands['alice']!.length).toBe(4);
    // Reason is min_hand_size; knowledge of slot 0 preserved.
    const failEvent = result.events.find((e) => e.type === 'match_failed');
    expect(failEvent?.type).toBe('match_failed');
    if (failEvent?.type !== 'match_failed') return;
    expect(failEvent.reason).toBe('min_hand_size');
    // Slot 0 knowledge preserved (rank was actually correct).
    expect(result.state.knownCards['alice']?.['alice']?.[0]).toBeDefined();
  });

  it('returns must_draw_first when no drawn', () => {
    const state = makePlayingGame();
    const result = applyMove(state, { type: 'match_drawn', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('must_draw_first');
  });

  it('returns not_your_turn for non-current player', () => {
    const state = makePlayingGame();
    const result = applyMove(state, { type: 'match_drawn', playerId: 'bob', handIndex: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('not_your_turn');
  });

  it('returns invalid_hand_index for out-of-range index', () => {
    const state = makePlayingGame();
    const withDraw = drawFromDeck(state, 'alice');
    const result = applyMove(withDraw, { type: 'match_drawn', playerId: 'alice', handIndex: 99 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_hand_index');
  });
});

// ---------------------------------------------------------------------------
// match_hand (move #4)
// ---------------------------------------------------------------------------

describe('applyMove — match_hand', () => {
  it('success: both slots removed, hand shrinks by 2, match_succeeded event', () => {
    let state = makePlayingGame();
    // Make alice slots 0 and 1 the same rank.
    const rank = state.cardCatalog[state.hands['alice']![0]!]!.rank;
    state = placeRankInHandSlot(state, 'alice', 1, rank);

    const originalHandSize = state.hands['alice']!.length;
    const result = applyMove(state, {
      type: 'match_hand',
      playerId: 'alice',
      handIndexA: 0,
      handIndexB: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.hands['alice']!.length).toBe(originalHandSize - 2);
    expect(result.events.some((e) => e.type === 'match_succeeded')).toBe(true);
  });

  it('fail wrong_rank: both slots stay, penalty added, knownCards cleared for both', () => {
    let state = makePlayingGame();
    // Force slots 0 and 1 to have different ranks.
    const rankA = state.cardCatalog[state.hands['alice']![0]!]!.rank;
    const rankB = ((rankA % 13) + 1) as Rank;
    state = placeRankInHandSlot(state, 'alice', 1, rankB);

    // Seed knowledge for both slots.
    state = {
      ...state,
      knownCards: {
        ...state.knownCards,
        alice: {
          ...state.knownCards['alice'],
          alice: {
            0: state.hands['alice']![0]!,
            1: state.hands['alice']![1]!,
          },
        },
      },
    };

    const originalHandSize = state.hands['alice']!.length;
    const result = applyMove(state, {
      type: 'match_hand',
      playerId: 'alice',
      handIndexA: 0,
      handIndexB: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.hands['alice']!.length).toBe(originalHandSize + 1);
    // Both targeted slots' knowledge cleared.
    expect(result.state.knownCards['alice']?.['alice']?.[0]).toBeUndefined();
    expect(result.state.knownCards['alice']?.['alice']?.[1]).toBeUndefined();
  });

  it('fail min_hand_size at hand size 2: hand grows by 1, knowledge preserved', () => {
    let state = makePlayingGame();
    // Force hand to 2 cards of matching rank.
    const rank = state.cardCatalog[state.hands['alice']![0]!]!.rank;
    state = placeRankInHandSlot(state, 'alice', 1, rank);
    const twoCardHand = state.hands['alice']!.slice(0, 2);
    state = { ...state, hands: { ...state.hands, alice: twoCardHand } };

    const result = applyMove(state, {
      type: 'match_hand',
      playerId: 'alice',
      handIndexA: 0,
      handIndexB: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.hands['alice']!.length).toBe(3);
    const failEvent = result.events.find((e) => e.type === 'match_failed');
    if (failEvent?.type !== 'match_failed') return;
    expect(failEvent.reason).toBe('min_hand_size');
  });

  it('returns same_index when A === B', () => {
    const state = makePlayingGame();
    const result = applyMove(state, {
      type: 'match_hand',
      playerId: 'alice',
      handIndexA: 0,
      handIndexB: 0,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('same_index');
  });

  it('returns invalid_hand_index for out-of-range index', () => {
    const state = makePlayingGame();
    const result = applyMove(state, {
      type: 'match_hand',
      playerId: 'alice',
      handIndexA: 0,
      handIndexB: 99,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_hand_index');
  });

  it('returns already_drawn when mid-draw', () => {
    const state = makePlayingGame();
    const withDraw = drawFromDeck(state, 'alice');
    const result = applyMove(withDraw, {
      type: 'match_hand',
      playerId: 'alice',
      handIndexA: 0,
      handIndexB: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('already_drawn');
  });

  it('returns power_pending when power is pending', () => {
    const state = {
      ...makePlayingGame(),
      pendingPower: { rank: 7 as const, power: 'peek_self' as const, playerId: 'alice' },
    };
    const result = applyMove(state, {
      type: 'match_hand',
      playerId: 'alice',
      handIndexA: 0,
      handIndexB: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('power_pending');
  });
});

// ---------------------------------------------------------------------------
// match_discard (move #5)
// ---------------------------------------------------------------------------

describe('applyMove — match_discard', () => {
  it('success: slot removed, hand card becomes discard top, match_succeeded', () => {
    let state = makePlayingGame();
    // Make alice slot 0 match the discard top.
    const discardTop = state.discard[state.discard.length - 1]!;
    const topRank = state.cardCatalog[discardTop]!.rank;
    state = placeRankInHandSlot(state, 'alice', 0, topRank);

    const originalHandSize = state.hands['alice']!.length;
    const targetCard = state.hands['alice']![0]!;

    const result = applyMove(state, { type: 'match_discard', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.hands['alice']!.length).toBe(originalHandSize - 1);
    expect(result.state.discard[result.state.discard.length - 1]).toBe(targetCard);
    expect(result.events.some((e) => e.type === 'match_succeeded')).toBe(true);
  });

  it('fail wrong_rank: slot stays, penalty added, targeted slot knowledge cleared', () => {
    let state = makePlayingGame();
    // Force slot 0 to NOT match the discard top.
    const discardTop = state.discard[state.discard.length - 1]!;
    const topRank = state.cardCatalog[discardTop]!.rank;
    const wrongRank = ((topRank % 13) + 1) as Rank;
    state = placeRankInHandSlot(state, 'alice', 0, wrongRank);

    // Seed knowledge.
    state = {
      ...state,
      knownCards: {
        ...state.knownCards,
        alice: {
          ...state.knownCards['alice'],
          alice: { 0: state.hands['alice']![0]! },
        },
      },
    };

    const originalHandSize = state.hands['alice']!.length;
    const result = applyMove(state, { type: 'match_discard', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.hands['alice']!.length).toBe(originalHandSize + 1);
    expect(result.state.knownCards['alice']?.['alice']?.[0]).toBeUndefined();
  });

  it('fail min_hand_size: penalty added, targeted slot knowledge preserved', () => {
    let state = makePlayingGame();
    // Force matching rank in slot 0, hand size 2.
    const discardTop = state.discard[state.discard.length - 1]!;
    const topRank = state.cardCatalog[discardTop]!.rank;
    state = placeRankInHandSlot(state, 'alice', 0, topRank);
    state = { ...state, hands: { ...state.hands, alice: state.hands['alice']!.slice(0, 2) } };

    const result = applyMove(state, { type: 'match_discard', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const failEvent = result.events.find((e) => e.type === 'match_failed');
    if (failEvent?.type !== 'match_failed') return;
    expect(failEvent.reason).toBe('min_hand_size');
    expect(result.state.hands['alice']!.length).toBe(3);
  });

  it('returns discard_empty when discard is empty', () => {
    const state = { ...makePlayingGame(), discard: [] };
    const result = applyMove(state, { type: 'match_discard', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('discard_empty');
  });

  it('returns already_drawn when mid-draw', () => {
    const state = makePlayingGame();
    const withDraw = drawFromDeck(state, 'alice');
    const result = applyMove(withDraw, { type: 'match_discard', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('already_drawn');
  });

  it('returns invalid_hand_index for out-of-range slot', () => {
    const state = makePlayingGame();
    const result = applyMove(state, { type: 'match_discard', playerId: 'alice', handIndex: 99 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_hand_index');
  });
});

// ---------------------------------------------------------------------------
// Slot reindex
// ---------------------------------------------------------------------------

describe('applyMove — slot reindex after successful match', () => {
  it('match_hand([0,2]): indices 1,3 remap to 0,1', () => {
    let state = makePlayingGame();
    // Force slots 0 and 2 to match. Slots 1 and 3 should survive at new indices.
    const rank02 = state.cardCatalog[state.hands['alice']![0]!]!.rank;
    state = placeRankInHandSlot(state, 'alice', 2, rank02);

    // Seed knowledge of slot 1 and slot 3.
    const card1 = state.hands['alice']![1]!;
    const card3 = state.hands['alice']![3]!;
    state = {
      ...state,
      knownCards: {
        ...state.knownCards,
        alice: {
          ...state.knownCards['alice'],
          alice: { 1: card1, 3: card3 },
        },
      },
    };

    const result = applyMove(state, {
      type: 'match_hand',
      playerId: 'alice',
      handIndexA: 0,
      handIndexB: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // New hand: [original_1, original_3]
    expect(result.state.hands['alice']!.length).toBe(2);
    // Knowledge remapped: old 1→0, old 3→1.
    expect(result.state.knownCards['alice']?.['alice']?.[0]).toBe(card1);
    expect(result.state.knownCards['alice']?.['alice']?.[1]).toBe(card3);
  });

  it('cross-knower reindex: bob knew alice[1] and alice[3]; after match_hand([0,2]) they remap', () => {
    let state = makePlayingGame();
    const rank02 = state.cardCatalog[state.hands['alice']![0]!]!.rank;
    state = placeRankInHandSlot(state, 'alice', 2, rank02);

    const card1 = state.hands['alice']![1]!;
    const card3 = state.hands['alice']![3]!;
    state = {
      ...state,
      knownCards: {
        ...state.knownCards,
        bob: {
          ...state.knownCards['bob'],
          alice: { 1: card1, 3: card3 },
        },
      },
    };

    const result = applyMove(state, {
      type: 'match_hand',
      playerId: 'alice',
      handIndexA: 0,
      handIndexB: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.knownCards['bob']?.['alice']?.[0]).toBe(card1);
    expect(result.state.knownCards['bob']?.['alice']?.[1]).toBe(card3);
    expect(result.state.knownCards['bob']?.['alice']?.[2]).toBeUndefined();
    expect(result.state.knownCards['bob']?.['alice']?.[3]).toBeUndefined();
  });

  it('two successive match_discard shrinks remap correctly', () => {
    let state = makePlayingGame();
    // Shrink alice hand to 4 elements.
    // First match_discard on slot 1.
    const discardTop1 = state.discard[state.discard.length - 1]!;
    const rank1 = state.cardCatalog[discardTop1]!.rank;
    state = placeRankInHandSlot(state, 'alice', 1, rank1);

    const r1 = applyMove(state, { type: 'match_discard', playerId: 'alice', handIndex: 1 });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    // Advance past alice's turn, then back to alice.
    let s = r1.state;
    // Bob's turn: draw and discard.
    const bobDraw = applyMove(s, { type: 'draw_from_deck', playerId: 'bob' });
    expect(bobDraw.ok).toBe(true);
    if (!bobDraw.ok) return;
    s = bobDraw.state;
    const bobDiscard = applyMove(s, { type: 'discard_drawn', playerId: 'bob' });
    expect(bobDiscard.ok).toBe(true);
    if (!bobDiscard.ok) return;
    s = bobDiscard.state;
    // Handle power if activated.
    if (s.pendingPower !== null) {
      const skip = applyMove(s, { type: 'skip_power', playerId: 'bob' });
      if (skip.ok) s = skip.state;
    }

    // Now alice again. She has 3 cards. Match slot 0.
    const discardTop2 = s.discard[s.discard.length - 1]!;
    const rank2 = s.cardCatalog[discardTop2]!.rank;
    s = placeRankInHandSlot(s, 'alice', 0, rank2);
    const r2 = applyMove(s, { type: 'match_discard', playerId: 'alice', handIndex: 0 });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    // Alice should now have 2 cards.
    expect(r2.state.hands['alice']!.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Power resolution (unchanged semantics, new guard paths)
// ---------------------------------------------------------------------------

describe('applyMove — use_peek_self', () => {
  function stateWithPeekSelfPower(): GameState {
    const { state: withSeven } = placeRankOnDeckTop(makePlayingGame(), 7);
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
    expect(result.state.knownCards['alice']?.['alice']?.[1]).toBe(state.hands['alice']![1]);
    expect(result.state.pendingPower).toBeNull();
    expect(result.state.turnIndex).toBe(1);
  });

  it('returns illegal_target for out-of-range handIndex', () => {
    const state = stateWithPeekSelfPower();
    const result = applyMove(state, { type: 'use_peek_self', playerId: 'alice', handIndex: 99 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('illegal_target');
  });
});

describe('applyMove — use_peek_opponent', () => {
  function stateWithPeekOpponentPower(): GameState {
    const { state: withEight } = placeRankOnDeckTop(makePlayingGame(), 8);
    const withDraw = drawFromDeck(withEight, 'alice');
    const discardResult = applyMove(withDraw, { type: 'discard_drawn', playerId: 'alice' });
    if (!discardResult.ok) throw new Error('setup failed');
    return discardResult.state;
  }

  it('updates cross-player knowledge and ends turn', () => {
    const state = stateWithPeekOpponentPower();
    const result = applyMove(state, {
      type: 'use_peek_opponent',
      playerId: 'alice',
      targetPlayer: 'bob',
      targetHandIndex: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.knownCards['alice']?.['bob']?.[0]).toBe(state.hands['bob']![0]);
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
});

describe('applyMove — use_swap_blind', () => {
  function stateWithSwapBlindPower(): GameState {
    const { state: withNine } = placeRankOnDeckTop(makePlayingGame(), 9);
    const withDraw = drawFromDeck(withNine, 'alice');
    const discardResult = applyMove(withDraw, { type: 'discard_drawn', playerId: 'alice' });
    if (!discardResult.ok) throw new Error('setup failed');
    return discardResult.state;
  }

  it('swaps cards and applies symmetric knowledge transfer', () => {
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
      ...makePlayingGame(),
      pendingPower: { rank: 7, power: 'peek_self', playerId: 'alice' },
    };
    const result = applyMove(state, { type: 'skip_power', playerId: 'alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pendingPower).toBeNull();
    expect(result.state.turnIndex).toBe(1);
  });

  it('returns no_power_to_resolve when no power is pending', () => {
    const state = makePlayingGame();
    const result = applyMove(state, { type: 'skip_power', playerId: 'alice' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('no_power_to_resolve');
  });
});

// ---------------------------------------------------------------------------
// call_pablo — on-turn
// ---------------------------------------------------------------------------

describe('applyMove — call_pablo (on-turn)', () => {
  it('on-turn call ends the round immediately', () => {
    const state = makePlayingGame(['alice', 'bob']);
    const result = applyMove(state, { type: 'call_pablo', playerId: 'alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.status).toBe('ended');
    expect(result.events.some((e) => e.type === 'round_ended')).toBe(true);
  });

  it('round_ended event carries winners array', () => {
    const state = makePlayingGame(['alice', 'bob']);
    const result = applyMove(state, { type: 'call_pablo', playerId: 'alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const roundEnd = result.events.find((e) => e.type === 'round_ended');
    expect(roundEnd?.type).toBe('round_ended');
    if (roundEnd?.type !== 'round_ended') return;
    expect(Array.isArray(roundEnd.winners)).toBe(true);
  });

  it('returns pablo_already_called if pablo was already called', () => {
    const state = { ...makePlayingGame(), pabloCalledBy: 'alice' };
    const result = applyMove(state, { type: 'call_pablo', playerId: 'alice' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('pablo_already_called');
  });

  it('returns pablo_blocked when a card is in hand (mid-draw)', () => {
    const state = makePlayingGame();
    const withDraw = drawFromDeck(state, 'alice');
    const result = applyMove(withDraw, { type: 'call_pablo', playerId: 'alice' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('pablo_blocked');
  });

  it('returns pablo_blocked when power is pending', () => {
    const state: GameState = {
      ...makePlayingGame(),
      pendingPower: { rank: 7, power: 'peek_self', playerId: 'alice' },
    };
    const result = applyMove(state, { type: 'call_pablo', playerId: 'alice' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('pablo_blocked');
  });
});

// ---------------------------------------------------------------------------
// call_pablo — off-turn
// ---------------------------------------------------------------------------

describe('applyMove — call_pablo (off-turn)', () => {
  it('off-turn call sets pabloCalledBy without changing turn or ending game', () => {
    const state = makePlayingGame(['alice', 'bob', 'carol']);
    // alice is current (index 0). bob calls off-turn.
    const result = applyMove(state, { type: 'call_pablo', playerId: 'bob' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pabloCalledBy).toBe('bob');
    expect(result.state.status).toBe('playing');
    expect(result.state.turnIndex).toBe(0); // still alice's turn
    expect(result.events.some((e) => e.type === 'pablo_called')).toBe(true);
    expect(result.events.some((e) => e.type === 'round_ended')).toBe(false);
  });

  it('off-turn call blocked when drawn !== null (mid-draw)', () => {
    const state = makePlayingGame(['alice', 'bob', 'carol']);
    const withDraw = drawFromDeck(state, 'alice');
    const result = applyMove(withDraw, { type: 'call_pablo', playerId: 'bob' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('pablo_blocked');
  });

  it('off-turn call blocked when pendingPower !== null', () => {
    const state: GameState = {
      ...makePlayingGame(['alice', 'bob']),
      pendingPower: { rank: 7, power: 'peek_self', playerId: 'alice' },
    };
    const result = applyMove(state, { type: 'call_pablo', playerId: 'bob' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('pablo_blocked');
  });

  it('2-player: B calls off-turn during A turn, A finishes → round ends', () => {
    const state = makePlayingGame(['alice', 'bob']);
    // Bob calls off-turn during Alice's turn.
    const bobCall = applyMove(state, { type: 'call_pablo', playerId: 'bob' });
    expect(bobCall.ok).toBe(true);
    if (!bobCall.ok) return;
    expect(bobCall.state.pabloCalledBy).toBe('bob');

    // Alice draws and discards (completing her turn).
    let s = bobCall.state;
    const aliceDraw = applyMove(s, { type: 'draw_from_deck', playerId: 'alice' });
    expect(aliceDraw.ok).toBe(true);
    if (!aliceDraw.ok) return;
    s = aliceDraw.state;

    if (s.status !== 'ended') {
      const aliceDiscard = applyMove(s, { type: 'discard_drawn', playerId: 'alice' });
      expect(aliceDiscard.ok).toBe(true);
      if (!aliceDiscard.ok) return;
      s = aliceDiscard.state;
      if (s.pendingPower !== null) {
        const skip = applyMove(s, { type: 'skip_power', playerId: 'alice' });
        if (skip.ok) s = skip.state;
      }
    }

    // After Alice's turn, turn pointer → Bob. Bob is the caller → round ends.
    expect(s.status).toBe('ended');
  });

  it('3-player ABC: B calls off-turn, A finishes, advanceTurn lands on B → round ends', () => {
    const state = makePlayingGame(['alice', 'bob', 'carol']);
    // Bob calls off-turn during Alice's turn.
    const bobCall = applyMove(state, { type: 'call_pablo', playerId: 'bob' });
    expect(bobCall.ok).toBe(true);
    if (!bobCall.ok) return;

    let s = bobCall.state;
    // Alice draws and swaps.
    const aliceDraw = applyMove(s, { type: 'draw_from_deck', playerId: 'alice' });
    expect(aliceDraw.ok).toBe(true);
    if (!aliceDraw.ok) return;
    s = aliceDraw.state;
    if (s.status !== 'ended') {
      const aliceSwap = applyMove(s, { type: 'swap_drawn', playerId: 'alice', handIndex: 0 });
      expect(aliceSwap.ok).toBe(true);
      if (!aliceSwap.ok) return;
      s = aliceSwap.state;
      if (s.pendingPower !== null) {
        const skip = applyMove(s, { type: 'skip_power', playerId: 'alice' });
        if (skip.ok) s = skip.state;
      }
    }

    // advanceTurn from alice: next index is 1 (bob) = caller → round ends.
    expect(s.status).toBe('ended');
  });

  it('3-player ABC: C calls off-turn; A finishes, B plays, then advanceTurn lands on C → ends', () => {
    const state = makePlayingGame(['alice', 'bob', 'carol']);
    // Carol calls off-turn during Alice's turn.
    const carolCall = applyMove(state, { type: 'call_pablo', playerId: 'carol' });
    expect(carolCall.ok).toBe(true);
    if (!carolCall.ok) return;

    let s = carolCall.state;

    function doTurnDrawDiscard(gs: GameState, pid: string): GameState {
      const draw = applyMove(gs, { type: 'draw_from_deck', playerId: pid });
      if (!draw.ok) return gs;
      let ns = draw.state;
      if (ns.status === 'ended') return ns;
      const disc = applyMove(ns, { type: 'discard_drawn', playerId: pid });
      if (!disc.ok) return ns;
      ns = disc.state;
      if (ns.pendingPower !== null) {
        const skip = applyMove(ns, { type: 'skip_power', playerId: pid });
        if (skip.ok) ns = skip.state;
      }
      return ns;
    }

    // Alice's turn.
    s = doTurnDrawDiscard(s, 'alice');
    expect(s.status).toBe('playing'); // carol hasn't been reached yet

    // Bob's turn.
    s = doTurnDrawDiscard(s, 'bob');

    // advanceTurn from Bob: next index = 2 (carol) = caller → round ends.
    expect(s.status).toBe('ended');
  });

  it('returns pablo_blocked when non-current player tries off-turn Pablo mid-draw', () => {
    const state = makePlayingGame(['alice', 'bob', 'carol']);
    const withDraw = drawFromDeck(state, 'alice');
    const result = applyMove(withDraw, { type: 'call_pablo', playerId: 'carol' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('pablo_blocked');
  });
});

// ---------------------------------------------------------------------------
// Penalty card with empty deck
// ---------------------------------------------------------------------------

describe('applyMove — penalty card with empty deck', () => {
  it('failed match triggers reshuffle + penalty delivery when deck is empty', () => {
    let state = makePlayingGame();
    // Force slot 0 to mismatch discard top, set deck empty with multi-card discard.
    const discardTop = state.discard[state.discard.length - 1]!;
    const topRank = state.cardCatalog[discardTop]!.rank;
    const wrongRank = ((topRank % 13) + 1) as Rank;
    state = placeRankInHandSlot(state, 'alice', 0, wrongRank);

    // Keep discardTop as the last (=top) element; prefix extra cards so reshuffle
    // has enough material to put back into the deck.
    const extraCards = state.deck.slice(0, 5);
    state = {
      ...state,
      deck: [],
      discard: [...extraCards, discardTop],
    };

    const result = applyMove(state, { type: 'match_discard', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.some((e) => e.type === 'deck_reshuffled')).toBe(true);
    expect(result.events.some((e) => e.type === 'penalty_card_dealt')).toBe(true);
    expect(result.state.status).toBe('playing');
  });

  it('failed match ends round when deck AND discard are exhausted', () => {
    let state = makePlayingGame();
    const discardTop = state.discard[state.discard.length - 1]!;
    const topRank = state.cardCatalog[discardTop]!.rank;
    const wrongRank = ((topRank % 13) + 1) as Rank;
    state = placeRankInHandSlot(state, 'alice', 0, wrongRank);

    // Only 1 card in discard (the top), deck empty.
    state = { ...state, deck: [], discard: [discardTop] };

    const result = applyMove(state, { type: 'match_discard', playerId: 'alice', handIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.status).toBe('ended');
    expect(result.events.some((e) => e.type === 'round_ended')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Immutability and determinism
// ---------------------------------------------------------------------------

describe('applyMove — immutability and determinism', () => {
  it('never mutates the input state', () => {
    const state = makePlayingGame();
    const frozen = JSON.parse(JSON.stringify(state));
    applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(JSON.stringify(state)).toBe(JSON.stringify(frozen));
  });

  it('same move sequence on same seed produces equal states', () => {
    const s1 = makePlayingGame();
    const s2 = makePlayingGame();
    const r1 = applyMove(s1, { type: 'draw_from_deck', playerId: 'alice' });
    const r2 = applyMove(s2, { type: 'draw_from_deck', playerId: 'alice' });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.state.drawn).toEqual(r2.state.drawn);
    expect(r1.state.deck).toEqual(r2.state.deck);
  });

  it('turn advance wraps around correctly', () => {
    const state = makePlayingGame(['alice', 'bob', 'carol']);
    let s = state;
    for (const p of ['alice', 'bob', 'carol', 'alice', 'bob'] as const) {
      s = drawFromDeck(s, p);
      const result = applyMove(s, { type: 'swap_drawn', playerId: p, handIndex: 0 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      s = result.state;
      if (s.pendingPower !== null) {
        const skip = applyMove(s, { type: 'skip_power', playerId: p });
        if (skip.ok) s = skip.state;
      }
    }
    // After 5 turns (5 % 3 = 2), should be carol's turn (index 2).
    expect(s.turnIndex).toBe(2);
  });

  it('returns unknown_move for unrecognised move type', () => {
    const state = makePlayingGame();
    // @ts-expect-error testing unknown move type
    const result = applyMove(state, { type: 'teleport', playerId: 'alice' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('unknown_move');
  });
});

describe('applyMove — round-end scores in state', () => {
  it('writes perPlayerHand into state.scores when round ends on-turn Pablo', () => {
    const state = makePlayingGame(['alice', 'bob']);
    const pablo = applyMove(state, { type: 'call_pablo', playerId: 'alice' });
    expect(pablo.ok).toBe(true);
    if (!pablo.ok) return;
    expect(pablo.state.status).toBe('ended');
    const total = (pablo.state.scores['alice'] ?? 0) + (pablo.state.scores['bob'] ?? 0);
    expect(total).toBeGreaterThan(0);
  });

  it('writes perPlayerHand into state.scores when round ends by deck exhaustion', () => {
    const base = makePlayingGame();
    const state: GameState = { ...base, deck: [], discard: [base.discard[0]!] };
    const result = applyMove(state, { type: 'draw_from_deck', playerId: 'alice' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.status).toBe('ended');
    const total = (result.state.scores['alice'] ?? 0) + (result.state.scores['bob'] ?? 0);
    expect(total).toBeGreaterThan(0);
  });
});
