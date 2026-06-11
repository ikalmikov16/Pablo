# GAME_LOGIC — Canonical Pablo Rules

This is the authoritative description of Pablo as implemented by `packages/engine`. If the engine and this doc disagree, **fix the engine**. If the rules need to change, **update this doc first**, then update the engine + tests in the same PR.

Last revised: 2026-06-10 (Phase 7 — documented `peek_one` / `peek_one_chosen`, `hasPeeked` projection flag, peek redaction).

## Goal

Have the lowest total point value in your hand when the round ends.

A "game" is a single round. Matches / sessions (best-of-N, score caps, etc.) are handled by the orchestration layer outside the engine — never inside `packages/engine`.

## Setup

- Standard 52-card deck. No jokers in v1.
- 2–6 players.
- Each player is dealt `rules.initialHandSize` cards (default **4**) face-down in a 2×2 grid (positions 0, 1, 2, 3).
- One card is flipped face-up to start the discard pile.
- The remaining deck is the draw pile.
- The game starts in **`peek_phase`** (see next section).

## Peek phase

After the deal and before any turns begin, the game sits in `status='peek_phase'`. Each player must peek exactly `rules.initialPeekCount` cards from their hand (default 2) to privately look at, via one of two equivalent move shapes:

- `choose_peek` — atomic: all indices in one move (bots use this).
- `peek_one` — incremental: one index per move, accumulating until the quota is hit (the UI uses this for tap-by-tap reveals). Each `peek_one` emits a `peek_one_chosen` event.

Rules:

- Peek order is not enforced — every not-yet-peeked player has a legal peek move simultaneously.
- The chosen indices are private. The `peek_chosen` event broadcasts only the `playerId`, never the indices. The `peek_one_chosen` event carries `handIndex` + `cardId` for the peeker; the edge-function redaction layer nulls **both** fields for every other viewer (see `docs/SCHEMA.md` § Hidden-info contract).
- `PlayerViewEntry.hasPeeked` exposes each player's completion status publicly (boolean only — never which slots), so UIs can show "waiting on N players" without leaking picks.
- When the last player completes their quota, the engine emits `peek_phase_ended` and flips `status` to `'playing'`.
- If `rules.initialPeekCount === 0`, `newGame` starts directly in `'playing'`.

## A turn (the five options)

On your turn — in `status='playing'`, with `drawn === null` and `pendingPower === null` — you must do exactly one of:

1. **Draw from the deck**, then choose one of:
   - **Swap** the drawn card with one of your hand slots (the displaced card lands face-up on the discard pile), OR
   - **Discard** the drawn card directly. If the card has a power, it activates (see "Special cards"), OR
   - **Match the drawn card** against one of your hand slots (see "Matching plays — `match_drawn`").

2. **Match two of your own hand slots** without drawing (see "Matching plays — `match_hand`").

3. **Match one of your hand slots against the top of the discard pile** without drawing (see "Matching plays — `match_discard`").

4. **Call Pablo** (see "Calling Pablo").

> Move #2 from prior versions — "draw from the discard pile" — has been removed. The discard top can only be interacted with via `match_discard`.

After your move, play proceeds to the next player.

## Matching plays

A matching play removes cards from your hand by discarding them. Each kind has a success condition and a failure penalty.

### `match_drawn` (move #1 → "Match the drawn card")

You have drawn a card from the deck. Claim that the rank of your drawn card matches the rank of one of your hand slots.

- **Success** (drawn rank === target rank AND hand size − 1 ≥ `rules.minHandSize`):
  - Both the drawn card and the matched hand card go to the discard pile, drawn first.
  - Your targeted hand slot is removed; the hand shrinks by 1.
  - Slot indices reindex (see "Slot reindex").
- **Failure** (wrong rank, or would drop below `minHandSize`):
  - The drawn card joins your hand at slot N (= old hand length).
  - You learn the drawn card's identity (it's added to your private knowledge for slot N).
  - You receive `rules.penaltyCardOnFail` penalty cards (face-down, appended after the drawn card; see "Penalty cards").
  - The hand grows by `1 + penaltyCardOnFail`.

### `match_hand` (move #2 → "Match two of your own slots")

No draw. Claim that two of your own hand slots have the same rank.

- **Success** (both ranks match AND hand size − 2 ≥ `minHandSize`):
  - Both targeted cards go to the discard pile.
  - Both slots removed; hand shrinks by 2.
- **Failure**:
  - Both slots stay where they are.
  - You receive `penaltyCardOnFail` penalty cards.
  - The hand grows by `penaltyCardOnFail`.

### `match_discard` (move #3 → "Match a hand slot against the discard top")

No draw. Claim that one of your hand slots has the same rank as the top of the discard pile.

- **Success** (rank matches AND hand size − 1 ≥ `minHandSize`):
  - Your hand card goes face-up on top of the discard pile (becoming the new top).
  - The slot is removed; hand shrinks by 1.
- **Failure**:
  - The slot stays.
  - You receive `penaltyCardOnFail` penalty cards.

### Failure-mode bookkeeping

| Failure reason  | Targeted-slot self-knowledge                                                     |
| --------------- | -------------------------------------------------------------------------------- |
| `wrong_rank`    | **Cleared** (you remembered wrongly).                                            |
| `min_hand_size` | **Preserved** (your rank memory was correct; the rule is what blocked the play). |

The `match_failed` event carries the `reason` so the UI can communicate why.

## Special cards (powers)

Powers activate **only when a card is discarded directly from a deck draw** (move #1 → Discard). They never activate via swap, via successful matching plays, or via penalty cards.

| Card            | Power                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| 7               | **Peek own** (`peek_self`): secretly look at one of your own hand slots.                                 |
| 8               | **Peek opponent** (`peek_opponent`): secretly look at one of any opponent's hand slots.                  |
| 9               | **Blind swap** (`swap_blind`): swap one of your hand slots with an opponent's, neither side seeing them. |
| 10, Jack, Queen | No power.                                                                                                |
| King            | No power. (Scoring override: K♥ = 0; other kings = 10. See "Scoring".)                                   |

Players may **decline** a triggered power via `skip_power`; the card still ends up in the discard pile.

While a power is pending resolution, `state.pendingPower` is non-null and `legalMoves` restricts the player to `use_*` (the relevant verb for that power) or `skip_power`. No other moves are legal, by any player.

### Knowledge transfer for `swap_blind`

When alice blind-swaps her slot `i` with bob's slot `j`, knowledge migrates symmetrically:

- For every knower K, K's knowledge of `alice[i]` becomes K's knowledge of `bob[j]`, and vice versa.
- This reflects the public visibility of the `swapped_blind` event — observers who knew a card at one side can deduce it's now at the other side.

## Calling Pablo

Any player whose `pabloCalledBy === null`, `drawn === null`, `pendingPower === null`, and `status === 'playing'` may call Pablo. Notably, this includes **off-turn** callers.

- **On-turn caller** (it's the caller's turn): the round ends immediately. `pabloCalledBy` is set and `finaliseRound` runs in the same `applyMove` call.
- **Off-turn caller** (someone other than the current player): `pabloCalledBy` is set and the `pablo_called` event fires, but **nothing else changes**. The current player keeps playing. The round ends the moment the turn pointer next reaches the caller — at that point the engine skips the caller's turn and calls `finaliseRound`.

A second `call_pablo` after one is in flight returns `pablo_already_called`. A `call_pablo` issued mid-draw or mid-power returns `pablo_blocked` (regardless of who calls).

## Variable hand size

Hands can grow (penalty cards) and shrink (successful matches). Slot indices are **non-negative integers**, validated against the current hand length on every move.

### Slot reindex

When a successful matching play removes one or more slots, the remaining slots are compacted (`removeSlots`). The engine produces an `indexMap[oldIdx] -> newIdx | undefined` and rewrites every knower's knowledge of that player's hand via `reindexKnowledgeForPlayer`:

- Entries pointing at removed slots are **dropped**.
- Entries pointing at kept slots are **rewritten** at the new index.
- Other knowers' knowledge of OTHER players is untouched.

The `PlayerView` projection additionally filters every `knownCards` entry against `hand[idx] === cardId` as a defense-in-depth check.

## Penalty cards

A penalty card is the top of the deck, appended **face-down** to the recipient's hand. The recipient does **not** learn its rank — no `knownCards` entry is written.

- If the deck is empty when a penalty is required, the engine reshuffles the discard pile (minus its top card) back into the deck and emits `deck_reshuffled`.
- If after reshuffle the deck is still empty (all cards are in hands), the round ends immediately.

## Scoring

Each card has a point value:

| Card   | Value                                                   |
| ------ | ------------------------------------------------------- |
| Ace    | 1                                                       |
| 2–10   | Face                                                    |
| Jack   | `rules.jackValue` (default 10)                          |
| Queen  | `rules.queenValue` (default 10)                         |
| King   | `rules.kingValue` (default 10)                          |
| **K♥** | **0** (per-card override in `rules.cardValueOverrides`) |

A player's hand value is the sum of all their cards' values. Penalty cards count toward this total — they're real cards in the hand.

`scoreRound` returns:

- `perPlayerHand`: the raw hand totals.
- `winners`: every player whose hand total equals the lowest. Multi-element on tie.

**There is no Pablo-caller penalty.** The caller scores exactly their hand value, no more, no less. If they're the sole lowest, they're the sole winner. If they're tied for lowest, they share the win. If they're not lowest, they simply lose.

The `round_ended` event carries `scores` (the per-player hand totals) and `winners`. `state.scores` is also overwritten with `perPlayerHand` so the `PlayerView` projection reflects the result.

## Rules config (`GameRules`)

| Setting              | Default                                                   | Notes                                                                                       |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `kingValue`          | `10`                                                      |                                                                                             |
| `queenValue`         | `10`                                                      |                                                                                             |
| `jackValue`          | `10`                                                      |                                                                                             |
| `cardValueOverrides` | `[{ suit: 'hearts', rank: 13, value: 0 }]`                | Per-card scoring override. Takes precedence over rank value. Does NOT affect rank matching. |
| `powers`             | `{ 7: 'peek_self', 8: 'peek_opponent', 9: 'swap_blind' }` | Rank → power map. Ranks not listed grant no power.                                          |
| `initialHandSize`    | `4`                                                       | Cards dealt per player at game start.                                                       |
| `initialPeekCount`   | `2`                                                       | Number of own slots each player peeks in `peek_phase`. `0` skips peek_phase.                |
| `minHandSize`        | `2`                                                       | A matching play that would drop a hand below this fails with `min_hand_size`.               |
| `penaltyCardOnFail`  | `1`                                                       | Penalty cards issued on a failed matching claim.                                            |

Removed in Phase 2.5 (used to live here, now out of scope): `maxScore`, `pabloPenalty`, `allowDrawDiscardAndDiscard`.

### Power vocabulary

`SpecialPower` is one of:

- `'peek_self'` — secretly look at one of your own slots.
- `'peek_opponent'` — secretly look at one of any opponent's slots.
- `'swap_blind'` — swap one of your slots with an opponent's, neither side seeing them.

Future variants can add `'swap_sighted'` (look-then-swap) or similar without touching `Move` — only the dispatch in `applyMove` cares which power a rank grants.

## State machine

```
                                  newGame()
                                     │
                                     ▼
                       ┌──────────────────────────┐
                       │       peek_phase         │
                       │  Each player calls       │
                       │  choose_peek once.       │
                       │  No turn order.          │
                       └────────────┬─────────────┘
                                    │ all players have peeked
                                    │ → emit peek_phase_ended
                                    ▼
                       ┌──────────────────────────┐
                       │         playing          │
                       │                          │
                       │   idle ─── draw_from_deck ──→ drawn
                       │     ▲                         │
                       │     │  swap_drawn /           │
                       │     │  match_drawn /          │
                       │     │  discard_drawn (no pwr) │
                       │     │                         ▼
                       │     │                     pending_power
                       │     │  use_* / skip_power     │
                       │     └─────────────────────────┘
                       │                                │
                       │  match_hand / match_discard ───┘
                       │  (outcome: success → advanceTurn;
                       │   failure → penalty → advanceTurn)
                       │                                │
                       └──────────────┬─────────────────┘
                                      │ on-turn call_pablo
                                      │ OR off-turn caller becomes
                                      │    the next player
                                      │ OR deck+discard exhausted
                                      ▼
                       ┌──────────────────────────┐
                       │          ended           │
                       │  scores = perPlayerHand  │
                       │  round_ended event       │
                       └──────────────────────────┘
```

## Edge cases the engine must handle

- **Deck exhaustion on draw**: reshuffle the discard pile (except its top card) back into the deck. Emit `deck_reshuffled`. If the deck is still empty after reshuffle, end the round.
- **Deck exhaustion on penalty**: same reshuffle + end-round semantics, but inside `drawPenaltyCard`.
- **Calling Pablo with empty deck**: legal. `call_pablo` doesn't touch the deck.
- **Off-turn Pablo with empty deck**: also legal.
- **Player disconnect mid-turn**: the engine has no concept of disconnects. The orchestration layer (edge function) translates a disconnect to a concrete `Move` (typically `discard_drawn` or `skip_power`).
- **Reshuffle determinism**: sub-seed = `${state.seed}:rs${state.reshuffleCount + 1}`. The reshuffle counter increments each time. Replays reproduce the exact deck order.

## Hidden-info contract

`computePlayerView(state, playerId)` projects the full `GameState` into what `playerId` is allowed to see. Hidden:

- The deck order and individual deck cards (only `deckCount` is exposed).
- Opponent hand cards that the viewer has not peeked or learned via a power.
- Penalty cards (face-down even to their owner).
- Choices made during `choose_peek` (the viewer sees only their own picks, via their own `knownCards`).

Visible:

- The viewer's own peeked slots and any opponent slots the viewer has learned via powers.
- The top of the discard pile (always public).
- The viewer's own drawn card (only the drawer sees `drawnCardId`).
- Each player's `hasPeeked` flag (peek-phase completion status — boolean only, never the indices).
- All public game scalars: `status`, `currentPlayerId`, `pabloCalledBy`, `pendingPower`, `deckCount`, `rules`, full 52-card `catalog`.

## Public API (what the engine exports)

```ts
// types.ts — all types are readonly and discriminated where applicable.
export type GameState = { ... };
export type Move = { ... };          // 13 variants
export type GameEvent = { ... };     // 16 variants
export type PlayerView = { ... };
export type GameRules = { ... };
export type MatchKind = 'drawn' | 'hand' | 'discard';
export type MatchFailReason = 'wrong_rank' | 'min_hand_size';

// functions
export function newGame(opts: {
  id: string;
  players: ReadonlyArray<PlayerId>;
  seed: string;
  rules?: Partial<GameRules>;
}): GameState;
export function applyMove(state: GameState, move: Move): MoveResult;
export function computePlayerView(state: GameState, playerId: PlayerId): PlayerView;
export function scoreRound(state: GameState): RoundScore;
export function legalMoves(state: GameState, playerId: PlayerId): ReadonlyArray<Move>;

// internal helpers re-exported for Phase 4 mock client / Phase 5 edge functions.
export function makeRng(seed: string): Rng;
export function cardValue(card: Card, rules: GameRules): number;
export function cardId(suit: Suit, rank: Rank): CardId;
export function buildCatalog(): { catalog: Record<CardId, Card>; ids: CardId[] };
```

All functions are pure and synchronous. No `Date.now()`, no `Math.random()` — randomness comes from the seed.

## Move and event catalog

### `Move` variants

- `choose_peek` — peek_phase only; pick `initialPeekCount` indices atomically.
- `peek_one` — peek_phase only; pick one index per move until the quota is reached.
- `draw_from_deck` — start of turn (current player); status='playing', `drawn===null`, `pendingPower===null`.
- `swap_drawn` — after drawing.
- `discard_drawn` — after drawing; activates power if the card has one.
- `match_drawn` — after drawing; success or failure as above.
- `match_hand` — no draw; two own slots.
- `match_discard` — no draw; one own slot vs discard top.
- `use_peek_self` / `use_peek_opponent` / `use_swap_blind` — resolve the pending power.
- `skip_power` — decline the pending power.
- `call_pablo` — any player while idle (uniformly guarded). On-turn ends round immediately; off-turn defers.

### `GameEvent` variants

- `card_drawn { playerId, from: 'deck' }`
- `card_swapped { playerId, handIndex, discardedCardId }` — emitted by `swap_drawn`; carries the displaced card's id (it goes to the discard pile).
- `card_discarded { cardId, playerId }`
- `peeked { playerId, targetPlayer, handIndex, cardId }` — emitted by `use_peek_*`.
- `swapped_blind { playerId, selfHandIndex, targetPlayer, targetHandIndex }`
- `pablo_called { playerId }`
- `turn_ended { nextPlayer }`
- `deck_reshuffled`
- `round_ended { scores, winners }`
- `power_activated { rank, power, playerId }`
- `peek_chosen { playerId }` — fires when a player completes their peek quota. Indices are intentionally omitted.
- `peek_one_chosen { playerId, handIndex, cardId }` — fires for every individual `peek_one`. `handIndex` + `cardId` are redacted to `null` for all viewers other than the peeker.
- `peek_phase_ended` — fires once when the last player peeks.
- `match_succeeded { playerId, kind, slotIndices, discardedCardIds }`
- `match_failed { playerId, kind, slotIndices, reason }`
- `penalty_card_dealt { playerId }`

### `MoveError` variants

`not_your_turn`, `not_in_game`, `must_draw_first`, `already_drawn`, `illegal_target`, `power_not_available`, `power_pending`, `no_power_to_resolve`, `game_already_ended`, `pablo_already_called`, `pablo_blocked`, `discard_empty`, `not_peek_phase`, `peek_phase_active`, `already_peeked`, `invalid_peek_count`, `duplicate_indices`, `invalid_hand_index`, `same_index`, `unknown_move`.
