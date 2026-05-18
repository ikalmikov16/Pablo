/**
 * Bot heuristic module.
 *
 * HONESTY CONTRACT: `decide` reads ONLY `ctx.view` (a PlayerView). It MUST
 * NOT access the full GameState. The mockClient enforces this by only passing
 * the view to this module — never the raw engine state.
 *
 * Lint guard: this file may not import from ../viewStore (which holds GameState).
 */

import {
  type Card,
  type GameRules,
  type HandIndex,
  type Move,
  type PlayerId,
  type PlayerView,
  type Rank,
  cardValue,
  makeRng,
} from '@pablo/engine';

type Rng = ReturnType<typeof makeRng>;

export type BotContext = {
  readonly view: PlayerView;
  readonly self: PlayerId;
  readonly rules: GameRules;
  readonly rng: Rng;
};

export type BotDecision =
  | { readonly kind: 'on_turn'; readonly move: Move }
  | { readonly kind: 'off_turn_pablo'; readonly move: Extract<Move, { type: 'call_pablo' }> }
  | { readonly kind: 'peek'; readonly move: Extract<Move, { type: 'choose_peek' }> }
  | { readonly kind: 'pass' };

/** Estimated average card value across the full 52-card catalog minus overrides. */
function computeCatalogAverage(view: PlayerView): number {
  const cards = Object.values(view.catalog) as Card[];
  if (cards.length === 0) return 6.5;
  const total = cards.reduce((sum, c) => sum + cardValue(c, view.rules), 0);
  return total / cards.length;
}

/** Sum of known own cards + unknown-slot prior. */
export function estimateOwnTotal(view: PlayerView, self: PlayerId): number {
  const entry = view.players.find((p) => p.id === self);
  if (!entry) return 999;
  const avg = computeCatalogAverage(view);
  let total = 0;
  for (let i = 0; i < entry.handSize; i++) {
    const knownId = entry.knownCards[i];
    if (knownId !== undefined) {
      const card = view.catalog[knownId];
      total += card ? cardValue(card, view.rules) : avg;
    } else {
      total += avg;
    }
  }
  return total;
}

/** Known ranks for own slots: Record<handIndex, rank>. */
function ownKnownRanks(view: PlayerView, self: PlayerId): Readonly<Partial<Record<number, Rank>>> {
  const entry = view.players.find((p) => p.id === self);
  if (!entry) return {};
  const result: Partial<Record<number, Rank>> = {};
  for (const [idxStr, cardId] of Object.entries(entry.knownCards)) {
    if (cardId === undefined) continue;
    const card = view.catalog[cardId];
    if (card) result[Number(idxStr)] = card.rank;
  }
  return result;
}

/** Find a pair of own slots with the same known rank, or null. */
function findMatchHandPair(view: PlayerView, self: PlayerId): [HandIndex, HandIndex] | null {
  const entry = view.players.find((p) => p.id === self);
  if (!entry) return null;
  const ranks = ownKnownRanks(view, self);
  const indices = Object.keys(ranks).map(Number);
  for (let i = 0; i < indices.length; i++) {
    for (let j = i + 1; j < indices.length; j++) {
      const a = indices[i]!;
      const b = indices[j]!;
      if (ranks[a] === ranks[b] && entry.handSize - 2 >= view.rules.minHandSize) {
        return [a, b];
      }
    }
  }
  return null;
}

/** Find an own slot matching the discard top rank, or null. */
function findMatchDiscardSlot(view: PlayerView, self: PlayerId): HandIndex | null {
  const entry = view.players.find((p) => p.id === self);
  if (!entry || !view.discardTopCardId) return null;
  const discardCard = view.catalog[view.discardTopCardId];
  if (!discardCard) return null;
  const ranks = ownKnownRanks(view, self);
  for (const [idxStr, rank] of Object.entries(ranks)) {
    if (rank === discardCard.rank && entry.handSize - 1 >= view.rules.minHandSize) {
      return Number(idxStr);
    }
  }
  return null;
}

/** Decide what to do with a drawn card (called AFTER draw resolves). */
function decidePendingDraw(ctx: BotContext, legal: ReadonlyArray<Move>): Move | null {
  const { view, self } = ctx;
  if (!view.drawnCardId) return null;
  const drawnCard = view.catalog[view.drawnCardId];
  if (!drawnCard) return null;
  const entry = view.players.find((p) => p.id === self);
  if (!entry) return null;
  const ranks = ownKnownRanks(view, self);

  // 1. match_drawn: drawn matches a known slot
  for (const [idxStr, rank] of Object.entries(ranks)) {
    const idx = Number(idxStr);
    if (rank === drawnCard.rank && entry.handSize - 1 >= view.rules.minHandSize) {
      const m: Move = { type: 'match_drawn', playerId: self, handIndex: idx };
      if (legal.some((l) => l.type === m.type && (l as typeof m).handIndex === idx)) return m;
    }
  }

  // 2. swap_drawn: drawn is low (≤ 4) and a known high (≥ 9) slot exists
  if (cardValue(drawnCard, view.rules) <= 4) {
    let bestIdx: HandIndex | null = null;
    let bestVal = 0;
    for (const [idxStr] of Object.entries(ranks)) {
      // value comes from the catalog card, not from the rank directly
      const knownId = entry.knownCards[Number(idxStr)];
      if (!knownId) continue;
      const knownCard = view.catalog[knownId];
      if (!knownCard) continue;
      const val = cardValue(knownCard, view.rules);
      if (val >= 9 && val > bestVal) {
        bestVal = val;
        bestIdx = Number(idxStr);
      }
    }
    if (bestIdx !== null) {
      const m: Move = { type: 'swap_drawn', playerId: self, handIndex: bestIdx };
      if (legal.some((l) => l.type === 'swap_drawn' && (l as typeof m).handIndex === bestIdx)) {
        return m;
      }
    }
  }

  // 3. discard_drawn
  if (legal.some((l) => l.type === 'discard_drawn')) {
    return { type: 'discard_drawn', playerId: self };
  }

  return null;
}

/** Decide power resolution. */
function decidePower(ctx: BotContext, legal: ReadonlyArray<Move>): Move | null {
  const { view, self } = ctx;
  const pending = view.pendingPower;
  if (!pending) return null;

  if (pending.power === 'peek_self') {
    // Pick the least-known slot (first with no knownCards entry)
    const entry = view.players.find((p) => p.id === self);
    if (entry) {
      for (let i = 0; i < entry.handSize; i++) {
        if (entry.knownCards[i] === undefined) {
          const m: Move = { type: 'use_peek_self', playerId: self, handIndex: i };
          if (legal.some((l) => l.type === 'use_peek_self')) return m;
        }
      }
    }
  }

  if (pending.power === 'peek_opponent') {
    // Pick the opponent with the most unknown slots, then their first unknown slot
    let bestOpp: PlayerId | null = null;
    let bestUnknown = -1;
    for (const p of view.players) {
      if (p.id === self) continue;
      const unknown = p.handSize - Object.keys(p.knownCards).length;
      if (unknown > bestUnknown) {
        bestUnknown = unknown;
        bestOpp = p.id;
      }
    }
    if (bestOpp !== null) {
      const oppEntry = view.players.find((p) => p.id === bestOpp);
      if (oppEntry) {
        for (let i = 0; i < oppEntry.handSize; i++) {
          if (oppEntry.knownCards[i] === undefined) {
            const m: Move = {
              type: 'use_peek_opponent',
              playerId: self,
              targetPlayer: bestOpp,
              targetHandIndex: i,
            };
            if (legal.some((l) => l.type === 'use_peek_opponent')) return m;
          }
        }
      }
    }
  }

  if (pending.power === 'swap_blind') {
    // Only swap if we have a high-value known slot and opponent has an unknown slot
    const entry = view.players.find((p) => p.id === self);
    if (entry) {
      let highSelf: HandIndex | null = null;
      let highVal = 0;
      for (const [idxStr, _rank] of Object.entries(ownKnownRanks(view, self))) {
        const knownId = entry.knownCards[Number(idxStr)];
        if (!knownId) continue;
        const c = view.catalog[knownId];
        if (!c) continue;
        const val = cardValue(c, view.rules);
        if (val >= 9 && val > highVal) {
          highVal = val;
          highSelf = Number(idxStr);
        }
      }
      if (highSelf !== null) {
        for (const opp of view.players) {
          if (opp.id === self) continue;
          for (let i = 0; i < opp.handSize; i++) {
            if (opp.knownCards[i] === undefined) {
              const m: Move = {
                type: 'use_swap_blind',
                playerId: self,
                selfHandIndex: highSelf,
                targetPlayer: opp.id,
                targetHandIndex: i,
              };
              if (legal.some((l) => l.type === 'use_swap_blind')) return m;
            }
          }
        }
      }
    }
  }

  // Default: skip
  if (legal.some((l) => l.type === 'skip_power')) {
    return { type: 'skip_power', playerId: self };
  }
  return null;
}

const BOT_LOW_TOTAL_THRESHOLD = 8;
const PABLO_RARE_PROB = 1 / 30;
const PABLO_VERY_LOW_THRESHOLD = 5;

export function decide(ctx: BotContext, legal: ReadonlyArray<Move>): BotDecision {
  const { view, self, rng } = ctx;
  if (legal.length === 0) return { kind: 'pass' };

  // --- peek_phase ---
  if (view.status === 'peek_phase') {
    const peekMoves = legal.filter((m) => m.type === 'choose_peek');
    if (peekMoves.length > 0) {
      const entry = view.players.find((p) => p.id === self);
      const handSize = entry?.handSize ?? 4;
      const count = view.rules.initialPeekCount;
      // Pick bottom-two deterministically: last and second-to-last indices
      const indices: HandIndex[] = [];
      for (let i = handSize - 1; i >= 0 && indices.length < count; i--) {
        indices.unshift(i);
      }
      return {
        kind: 'peek',
        move: { type: 'choose_peek', playerId: self, indices },
      };
    }
    return { kind: 'pass' };
  }

  // --- off-turn Pablo check ---
  const isCurrentPlayer = view.currentPlayerId === self;
  if (!isCurrentPlayer) {
    if (legal.some((l) => l.type === 'call_pablo')) {
      const est = estimateOwnTotal(view, self);
      if (est <= BOT_LOW_TOTAL_THRESHOLD) {
        return {
          kind: 'off_turn_pablo',
          move: { type: 'call_pablo', playerId: self },
        };
      }
    }
    return { kind: 'pass' };
  }

  // --- on-turn: pending power ---
  if (view.pendingPower) {
    const m = decidePower(ctx, legal);
    if (m) return { kind: 'on_turn', move: m };
    return { kind: 'pass' };
  }

  // --- on-turn: after drawing ---
  if (view.drawnCardId !== null) {
    const m = decidePendingDraw(ctx, legal);
    if (m) return { kind: 'on_turn', move: m };
    // fallback: discard
    if (legal.some((l) => l.type === 'discard_drawn')) {
      return { kind: 'on_turn', move: { type: 'discard_drawn', playerId: self } };
    }
    return { kind: 'pass' };
  }

  // --- on-turn idle: match_hand (rule 1) ---
  const matchHandPair = findMatchHandPair(view, self);
  if (matchHandPair !== null) {
    const [a, b] = matchHandPair;
    return {
      kind: 'on_turn',
      move: { type: 'match_hand', playerId: self, handIndexA: a, handIndexB: b },
    };
  }

  // --- on-turn idle: match_discard (rule 2) ---
  const matchDiscardSlot = findMatchDiscardSlot(view, self);
  if (matchDiscardSlot !== null) {
    return {
      kind: 'on_turn',
      move: { type: 'match_discard', playerId: self, handIndex: matchDiscardSlot },
    };
  }

  // --- on-turn idle: rare Pablo on very low hand (rule 6) ---
  const est = estimateOwnTotal(view, self);
  if (est <= PABLO_VERY_LOW_THRESHOLD && rng.next() < PABLO_RARE_PROB) {
    if (legal.some((l) => l.type === 'call_pablo')) {
      return { kind: 'on_turn', move: { type: 'call_pablo', playerId: self } };
    }
  }

  // --- on-turn idle: draw (rule 3) ---
  if (legal.some((l) => l.type === 'draw_from_deck')) {
    return { kind: 'on_turn', move: { type: 'draw_from_deck', playerId: self } };
  }

  return { kind: 'pass' };
}
