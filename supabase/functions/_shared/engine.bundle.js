// packages/engine/src/types.ts
var DEFAULT_RULES = {
  kingValue: 10,
  queenValue: 10,
  jackValue: 10,
  cardValueOverrides: [{ suit: "hearts", rank: 13, value: 0 }],
  powers: {
    7: "peek_self",
    8: "peek_opponent",
    9: "swap_blind"
  },
  initialHandSize: 4,
  initialPeekCount: 2,
  minHandSize: 2,
  penaltyCardOnFail: 1
};
// packages/engine/src/internal/cards.ts
var SUITS = ["hearts", "diamonds", "clubs", "spades"];
var RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
function cardId(suit, rank) {
  const suitChar = suit[0].toUpperCase();
  return `${rank.toString().padStart(2, "0")}${suitChar}`;
}
function buildCatalog() {
  const catalog = {};
  const ids = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const id = cardId(suit, rank);
      catalog[id] = { suit, rank };
      ids.push(id);
    }
  }
  return { catalog, ids };
}
function cardValue(card, rules) {
  for (const override of rules.cardValueOverrides) {
    if (override.suit === card.suit && override.rank === card.rank) {
      return override.value;
    }
  }
  if (card.rank === 1)
    return 1;
  if (card.rank <= 10)
    return card.rank;
  if (card.rank === 11)
    return rules.jackValue;
  if (card.rank === 12)
    return rules.queenValue;
  return rules.kingValue;
}

// packages/engine/src/internal/rng.ts
function cyrb128(str) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0;i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ h1 >>> 18, 597399067);
  h2 = Math.imul(h4 ^ h2 >>> 22, 2869860233);
  h3 = Math.imul(h1 ^ h3 >>> 17, 951274213);
  h4 = Math.imul(h2 ^ h4 >>> 19, 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
function sfc32(a, b, c, d) {
  return function() {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = c << 21 | c >>> 11;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}
function makeRng(seed) {
  const [a, b, c, d] = cyrb128(seed);
  const raw = sfc32(a, b, c, d);
  raw();
  raw();
  raw();
  raw();
  return {
    next: raw,
    nextInt(maxExclusive) {
      return Math.floor(raw() * maxExclusive);
    }
  };
}
function shuffle(items, rng) {
  const result = items.slice();
  for (let i = result.length - 1;i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

// packages/engine/src/internal/knowledge.ts
function cloneKnown(known) {
  const out = {};
  for (const knower of Object.keys(known)) {
    out[knower] = {};
    const targets = known[knower];
    for (const target of Object.keys(targets)) {
      out[knower][target] = { ...targets[target] };
    }
  }
  return out;
}
function setKnowledge(known, knower, target, handIndex, cardId2) {
  const m = cloneKnown(known);
  if (!m[knower])
    m[knower] = {};
  if (!m[knower][target])
    m[knower][target] = {};
  m[knower][target][handIndex] = cardId2;
  return m;
}
function clearSlotForAll(known, target, handIndex) {
  const m = cloneKnown(known);
  for (const knower of Object.keys(m)) {
    if (m[knower]?.[target]) {
      delete m[knower][target][handIndex];
    }
  }
  return m;
}
function clearOwnSlot(known, player, index) {
  const m = cloneKnown(known);
  if (m[player]?.[player]) {
    delete m[player][player][index];
  }
  return m;
}
function swapKnowledge(known, p1, i, p2, j) {
  const m = cloneKnown(known);
  for (const knower of Object.keys(m)) {
    const kMap = m[knower];
    const cardAtP1i = kMap[p1]?.[i];
    const cardAtP2j = kMap[p2]?.[j];
    if (!kMap[p1])
      kMap[p1] = {};
    if (!kMap[p2])
      kMap[p2] = {};
    if (cardAtP2j !== undefined) {
      kMap[p1][i] = cardAtP2j;
    } else {
      delete kMap[p1][i];
    }
    if (cardAtP1i !== undefined) {
      kMap[p2][j] = cardAtP1i;
    } else {
      delete kMap[p2][j];
    }
  }
  return m;
}
function reindexKnowledgeForPlayer(known, targetPlayer, indexMap) {
  const m = cloneKnown(known);
  for (const knower of Object.keys(m)) {
    const oldEntries = { ...m[knower][targetPlayer] ?? {} };
    const newEntries = {};
    for (const [oldIdxStr, cardId2] of Object.entries(oldEntries)) {
      const oldIdx = Number(oldIdxStr);
      const newIdx = indexMap[oldIdx];
      if (newIdx !== undefined && cardId2 !== undefined) {
        newEntries[newIdx] = cardId2;
      }
    }
    m[knower][targetPlayer] = newEntries;
  }
  return m;
}
function emptyKnowledge(players) {
  const m = {};
  for (const p of players) {
    m[p] = {};
    for (const q of players) {
      m[p][q] = {};
    }
  }
  return m;
}

// packages/engine/src/newGame.ts
function newGame(opts) {
  const { id, players, seed } = opts;
  if (players.length < 2 || players.length > 6) {
    throw new Error(`newGame: player count must be 2–6, got ${players.length}`);
  }
  const rules = opts.rules ? { ...DEFAULT_RULES, ...opts.rules } : DEFAULT_RULES;
  const { catalog, ids } = buildCatalog();
  const rng = makeRng(seed);
  const deck = shuffle(ids, rng);
  const hands = {};
  for (const p of players) {
    hands[p] = [];
  }
  for (let slot = 0;slot < rules.initialHandSize; slot++) {
    for (const p of players) {
      const card = deck.pop();
      if (!card)
        throw new Error("newGame: deck exhausted during deal");
      hands[p].push(card);
    }
  }
  const firstDiscard = deck.pop();
  if (!firstDiscard)
    throw new Error("newGame: deck exhausted before discard flip");
  const discard = [firstDiscard];
  const knownCards = emptyKnowledge(players);
  const scores = {};
  for (const p of players) {
    scores[p] = 0;
  }
  const finalHands = {};
  for (const p of players) {
    finalHands[p] = hands[p];
  }
  const status = rules.initialPeekCount === 0 ? "playing" : "peek_phase";
  return {
    id,
    status,
    seed,
    cardCatalog: catalog,
    deck,
    discard,
    players,
    hands: finalHands,
    turnIndex: 0,
    drawn: null,
    pabloCalledBy: null,
    scores,
    rules,
    knownCards,
    pendingPower: null,
    reshuffleCount: 0
  };
}
// packages/engine/src/internal/hand.ts
function removeSlots(hand, removed) {
  const removedSet = new Set(removed);
  const indexMap = new Array(hand.length).fill(undefined);
  const newHand = [];
  for (let i = 0;i < hand.length; i++) {
    if (!removedSet.has(i)) {
      indexMap[i] = newHand.length;
      newHand.push(hand[i]);
    }
  }
  return { newHand, indexMap };
}

// packages/engine/src/internal/reshuffle.ts
function reshuffleDiscardIntoDeck(state, events) {
  const reshuffleCount = state.reshuffleCount + 1;
  const subSeed = `${state.seed}:rs${reshuffleCount}`;
  const rng = makeRng(subSeed);
  const topDiscard = state.discard[state.discard.length - 1];
  const toReshuffle = state.discard.slice(0, state.discard.length - 1);
  const newDeck = shuffle(toReshuffle, rng);
  events.push({ type: "deck_reshuffled" });
  return {
    ...state,
    deck: newDeck,
    discard: [topDiscard],
    reshuffleCount
  };
}

// packages/engine/src/score.ts
function scoreRound(state) {
  const { players, hands, rules, cardCatalog } = state;
  const perPlayerHand = {};
  for (const p of players) {
    const hand = hands[p] ?? [];
    let total = 0;
    for (const cardId2 of hand) {
      const card = cardCatalog[cardId2];
      if (card)
        total += cardValue(card, rules);
    }
    perPlayerHand[p] = total;
  }
  let lowestHand = Infinity;
  for (const p of players) {
    if (perPlayerHand[p] < lowestHand)
      lowestHand = perPlayerHand[p];
  }
  const winners = players.filter((p) => perPlayerHand[p] === lowestHand);
  return { perPlayerHand, winners };
}

// packages/engine/src/internal/finalise.ts
function finaliseRound(state, events) {
  const ended = { ...state, status: "ended", drawn: null, pendingPower: null };
  const roundScore = scoreRound(ended);
  events.push({
    type: "round_ended",
    scores: roundScore.perPlayerHand,
    winners: roundScore.winners
  });
  return {
    state: { ...ended, scores: roundScore.perPlayerHand }
  };
}

// packages/engine/src/internal/penalty.ts
function drawPenaltyCard(state, recipient, events) {
  let s = state;
  if (s.deck.length === 0) {
    if (s.discard.length <= 1) {
      const { state: finalState } = finaliseRound(s, events);
      return { state: finalState, roundEnded: true };
    }
    s = reshuffleDiscardIntoDeck(s, events);
    if (s.deck.length === 0) {
      const { state: finalState } = finaliseRound(s, events);
      return { state: finalState, roundEnded: true };
    }
  }
  const newDeck = s.deck.slice();
  const cardId2 = newDeck.pop();
  const newHand = [...s.hands[recipient], cardId2];
  events.push({ type: "penalty_card_dealt", playerId: recipient });
  return {
    state: {
      ...s,
      deck: newDeck,
      hands: { ...s.hands, [recipient]: newHand }
    },
    roundEnded: false
  };
}

// packages/engine/src/applyMove.ts
function currentPlayer(state) {
  return state.players[state.turnIndex];
}
function assertPlaying(state) {
  if (state.status === "ended")
    return { ok: false, error: "game_already_ended" };
  if (state.status === "peek_phase")
    return { ok: false, error: "peek_phase_active" };
  return null;
}
function assertCurrentPlayer(state, playerId) {
  const guard = assertPlaying(state);
  if (guard)
    return guard;
  if (!state.players.includes(playerId))
    return { ok: false, error: "not_in_game" };
  if (currentPlayer(state) !== playerId)
    return { ok: false, error: "not_your_turn" };
  return null;
}
function drawTopOfDeck(state, events) {
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
  const cardId2 = newDeck.pop();
  return { cardId: cardId2, state: { ...s, deck: newDeck } };
}
function advanceTurn(state, events) {
  const nextIndex = (state.turnIndex + 1) % state.players.length;
  const nextPlayer = state.players[nextIndex];
  if (state.pabloCalledBy !== null && nextPlayer === state.pabloCalledBy) {
    return finaliseRound({ ...state, turnIndex: nextIndex, drawn: null, pendingPower: null }, events).state;
  }
  events.push({ type: "turn_ended", nextPlayer });
  return {
    ...state,
    turnIndex: nextIndex,
    drawn: null,
    pendingPower: null
  };
}
function applyPenalties(state, recipient, events) {
  let s = state;
  for (let i = 0;i < state.rules.penaltyCardOnFail; i++) {
    const result = drawPenaltyCard(s, recipient, events);
    s = result.state;
    if (result.roundEnded)
      return { state: s, roundEnded: true };
  }
  return { state: s, roundEnded: false };
}
function unreachable(_x) {
  return { ok: false, error: "unknown_move" };
}
function applyMove(state, move) {
  const events = [];
  switch (move.type) {
    case "choose_peek": {
      if (state.status === "ended")
        return { ok: false, error: "game_already_ended" };
      if (state.status === "playing")
        return { ok: false, error: "not_peek_phase" };
      if (!state.players.includes(move.playerId))
        return { ok: false, error: "not_in_game" };
      const myKnowledge = state.knownCards[move.playerId]?.[move.playerId] ?? {};
      if (Object.keys(myKnowledge).length > 0)
        return { ok: false, error: "already_peeked" };
      const { indices } = move;
      if (indices.length !== state.rules.initialPeekCount) {
        return { ok: false, error: "invalid_peek_count" };
      }
      const hand = state.hands[move.playerId];
      for (const idx of indices) {
        if (idx < 0 || idx >= hand.length)
          return { ok: false, error: "invalid_hand_index" };
      }
      const unique = new Set(indices);
      if (unique.size !== indices.length)
        return { ok: false, error: "duplicate_indices" };
      let knownCards = state.knownCards;
      for (const idx of indices) {
        knownCards = setKnowledge(knownCards, move.playerId, move.playerId, idx, hand[idx]);
      }
      events.push({ type: "peek_chosen", playerId: move.playerId });
      const allPeeked = state.players.every((p) => Object.keys(knownCards[p]?.[p] ?? {}).length >= state.rules.initialPeekCount);
      let newState = { ...state, knownCards };
      if (allPeeked) {
        newState = { ...newState, status: "playing" };
        events.push({ type: "peek_phase_ended" });
      }
      return { ok: true, state: newState, events };
    }
    case "peek_one": {
      if (state.status === "ended")
        return { ok: false, error: "game_already_ended" };
      if (state.status === "playing")
        return { ok: false, error: "not_peek_phase" };
      if (!state.players.includes(move.playerId))
        return { ok: false, error: "not_in_game" };
      const { handIndex } = move;
      const hand = state.hands[move.playerId];
      if (handIndex < 0 || handIndex >= hand.length) {
        return { ok: false, error: "invalid_hand_index" };
      }
      const myKnowledge = state.knownCards[move.playerId]?.[move.playerId] ?? {};
      const alreadyPeekedCount = Object.keys(myKnowledge).length;
      if (alreadyPeekedCount >= state.rules.initialPeekCount) {
        return { ok: false, error: "already_peeked" };
      }
      if (myKnowledge[handIndex] !== undefined) {
        return { ok: false, error: "duplicate_indices" };
      }
      const cardId2 = hand[handIndex];
      const knownCards = setKnowledge(state.knownCards, move.playerId, move.playerId, handIndex, cardId2);
      events.push({
        type: "peek_one_chosen",
        playerId: move.playerId,
        handIndex,
        cardId: cardId2
      });
      const nowPeekedCount = alreadyPeekedCount + 1;
      const playerJustFinished = nowPeekedCount === state.rules.initialPeekCount;
      if (playerJustFinished) {
        events.push({ type: "peek_chosen", playerId: move.playerId });
      }
      const allPeeked = state.players.every((p) => Object.keys(knownCards[p]?.[p] ?? {}).length >= state.rules.initialPeekCount);
      let newState = { ...state, knownCards };
      if (allPeeked) {
        newState = { ...newState, status: "playing" };
        events.push({ type: "peek_phase_ended" });
      }
      return { ok: true, state: newState, events };
    }
    case "draw_from_deck": {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard)
        return guard;
      if (state.drawn !== null)
        return { ok: false, error: "already_drawn" };
      if (state.pendingPower !== null)
        return { ok: false, error: "power_pending" };
      const result = drawTopOfDeck(state, events);
      if ("roundEnded" in result)
        return { ok: true, state: result.state, events };
      const nextState = {
        ...result.state,
        drawn: { playerId: move.playerId, cardId: result.cardId, from: "deck" }
      };
      events.push({ type: "card_drawn", playerId: move.playerId, from: "deck" });
      return { ok: true, state: nextState, events };
    }
    case "swap_drawn": {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard)
        return guard;
      if (state.drawn === null)
        return { ok: false, error: "must_draw_first" };
      if (state.pendingPower !== null)
        return { ok: false, error: "power_pending" };
      const { handIndex } = move;
      const oldHand = state.hands[move.playerId];
      if (handIndex < 0 || handIndex >= oldHand.length) {
        return { ok: false, error: "invalid_hand_index" };
      }
      const displacedCardId = oldHand[handIndex];
      const drawnCardId = state.drawn.cardId;
      const newHand = oldHand.slice();
      newHand[handIndex] = drawnCardId;
      let knownCards = clearSlotForAll(state.knownCards, move.playerId, handIndex);
      knownCards = setKnowledge(knownCards, move.playerId, move.playerId, handIndex, drawnCardId);
      events.push({
        type: "card_swapped",
        playerId: move.playerId,
        handIndex,
        discardedCardId: displacedCardId
      });
      const nextState = advanceTurn({
        ...state,
        hands: { ...state.hands, [move.playerId]: newHand },
        discard: [...state.discard, displacedCardId],
        knownCards,
        drawn: null
      }, events);
      return { ok: true, state: nextState, events };
    }
    case "discard_drawn": {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard)
        return guard;
      if (state.drawn === null)
        return { ok: false, error: "must_draw_first" };
      if (state.pendingPower !== null)
        return { ok: false, error: "power_pending" };
      const drawnCardId = state.drawn.cardId;
      const card = state.cardCatalog[drawnCardId];
      const power = state.rules.powers[card.rank];
      events.push({ type: "card_discarded", cardId: drawnCardId, playerId: move.playerId });
      const withDiscard = {
        ...state,
        drawn: null,
        discard: [...state.discard, drawnCardId]
      };
      if (power !== undefined) {
        events.push({ type: "power_activated", rank: card.rank, power, playerId: move.playerId });
        return {
          ok: true,
          state: {
            ...withDiscard,
            pendingPower: { rank: card.rank, power, playerId: move.playerId }
          },
          events
        };
      }
      const nextState = advanceTurn(withDiscard, events);
      return { ok: true, state: nextState, events };
    }
    case "match_drawn": {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard)
        return guard;
      if (state.drawn === null)
        return { ok: false, error: "must_draw_first" };
      if (state.pendingPower !== null)
        return { ok: false, error: "power_pending" };
      const { handIndex } = move;
      const hand = state.hands[move.playerId];
      if (handIndex < 0 || handIndex >= hand.length) {
        return { ok: false, error: "invalid_hand_index" };
      }
      const drawnCardId = state.drawn.cardId;
      const drawnRank = state.cardCatalog[drawnCardId].rank;
      const targetCardId = hand[handIndex];
      const targetRank = state.cardCatalog[targetCardId].rank;
      const rankMatches = drawnRank === targetRank;
      const minSizeOk = hand.length - 1 >= state.rules.minHandSize;
      if (rankMatches && minSizeOk) {
        const { newHand, indexMap } = removeSlots(hand, [handIndex]);
        const knownCards2 = reindexKnowledgeForPlayer(state.knownCards, move.playerId, indexMap);
        events.push({ type: "card_discarded", cardId: drawnCardId, playerId: move.playerId });
        events.push({ type: "card_discarded", cardId: targetCardId, playerId: move.playerId });
        events.push({
          type: "match_succeeded",
          playerId: move.playerId,
          kind: "drawn",
          slotIndices: [handIndex],
          discardedCardIds: [drawnCardId, targetCardId]
        });
        const nextState2 = advanceTurn({
          ...state,
          hands: { ...state.hands, [move.playerId]: newHand },
          discard: [...state.discard, drawnCardId, targetCardId],
          knownCards: knownCards2,
          drawn: null
        }, events);
        return { ok: true, state: nextState2, events };
      }
      const reason = rankMatches ? "min_hand_size" : "wrong_rank";
      const slotN = hand.length;
      let knownCards = setKnowledge(state.knownCards, move.playerId, move.playerId, slotN, drawnCardId);
      if (reason === "wrong_rank") {
        knownCards = clearOwnSlot(knownCards, move.playerId, handIndex);
      }
      events.push({
        type: "match_failed",
        playerId: move.playerId,
        kind: "drawn",
        slotIndices: [handIndex],
        reason
      });
      let workingState = {
        ...state,
        hands: { ...state.hands, [move.playerId]: [...hand, drawnCardId] },
        knownCards,
        drawn: null
      };
      const penaltyResult = applyPenalties(workingState, move.playerId, events);
      workingState = penaltyResult.state;
      if (penaltyResult.roundEnded)
        return { ok: true, state: workingState, events };
      const nextState = advanceTurn(workingState, events);
      return { ok: true, state: nextState, events };
    }
    case "match_hand": {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard)
        return guard;
      if (state.drawn !== null)
        return { ok: false, error: "already_drawn" };
      if (state.pendingPower !== null)
        return { ok: false, error: "power_pending" };
      const { handIndexA, handIndexB } = move;
      if (handIndexA === handIndexB)
        return { ok: false, error: "same_index" };
      const hand = state.hands[move.playerId];
      if (handIndexA < 0 || handIndexA >= hand.length) {
        return { ok: false, error: "invalid_hand_index" };
      }
      if (handIndexB < 0 || handIndexB >= hand.length) {
        return { ok: false, error: "invalid_hand_index" };
      }
      const cardA = hand[handIndexA];
      const cardB = hand[handIndexB];
      const rankA = state.cardCatalog[cardA].rank;
      const rankB = state.cardCatalog[cardB].rank;
      const rankMatches = rankA === rankB;
      const minSizeOk = hand.length - 2 >= state.rules.minHandSize;
      if (rankMatches && minSizeOk) {
        const sortedIndices = [handIndexA, handIndexB].sort((a, b) => a - b);
        const { newHand, indexMap } = removeSlots(hand, sortedIndices);
        const knownCards2 = reindexKnowledgeForPlayer(state.knownCards, move.playerId, indexMap);
        events.push({ type: "card_discarded", cardId: cardA, playerId: move.playerId });
        events.push({ type: "card_discarded", cardId: cardB, playerId: move.playerId });
        events.push({
          type: "match_succeeded",
          playerId: move.playerId,
          kind: "hand",
          slotIndices: [handIndexA, handIndexB],
          discardedCardIds: [cardA, cardB]
        });
        const nextState2 = advanceTurn({
          ...state,
          hands: { ...state.hands, [move.playerId]: newHand },
          discard: [...state.discard, cardA, cardB],
          knownCards: knownCards2
        }, events);
        return { ok: true, state: nextState2, events };
      }
      const reason = rankMatches ? "min_hand_size" : "wrong_rank";
      let knownCards = state.knownCards;
      if (reason === "wrong_rank") {
        knownCards = clearOwnSlot(knownCards, move.playerId, handIndexA);
        knownCards = clearOwnSlot(knownCards, move.playerId, handIndexB);
      }
      events.push({
        type: "match_failed",
        playerId: move.playerId,
        kind: "hand",
        slotIndices: [handIndexA, handIndexB],
        reason
      });
      let workingState = { ...state, knownCards };
      const penaltyResult = applyPenalties(workingState, move.playerId, events);
      workingState = penaltyResult.state;
      if (penaltyResult.roundEnded)
        return { ok: true, state: workingState, events };
      const nextState = advanceTurn(workingState, events);
      return { ok: true, state: nextState, events };
    }
    case "match_discard": {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard)
        return guard;
      if (state.drawn !== null)
        return { ok: false, error: "already_drawn" };
      if (state.pendingPower !== null)
        return { ok: false, error: "power_pending" };
      if (state.discard.length === 0)
        return { ok: false, error: "discard_empty" };
      const { handIndex } = move;
      const hand = state.hands[move.playerId];
      if (handIndex < 0 || handIndex >= hand.length) {
        return { ok: false, error: "invalid_hand_index" };
      }
      const discardTopId = state.discard[state.discard.length - 1];
      const topRank = state.cardCatalog[discardTopId].rank;
      const targetCardId = hand[handIndex];
      const targetRank = state.cardCatalog[targetCardId].rank;
      const rankMatches = topRank === targetRank;
      const minSizeOk = hand.length - 1 >= state.rules.minHandSize;
      if (rankMatches && minSizeOk) {
        const { newHand, indexMap } = removeSlots(hand, [handIndex]);
        const knownCards2 = reindexKnowledgeForPlayer(state.knownCards, move.playerId, indexMap);
        events.push({ type: "card_discarded", cardId: targetCardId, playerId: move.playerId });
        events.push({
          type: "match_succeeded",
          playerId: move.playerId,
          kind: "discard",
          slotIndices: [handIndex],
          discardedCardIds: [targetCardId]
        });
        const nextState2 = advanceTurn({
          ...state,
          hands: { ...state.hands, [move.playerId]: newHand },
          discard: [...state.discard, targetCardId],
          knownCards: knownCards2
        }, events);
        return { ok: true, state: nextState2, events };
      }
      const reason = rankMatches ? "min_hand_size" : "wrong_rank";
      let knownCards = state.knownCards;
      if (reason === "wrong_rank") {
        knownCards = clearOwnSlot(knownCards, move.playerId, handIndex);
      }
      events.push({
        type: "match_failed",
        playerId: move.playerId,
        kind: "discard",
        slotIndices: [handIndex],
        reason
      });
      let workingState = { ...state, knownCards };
      const penaltyResult = applyPenalties(workingState, move.playerId, events);
      workingState = penaltyResult.state;
      if (penaltyResult.roundEnded)
        return { ok: true, state: workingState, events };
      const nextState = advanceTurn(workingState, events);
      return { ok: true, state: nextState, events };
    }
    case "use_peek_self": {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard)
        return guard;
      if (state.pendingPower === null)
        return { ok: false, error: "no_power_to_resolve" };
      if (state.pendingPower.power !== "peek_self") {
        return { ok: false, error: "power_not_available" };
      }
      const { handIndex } = move;
      const cardId2 = state.hands[move.playerId]?.[handIndex];
      if (cardId2 === undefined)
        return { ok: false, error: "illegal_target" };
      const knownCards = setKnowledge(state.knownCards, move.playerId, move.playerId, handIndex, cardId2);
      events.push({
        type: "peeked",
        playerId: move.playerId,
        targetPlayer: move.playerId,
        handIndex,
        cardId: cardId2
      });
      const nextState = advanceTurn({ ...state, knownCards, pendingPower: null }, events);
      return { ok: true, state: nextState, events };
    }
    case "use_peek_opponent": {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard)
        return guard;
      if (state.pendingPower === null)
        return { ok: false, error: "no_power_to_resolve" };
      if (state.pendingPower.power !== "peek_opponent") {
        return { ok: false, error: "power_not_available" };
      }
      if (move.targetPlayer === move.playerId)
        return { ok: false, error: "illegal_target" };
      if (!state.players.includes(move.targetPlayer))
        return { ok: false, error: "illegal_target" };
      const { targetHandIndex } = move;
      const cardId2 = state.hands[move.targetPlayer]?.[targetHandIndex];
      if (cardId2 === undefined)
        return { ok: false, error: "illegal_target" };
      const knownCards = setKnowledge(state.knownCards, move.playerId, move.targetPlayer, targetHandIndex, cardId2);
      events.push({
        type: "peeked",
        playerId: move.playerId,
        targetPlayer: move.targetPlayer,
        handIndex: targetHandIndex,
        cardId: cardId2
      });
      const nextState = advanceTurn({ ...state, knownCards, pendingPower: null }, events);
      return { ok: true, state: nextState, events };
    }
    case "use_swap_blind": {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard)
        return guard;
      if (state.pendingPower === null)
        return { ok: false, error: "no_power_to_resolve" };
      if (state.pendingPower.power !== "swap_blind") {
        return { ok: false, error: "power_not_available" };
      }
      if (move.targetPlayer === move.playerId)
        return { ok: false, error: "illegal_target" };
      if (!state.players.includes(move.targetPlayer))
        return { ok: false, error: "illegal_target" };
      const { selfHandIndex, targetHandIndex } = move;
      const selfCard = state.hands[move.playerId]?.[selfHandIndex];
      const targetCard = state.hands[move.targetPlayer]?.[targetHandIndex];
      if (selfCard === undefined || targetCard === undefined) {
        return { ok: false, error: "illegal_target" };
      }
      const newSelfHand = state.hands[move.playerId].slice();
      const newTargetHand = state.hands[move.targetPlayer].slice();
      newSelfHand[selfHandIndex] = targetCard;
      newTargetHand[targetHandIndex] = selfCard;
      const knownCards = swapKnowledge(state.knownCards, move.playerId, selfHandIndex, move.targetPlayer, targetHandIndex);
      events.push({
        type: "swapped_blind",
        playerId: move.playerId,
        selfHandIndex,
        targetPlayer: move.targetPlayer,
        targetHandIndex
      });
      const nextState = advanceTurn({
        ...state,
        hands: {
          ...state.hands,
          [move.playerId]: newSelfHand,
          [move.targetPlayer]: newTargetHand
        },
        knownCards,
        pendingPower: null
      }, events);
      return { ok: true, state: nextState, events };
    }
    case "skip_power": {
      const guard = assertCurrentPlayer(state, move.playerId);
      if (guard)
        return guard;
      if (state.pendingPower === null)
        return { ok: false, error: "no_power_to_resolve" };
      const nextState = advanceTurn({ ...state, pendingPower: null }, events);
      return { ok: true, state: nextState, events };
    }
    case "call_pablo": {
      const playingGuard = assertPlaying(state);
      if (playingGuard)
        return playingGuard;
      if (!state.players.includes(move.playerId))
        return { ok: false, error: "not_in_game" };
      if (state.pabloCalledBy !== null)
        return { ok: false, error: "pablo_already_called" };
      if (state.drawn !== null)
        return { ok: false, error: "pablo_blocked" };
      if (state.pendingPower !== null)
        return { ok: false, error: "pablo_blocked" };
      events.push({ type: "pablo_called", playerId: move.playerId });
      const isOnTurn = state.players[state.turnIndex] === move.playerId;
      if (isOnTurn) {
        const { state: finalState } = finaliseRound({ ...state, pabloCalledBy: move.playerId }, events);
        return { ok: true, state: finalState, events };
      }
      return {
        ok: true,
        state: { ...state, pabloCalledBy: move.playerId },
        events
      };
    }
    default:
      return unreachable(move);
  }
}
// packages/engine/src/playerView.ts
function computePlayerView(state, playerId) {
  if (!state.players.includes(playerId)) {
    throw new Error(`computePlayerView: unknown player "${playerId}"`);
  }
  const currentPlayerInTurn = state.players[state.turnIndex];
  const myKnowledge = state.knownCards[playerId] ?? {};
  const players = state.players.map((id) => {
    const hand = state.hands[id] ?? [];
    const theirKnowledge = myKnowledge[id] ?? {};
    const ownPeekCount = Object.keys(state.knownCards[id]?.[id] ?? {}).length;
    const hasPeeked = state.status !== "peek_phase" || ownPeekCount >= state.rules.initialPeekCount;
    const knownCards = {};
    if (state.status === "ended") {
      hand.forEach((cardId2, idx) => {
        knownCards[idx] = cardId2;
      });
    } else {
      for (const [indexStr, cardId2] of Object.entries(theirKnowledge)) {
        const idx = Number(indexStr);
        if (hand[idx] === cardId2) {
          knownCards[idx] = cardId2;
        }
      }
    }
    return {
      id,
      handSize: hand.length,
      knownCards,
      score: state.scores[id] ?? 0,
      isCurrentTurn: id === currentPlayerInTurn,
      hasPeeked
    };
  });
  const discardTop = state.discard.length > 0 ? state.discard[state.discard.length - 1] : null;
  const isMyDraw = state.drawn !== null && state.drawn.playerId === playerId;
  const drawnCardId = isMyDraw ? state.drawn.cardId : null;
  const drawnFrom = isMyDraw ? state.drawn.from : null;
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
    rules: state.rules
  };
}
// packages/engine/src/legalMoves.ts
function legalMoves(state, playerId) {
  if (state.status === "ended")
    return [];
  if (state.status === "peek_phase") {
    if (!state.players.includes(playerId))
      return [];
    const myKnowledge = state.knownCards[playerId]?.[playerId] ?? {};
    const alreadyPeekedCount = Object.keys(myKnowledge).length;
    const peekCount = state.rules.initialPeekCount;
    if (alreadyPeekedCount >= peekCount)
      return [];
    const hand2 = state.hands[playerId];
    const indices = Array.from({ length: hand2.length }, (_, i) => i);
    const moves = [];
    if (alreadyPeekedCount === 0) {
      for (const combo of combinations(indices, peekCount)) {
        moves.push({ type: "choose_peek", playerId, indices: combo });
      }
    }
    for (const idx of indices) {
      if (myKnowledge[idx] !== undefined)
        continue;
      moves.push({ type: "peek_one", playerId, handIndex: idx });
    }
    return moves;
  }
  const isCurrentPlayer = state.players[state.turnIndex] === playerId;
  const hand = state.hands[playerId] ?? [];
  const handSize = hand.length;
  if (state.pendingPower !== null) {
    if (!isCurrentPlayer)
      return [];
    const { power } = state.pendingPower;
    const moves = [];
    if (power === "peek_self") {
      for (let i = 0;i < handSize; i++) {
        moves.push({ type: "use_peek_self", playerId, handIndex: i });
      }
    }
    if (power === "peek_opponent") {
      for (const opponent of state.players) {
        if (opponent === playerId)
          continue;
        const oppHandSize = (state.hands[opponent] ?? []).length;
        for (let i = 0;i < oppHandSize; i++) {
          moves.push({
            type: "use_peek_opponent",
            playerId,
            targetPlayer: opponent,
            targetHandIndex: i
          });
        }
      }
    }
    if (power === "swap_blind") {
      for (let selfIdx = 0;selfIdx < handSize; selfIdx++) {
        for (const opponent of state.players) {
          if (opponent === playerId)
            continue;
          const oppHandSize = (state.hands[opponent] ?? []).length;
          for (let oppIdx = 0;oppIdx < oppHandSize; oppIdx++) {
            moves.push({
              type: "use_swap_blind",
              playerId,
              selfHandIndex: selfIdx,
              targetPlayer: opponent,
              targetHandIndex: oppIdx
            });
          }
        }
      }
    }
    moves.push({ type: "skip_power", playerId });
    return moves;
  }
  if (state.drawn !== null) {
    if (!isCurrentPlayer)
      return [];
    const moves = [];
    for (let i = 0;i < handSize; i++) {
      moves.push({ type: "swap_drawn", playerId, handIndex: i });
    }
    moves.push({ type: "discard_drawn", playerId });
    for (let i = 0;i < handSize; i++) {
      moves.push({ type: "match_drawn", playerId, handIndex: i });
    }
    return moves;
  }
  if (isCurrentPlayer) {
    const moves = [];
    moves.push({ type: "draw_from_deck", playerId });
    for (let a = 0;a < handSize - 1; a++) {
      for (let b = a + 1;b < handSize; b++) {
        moves.push({ type: "match_hand", playerId, handIndexA: a, handIndexB: b });
      }
    }
    if (state.discard.length > 0) {
      for (let i = 0;i < handSize; i++) {
        moves.push({ type: "match_discard", playerId, handIndex: i });
      }
    }
    if (state.pabloCalledBy === null) {
      moves.push({ type: "call_pablo", playerId });
    }
    return moves;
  }
  if (!state.players.includes(playerId))
    return [];
  if (state.pabloCalledBy === null) {
    return [{ type: "call_pablo", playerId }];
  }
  return [];
}
function combinations(arr, k) {
  if (k === 0)
    return [[]];
  if (arr.length < k)
    return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}
export {
  scoreRound,
  newGame,
  makeRng,
  legalMoves,
  computePlayerView,
  cardValue,
  cardId,
  buildCatalog,
  applyMove,
  DEFAULT_RULES
};
