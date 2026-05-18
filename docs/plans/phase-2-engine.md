# Phase 2 — Engine implementation plan

> Status: **approved, in execution** on branch `phase-2-engine`.

## Branch + workflow

- Branch: `phase-2-engine` off `main`.
- Final step before PR: update `docs/PLAN.md` (move items, append decisions).
- PR title: `phase 2: engine implementation`. Do NOT merge.

---

## Seeded PRNG — cyrb128 → sfc32

**Choice**: `cyrb128` string-hash → `sfc32` 128-bit PRNG, in `packages/engine/src/internal/rng.ts`.

Why:

- Pure TS, ~25 lines, no deps, no `Math.random`, no `crypto`, no `Date.now`.
- Deterministic across V8 (browser/RN/Hermes/Deno): uses `Math.imul` + `>>> 0`, both spec-stable.
- `sfc32` has 128 bits of state, period ≈ 2^128 — more than enough for shuffling 52 cards.
- Cryptographic strength is not required; the seed is server-controlled and never exposed to clients.

Public surface (internal; not re-exported from `@pablo/engine`):

```ts
type Rng = { next: () => number; nextInt: (maxExclusive: number) => number };
function makeRng(seed: string): Rng;
function shuffle<T>(items: ReadonlyArray<T>, rng: Rng): T[]; // Fisher–Yates, returns new array
```

**Reshuffle determinism** (per `docs/GAME_LOGIC.md` "Reshuffle determinism"):

- Round RNG seed: `${matchSeed}:r${roundNumber}`.
- Reshuffle sub-seed: `${matchSeed}:r${roundNumber}:rs${reshuffleCount}`.
- `reshuffleCount: number` is added to `GameState` to track reshuffles within a round.

---

## Where per-player knowledge lives — inside `GameState`

**Decision: add `knownCards` to `GameState`.** No sidecar.

Shape:

```ts
readonly knownCards: Readonly<
  Record<
    PlayerId,                                 // knower
    Record<
      PlayerId,                               // target (the player whose card is known)
      Readonly<Partial<Record<HandIndex, CardId>>>
    >
  >
>;
```

Why inside `GameState`, not a sidecar:

1. `GameState` is the persisted unit (one round = one `games` row). Persistence + replay must be a single serializable blob.
2. `computePlayerView` takes only `state` — threading a separate sidecar through every function would touch `applyMove`, `legalMoves`, `scoreRound`, and all tests with no upside.
3. Immutability is enforced by `Readonly<...>` either way.
4. The "never leak hidden cards" rule is about the projection, not the raw state shape. Knowledge IS the projection input — keeping it next to `hands` is correct.
5. Edge-function determinism: the server stores the whole `GameState` and emits projections. Knowledge change is a pure function of the move + prior state.

**When `knownCards` updates**:

| Trigger             | Knowledge change                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `newGame`           | Each player P: `knownCards[P][P]` seeded with bottom `initialPeekCount` slots (default: positions 2, 3).                    |
| `draw_from_deck`    | No change — drawn card identity is in `state.drawn`, exposed to the drawer only via their view.                             |
| `draw_from_discard` | No change — same reasoning as above.                                                                                        |
| `swap_drawn`        | `knownCards[drawer][drawer][handIndex] = drawnCardId`. All knowers' prior knowledge of that slot for the drawer is cleared. |
| `discard_drawn`     | No private change (card is now public discard).                                                                             |
| `use_peek_self`     | `knownCards[drawer][drawer][handIndex] = cardId`.                                                                           |
| `use_peek_opponent` | `knownCards[drawer][target][targetHandIndex] = cardId`.                                                                     |
| `use_swap_blind`    | For every knower K: swap `knownCards[K][P1][i]` ↔ `knownCards[K][P2][j]`. Knowers who knew neither slot are unaffected.     |
| `skip_power`        | No change.                                                                                                                  |
| `call_pablo`        | No change.                                                                                                                  |
| Deck reshuffle      | No change (shuffled cards remain face-down).                                                                                |
| Round end           | `knownCards` is NOT carried over — fresh `GameState` per round.                                                             |

**Projection rule** in `computePlayerView`:

- For each player P: `knownCards: state.knownCards[self]?.[P] ?? {}`.
- Discard top + own drawn card overlaid on top.

---

## Rule → function mapping

| Rule (from `docs/GAME_LOGIC.md`)                        | Implemented by                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 52-card deck, no jokers                                 | `newGame` — builds catalog as `Suit × Rank` cross-product, 52 entries                                               |
| 2–6 players                                             | `newGame` — throws (impossible-state) if `players.length < 2 \|\| > 6`                                              |
| Deal 4 cards face-down per player, positions 0–3        | `newGame` — deals `rules.initialHandSize` per player from shuffled deck                                             |
| Initial peek of bottom 2 cards                          | `newGame` — seeds `knownCards[P][P]` for positions 2, 3 (count from `rules.initialPeekCount`)                       |
| Discard pile starts with one flipped card               | `newGame` — deck top → `discard`                                                                                    |
| Draw from deck                                          | `applyMove` `draw_from_deck` — sets `drawn`, no turn advance                                                        |
| Swap drawn card                                         | `applyMove` `swap_drawn` — replaces hand slot, displaced card → discard, ends turn                                  |
| Discard drawn card                                      | `applyMove` `discard_drawn` — drawn → discard; power activates if `rules.powers[rank]` defined                      |
| Draw from discard                                       | `applyMove` `draw_from_discard` — discard top → `drawn`; must follow with `swap_drawn` unless rule override         |
| Call Pablo                                              | `applyMove` `call_pablo` — sets `pabloCalledBy`, `finalTurnsRemaining = players.length - 1`, status → `final_turns` |
| 7 = peek_self                                           | `applyMove` power dispatch → sets `pendingPower`; resolved by `use_peek_self`                                       |
| 8 = peek_opponent                                       | `applyMove` power dispatch → `pendingPower`; resolved by `use_peek_opponent`                                        |
| 9 = swap_blind                                          | `applyMove` power dispatch → `pendingPower`; resolved by `use_swap_blind`                                           |
| 10/J/Q/K no power                                       | `rules.powers` map omits those ranks; no `pendingPower` set                                                         |
| Power is optional                                       | `skip_power` clears `pendingPower` and ends the turn                                                                |
| Pablo: others get one more turn                         | `applyMove` decrements `finalTurnsRemaining` each turn end; 0 → status `ended`                                      |
| Card value (Ace=1, 2–10, J/Q=10, K=10, K♥=0)            | `scoreRound` via `cardValue(card, rules)` helper (consults `cardValueOverrides` first)                              |
| Caller has lowest → caller scores 0                     | `scoreRound`                                                                                                        |
| Caller does NOT have lowest → caller hand + penalty     | `scoreRound`                                                                                                        |
| Tie for lowest among non-callers → tied players score 0 | `scoreRound`                                                                                                        |
| `maxScore` ends match, lowest cumulative wins           | `endRound` (match layer)                                                                                            |
| Deck exhaustion → reshuffle discard (except top)        | `applyMove` helper `drawFromDeck` detects empty deck, calls `reshuffleDiscardIntoDeck`, emits `deck_reshuffled`     |
| Deck still empty after reshuffle → round ends           | Same helper; if `discard.length <= 1`, round ends (no Pablo penalty unless `pabloCalledBy` set)                     |
| Pablo callable with empty deck                          | Allowed — `call_pablo` does not check deck state                                                                    |
| Disconnect mid-turn                                     | Out of scope for the engine; edge function (Phase 5) dispatches the appropriate concrete moves                      |
| Reshuffle determinism                                   | `reshuffleCount` on `GameState`; sub-seed `${seed}:r${roundNumber}:rs${count}`                                      |
| `GameRules` fully configurable                          | `newGame` deep-merges `opts.rules` over `DEFAULT_RULES`                                                             |
| Multi-round match                                       | `newMatch` / `startNextRound` / `endRound`                                                                          |

---

## Type extensions to `types.ts`

All additive (existing tests stay green):

```ts
// Added to GameState:
readonly knownCards: Readonly<Record<PlayerId, Record<PlayerId, Readonly<Partial<Record<HandIndex, CardId>>>>>>;
readonly pendingPower: Readonly<{ rank: Rank; power: SpecialPower; playerId: PlayerId }> | null;
readonly reshuffleCount: number;

// New MoveError variants:
| 'power_pending'
| 'no_power_to_resolve'
| 'must_swap_after_discard_draw'

// New GameEvent variants:
| { type: 'power_activated'; rank: Rank; power: SpecialPower; playerId: PlayerId }
| { type: 'final_turns_started'; pabloCalledBy: PlayerId }
```

---

## File plan

| File                                        | Status    | Purpose                                               |
| ------------------------------------------- | --------- | ----------------------------------------------------- |
| `packages/engine/src/types.ts`              | extend    | fields above + new errors/events                      |
| `packages/engine/src/internal/rng.ts`       | new       | `makeRng`, `shuffle` (cyrb128 + sfc32 + Fisher–Yates) |
| `packages/engine/src/internal/cards.ts`     | new       | `buildCatalog`, `cardValue(card, rules)`              |
| `packages/engine/src/internal/knowledge.ts` | new       | `setKnowledge`, `clearSlot`, `swapKnowledge`          |
| `packages/engine/src/newGame.ts`            | implement | full implementation                                   |
| `packages/engine/src/applyMove.ts`          | implement | all move branches, power dispatch, reshuffle helper   |
| `packages/engine/src/playerView.ts`         | implement | per-player projection                                 |
| `packages/engine/src/score.ts`              | implement | round scoring                                         |
| `packages/engine/src/legalMoves.ts`         | implement | enumerate legal moves                                 |
| `packages/engine/src/match.ts`              | implement | `newMatch` / `startNextRound` / `endRound`            |
| `packages/engine/src/newGame.test.ts`       | expand    | keep 6 contract tests, add more                       |
| `packages/engine/src/applyMove.test.ts`     | new       | all move types + edge flows                           |
| `packages/engine/src/legalMoves.test.ts`    | new       | enumeration for all states                            |
| `packages/engine/src/playerView.test.ts`    | new       | projection + knowledge + hidden-card tests            |
| `packages/engine/src/score.test.ts`         | new       | scoring + K♥, ties, Pablo penalty                     |
| `packages/engine/src/match.test.ts`         | new       | multi-round + match end                               |
| `packages/engine/src/edgeCases.test.ts`     | new       | every bullet from "Edge cases" section                |

---

## Test case index

### `newGame`

- dealt sizes / one discard / 52 total / determinism / different seeds (existing ×5)
- `initialPeekCount` cards recorded in `knownCards[P][P]` for bottom slots
- each card id appears exactly once across all state
- deck sizes for 2-player and 6-player
- `rules` deep-merges with caller overrides
- invalid player count throws

### `applyMove`

- `draw_from_deck`: legal, sets `drawn`; `already_drawn` when drawn exists; `not_your_turn` for wrong player
- `draw_from_discard`: pulls discard top; `discard_empty` if pile empty; `already_drawn` when drawn exists
- `swap_drawn`: replaces slot, updates `knownCards`, clears stale knowledge, ends turn
- `discard_drawn` (no power): drawn → discard, turn ends
- `discard_drawn` (rank 7/8/9): sets `pendingPower`, emits `power_activated`, turn NOT yet ended
- `use_peek_self`: updates `knownCards`, clears `pendingPower`, ends turn; `power_not_available` if wrong power
- `use_peek_opponent`: cross-player knowledge update; `illegal_target` for self-target
- `use_swap_blind`: hand swap + symmetric knowledge swap; illegal self-target
- `skip_power`: clears `pendingPower`, ends turn; `no_power_to_resolve` when no power pending
- `call_pablo`: sets `pabloCalledBy`, `finalTurnsRemaining`, status; `pablo_already_called`; `already_drawn` when drawn exists
- `draw_from_discard` → `discard_drawn` with `allowDrawDiscardAndDiscard=false` → `must_swap_after_discard_draw`
- applyMove never mutates input state (snapshot check)
- turn advance wraps around correctly
- `final_turns` countdown → status `ended` at 0

### `legalMoves`

- fresh turn: `draw_from_deck` + `draw_from_discard` + `call_pablo`
- after deck draw: `swap_drawn` × 4 + `discard_drawn`
- after discard draw (`allowDrawDiscardAndDiscard=false`): only `swap_drawn` × 4
- after discard draw (`allowDrawDiscardAndDiscard=true`): + `discard_drawn`
- `pendingPower='peek_self'`: `use_peek_self` × 4 + `skip_power`
- `pendingPower='peek_opponent'`: `use_peek_opponent` × (opponents × 4) + `skip_power`
- `pendingPower='swap_blind'`: `use_swap_blind` × (4 × opponents × 4) + `skip_power`
- non-current player: empty
- game `ended`: empty

### `playerView`

- `deckCount` not `deck`; `discardTopCardId` correct
- initial bottom-peek slots visible in own view
- opponent cards hidden unless peeked
- after `use_peek_opponent`: peeked card visible in view; other players don't see the knowledge
- after `use_swap_blind` with prior self-knowledge: knowledge transfers correctly
- `drawnCardId` non-null only for current player

### `score`

- hand sum: `[A♠, 5♦, J♣, K♣]` → 26
- K♥ override → 0
- caller is lowest → caller scores 0
- caller is NOT lowest → caller hand + 10 penalty
- tie for lowest among non-callers → all tied score 0
- caller tied for lowest with non-caller → caller and tied non-callers score 0 (decision logged)
- custom `cardValueOverrides`

### `match`

- `newMatch`: `between_rounds`, `cumulativeScores` all zero
- `startNextRound`: status `in_progress`, `currentRound` populated, seed deterministic
- `endRound`: appends history, updates cumulative, returns to `between_rounds`
- `endRound` triggering match end: `status='ended'`, `winner=argmin(cumulative)`
- 3-round cumulative scoring correctness

### `edgeCases`

- Deck exhaustion + reshuffle: `deck_reshuffled` event, new deck length correct
- Deck empty after reshuffle: round ends (no penalty unless Pablo called)
- Call Pablo with empty deck: legal
- Reshuffle determinism: same sub-seed → same order; different sub-seed → different
- K♥ only (K♦/K♠/K♣ are 10)
- Power does NOT activate on `swap_drawn` (only on `discard_drawn`)
- Full 2-player game flow from `newGame` to `endRound`

---

## Ambiguity decisions (logged in `docs/PLAN.md`)

1. **Caller in tie for lowest**: caller and tied non-callers all score 0.
2. **`draw_from_discard` with empty pile**: returns `discard_empty`.
3. **Power never activates on `swap_drawn`**: matches "Special cards" note in `docs/GAME_LOGIC.md`.
4. **Engine has no auto-pass/disconnect move**: edge function (Phase 5) dispatches concrete moves.
