import type { GameRules, GameState, PlayerId } from './types';
import { DEFAULT_RULES } from './types';
import { buildCatalog } from './internal/cards';
import { makeRng, shuffle } from './internal/rng';
import { emptyKnowledge } from './internal/knowledge';

/**
 * Build the initial state for a new game.
 *
 * - Builds the 52-card catalog.
 * - Shuffles using a seeded PRNG (caller provides the seed).
 * - Deals rules.initialHandSize cards to each player.
 * - Flips one card from the deck to start the discard pile.
 * - Status is 'peek_phase': players must each call choose_peek before play
 *   begins. If initialPeekCount===0, status starts as 'playing' directly.
 * - knownCards starts completely empty — no auto-peek. Knowledge comes only
 *   from explicit choose_peek moves and in-game power uses.
 * - Sets turnIndex=0, drawn=null, pabloCalledBy=null, scores all zero.
 */
export function newGame(opts: {
  readonly id: string;
  readonly players: ReadonlyArray<PlayerId>;
  readonly seed: string;
  readonly rules?: Partial<GameRules>;
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

  // knownCards starts empty — no automatic peek of bottom slots.
  const knownCards = emptyKnowledge(players);

  const scores: Record<PlayerId, number> = {};
  for (const p of players) {
    scores[p] = 0;
  }

  const finalHands: Record<PlayerId, readonly string[]> = {};
  for (const p of players) {
    finalHands[p] = hands[p]!;
  }

  // If initialPeekCount is 0, skip peek_phase entirely.
  const status = rules.initialPeekCount === 0 ? 'playing' : 'peek_phase';

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
    reshuffleCount: 0,
  };
}
