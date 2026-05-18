/**
 * Helpers for the per-player knowledge map inside GameState.
 *
 * knownCards[knower][target][handIndex] = cardId
 *
 * Internal — not re-exported from @pablo/engine.
 */

import type { CardId, GameState, PlayerId } from '../types';

type KnownCards = GameState['knownCards'];
type MutableKnown = Record<PlayerId, Record<PlayerId, Partial<Record<number, CardId>>>>;

/** Deep-clone the knownCards map into a mutable structure. */
function cloneKnown(known: KnownCards): MutableKnown {
  const out: MutableKnown = {};
  for (const knower of Object.keys(known)) {
    out[knower] = {};
    const targets = known[knower]!;
    for (const target of Object.keys(targets)) {
      out[knower]![target] = { ...targets[target] };
    }
  }
  return out;
}

/**
 * Record that `knower` now knows the card at `target[handIndex]`.
 */
export function setKnowledge(
  known: KnownCards,
  knower: PlayerId,
  target: PlayerId,
  handIndex: number,
  cardId: CardId,
): KnownCards {
  const m = cloneKnown(known);
  if (!m[knower]) m[knower] = {};
  if (!m[knower]![target]) m[knower]![target] = {};
  m[knower]![target]![handIndex] = cardId;
  return m;
}

/**
 * Clear knowledge of `target[handIndex]` for ALL knowers.
 * Called when a card at that position is replaced (e.g. after swap_drawn).
 */
export function clearSlotForAll(
  known: KnownCards,
  target: PlayerId,
  handIndex: number,
): KnownCards {
  const m = cloneKnown(known);
  for (const knower of Object.keys(m)) {
    if (m[knower]?.[target]) {
      delete m[knower]![target]![handIndex];
    }
  }
  return m;
}

/**
 * Clear only the player's own self-knowledge of one slot.
 *
 * Used after a failed matching claim with reason='wrong_rank' to drop the
 * player's stale memory of the targeted slot. Only touches knownCards[player][player];
 * other knowers' entries for that slot are unaffected.
 */
export function clearOwnSlot(known: KnownCards, player: PlayerId, index: number): KnownCards {
  const m = cloneKnown(known);
  if (m[player]?.[player]) {
    delete m[player]![player]![index];
  }
  return m;
}

/**
 * Symmetrically transfer knowledge when a blind swap is executed.
 *
 * For every knower K:
 *   - K's knowledge of p1[i] becomes K's knowledge of p2[j]
 *   - K's knowledge of p2[j] becomes K's knowledge of p1[i]
 *
 * One-directional partial transfers are correct when K only knew one side.
 */
export function swapKnowledge(
  known: KnownCards,
  p1: PlayerId,
  i: number,
  p2: PlayerId,
  j: number,
): KnownCards {
  const m = cloneKnown(known);
  for (const knower of Object.keys(m)) {
    const kMap = m[knower]!;
    const cardAtP1i = kMap[p1]?.[i];
    const cardAtP2j = kMap[p2]?.[j];

    if (!kMap[p1]) kMap[p1] = {};
    if (!kMap[p2]) kMap[p2] = {};

    if (cardAtP2j !== undefined) {
      kMap[p1]![i] = cardAtP2j;
    } else {
      delete kMap[p1]![i];
    }

    if (cardAtP1i !== undefined) {
      kMap[p2]![j] = cardAtP1i;
    } else {
      delete kMap[p2]![j];
    }
  }
  return m;
}

/**
 * Reindex all knowers' entries for `targetPlayer` after slots are removed.
 *
 * indexMap[oldIdx] = newIdx (or undefined if the slot was removed).
 * Entries pointing at removed slots are dropped. Entries pointing at kept
 * slots are written at the new index.
 */
export function reindexKnowledgeForPlayer(
  known: KnownCards,
  targetPlayer: PlayerId,
  indexMap: ReadonlyArray<number | undefined>,
): KnownCards {
  const m = cloneKnown(known);
  for (const knower of Object.keys(m)) {
    const oldEntries = { ...(m[knower]![targetPlayer] ?? {}) };
    const newEntries: Partial<Record<number, CardId>> = {};
    for (const [oldIdxStr, cardId] of Object.entries(oldEntries)) {
      const oldIdx = Number(oldIdxStr);
      const newIdx = indexMap[oldIdx];
      if (newIdx !== undefined && cardId !== undefined) {
        newEntries[newIdx] = cardId;
      }
    }
    m[knower]![targetPlayer] = newEntries;
  }
  return m;
}

/**
 * Initialise an empty knowledge map for all players.
 */
export function emptyKnowledge(players: ReadonlyArray<PlayerId>): KnownCards {
  const m: MutableKnown = {};
  for (const p of players) {
    m[p] = {};
    for (const q of players) {
      m[p]![q] = {};
    }
  }
  return m;
}
