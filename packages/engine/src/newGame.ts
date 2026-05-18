import type { GameRules, GameState, HandIndex, PlayerId } from './types';
import { DEFAULT_RULES } from './types';
import { buildCatalog } from './internal/cards';
import { makeRng, shuffle } from './internal/rng';
import { emptyKnowledge, setKnowledge } from './internal/knowledge';

/**
 * Build the initial state for a new round.
 *
 * - Builds the 52-card catalog.
 * - Shuffles using a seeded PRNG (seed is the caller's responsibility — usually
 *   `${matchSeed}:r${roundNumber}`).
 * - Deals `rules.initialHandSize` cards to each player.
 * - Seeds `knownCards` with the bottom `rules.initialPeekCount` positions per player.
 * - Flips one card from the deck to start the discard pile.
 * - Sets turnIndex=0, status='playing', drawn=null.
 * - Initialises scores to 0 for every player (within-round accumulation only;
 *   cumulative tracking lives in MatchState).
 */
export function newGame(opts: {
  readonly id: string;
  readonly players: ReadonlyArray<PlayerId>;
  readonly seed: string;
  readonly rules?: Partial<GameRules>;
  readonly roundNumber?: number;
}): GameState {
  const { id, players, seed } = opts;

  if (players.length < 2 || players.length > 6) {
    throw new Error(`newGame: player count must be 2–6, got ${players.length}`);
  }

  const rules: GameRules = opts.rules ? { ...DEFAULT_RULES, ...opts.rules } : DEFAULT_RULES;

  const { catalog, ids } = buildCatalog();
  const rng = makeRng(seed);
  const deck = shuffle(ids, rng);

  // Deal hands.
  const hands: Record<PlayerId, string[]> = {};
  for (const p of players) {
    hands[p] = [];
  }
  for (let slot = 0; slot < rules.initialHandSize; slot++) {
    for (const p of players) {
      const card = deck.pop();
      if (!card) throw new Error('newGame: deck exhausted during deal');
      hands[p]!.push(card);
    }
  }

  // Flip one card to start the discard pile.
  const firstDiscard = deck.pop();
  if (!firstDiscard) throw new Error('newGame: deck exhausted before discard flip');
  const discard: string[] = [firstDiscard];

  // Seed initial knowledge: each player privately peeks their bottom slots.
  // Positions are 0-indexed left-to-right, top-to-bottom in the 2×2 grid.
  // "Bottom two" = positions 2 and 3.
  const peekSlots: HandIndex[] = [];
  for (let i = 0; i < rules.initialPeekCount; i++) {
    // Fill from the bottom: position (initialHandSize - 1 - i)
    const idx = (rules.initialHandSize - 1 - i) as HandIndex;
    peekSlots.push(idx);
  }

  let knownCards = emptyKnowledge(players);
  for (const p of players) {
    for (const slot of peekSlots) {
      const cardId = hands[p]![slot];
      if (cardId) {
        knownCards = setKnowledge(knownCards, p, p, slot, cardId);
      }
    }
  }

  // Build final scores map (all 0).
  const scores: Record<PlayerId, number> = {};
  for (const p of players) {
    scores[p] = 0;
  }

  const finalHands: Record<PlayerId, readonly string[]> = {};
  for (const p of players) {
    finalHands[p] = hands[p]!;
  }

  return {
    id,
    status: 'playing',
    seed,
    cardCatalog: catalog,
    deck,
    discard,
    players,
    hands: finalHands,
    turnIndex: 0,
    drawn: null,
    pabloCalledBy: null,
    finalTurnsRemaining: 0,
    scores,
    roundNumber: opts.roundNumber ?? 1,
    rules,
    knownCards,
    pendingPower: null,
    reshuffleCount: 0,
  };
}
