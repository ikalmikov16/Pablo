import type { GameState, PlayerId, RoundScore } from './types';
import { cardValue } from './internal/cards';

/**
 * Compute scores at the end of a round.
 *
 * Rules (from docs/GAME_LOGIC.md):
 *  - Sum each player's hand values.
 *  - If Pablo was called AND the caller has the lowest hand value (including
 *    ties with non-callers): caller scores 0, all non-callers who are also
 *    tied for lowest score 0, others score their hand value.
 *  - If Pablo was called AND the caller does NOT have the lowest hand value:
 *    caller scores hand + pabloPenalty; actual lowest non-caller(s) score 0.
 *  - If Pablo was NOT called: lowest player(s) score 0, others score their
 *    hand value.
 *  - Ties for lowest (any case without the Pablo-caller penalty) all score 0.
 *
 * Decision: if the Pablo caller is tied for lowest among all players, the
 * caller is treated as "has the lowest" and scores 0 (not penalised).
 * Logged in docs/PLAN.md under "Decisions made".
 *
 * USAGE CONTRACT: Call scoreRound at most ONCE per round, on a state where
 * state.scores is still 0 (which is the case during a round). The match layer
 * uses `RoundScore.perPlayerRound` (not `.cumulative`) to update its own
 * cumulativeScores, so calling scoreRound twice on a state whose `.scores`
 * was already written by `finaliseRound` would double-count the cumulative
 * field. The round_ended event carries the canonical per-round score —
 * prefer the event over re-running scoreRound.
 */
export function scoreRound(state: GameState): RoundScore {
  const { players, hands, rules, pabloCalledBy, cardCatalog } = state;

  // Compute raw hand totals.
  const perPlayerHand: Record<PlayerId, number> = {};
  for (const p of players) {
    const hand = hands[p] ?? [];
    let total = 0;
    for (const cardId of hand) {
      const card = cardCatalog[cardId];
      if (card) total += cardValue(card, rules);
    }
    perPlayerHand[p] = total;
  }

  const perPlayerRound: Record<PlayerId, number> = {};
  let lowestHand = Infinity;
  for (const p of players) {
    if (perPlayerHand[p]! < lowestHand) lowestHand = perPlayerHand[p]!;
  }

  if (pabloCalledBy !== null) {
    const callerHand = perPlayerHand[pabloCalledBy]!;
    const callerIsLowest = callerHand <= lowestHand; // <= catches ties

    if (callerIsLowest) {
      // Caller is at or tied for lowest — no penalty.
      // All players at the minimum (including the caller) score 0.
      for (const p of players) {
        perPlayerRound[p] = perPlayerHand[p]! <= lowestHand ? 0 : perPlayerHand[p]!;
      }
    } else {
      // Caller is NOT lowest — caller pays penalty.
      for (const p of players) {
        if (p === pabloCalledBy) {
          perPlayerRound[p] = callerHand + rules.pabloPenalty;
        } else {
          // Non-caller lowest players score 0.
          perPlayerRound[p] = perPlayerHand[p]! <= lowestHand ? 0 : perPlayerHand[p]!;
        }
      }
    }
  } else {
    // No Pablo called: lowest hand(s) score 0.
    for (const p of players) {
      perPlayerRound[p] = perPlayerHand[p]! <= lowestHand ? 0 : perPlayerHand[p]!;
    }
  }

  // Accumulate on top of existing state.scores.
  const cumulative: Record<PlayerId, number> = {};
  for (const p of players) {
    cumulative[p] = (state.scores[p] ?? 0) + perPlayerRound[p]!;
  }

  // Lowest cumulative score wins the round (the player with lowest cumulative
  // after this round — usually just the player with 0 round score).
  // For the round winner we use the lowest round score.
  let lowestRound = Infinity;
  for (const p of players) {
    if (perPlayerRound[p]! < lowestRound) lowestRound = perPlayerRound[p]!;
  }
  const roundWinners = players.filter((p) => perPlayerRound[p] === lowestRound);
  // If there are ties, pick the one earliest in the player list (stable).
  const winner = roundWinners[0]!;

  const callerHand = pabloCalledBy !== null ? perPlayerHand[pabloCalledBy]! : null;
  const callerIsLowest = callerHand !== null && callerHand <= lowestHand;

  return {
    perPlayerHand,
    perPlayerRound,
    cumulative,
    winner,
    pabloCallerWasLowest: pabloCalledBy !== null ? callerIsLowest : null,
  };
}
