# Phase 2.5 — Engine rules revision implementation plan

> Status: **draft, awaiting approval** for branch `phase-2.5-engine` (off `main`).

## One-sentence goal

Re-shape `packages/engine` so its behaviour matches `docs/GAME_LOGIC.md` exactly under the 2026-05-17 rules pivot — five turn options, off-turn Pablo, variable hand size with penalty cards, single-game scoring with multi-winner ties, initial peek as an explicit move — while preserving engine purity, the seeded RNG, and the hidden-info projection contract.

---

## Branch + workflow

- Branch: `phase-2.5-engine` off `main` (NOT off `phase-4-singleplayer`; phase-4 plan is preserved in its own branch and rewritten only after 2.5 merges).
- Plan ships in the **same** PR as implementation (AGENTS.md hard rule #9).
- Last step before pushing: update `docs/PLAN.md` (move Phase 2.5 → Done, append new "Decisions Made" rows).
- Default = **do not merge**. Push branch and stop. User says "merge" before squash-merge.
- `bun run check` (format + lint + typecheck + tests) must be clean on the final commit.
- Coverage target: ≥ 95% on `packages/engine/src` (Phase 2 hit 98.99% — keep it there).

---

## Diff against the Phase 2 engine

File-by-file action list. Anything not mentioned stays.

### `packages/engine/src/types.ts` — **rewrite shape**

Deletions:

- `MatchState`, `MatchStatus`, `newMatch`/`startNextRound`/`endRound` type leakage.
- `GameStatus`: `'waiting'` and `'final_turns'` gone; `'peek_phase'` added.
- `HandIndex` literal union `0|1|2|3` → widens to `number` (validate `< handLength`).
- `DrawnCard.from`: union `'deck'|'discard'` collapses to `'deck'` (only source post-pivot — kept as a single-member literal for forward-compat).
- `GameRules`: drop `maxScore`, `pabloPenalty`, `allowDrawDiscardAndDiscard`; add `minHandSize`, `penaltyCardOnFail`.
- `GameState`: drop `roundNumber`, `finalTurnsRemaining`.
- `Move`: drop `draw_from_discard`. Add `choose_peek`, `match_drawn`, `match_hand`, `match_discard`.
- `GameEvent`: drop `final_turns_started`. Add `peek_chosen`, `peek_phase_ended`, `match_succeeded`, `match_failed`, `penalty_card_dealt`. Reshape `round_ended` to carry `winners: ReadonlyArray<PlayerId>` instead of `winner: PlayerId`.
- `MoveError`: drop `must_swap_after_discard_draw`, `discard_empty`. Add `not_peek_phase`, `peek_phase_active`, `already_peeked`, `invalid_peek_count`, `duplicate_indices`, `invalid_hand_index`, `same_index`, `discard_empty_for_match` (a different beast — see §9), `pablo_blocked` (covers `drawn !== null` and `pendingPower !== null` regardless of caller's turn). Keep `not_your_turn`, `not_in_game`, `already_drawn`, `must_draw_first`, `illegal_target`, `power_not_available`, `power_pending`, `no_power_to_resolve`, `game_already_ended`, `pablo_already_called`, `unknown_move`.
- `PlayerView`: drop `roundNumber`, `finalTurnsRemaining`. Add `pendingPower` (mirrors GameState shape), `drawnFrom: 'deck' | null`, `catalog: Readonly<Record<CardId, Card>>` (full 52, recommendation in §15).
- `PlayerViewEntry`: unchanged shape; `knownCards` keys widen from `HandIndex` to `number` (transparent).
- `RoundScore`: collapse to `{ perPlayerHand, winners }` — `perPlayerRound`, `cumulative`, `winner`, `pabloCallerWasLowest` all gone.

### `packages/engine/src/applyMove.ts` — **rewrite extensively**

- New `switch` arms for `choose_peek`, `match_drawn`, `match_hand`, `match_discard`.
- `call_pablo` gains an off-turn branch (current-player check becomes "player-in-game" + Pablo-not-called + not mid-action).
- `discard_drawn` loses its `must_swap_after_discard_draw` branch (drawn always from deck).
- `draw_from_discard` arm deleted entirely.
- `advanceTurn` gains off-turn-Pablo termination: when next index lands on `pabloCalledBy`, finalise instead of advancing.
- `drawTopOfDeck` body unchanged in shape but: sub-seed becomes `${seed}:rs${reshuffleCount}` (no `:r${roundNumber}`).
- `finaliseRound` rewritten to use the new `scoreRound` (no caller-vs-lowest); `round_ended` event now carries `winners: ReadonlyArray<PlayerId>`.

### `packages/engine/src/legalMoves.ts` — **rewrite**

- Hand-size loops use actual `state.hands[playerId].length` (no fixed `4`).
- `peek_phase`: enumerate `choose_peek` options as C(handSize, peekCount) tuples for `playerId` if they haven't peeked; return empty otherwise.
- `playing-idle` (current player): `draw_from_deck` + `match_hand` (all index pairs) + `match_discard` (one per slot, only if discard non-empty) + `call_pablo` (if `pabloCalledBy === null`).
- `playing-idle` (non-current player): just `call_pablo` if `pabloCalledBy === null` AND `drawn === null` AND `pendingPower === null`.
- `playing-drawn` (current player): `swap_drawn` × N + `discard_drawn` + `match_drawn` × N. No `call_pablo` (blocked mid-action).
- `playing-drawn` (non-current player): empty (off-turn Pablo blocked mid-action).
- `pending_power` (current player): unchanged set of `use_*` + `skip_power`, but enumerated over actual hand sizes.
- `pending_power` (non-current player): empty.
- `ended`: empty.

### `packages/engine/src/newGame.ts` — **update**

- Status starts at `'peek_phase'`.
- **No automatic seeding of `knownCards`** with bottom slots — `choose_peek` is the only path to initial knowledge.
- Drop `roundNumber` from input opts and output state.
- Drop `finalTurnsRemaining` from output state.
- Same dealing logic, same RNG seed (no longer derived from a "round number" — caller passes a fresh seed per game).

### `packages/engine/src/playerView.ts` — **update**

- Remove `roundNumber`, `finalTurnsRemaining`.
- Add `pendingPower` (verbatim from `state.pendingPower` — it's public info: everyone sees a power activated).
- Add `drawnFrom: 'deck' | null` (mirrors `state.drawn?.from ?? null`, currently always `'deck'` when set).
- Add `catalog: state.cardCatalog` (full 52 — see §15 question 3).
- Existing stale-knowledge filter (compare `hand[idx] === knownCardId`) stays — it naturally handles slot reindex, penalty cards, and dropped-slot residue.

### `packages/engine/src/score.ts` — **rewrite (much simpler)**

- Compute `perPlayerHand` exactly as today.
- Compute `lowestHand` across all players.
- `winners = players.filter(p => perPlayerHand[p] === lowestHand)`.
- No caller-vs-lowest logic. No penalty. Pablo caller scores their hand like everyone else.
- Return `{ perPlayerHand, winners }`.

### `packages/engine/src/match.ts` + `match.test.ts` — **delete entirely**

No multi-round wrapper post-pivot. Client orchestrates "play again" by calling `newGame` with a fresh seed.

### `packages/engine/src/internal/cards.ts` — **keep, re-export `cardValue`**

(Re-export happens in `index.ts`.)

### `packages/engine/src/internal/rng.ts` — **keep, re-export `makeRng`**

(Same.)

### `packages/engine/src/internal/knowledge.ts` — **extend**

Add:

```ts
export function reindexKnowledgeForPlayer(
  known: KnownCards,
  targetPlayer: PlayerId,
  indexMap: ReadonlyArray<number | undefined>,
): KnownCards;
// for every knower K, rewrites K[targetPlayer] so that
//   old index i → new index indexMap[i] (drops if undefined)

export function clearOwnSlot(known: KnownCards, player: PlayerId, index: number): KnownCards;
// clears known[player][player][index] only (not all knowers — used on failed
// matching claims where ONLY the claimant's self-knowledge is invalidated)
```

### `packages/engine/src/internal/penalty.ts` — **new**

```ts
export function drawPenaltyCard(
  state: GameState,
  recipient: PlayerId,
  events: GameEvent[],
): { state: GameState; roundEnded: boolean };
```

- If deck empty: reshuffle (same algorithm as `drawTopOfDeck`'s reshuffle path, increment `reshuffleCount`, emit `deck_reshuffled`). If still empty after reshuffle, call `finaliseRound` and return `{ state: finalState, roundEnded: true }`.
- Else: pop deck top, append to `hands[recipient]`, emit `penalty_card_dealt { playerId: recipient }`. **No `knownCards` entry written** (penalty cards are face-down to their owner).
- Returns the new state and whether the round ended (caller short-circuits if so).

### `packages/engine/src/internal/hand.ts` — **new**

```ts
export function removeSlots(
  hand: ReadonlyArray<CardId>,
  removed: ReadonlyArray<number>,
): { newHand: ReadonlyArray<CardId>; indexMap: ReadonlyArray<number | undefined> };
// pure: filters out removed indices, returns the new array AND a mapping
// where indexMap[oldIdx] = newIdx | undefined
```

### `packages/engine/src/index.ts` — **update exports**

```ts
export * from './types';
export { newGame } from './newGame';
export { applyMove } from './applyMove';
export { computePlayerView } from './playerView';
export { scoreRound } from './score';
export { legalMoves } from './legalMoves';
// NEW public exports (per §15 question 4):
export { makeRng } from './internal/rng';
export { cardValue, cardId, buildCatalog } from './internal/cards';
// REMOVED:
// export { newMatch, startNextRound, endRound } from './match';
```

---

## New / updated type definitions

Authoritative TS for the changed shapes. Strict-mode clean, `readonly` everywhere.

```ts
// types.ts (after the rewrite)

export type GameStatus = 'peek_phase' | 'playing' | 'ended';

export type HandIndex = number; // non-negative integer; callers validate < hand.length

export type Hand = ReadonlyArray<CardId>;

export type DrawnCard = {
  readonly playerId: PlayerId;
  readonly cardId: CardId;
  readonly from: 'deck'; // pivot removed 'discard' source
};

export type GameRules = {
  readonly kingValue: number;
  readonly queenValue: number;
  readonly jackValue: number;
  readonly cardValueOverrides: ReadonlyArray<CardValueOverride>;
  readonly powers: Readonly<Partial<Record<Rank, SpecialPower>>>;
  readonly initialHandSize: number; // typically 4
  readonly initialPeekCount: number; // typically 2
  readonly minHandSize: number; // typically 2
  readonly penaltyCardOnFail: number; // typically 1
  // REMOVED: maxScore, pabloPenalty, allowDrawDiscardAndDiscard
};

export const DEFAULT_RULES: GameRules = {
  kingValue: 10,
  queenValue: 10,
  jackValue: 10,
  cardValueOverrides: [{ suit: 'hearts', rank: 13, value: 0 }],
  powers: { 7: 'peek_self', 8: 'peek_opponent', 9: 'swap_blind' },
  initialHandSize: 4,
  initialPeekCount: 2,
  minHandSize: 2,
  penaltyCardOnFail: 1,
};

export type GameState = {
  readonly id: string;
  readonly status: GameStatus;
  readonly seed: string;
  readonly cardCatalog: Readonly<Record<CardId, Card>>;
  readonly deck: ReadonlyArray<CardId>;
  readonly discard: ReadonlyArray<CardId>;
  readonly players: ReadonlyArray<PlayerId>;
  readonly hands: Readonly<Record<PlayerId, Hand>>;
  readonly turnIndex: number;
  readonly drawn: DrawnCard | null;
  readonly pabloCalledBy: PlayerId | null;
  readonly scores: Readonly<Record<PlayerId, number>>;
  readonly rules: GameRules;
  readonly knownCards: Readonly<
    Record<PlayerId, Readonly<Record<PlayerId, Readonly<Partial<Record<number, CardId>>>>>>
  >;
  readonly pendingPower: Readonly<{
    rank: Rank;
    power: SpecialPower;
    playerId: PlayerId;
  }> | null;
  readonly reshuffleCount: number;
  // REMOVED: roundNumber, finalTurnsRemaining
};

export type Move =
  | {
      readonly type: 'choose_peek';
      readonly playerId: PlayerId;
      readonly indices: ReadonlyArray<HandIndex>; // length must equal rules.initialPeekCount, all unique, all in-range
    }
  | { readonly type: 'draw_from_deck'; readonly playerId: PlayerId }
  | { readonly type: 'swap_drawn'; readonly playerId: PlayerId; readonly handIndex: HandIndex }
  | { readonly type: 'discard_drawn'; readonly playerId: PlayerId }
  | { readonly type: 'match_drawn'; readonly playerId: PlayerId; readonly handIndex: HandIndex }
  | {
      readonly type: 'match_hand';
      readonly playerId: PlayerId;
      readonly handIndexA: HandIndex;
      readonly handIndexB: HandIndex; // must differ from A
    }
  | { readonly type: 'match_discard'; readonly playerId: PlayerId; readonly handIndex: HandIndex }
  | { readonly type: 'use_peek_self'; readonly playerId: PlayerId; readonly handIndex: HandIndex }
  | {
      readonly type: 'use_peek_opponent';
      readonly playerId: PlayerId;
      readonly targetPlayer: PlayerId;
      readonly targetHandIndex: HandIndex;
    }
  | {
      readonly type: 'use_swap_blind';
      readonly playerId: PlayerId;
      readonly selfHandIndex: HandIndex;
      readonly targetPlayer: PlayerId;
      readonly targetHandIndex: HandIndex;
    }
  | { readonly type: 'skip_power'; readonly playerId: PlayerId }
  | { readonly type: 'call_pablo'; readonly playerId: PlayerId };
//   ^ legal for ANY player (current or not) as long as pabloCalledBy===null,
//     drawn===null, pendingPower===null, status==='playing'. On-turn caller
//     → round ends immediately. Off-turn caller → set pabloCalledBy, emit
//     pablo_called, no turn change.

export type MatchKind = 'drawn' | 'hand' | 'discard'; // moves #3, #4, #5

export type MatchFailReason = 'wrong_rank' | 'min_hand_size';

export type GameEvent =
  | { readonly type: 'card_drawn'; readonly playerId: PlayerId; readonly from: 'deck' }
  | {
      readonly type: 'card_swapped';
      readonly playerId: PlayerId;
      readonly handIndex: HandIndex;
      readonly discardedCardId: CardId;
    }
  | { readonly type: 'card_discarded'; readonly cardId: CardId; readonly playerId: PlayerId }
  | {
      readonly type: 'peeked';
      readonly playerId: PlayerId;
      readonly targetPlayer: PlayerId;
      readonly handIndex: HandIndex;
      readonly cardId: CardId;
    }
  | {
      readonly type: 'swapped_blind';
      readonly playerId: PlayerId;
      readonly selfHandIndex: HandIndex;
      readonly targetPlayer: PlayerId;
      readonly targetHandIndex: HandIndex;
    }
  | { readonly type: 'pablo_called'; readonly playerId: PlayerId }
  | { readonly type: 'turn_ended'; readonly nextPlayer: PlayerId }
  | { readonly type: 'deck_reshuffled' }
  | {
      readonly type: 'round_ended';
      readonly scores: Readonly<Record<PlayerId, number>>;
      readonly winners: ReadonlyArray<PlayerId>; // multi-element on tie
    }
  | {
      readonly type: 'power_activated';
      readonly rank: Rank;
      readonly power: SpecialPower;
      readonly playerId: PlayerId;
    }
  // NEW for Phase 2.5:
  | {
      readonly type: 'peek_chosen';
      readonly playerId: PlayerId;
      // indices intentionally omitted — private to the choosing player; the
      // projection delivers them via knownCards (§15 question 9).
    }
  | { readonly type: 'peek_phase_ended' }
  | {
      readonly type: 'match_succeeded';
      readonly playerId: PlayerId;
      readonly kind: MatchKind;
      readonly slotIndices: ReadonlyArray<HandIndex>; // removed slots
      readonly discardedCardIds: ReadonlyArray<CardId>; // landed on discard, in landing order
    }
  | {
      readonly type: 'match_failed';
      readonly playerId: PlayerId;
      readonly kind: MatchKind;
      readonly slotIndices: ReadonlyArray<HandIndex>; // the slots the player TARGETED
      readonly reason: MatchFailReason;
    }
  | { readonly type: 'penalty_card_dealt'; readonly playerId: PlayerId };
// REMOVED: final_turns_started

export type RoundScore = {
  readonly perPlayerHand: Readonly<Record<PlayerId, number>>;
  readonly winners: ReadonlyArray<PlayerId>; // multi-element on tie
};

export type PlayerView = {
  readonly self: PlayerId;
  readonly status: GameStatus;
  readonly deckCount: number;
  readonly discardTopCardId: CardId | null;
  readonly currentPlayerId: PlayerId;
  readonly players: ReadonlyArray<PlayerViewEntry>;
  readonly drawnCardId: CardId | null;
  readonly drawnFrom: 'deck' | null; // NEW
  readonly pabloCalledBy: PlayerId | null;
  readonly pendingPower: GameState['pendingPower']; // NEW — public info
  readonly catalog: Readonly<Record<CardId, Card>>; // NEW — full 52
  readonly rules: GameRules;
  // REMOVED: roundNumber, finalTurnsRemaining
};
```

---

## State machine diagram

```
                                  newGame()
                                     │
                                     ▼
                       ┌──────────────────────────┐
                       │       peek_phase         │
                       │  (status='peek_phase')   │
                       │                          │
                       │ Each player calls        │
                       │ choose_peek({indices})   │
                       │ exactly once.            │
                       │ Turn pointer unused.     │
                       └────────────┬─────────────┘
                                    │ all players have peeked
                                    │ → emit peek_phase_ended
                                    ▼
                       ┌──────────────────────────┐
                       │         playing          │
                       │   (status='playing')     │
                       │                          │
                       │   ┌─────────────────┐    │
                       │   │  idle           │    │  draw_from_deck
                       │   │  drawn=null     │────┼────┐
                       │   │  pendingPower=  │    │    │
                       │   │   null          │    │    ▼
                       │   └────────▲────────┘    │ ┌─────────────────┐
                       │            │             │ │  drawn          │
                       │  match_*   │             │ │  drawn={...}    │
                       │  (success  │             │ │  pendingPower=  │
                       │  or fail)  │             │ │   null          │
                       │  power     │             │ └────────┬────────┘
                       │  skip      │             │          │
                       │  swap_drawn│             │          │
                       │  discard_  │             │ swap_drawn / match_drawn(any outcome)
                       │  drawn(no  │             │ / discard_drawn(no power)
                       │  power)    │             │          │
                       │            │             │          ▼ advanceTurn
                       │            │             │ ┌─────────────────┐
                       │            │             │ │  pending_power  │
                       │            │             │ │  drawn=null     │
                       │            │             │ │  pendingPower=  │
                       │            │             │ │   {...}         │
                       │            │             │ └────────┬────────┘
                       │            │             │          │ use_* / skip_power
                       │            │             │          │
                       │            └─────────────┴──────────┘  advanceTurn
                       └────────────┬─────────────────────────┘
                                    │
                                    │ One of:
                                    │  (a) on-turn call_pablo
                                    │  (b) advanceTurn finds next player === pabloCalledBy
                                    │  (c) drawTopOfDeck / drawPenaltyCard exhaust deck+discard
                                    ▼
                       ┌──────────────────────────┐
                       │          ended           │
                       │   (status='ended')       │
                       │  scores=perPlayerHand    │
                       │  round_ended event with  │
                       │  winners[]               │
                       └──────────────────────────┘

Off-turn call_pablo (non-current player, status='playing', drawn===null,
pendingPower===null, pabloCalledBy===null):
   - sets state.pabloCalledBy = caller
   - emits pablo_called
   - DOES NOT touch turnIndex or status
   - does not emit turn_ended
   - current player continues whatever they were doing
   - subsequent advanceTurn calls check: if players[nextIndex] === pabloCalledBy
     → finaliseRound (skip the caller's turn, score everyone's hand as-is)
```

---

## Penalty-card mechanic

**Helper**: `drawPenaltyCard(state, recipient, events): { state, roundEnded }` in `packages/engine/src/internal/penalty.ts`.

**Behaviour, in order**:

1. If `state.deck.length === 0`:
   - If `state.discard.length <= 1`: nothing to reshuffle → `finaliseRound(state, events)` → return `{ state: finalState, roundEnded: true }`.
   - Else: increment `reshuffleCount`, derive sub-seed `${state.seed}:rs${newCount}`, shuffle `discard.slice(0, -1)` with that RNG into the new `deck`, leave the discard top in place. Emit `deck_reshuffled`. Mutate the working state to the reshuffled shape.
   - After reshuffle, if `deck.length === 0` still (impossible unless every card is in a hand): finalise + return `{ roundEnded: true }`.
2. Pop the top of the deck (`deck.pop()`).
3. Append that card id to `hands[recipient]` (immutably).
4. **Do not** write any `knownCards` entry — penalty cards are face-down even to the owner (per `docs/GAME_LOGIC.md` § "Penalty cards").
5. Emit `penalty_card_dealt { playerId: recipient }`.
6. Return `{ state: newState, roundEnded: false }`.

**Interactions**:

- Called from every failed `match_*` arm. Failed-claim flow: emit `match_failed`, then call `drawPenaltyCard`, then (if not `roundEnded`) `advanceTurn`.
- For `match_drawn` fail specifically: the drawn card gets appended BEFORE the penalty card (so the drawn card is at slot N and the penalty is at slot N+1). Knowledge is set for slot N (drawer saw the card) but NOT for slot N+1.
- Multiple penalty cards in a single move are not part of the v1 rules (`penaltyCardOnFail` defaults to 1) but the helper is written to be called in a loop if `rules.penaltyCardOnFail > 1`. The helper short-circuits the loop if `roundEnded` becomes true mid-loop.

**Why no `knownCards` update**:

`computePlayerView` filters `knownCards` against the actual hand, so a missing entry yields a face-down slot for everyone (including the owner). That is the desired behaviour.

---

## Slot reindex mechanic

**Helpers**: `removeSlots(hand, removed)` in `internal/hand.ts`; `reindexKnowledgeForPlayer(known, targetPlayer, indexMap)` in `internal/knowledge.ts`.

**`removeSlots`**:

- Pure function over `(hand, sortedRemovedIndices)`.
- Returns `{ newHand, indexMap }` where `indexMap[oldIdx] = newIdx | undefined`.
- Example: `hand = [c0,c1,c2,c3]`, `removed = [0,2]` → `newHand=[c1,c3]`, `indexMap=[undefined, 0, undefined, 1]`.

**`reindexKnowledgeForPlayer`**:

- For every knower K, rewrites `known[K][targetPlayer]` by walking each `(oldIdx, cardId)` entry:
  - If `indexMap[oldIdx] === undefined`: drop the entry (slot was removed).
  - Else: write at `indexMap[oldIdx]`.
- Other knowers' entries for OTHER players are untouched.

**Where it's used**:

- Inside the success branches of `match_drawn` (1 slot removed), `match_hand` (2 slots removed), `match_discard` (1 slot removed). Sequence: build new hand → build indexMap → reindex knownCards → write back.

**Stale-knowledge safety net**:

- `computePlayerView` already gates each knownCards entry on `hand[idx] === knownCardId`. So even if a reindex bug somehow left a stale entry pointing at a slot that's now occupied by a different card, the projection drops it. Defence in depth: the projection is the last word on visibility.

**What if a knower had stale knowledge of a removed slot**:

- The engine drops it during reindex (indexMap returns `undefined`).
- Even without the reindex, the projection's `hand[idx] === knownCardId` check would have hidden it on the next view.

**Growth case (penalty card / drawn-card-appended on #3 fail)**:

- No reindex needed — existing slots keep their indices; new card sits at slot N = old length.
- For the drawn-card-appended case, the engine writes `knownCards[player][player][N] = drawnCardId` (the player saw the draw, so they know what's at slot N).

---

## New move handlers

Each spec follows the same shape: guards → effect → events → state transition.

### `choose_peek`

**Legal preconditions**:

- `state.status === 'peek_phase'` (else `not_peek_phase`).
- `state.players.includes(move.playerId)` (else `not_in_game`).
- This player hasn't already peeked (check: `Object.keys(state.knownCards[playerId][playerId] ?? {}).length === 0`; if non-zero → `already_peeked`).
- `move.indices.length === state.rules.initialPeekCount` (else `invalid_peek_count`).
- All indices in `[0, hand.length)` (else `invalid_hand_index`).
- All indices unique (else `duplicate_indices`).

**Success path**:

- For each `i` in `move.indices`: `knownCards = setKnowledge(knownCards, playerId, playerId, i, hand[i])`.
- Emit `peek_chosen { playerId }`.
- If every player now has `Object.keys(knownCards[p][p]).length === rules.initialPeekCount`: set `status = 'playing'`, emit `peek_phase_ended`.
- Return `{ ok: true, state: newState, events }`.
- **Turn pointer untouched** — peek phase has no turn order.

**Failure path**: return `{ ok: false, error: <one of the codes above> }` without state change.

### `match_drawn` (move #3)

**Legal preconditions**:

- `state.status === 'playing'` (else `game_already_ended` if `'ended'`, else fall through).
- `state.players[state.turnIndex] === move.playerId` (else `not_your_turn`).
- `state.drawn !== null` (else `must_draw_first`).
- `state.pendingPower === null` (else `power_pending`).
- `move.handIndex < hand.length` (else `invalid_hand_index`).

**Decide success vs failure**:

- `drawnRank = catalog[state.drawn.cardId].rank`.
- `targetRank = catalog[hand[move.handIndex]].rank`.
- If `drawnRank !== targetRank` → FAIL with reason `wrong_rank`.
- Else if `hand.length - 1 < rules.minHandSize` → FAIL with reason `min_hand_size`.
- Else → SUCCESS.

**Success path**:

- `newHand, indexMap = removeSlots(hand, [move.handIndex])`.
- `knownCards = reindexKnowledgeForPlayer(known, playerId, indexMap)`.
- Discard pile gains `[drawnCardId, targetCardId]` in that order (so the formerly hand-side card lands on top).
- Emit `card_discarded { cardId: drawnCardId, playerId }`.
- Emit `card_discarded { cardId: targetCardId, playerId }`.
- Emit `match_succeeded { playerId, kind: 'drawn', slotIndices: [move.handIndex], discardedCardIds: [drawnCardId, targetCardId] }`.
- `state.drawn = null`; `advanceTurn`.

**Failure path** (both reasons):

- Append `drawnCardId` to hand at new slot N (the player saw it; set `knownCards[playerId][playerId][N] = drawnCardId`).
- Clear targeted slot from the player's own self-knowledge (only on `wrong_rank` — see §15 question 1; on `min_hand_size`, preserve).
- `state.drawn = null`.
- Emit `match_failed { playerId, kind: 'drawn', slotIndices: [move.handIndex], reason }`.
- Loop `penaltyCardOnFail` times: `drawPenaltyCard(state, playerId, events)`. If any iteration returns `roundEnded: true`, return early with the final state.
- `advanceTurn`.

### `match_hand` (move #4)

**Legal preconditions**:

- `state.status === 'playing'` (else `game_already_ended` if `'ended'`).
- `state.players[state.turnIndex] === move.playerId` (else `not_your_turn`).
- `state.drawn === null` (else `already_drawn`).
- `state.pendingPower === null` (else `power_pending`).
- `move.handIndexA !== move.handIndexB` (else `same_index`).
- Both indices `< hand.length` (else `invalid_hand_index`).

**Decide success vs failure**:

- `rankA = catalog[hand[A]].rank`, `rankB = catalog[hand[B]].rank`.
- If `rankA !== rankB` → FAIL with reason `wrong_rank`.
- Else if `hand.length - 2 < rules.minHandSize` → FAIL with reason `min_hand_size`.
- Else → SUCCESS.

**Success path**:

- `newHand, indexMap = removeSlots(hand, [A, B])`.
- Reindex knowledge for the player.
- Discard pile gains `[hand[A], hand[B]]`.
- Emit `card_discarded` × 2, then `match_succeeded { kind: 'hand', slotIndices: [A, B], discardedCardIds: [hand[A], hand[B]] }`.
- `advanceTurn`.

**Failure path** (both reasons):

- Hand unchanged.
- Clear targeted slots from the player's own self-knowledge for indices A and B (only on `wrong_rank`; on `min_hand_size`, preserve — see §15 q1).
- Emit `match_failed { playerId, kind: 'hand', slotIndices: [A, B], reason }`.
- Penalty card loop (`penaltyCardOnFail` times), with early return if `roundEnded`.
- `advanceTurn`.

### `match_discard` (move #5)

**Legal preconditions**:

- `state.status === 'playing'`.
- `state.players[state.turnIndex] === move.playerId` (`not_your_turn` otherwise).
- `state.drawn === null` (`already_drawn`).
- `state.pendingPower === null` (`power_pending`).
- `state.discard.length > 0` (else `discard_empty_for_match` — distinct error code so legalMoves can mask this when discard is empty).
- `move.handIndex < hand.length`.

**Decide success vs failure**:

- `topRank = catalog[discard[discard.length - 1]].rank`.
- `targetRank = catalog[hand[move.handIndex]].rank`.
- If `topRank !== targetRank` → FAIL `wrong_rank`.
- Else if `hand.length - 1 < rules.minHandSize` → FAIL `min_hand_size`.
- Else SUCCESS.

**Success path**:

- `newHand, indexMap = removeSlots(hand, [move.handIndex])`.
- Reindex knowledge.
- Discard pile gains `[hand[move.handIndex]]` (pushed on top — previous top stays beneath; the new card is the new top).
- Emit `card_discarded { cardId: hand[move.handIndex], playerId }`, then `match_succeeded { kind: 'discard', slotIndices: [move.handIndex], discardedCardIds: [hand[move.handIndex]] }`.
- `advanceTurn`.

**Failure path** (both reasons):

- Hand unchanged.
- Clear targeted slot self-knowledge (only on `wrong_rank`).
- Emit `match_failed { kind: 'discard', slotIndices: [move.handIndex], reason }`.
- Penalty card loop, early-return on `roundEnded`.
- `advanceTurn`.

---

## Failed-match details (consolidated)

| Move (fail mode)         | Hand outcome                                                                             | Knowledge outcome                                                             | Net hand delta | Turn outcome                 |
| ------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------- | ---------------------------- |
| #3 fail `wrong_rank`     | Drawn appended (slot N); penalty appended                                                | Clear self-knowledge of targeted slot. Set self-knowledge of slot N to drawn. | +2             | `advanceTurn`                |
| #3 fail `min_hand_size`  | Drawn appended (slot N); penalty appended                                                | Preserve self-knowledge of targeted slot. Set self-knowledge of slot N.       | +2             | `advanceTurn`                |
| #4 fail `wrong_rank`     | Both slots stay; penalty appended                                                        | Clear self-knowledge of BOTH targeted slots.                                  | +1             | `advanceTurn`                |
| #4 fail `min_hand_size`  | Both slots stay; penalty appended                                                        | Preserve self-knowledge of both targeted slots.                               | +1             | `advanceTurn`                |
| #5 fail `wrong_rank`     | Slot stays; penalty appended                                                             | Clear self-knowledge of targeted slot.                                        | +1             | `advanceTurn`                |
| #5 fail `min_hand_size`  | Slot stays; penalty appended                                                             | Preserve self-knowledge of targeted slot.                                     | +1             | `advanceTurn`                |
| Any fail, deck exhausted | Same as above, then `finaliseRound` fires from `drawPenaltyCard` if reshuffle also fails | n/a (game over)                                                               | varies         | round ends, no `advanceTurn` |

Rationale for the wrong_rank/min_hand_size knowledge split (see §15 q1 — surfaced as an explicit decision):

- A `wrong_rank` failure proves the player remembered the rank incorrectly → drop the bad memory.
- A `min_hand_size` failure says nothing about whether the player remembered the rank — the play could have succeeded if hand-size hadn't blocked it. Don't punish memory that wasn't demonstrably wrong.

---

## Off-turn Pablo state machine

**Move guard for `call_pablo` (uniform for on-turn and off-turn)**:

```
status === 'playing'                  else: not_peek_phase OR game_already_ended
players.includes(move.playerId)       else: not_in_game
pabloCalledBy === null                else: pablo_already_called
drawn === null                        else: pablo_blocked  (mid-draw)
pendingPower === null                 else: pablo_blocked  (mid-power)
```

No `not_your_turn` check — off-turn calls are allowed.

**Branch on caller vs. current player**:

```
const isOnTurn = state.players[state.turnIndex] === move.playerId;

if (isOnTurn) {
  // On-turn Pablo: round ends immediately.
  events.push({ type: 'pablo_called', playerId: move.playerId });
  const { state: finalState } = finaliseRound(
    { ...state, pabloCalledBy: move.playerId },
    events,
  );
  return { ok: true, state: finalState, events };
}

// Off-turn Pablo: pre-announce.
events.push({ type: 'pablo_called', playerId: move.playerId });
return {
  ok: true,
  state: { ...state, pabloCalledBy: move.playerId },
  events,
};
// No turnIndex change, no status change, no turn_ended event.
// The current player keeps playing.
```

**Turn-advance helper (`advanceTurn`)** picks up the rest:

```
const nextIndex = (state.turnIndex + 1) % state.players.length;
const nextPlayer = state.players[nextIndex];

if (state.pabloCalledBy !== null && nextPlayer === state.pabloCalledBy) {
  // The pointer just landed on the caller. Their turn is skipped; finalise.
  return finaliseRound({ ...state, turnIndex: nextIndex, drawn: null, pendingPower: null }, events).state;
}

events.push({ type: 'turn_ended', nextPlayer });
return { ...state, turnIndex: nextIndex, drawn: null, pendingPower: null };
```

This works for both 2-player and N-player cases:

- 2-player ABC… wait, 2-player AB: A is current, B calls off-turn. A finishes → advanceTurn → nextIndex=1 (B) → B===pabloCalledBy → finalise. (A acted once after the call, B never acts.)
- 3-player ABC: B calls during A's turn. A finishes → next=B → finalise. C never plays.
- 3-player ABC: C calls during A's turn. A finishes → next=B → B plays → advanceTurn → next=C → finalise.
- 4-player ABCD: D calls during A's turn. A → next=B → B plays → next=C → C plays → next=D → finalise.

---

## Reshuffle determinism

**Sub-seed**: `${state.seed}:rs${state.reshuffleCount + 1}` (then `reshuffleCount` increments to that value).

**Round number is gone**. The engine no longer knows about rounds (no `match.ts`). Each `newGame` takes a fresh `seed` from the caller; replay reproducibility is at the game level, not the match level.

The sub-seed is constructed inside both `drawTopOfDeck` and `drawPenaltyCard` — they share the same logic, so a single helper `reshuffleDiscardIntoDeck(state, events)` will live in `internal/` for DRY.

---

## Test plan (per file)

Coverage target: ≥ 95% on `packages/engine/src`. We mirror Phase 2's test-per-rule discipline.

### `newGame.test.ts` — rewrite

- Status: `peek_phase` at game start (not `'waiting'`, not `'playing'`).
- No automatic knowledge: `state.knownCards[p][p]` is empty for every `p` (in contrast to Phase 2's auto-peek-of-bottom-2).
- 52-card invariant still holds (catalog/deck/discard/hands disjoint, union size 52).
- Deck sizes: 43 for 2 players, 27 for 6 players.
- Determinism: same seed → identical deck/hands/discard.
- Different seeds → different deals.
- Rules deep-merge: caller can override `minHandSize`, `penaltyCardOnFail`, `initialPeekCount`, `initialHandSize`, `powers`, value overrides.
- Throws for `< 2` players and `> 6` players.
- `pendingPower=null`, `reshuffleCount=0`, `pabloCalledBy=null`, `drawn=null`, `turnIndex=0`, `scores` all zero.
- `state.roundNumber` is NOT a field (compile-time check via `// @ts-expect-error`).

### `applyMove.test.ts` — rewrite

#### `choose_peek`

- Happy path: alice picks `[0, 2]`, knownCards updated for those slots, `peek_chosen` event emitted, status still `peek_phase` if bob hasn't peeked.
- All players peek → status transitions to `'playing'`, `peek_phase_ended` event fires after the last `peek_chosen`.
- `already_peeked` when same player calls twice.
- `invalid_peek_count` when `indices.length !== rules.initialPeekCount`.
- `duplicate_indices` when an index is repeated.
- `invalid_hand_index` when an index >= `hand.length`.
- `not_peek_phase` when called after game starts (status='playing').
- `not_in_game` for unknown player.

#### `draw_from_deck`

- Same semantics as Phase 2 but: must be `status='playing'` (not `peek_phase`).
- Error path: calling during `peek_phase` returns `peek_phase_active`.
- All other branches (`already_drawn`, `power_pending`, `not_your_turn`, `not_in_game`, `game_already_ended`) preserved.

#### `swap_drawn`, `discard_drawn`, `use_*`, `skip_power`

- Same semantics as Phase 2; tests adapted only to new initial-state setup (must call `choose_peek` for every player first, or use a fixture that synthesises `status='playing'` via a small helper).
- `discard_drawn` no longer has the `must_swap_after_discard_draw` branch.

#### `match_drawn` (move #3)

- Success (rank match): hand shrinks by 1, both cards on discard, knownCards reindexed, `match_succeeded` event.
- Success cleans up downstream knowers: if bob knew alice slot 2 and alice's slot 2 is the matched-out card, bob's knowledge of that slot is dropped (was either the moved-to-discard card or filtered by the projection).
- Fail `wrong_rank`: drawn appended, penalty appended, hand grows by 2, knownCards cleared for targeted slot, knownCards set for drawn slot.
- Fail `min_hand_size` at hand size 2: rank IS the same, but hand can't drop to 1 → fails the `min_hand_size` way; drawn appended, penalty appended, knownCards for targeted slot PRESERVED (per §15 q1).
- `must_draw_first` when no `drawn`.
- `power_pending` when a power is pending.
- `not_your_turn` for non-current player.
- `invalid_hand_index` for out-of-range index.

#### `match_hand` (move #4)

- Success (ranks match, hand size sufficient): both slots removed, discard gains 2, knownCards reindexed, `match_succeeded` event.
- Fail `wrong_rank`: hand unchanged, penalty appended, knownCards cleared for BOTH targeted slots.
- Fail `min_hand_size`: hand size 2 → claim ranks match but would drop to 0 → fail with reason `min_hand_size`; knownCards preserved.
- `same_index` when A === B.
- `invalid_hand_index` when either index out of range.
- `already_drawn` when mid-draw.
- `power_pending` when a power is pending.

#### `match_discard` (move #5)

- Success (top of discard rank matches): slot removed, hand[index] becomes new discard top, knownCards reindexed.
- Fail `wrong_rank`: slot stays, penalty appended, knownCards cleared for targeted slot.
- Fail `min_hand_size` at hand size 2.
- `discard_empty_for_match` when discard is empty (legalMoves should suppress this in normal play; the error is for defensive coverage).
- `already_drawn`, `power_pending`, `invalid_hand_index`.

#### Slot reindex (cross-cutting)

- Hand `[c0, c1, c2, c3]`, knowledge `{0: c0, 2: c2}`. After `match_hand([0, 2])` succeeds: hand becomes `[c1, c3]`, knowledge becomes `{}` (both known slots removed).
- Hand `[c0, c1, c2, c3]`, knowledge `{1: c1, 3: c3}`. After `match_hand([0, 2])`: hand `[c1, c3]`, knowledge `{0: c1, 1: c3}` (indices shift).
- Two successive shrinks: start `[c0..c4]`, match #5 on slot 2 → `[c0, c1, c3, c4]`; match #5 on slot 0 → `[c1, c3, c4]`. Verify a knownCards entry that was originally `{3: c3, 4: c4}` ends up `{1: c3, 2: c4}`.
- Cross-knower: if bob knew `alice[1] = X` and `alice[3] = Y`, and alice does a successful `match_hand([0, 2])`, bob's knowledge ends up `{0: X, 1: Y}` (his entries for alice were reindexed too).

#### Penalty-card flow with empty deck

- Hand-set-up where `deck.length === 0` and `discard.length > 1`: failed match triggers reshuffle inside `drawPenaltyCard`, `deck_reshuffled` event fires, penalty card lands face-down, round continues, `advanceTurn` runs.
- `deck.length === 0` AND `discard.length === 1`: failed match → reshuffle yields empty deck → finaliseRound → `round_ended` fires; `advanceTurn` does NOT run, status='ended'.

#### Off-turn Pablo

- 3-player ABC: B calls during A's turn (A has not drawn yet). State transitions: `pabloCalledBy='B'`, turnIndex unchanged, status='playing'. A continues, draws, swaps. `advanceTurn` lands on B → `finaliseRound` fires; C never plays.
- 3-player ABC: C calls during A's turn. After A finishes, B plays once, then advanceTurn lands on C → finalise.
- 4-player ABCD: D calls during A's turn. B and C both play after the call; advanceTurn from C lands on D → finalise.
- 2-player AB: B calls during A's turn → A finishes → next is B → finalise.
- Off-turn `call_pablo` from caller after their own off-turn call: `pablo_already_called`.
- Off-turn `call_pablo` while `drawn !== null`: `pablo_blocked`.
- Off-turn `call_pablo` while `pendingPower !== null`: `pablo_blocked`.
- On-turn `call_pablo` while `drawn !== null` or `pendingPower !== null`: `pablo_blocked` (same error).

#### Turn-advance skipping the caller

- Direct unit test on the public surface: synthesise a state where `pabloCalledBy === players[1]` and `turnIndex === 0`, run an `advanceTurn`-triggering move (e.g. a swap), assert status='ended' afterwards. (Verified end-to-end in the off-turn tests above, but isolating this is worth a dedicated case.)

#### Immutability / unknown_move (preserve from Phase 2)

- `applyMove` never mutates the input.
- Same move sequence on same seed produces equal states.
- `'teleport'` move → `unknown_move`.

### `legalMoves.test.ts` — rewrite

- **peek_phase**: returns C(handSize, peekCount) `choose_peek` enumerations for players who haven't peeked; empty for players who have. Returns empty after all have peeked (status is now `'playing'`).
- **playing-idle (current player)**:
  - `draw_from_deck` always present.
  - `match_hand` enumerated for each (A, B) unordered pair (C(handSize, 2)).
  - `match_discard` enumerated for each slot only if `discard.length > 0`.
  - `call_pablo` present iff `pabloCalledBy === null`.
- **playing-idle (non-current player) WITHOUT an outstanding Pablo call**: enumerates `call_pablo` (and nothing else).
- **playing-idle (non-current player) WITH `pabloCalledBy !== null`**: empty.
- **playing-drawn (current player)**: `swap_drawn` × N + `discard_drawn` + `match_drawn` × N. No `call_pablo`.
- **playing-drawn (non-current player)**: empty (call_pablo blocked mid-action).
- **pending_power (current player)**: same as Phase 2 but enumerated over actual hand lengths, including non-default opponents-have-different-hand-sizes setups.
- **pending_power (non-current player)**: empty.
- **ended**: empty for everyone.
- **Off-turn enumeration for ALL non-callers**: 3-player game with `pabloCalledBy === null`; verify that during A's idle turn, `legalMoves(state, 'B')` and `legalMoves(state, 'C')` both include `call_pablo`.

### `playerView.test.ts` — rewrite

- Structural: `deckCount` (not `deck`), `discardTopCardId` set/null, includes all players, `self` correct, throws for unknown player.
- New additive fields: `pendingPower` mirrors state, `drawnFrom` is `'deck'` when drawn else null, `catalog` is the full 52-card map.
- Hidden info still safe under variable hand size: bob's hand of 5 (1 penalty after a fail) — alice sees only `handSize: 5` and her existing knowledge; the penalty card is invisible.
- Penalty cards not in `knownCards`: after a failed move puts a penalty into alice's hand at slot N, `view.players[alice].knownCards[N]` is undefined for both alice and bob.
- Initial peek path: after `choose_peek`, the picked slots appear in `knownCards` of the picker's own entry; not in others' entries.
- Drawn card visibility: drawer's view returns `drawnCardId`; others get `null`.
- `pabloCalledBy` visible in every view.
- Stale knowledge filtered: after slot reindex via successful match, no entries point at the wrong card.
- Ties at round end: `state.scores` after finaliseRound equals `perPlayerHand` for every player; `round_ended` event carries `winners` with multiple entries when applicable; PlayerView reflects these scores.

### `score.test.ts` — rewrite

- Hand sums: `[A♠, 5♦, J♣, K♣] = 26`, `[K♥, K♦, 2♣, 3♣] = 15`, ace = 1.
- `K♥` = 0, other kings = 10.
- Arbitrary `cardValueOverrides`: e.g. `{ suit: 'spades', rank: 1, value: 11 }` makes A♠ worth 11.
- No Pablo, single low player: that player is the sole winner.
- No Pablo, tied lowest: multi-winner array.
- Pablo called, caller is low: caller is in `winners` (no penalty, no special treatment).
- Pablo called, caller NOT low: caller is NOT in `winners`; the actual lowest player(s) are.
- Pablo called, caller tied for lowest: caller and tied players all in `winners`.
- No `pabloCallerWasLowest` field anymore (regression check: the type doesn't expose it).
- No `perPlayerRound`, `cumulative`, `winner` (singular) fields anymore.

### `edgeCases.test.ts` — rewrite

- Deck exhaustion on draw: deck empty + discard >1 → reshuffle → drawn card delivered.
- Deck exhaustion on draw: deck empty + discard ≤1 → round ends immediately, no Pablo penalty (there isn't one anymore).
- Deck exhaustion on penalty: failed match with deck empty + discard >1 → reshuffle → penalty delivered → round continues.
- Deck exhaustion on penalty: failed match with deck empty + discard ≤1 → reshuffle yields empty → finaliseRound → round_ended in the same MoveResult.
- Call Pablo with empty deck: legal (`call_pablo` does not touch deck).
- Off-turn Pablo with empty deck: also legal.
- Reshuffle determinism: same state → applyMove twice → identical deck order after reshuffle.
- Reshuffle sub-seed format check: state with `seed='abc'`, `reshuffleCount=0` → first reshuffle uses sub-seed `'abc:rs1'`; verifying behaviourally by comparing with a hand-computed shuffle from `makeRng('abc:rs1')`.
- Power activation: 7/8/9 activates only on `discard_drawn`, not on `swap_drawn` and not on a successful `match_drawn` (regression check — successful match goes via the match_succeeded path, which does NOT touch `pendingPower`).
- Multiple matching plays in a single game flow: alice does `match_discard` successfully, bob does `match_hand` successfully, hand sizes shrink, knownCards reindex correctly across turns.
- Full single-game flow with multiple matching plays + final off-turn Pablo: e.g. ABC game, A does match_drawn success, B does match_hand fail (penalty), C calls off-turn Pablo during A's turn-2, A finishes, advanceTurn lands on B → next stop C → finalise (skipping C). Assert final scores and winners.

---

## Migration impact

### Test files to delete

| File                                | Reason                         |
| ----------------------------------- | ------------------------------ |
| `packages/engine/src/match.test.ts` | `MatchState` no longer exists. |

### Test files to rewrite (every file in the package)

| File                                     | Why                                                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine/src/newGame.test.ts`    | Initial status is now `peek_phase`; no auto-peek; `roundNumber` field gone; `maxScore`/`pabloPenalty` removed from rules.              |
| `packages/engine/src/applyMove.test.ts`  | Three new moves with success + failure branches; choose_peek; off-turn Pablo; penalty mechanics; slot reindex; no `draw_from_discard`. |
| `packages/engine/src/legalMoves.test.ts` | Enumerations change; off-turn `call_pablo`; `match_*` enumerations.                                                                    |
| `packages/engine/src/playerView.test.ts` | New additive fields; no `roundNumber`/`finalTurnsRemaining`; variable hand sizes.                                                      |
| `packages/engine/src/score.test.ts`      | No caller-vs-lowest logic; no penalty; `winners: PlayerId[]` shape; no cumulative.                                                     |
| `packages/engine/src/edgeCases.test.ts`  | Penalty-card path replaces several existing flows; off-turn Pablo; full-game flow.                                                     |

### Engine source files to touch

| File                                        | Action                                                                                                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine/src/types.ts`              | Rewrite shape (deletions + new variants per §3).                                                                                                                                        |
| `packages/engine/src/newGame.ts`            | Update (status=`peek_phase`, no auto-peek, drop `roundNumber`/`finalTurnsRemaining`).                                                                                                   |
| `packages/engine/src/applyMove.ts`          | Rewrite (new arms, off-turn Pablo, penalty path, advanceTurn skip).                                                                                                                     |
| `packages/engine/src/legalMoves.ts`         | Rewrite (variable hand sizes, new enumerations, off-turn Pablo).                                                                                                                        |
| `packages/engine/src/playerView.ts`         | Update (drop deprecated fields, add `pendingPower`/`drawnFrom`/`catalog`).                                                                                                              |
| `packages/engine/src/score.ts`              | Rewrite (simpler — just `perPlayerHand` + `winners`).                                                                                                                                   |
| `packages/engine/src/match.ts`              | **Delete.**                                                                                                                                                                             |
| `packages/engine/src/index.ts`              | Drop `newMatch`/`startNextRound`/`endRound` exports; add `makeRng`, `cardValue`, `cardId`, `buildCatalog`.                                                                              |
| `packages/engine/src/internal/cards.ts`     | Keep (no change). Re-exported from index.ts now.                                                                                                                                        |
| `packages/engine/src/internal/rng.ts`       | Keep (no change). Re-exported from index.ts now.                                                                                                                                        |
| `packages/engine/src/internal/knowledge.ts` | Extend: add `reindexKnowledgeForPlayer`, `clearOwnSlot`.                                                                                                                                |
| `packages/engine/src/internal/penalty.ts`   | **New.** `drawPenaltyCard` helper.                                                                                                                                                      |
| `packages/engine/src/internal/hand.ts`      | **New.** `removeSlots` helper.                                                                                                                                                          |
| `packages/engine/src/internal/reshuffle.ts` | **New.** Shared `reshuffleDiscardIntoDeck` helper used by both `drawTopOfDeck` (in applyMove.ts) and `drawPenaltyCard` (in penalty.ts). Avoids two copies of the sub-seed/shuffle code. |

### Files NOT touched by Phase 2.5

- `apps/mobile/**` — Phase 4 will adapt to the new engine. The current `mockClient`/`realClient` stubs typecheck against the engine; any breakage from the type changes will be flagged by `bun run typecheck` and noted in this PR's description for Phase 4 to fix.
- `supabase/**` — Phase 5 territory. No edge functions exist yet, so nothing to update.

### Sanity check before merging

After all source/test changes:

1. `bun run check` clean across the entire workspace.
2. Re-read `docs/GAME_LOGIC.md` section by section; for each numbered rule, point at the test(s) that cover it.
3. Coverage report: `packages/engine/src` ≥ 95%.
4. `docs/PLAN.md` updated: Phase 2.5 → Done; new decisions appended.

---

## Public API exports (final)

```ts
// packages/engine/src/index.ts
export * from './types';
export { newGame } from './newGame';
export { applyMove } from './applyMove';
export { computePlayerView } from './playerView';
export { scoreRound } from './score';
export { legalMoves } from './legalMoves';

// New: useful for Phase 4 mockClient/bot and Phase 5 edge functions.
export { makeRng } from './internal/rng';
export { cardValue, cardId, buildCatalog } from './internal/cards';
```

`shuffle` stays internal (Phase 4 / Phase 5 won't need raw shuffles outside the engine; if they do, they'll go through `makeRng().nextInt()` or write their own Fisher-Yates).

---

## Open questions / proposed decisions (need user input before execution)

### 1. Knowledge clearing on `min_hand_size` fails

**Question**: When a matching claim fails with reason `min_hand_size` (the rank actually matched, but the hand can't drop below `minHandSize`), should the player's self-knowledge of the targeted slot(s) be cleared?

**Proposal**: **NO**. Only clear on `wrong_rank` fails. Rationale:

- The player did NOT demonstrate they had bad memory — the rank claim was correct, the rules just refused the play.
- Punishing correct memory with information loss is asymmetric and works against the memory-game spirit.
- The engine can distinguish the two cases cheaply (it already checks both conditions).

**Alternative**: clear on every fail (simpler engine logic; uniform behaviour; player can't tell the difference between "I forgot" and "rules blocked me"). Defensible if you want the engine to be opaque about WHY a play failed.

### 2. Tracking `peeksChosen` in `GameState`

**Question**: Add a dedicated `peeksChosen: Readonly<Record<PlayerId, boolean>>` field, or derive "has this player peeked" from `Object.keys(knownCards[p][p]).length`?

**Proposal**: **DERIVE** from `knownCards` size. Rationale:

- During `peek_phase`, the only source of `knownCards[p][p]` entries is `choose_peek` itself.
- `Object.keys(knownCards[p][p]).length === rules.initialPeekCount` is a clean predicate; no extra state field.
- Once status flips to `'playing'`, we never re-read this predicate, so later modifications to `knownCards` (peek_self power, etc.) don't matter.
- Avoids a redundant field that could drift from `knownCards`.

**Alternative**: add the dedicated field for self-documentation / future flexibility. Negligible memory cost. If you'd prefer this for clarity, say so and I'll add it.

### 3. `catalog` field on `PlayerView` — full 52 or only "cards in play"?

**Question**: When projecting per-player views, should `catalog` be the full 52-card lookup or only cards the player could possibly see (their hand + discard + known)?

**Proposal**: **FULL 52**. Rationale:

- Catalog is fixed information — every player knows what a 52-card deck contains.
- Filtering is added complexity for zero secrecy gain.
- Client rendering needs catalog entries for any card it learns about (including cards revealed mid-power); pre-shipping all 52 avoids round-trips.
- 52 entries × ~30 bytes each = ~1.5 KB. Trivial.

**Alternative**: "cards in play". Useful only if you anticipate hidden cards (e.g. a face-down deck the rendering layer shouldn't even know about by id), but that conflicts with the engine's existing model where every cardId is publicly defined from the start.

### 4. Public exports of `makeRng` and `cardValue`

**Question**: Re-export `makeRng`, `cardValue`, `cardId`, `buildCatalog` from `@pablo/engine`?

**Proposal**: **YES** for all four. Rationale:

- Phase 4 `mockClient` and bot heuristics need deterministic seeded RNG (e.g. to pick bot moves reproducibly).
- Phase 5 edge functions need `cardValue` for any backend-side scoring / display logic that doesn't run a full `scoreRound`.
- `cardId(suit, rank)` is the canonical way to construct test fixtures and bot-side card references; exporting it means callers don't need to know the encoding scheme.
- `buildCatalog` lets a debug tool / dev screen list all 52 cards without re-running `newGame`.
- These functions are already pure and deterministic; exposing them adds no risk.

**Alternative**: keep them internal and force callers through `newGame()` + `state.cardCatalog`. Slightly more encapsulation, but the friction is real for Phase 4 (the bot would have to wrap every helper).

### 5. `peek_chosen` event — include indices or not?

**Question**: Should `peek_chosen { playerId, indices }` carry the picked indices, or just the player id?

**Proposal**: **JUST the playerId** (indices private). Rationale:

- The picking player's `knownCards` projection already tells them which slots they chose.
- Other players learning "alice picked slots 1 and 3 specifically" leaks information that isn't strictly public (in a digital UI, the choice is private; even in a physical game, opponents only see "alice peeked").
- Animations don't need the indices for non-pickers — a generic "alice peeked 2 cards" is enough.

**Alternative**: include indices for richer animation (animate the specific slots flipping for everyone). If you want this for UX reasons, say so — the engine can include them. The trade-off is more information leakage to spectators.

### 6. `pablo_blocked` as a new error code

**Question**: For `call_pablo` failing because `drawn !== null` or `pendingPower !== null` (regardless of whether the caller is the current player), do we want a dedicated `pablo_blocked` error code, or reuse `already_drawn` / `power_pending`?

**Proposal**: **NEW code `pablo_blocked`**. Rationale:

- The semantics differ from the existing codes: when alice (non-current) tries to call_pablo and bob (current) has drawn, returning `already_drawn` is technically wrong — alice didn't draw.
- A single explicit error is clearer for UIs surfacing "you can't call Pablo right now".

**Alternative**: reuse `already_drawn` / `power_pending`. Slightly less clear semantically, but doesn't require a new error variant.

### 7. `discard_empty_for_match` vs reusing `discard_empty`

**Question**: When `match_discard` is attempted with an empty discard, what error?

**Proposal**: **NEW code `discard_empty_for_match`** (or keep `discard_empty` and reuse it for this one case — `draw_from_discard` is gone so the code is otherwise unused). Even simpler: keep the existing `discard_empty` code as-is, since the only remaining use is this one error path.

**Recommendation**: just keep `discard_empty` and use it for `match_discard`. (Adjusting the plan above accordingly — `discard_empty_for_match` is dropped; `discard_empty` lives on as the one true "discard is empty" error.)

### 8. Drop `DrawnCard.from` field entirely?

**Question**: `from: 'deck'` is now a single-element union. Drop the field?

**Proposal**: **KEEP** as `from: 'deck'`. Rationale:

- Forward-compat: if a future variant re-adds `draw_from_discard` or `peek_top_then_decide`, the field is already there.
- Zero runtime cost.
- The PlayerView's `drawnFrom` field then has a meaningful value rather than always being effectively `'deck'`.

**Alternative**: drop the field, simplify `DrawnCard` to `{ playerId, cardId }`. Cleaner today; minor friction tomorrow if we re-add multiple sources.

### 9. `removeSlots` ordering when removed indices are unsorted

**Question**: The `removeSlots` helper expects sorted-ascending removed indices for cleanness, or accepts any order?

**Proposal**: Internal contract is **sorted ascending** (callers sort once at the call site). Helper validates with a dev-only assertion (`assert(arr === arr.toSorted())`). Keeps the helper simple; no caller is currently passing reversed indices.

**Alternative**: sort inside the helper. Marginal cost; one fewer caller convention to remember.

### 10. Anything else flagged while drafting

- **`finaliseRound` is still useful even without rounds** — kept as a single-game `finaliseGame` (or keep the existing name for diff-minimisation; both work). Plan uses `finaliseRound` for continuity.
- **`scores` field on GameState** — still populated by `finaliseRound` so the projection reflects the result. The Phase 2 decision "Round-end inside applyMove writes scoreRound's perPlayerRound into state.scores" reaffirms; in Phase 2.5 the value written is `perPlayerHand` (since `perPlayerRound` is gone).
- **`newGame` `seed` parameter** — no implicit `:r1` suffix. Caller passes the seed verbatim; the engine concatenates `:rs${count}` only for reshuffle sub-seeds.
- **Existing `apps/mobile` typecheck** — the engine's type-shape changes (e.g. `PlayerView` field additions/removals) will cascade to `apps/mobile/src/supabase/mockClient.ts` and `apps/mobile/src/supabase/PabloClient.ts`. Phase 2.5's scope (`packages/engine` only) does not patch those, but it must NOT break the workspace typecheck. The plan is: `apps/mobile`'s mock/real clients have stub implementations that don't yet exercise the deleted/changed fields; if `bun --filter='@pablo/mobile' run typecheck` breaks, fix the offending stub with the minimal change to typecheck-clean (and note the touched file in the PR body for Phase 4 to revisit).

---

## Sanity audit vs. AGENTS.md hard rules

| Rule                                          | Compliance                                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| #1 Server-authoritative                       | Engine purity unchanged; this PR doesn't touch the client at all (or only minimally for typecheck).                         |
| #2 Engine purity                              | No new framework imports; no `Math.random`; no `Date.now`; ESLint engine rules will catch violations.                       |
| #3 Never leak hidden cards                    | Penalty cards have no `knownCards` entry. Projection stale-knowledge filter unchanged. Off-turn Pablo doesn't reveal hands. |
| #5 Types flow engine → edge function → client | Type changes ripple to clients via typecheck; the PR includes a workspace-wide `bun run check` pass.                        |
| #6 No game logic in components                | n/a (no component changes).                                                                                                 |
| #9 Plan before you build                      | This document, committed in the same PR. ✅                                                                                 |

---

## Self-review checklist (run before pushing PR)

Per AGENTS.md "How to self-review before merging":

1. `bun run check` clean across the workspace.
2. Re-read every changed file in `packages/engine/**`.
3. Map each rule in `docs/GAME_LOGIC.md` to at least one test case (use the §11 test plan as the index).
4. Verify the test coverage report shows ≥ 95% on `packages/engine/src`.
5. Confirm `docs/PLAN.md` updated: Phase 2.5 → Done; "Decisions Made" appended (one row per resolved open question above).
6. Confirm `docs/GAME_LOGIC.md` was NOT modified (the engine catches up to the doc; the doc is already canonical).
7. Confirm `docs/SCHEMA.md` was NOT modified (no DB / edge function changes in this phase).
8. Push branch. Stop. Do NOT merge unless user says "merge".

If anything above is undesired, tell me before I switch to the branch.
