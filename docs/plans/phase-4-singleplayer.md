# Phase 4 — Single-player vs bot implementation plan

> Status: **draft, awaiting approval** for branch `phase-4-singleplayer` (off `main`).

## One-sentence goal

Make Pablo fully playable on a real iPhone against 1–3 bots — peek phase, all five turn options, off-turn Pablo, variable hand size with penalty cards, and an end-of-round reveal — by implementing the `PabloClient` `mockClient` over `@pablo/engine`, wiring a Zustand-backed UI layer, and assembling the Expo Router screens specified in `docs/PLAN.md` § Phase 4, without touching the engine and without introducing any backend.

---

## Branch + workflow

- Branch: `phase-4-singleplayer` off `main` (already created by setup; this plan ships in the same PR).
- Plan committed in the same PR as the implementation (AGENTS.md hard rule #9).
- Last step before pushing: update `docs/PLAN.md` (move Phase 4 → Done, append new "Decisions Made" rows for each resolved open question below).
- Default = **do not merge**. Push the branch and stop. User says "merge" before squash-merge.
- `bun run check` (format + lint + typecheck + tests) must be clean on the final commit.
- Manual verification: full single round on iOS simulator (1, 2, 3 bot configurations) and a real iPhone build. Screen recording attached to the PR description.

### Hard constraints we will not violate

| Constraint                                        | Where it is enforced in this plan                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine` is read-only this phase         | §3, §15. If a bug is found, we flag it in `Open questions` and stop before changing the engine.                                                                     |
| No game logic in components (ui.mdc)              | §5 selectors are the only place that touches `legalMoves`; components consume booleans + label arrays.                                                              |
| No hardcoded strings, colors, spacings, radii     | §9 / §10. New i18n keys land in `en.json`; new design tokens land in `apps/mobile/src/design/tokens.ts`.                                                            |
| All randomness via `makeRng` from `@pablo/engine` | §2 mockClient seeds; §3 bot tie-breaks. No `Math.random`, no `Date.now` (we use an injected `now()` clock — see §15 open question 5).                               |
| Stack additions limited / justified               | §2 only adds **zustand** (PLAN.md prescribes it for state). One-line justification: "the AGENTS.md stack table calls for Zustand; the package isn't installed yet." |

---

## Requirement → file mapping

Every "Must include" bullet in `docs/PLAN.md` § Phase 4 mapped to a concrete file.

| Requirement (PLAN.md)                                                                       | Lands in                                                                                                                                       | Notes                                                                                                       |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Expo Router with route groups `(home)`, `(game)`, `dev/`                                    | `apps/mobile/app/(home)/`, `apps/mobile/app/(game)/`, `apps/mobile/app/dev/`                                                                   | §4. Dev card-lab stays under `dev/` untouched.                                                              |
| Home screen with "Play vs bots" button                                                      | `apps/mobile/app/(home)/index.tsx`                                                                                                             | §5.                                                                                                         |
| Bot count picker (1–3 bots)                                                                 | `apps/mobile/app/(home)/new-game.tsx`                                                                                                          | §5. Picks bot count + seed; calls `mockClient.createRoom + startGame`.                                      |
| Game screen with hand grid, opponent rows, deck+discard, action bar                         | `apps/mobile/app/(game)/[gameId]/index.tsx` + components in `apps/mobile/src/components/game/`                                                 | §5, §7.                                                                                                     |
| Peek-phase UX                                                                               | `apps/mobile/src/components/game/PeekOverlay.tsx`, wired into the game screen                                                                  | §5. Auto-resolves for bots via the bot loop (§3).                                                           |
| Five-option action bar                                                                      | `apps/mobile/src/components/game/ActionBar.tsx` + sub-flows in `apps/mobile/src/components/game/actionFlows/`                                  | §5, §6.                                                                                                     |
| Off-turn Pablo UI (per opponent row)                                                        | `apps/mobile/src/components/game/OpponentRow.tsx` (Pablo affordance) + banner in `apps/mobile/src/components/game/PabloBanner.tsx`             | §5.                                                                                                         |
| Match-result animations (success / fail / penalty / swap / power / reshuffle / off-Pablo …) | `apps/mobile/src/components/game/animation/animator.ts` + per-event handlers in `apps/mobile/src/components/game/animation/handlers.ts`        | §6.                                                                                                         |
| Variable hand-size layout (grow / shrink without remount)                                   | `apps/mobile/src/components/game/HandGrid.tsx` (layout) + stable card-id keys                                                                  | §7.                                                                                                         |
| Mock client backed by `@pablo/engine`                                                       | `apps/mobile/src/supabase/mockClient.ts` (full rewrite of stub) + helpers in `apps/mobile/src/supabase/internal/`                              | §2.                                                                                                         |
| Bot heuristic using only `PlayerView`                                                       | `apps/mobile/src/supabase/internal/bot.ts`                                                                                                     | §3.                                                                                                         |
| End-of-round reveal                                                                         | `apps/mobile/src/components/game/EndOfRound.tsx` (overlay) + screen at `apps/mobile/app/(game)/[gameId]/result.tsx` (navigation target option) | §5. Default keeps reveal as an overlay on the game screen — see §15 open question 6 for the screen variant. |

Files **not** touched:

- `packages/engine/**` — read-only.
- `apps/mobile/src/components/cards/**` — `<PlayingCard>` is consumed as-is.
- `apps/mobile/app/dev/**` — Phase 3's card-lab stays where it is.
- `supabase/**` — Phase 5 territory.

### Full file tree this PR will touch

```
apps/mobile/
├── package.json                                   (modify: + zustand; minor sort)
├── app/
│   ├── _layout.tsx                                (modify: ensure GestureHandlerRootView + SafeAreaProvider + Stack wraps every group)
│   ├── (home)/
│   │   ├── _layout.tsx                            (new — stack with hidden header)
│   │   ├── index.tsx                              (new — replaces the current app/index.tsx home; preserves __DEV__ Card Lab link)
│   │   └── new-game.tsx                           (new — bot count picker)
│   ├── (game)/
│   │   ├── _layout.tsx                            (new — stack; header hidden; gestures disabled to prevent back-swipe mid-turn)
│   │   └── [gameId]/
│   │       ├── _layout.tsx                        (new — provides GameStoreProvider scoped to this game)
│   │       ├── index.tsx                          (new — main game screen)
│   │       └── result.tsx                         (new IF we go with screen-variant for end-of-round — see §15 q6; otherwise omitted)
│   ├── dev/                                       (unchanged)
│   └── index.tsx                                  (delete — replaced by (home)/index.tsx)
├── src/
│   ├── components/
│   │   ├── cards/                                 (unchanged — Phase 3 deliverable)
│   │   └── game/                                  (new tree)
│   │       ├── ActionBar.tsx                      (new)
│   │       ├── actionFlows/
│   │       │   ├── DrawFlow.tsx                   (new — after draw, choose swap/discard/match)
│   │       │   ├── MatchHandFlow.tsx              (new — pick two own slots)
│   │       │   ├── MatchDiscardFlow.tsx           (new — pick own slot vs discard top)
│   │       │   └── PowerFlow.tsx                  (new — peek_self / peek_opponent / swap_blind)
│   │       ├── HandGrid.tsx                       (new — own hand, variable-size layout)
│   │       ├── OpponentRow.tsx                    (new — face-down hand row + Pablo button)
│   │       ├── DeckArea.tsx                       (new — deck stack + discard top + counts)
│   │       ├── PabloBanner.tsx                    (new — shows who called Pablo)
│   │       ├── PeekOverlay.tsx                    (new — tap N cards in own hand to peek)
│   │       ├── PowerOverlay.tsx                   (new — slot picker when a power is pending)
│   │       ├── ToastHost.tsx                      (new — short timed message overlay for match_failed reason, etc.)
│   │       ├── EndOfRound.tsx                     (new — reveal + winners + Play again)
│   │       └── animation/
│   │           ├── animator.ts                    (new — event queue + per-event scheduler)
│   │           ├── handlers.ts                    (new — per-event handler mapping)
│   │           ├── layoutRegistry.ts              (new — shared registry of per-card animated positions for fly-to-discard, etc.)
│   │           └── animator.test.ts               (new — pure unit tests of the queue logic)
│   ├── design/
│   │   └── tokens.ts                              (modify: append game-area surfaces, action-bar surfaces, penalty tint, pablo-accent, slot states)
│   ├── i18n/
│   │   └── locales/en.json                        (modify: append home.*, game.*, result.* namespaces)
│   ├── store/                                     (new tree)
│   │   ├── gameStore.ts                           (new — Zustand store factory; one per active game)
│   │   ├── selectors.ts                           (new — pure selectors built on gameStore + engine.legalMoves)
│   │   ├── animationQueue.ts                      (new — store slice for the event queue UI consumes)
│   │   ├── uiSlice.ts                             (new — selected slot, drag-in-flight, dismissed toasts)
│   │   ├── provider.tsx                           (new — React context binding a store instance to a game route)
│   │   └── selectors.test.ts                      (new — pure tests over PlayerView fixtures)
│   └── supabase/
│       ├── mockClient.ts                          (rewrite — full PabloClient impl)
│       ├── internal/
│       │   ├── bot.ts                             (new — heuristic engine)
│       │   ├── botScheduler.ts                    (new — bot loop / timing)
│       │   ├── clock.ts                           (new — injectable now() + setTimeout abstractions)
│       │   ├── room.ts                            (new — pure helpers: createRoom, generate code/seed)
│       │   ├── viewStore.ts                       (new — in-memory game state + per-player view subscriptions)
│       │   ├── mockClient.test.ts                 (new — end-to-end deterministic single-round test)
│       │   ├── bot.test.ts                        (new — heuristic invariants)
│       │   └── room.test.ts                       (new — code/seed generator)
│       └── types.ts                               (unchanged)
docs/
├── PLAN.md                                        (modify — Phase 4 → Done, decisions appended)
└── plans/
    └── phase-4-singleplayer.md                    (this file)
```

---

## §2 `mockClient` design

### Module shape

`apps/mobile/src/supabase/mockClient.ts` exports `createMockClient(opts?: MockClientOptions): PabloClient`. All state lives **inside the closure** (no module-global state — tests can spin up isolated clients).

```ts
export type MockClientOptions = {
  /** Injectable RNG-seed source so tests are deterministic. */
  readonly seedSource?: () => string; // defaults to a UUID-style string from a per-client seeded sequence (no Math.random, no Date.now)
  /** Injectable clock: returns ms since some epoch. Tests pass a fake. */
  readonly now?: () => number; // defaults to () => Date.now() at runtime; see §15 q5 for the rule audit
  /** Injectable schedule for bot delays. Defaults to global setTimeout. */
  readonly scheduler?: {
    setTimeout(cb: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
  };
  /** Override the local human player's id (defaults to 'human'). */
  readonly localPlayerId?: PlayerId;
};
```

Internal layout (closure-local):

- `rooms: Map<RoomId, Room>` and `roomSubscribers: Map<RoomId, Set<(r: Room) => void>>`.
- `games: Map<GameId, { state: GameState; version: number; idempotency: Map<string, number>; viewSubs: Map<PlayerId, Set<(v: PlayerView) => void>>; pendingBots: Set<unknown> }>`.
- `localPlayerId: PlayerId` (default `'human'`).
- A small per-client `Rng` (built via `makeRng(seedSource())`) used **only** for generating room codes and per-game seeds. Once a game's seed is fixed, the engine owns all in-game randomness.

### Method-by-method behaviour

| `PabloClient` method  | Sync-vs-async                         | Implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Notes                                                                                                                                                                        |
| --------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signIn`              | sync-but-Promise-wrapped              | Returns `{ ok: true, data: localPlayerId }`. Idempotent; multiple calls return the same id.                                                                                                                                                                                                                                                                                                                                                                                                               | No auth concept in single-player.                                                                                                                                            |
| `createRoom`          | sync-but-Promise-wrapped              | Builds a `Room` with `hostId = localPlayerId`, a 4-char alphanumeric `code` from `makeRng(seedSource())`, `status: 'waiting'`, `members: [localPlayerId]`, `rules: merge(DEFAULT_RULES, opts.rules)`, `maxPlayers: opts.maxPlayers ?? 4`.                                                                                                                                                                                                                                                                 | Phase 4's home flow attaches bots via a follow-up `addBots` helper exposed only to the mockClient (NOT in the PabloClient interface — see §15 q2).                           |
| `joinRoom`            | sync-but-Promise-wrapped              | Looks up by code; in single-player nothing else joins so this is mostly a defensive return.                                                                                                                                                                                                                                                                                                                                                                                                               | Returns `not_found` error string otherwise.                                                                                                                                  |
| `leaveRoom`           | sync-but-Promise-wrapped              | Drops the room from the map; cancels any pending bot scheduler handles for games in that room.                                                                                                                                                                                                                                                                                                                                                                                                            |                                                                                                                                                                              |
| `startGame`           | sync-but-Promise-wrapped              | Calls `engine.newGame({ id, players, seed, rules })` where players are `[localPlayerId, ...botIds]` from the room. Stores `{ state, version: 0, idempotency: new Map(), viewSubs: new Map() }`. Fans out a view to each subscribed player. **Kicks off the bot scheduler** so bots can call `choose_peek` immediately (peek_phase has no turn order; bots peek without delay or with a short randomized delay — see §15 q5). Returns the `gameId`.                                                        | The seed is generated via the per-client RNG so test runs are deterministic when `seedSource` is fixed.                                                                      |
| `applyMove`           | sync-but-Promise-wrapped              | Looks up game. If `idempotency.has(idempotencyKey)`, returns the cached `version`. Checks `expectedVersion === game.version` (else returns `{ ok: false, error: 'version_mismatch' }`). Otherwise calls `engine.applyMove(game.state, move)`. On `ok:true`: writes new state, increments version, caches idempotency. **Fans out** per-player view to every viewSub. **Pumps the bot scheduler** after the move resolves. On `ok:false`: returns `{ ok: false, error: <engine.error> }` (UI surfaces it). | This is the only mutating entry point. Engine purity guarantees state is replaced wholesale.                                                                                 |
| `subscribeRoom`       | sync handle                           | Adds callback to `roomSubscribers[roomId]`; fires once immediately with current room. Returns `unsubscribe`.                                                                                                                                                                                                                                                                                                                                                                                              |                                                                                                                                                                              |
| `subscribePlayerView` | sync handle, fires when state changes | Resolves which `PlayerId` to project for (defaults to `localPlayerId`). Adds callback to `viewSubs[playerId]`. Fires once immediately. Returns `unsubscribe`.                                                                                                                                                                                                                                                                                                                                             | In single-player only the human subscribes; bots read views ad-hoc inside the bot loop (via `computePlayerView` directly — no need for an actual subscription tree, see §3). |

### How `subscribePlayerView` fires on state changes

A single internal `applyAndFanout(game, result)` helper is called by both `applyMove` (human moves) and the bot scheduler (bot moves):

```
function applyAndFanout(gameId: GameId, prev: GameState, next: GameState, events: ReadonlyArray<GameEvent>) {
  game.state = next;
  game.version += 1;
  for (const [playerId, callbacks] of game.viewSubs.entries()) {
    const view = computePlayerView(next, playerId);
    for (const cb of callbacks) cb(view);
  }
  // schedule bot reactions
  botScheduler.kick(gameId, events);
}
```

Notes:

- The fanout is synchronous so the UI sees a consistent view immediately after `applyMove` resolves.
- `events` are not delivered through `subscribePlayerView` (the interface doesn't have a slot for them). Phase 6 will add a `subscribeGameEvents` to `PabloClient` for animation playback over the network; in Phase 4 the mock client delivers events through a **separate** in-process channel exposed only to the mobile app via a thin store hook (see §6 — `animator.subscribe()`). This keeps `PabloClient` aligned with what the Phase 5 SQL projection can actually deliver, while still letting Phase 4 animate properly.

### Idempotency + expectedVersion in single-player

- `idempotencyKey`: stored in the per-game map. Re-submitting the same key returns the cached `{ version }` without re-applying.
- `expectedVersion`: enforced even in single-player so the same code paths work in Phase 6. If the human submits a move with stale version (e.g. after a bot moved between render and dispatch), the call returns `version_mismatch`; the store handles by re-reading the view and re-trying or dropping the action.
- The Zustand store always passes the **current** `version` it last saw via `subscribePlayerView`; we'll surface `version` to the store from a new field on the view (see §15 q4 — proposed addition vs. wrapping the subscription).

### Where the engine `GameState` lives in memory

- Inside the mockClient closure, keyed by `gameId`.
- The store **does not** hold `GameState` directly. It holds the most recent `PlayerView` for the local player plus UI state.
- This mirrors what Phase 6 will look like: the client sees only its view; the server holds the state. Keeping that boundary clean now means swapping `mockClient` → `realClient` later is a single import.

### Seed generation (no `Math.random`, no `Date.now`)

- Per-client base seed: a string passed into `createMockClient({ seedSource })`. Default at runtime is a stable derivation from `${now()}-${counter}`. We have a problem: `Date.now()` is banned by the engine rule, **but not by the mobile app rule** — that ban is engine-scoped. Still, to be cautious and to keep tests deterministic, the mockClient **does not call `Date.now()` directly**; it accepts an injected `now()` whose runtime default lives in `internal/clock.ts`.
- All in-game randomness (deck shuffle, reshuffle sub-seeds, etc.) happens **inside the engine** off `state.seed`. The mockClient only seeds:
  - room codes (`makeRng(baseSeed + ':room').nextInt(...)`)
  - per-game `GameState.seed` (`makeRng(baseSeed + ':game:' + counter).nextInt(...)`)
  - bot tie-breaks (one `Rng` per bot, seeded from `${state.seed}:bot:${botId}` — derived **once** per game).

All RNG flows route through `makeRng` from `@pablo/engine`. Linter already bans `Math.random` engine-side; we extend the lint rule to flag any `Math.random` or `Date.now` in `apps/mobile/src/supabase/internal/**` (see §15 q5).

### Public surface added to `mockClient.ts` for the home flow

Not added to `PabloClient` (would also affect Phase 6). Exposed as the **return** of `createMockClient`:

```ts
export type MockClient = PabloClient & {
  /** Configure how many bots a freshly-created room should auto-add. */
  readonly addBotsToRoom: (opts: {
    roomId: RoomId;
    count: 1 | 2 | 3;
  }) => Promise<ClientResult<Room>>;
};
```

`createMockClient(): MockClient` (still satisfies `PabloClient`). The mobile app imports `MockClient` from `apps/mobile/src/supabase` for the bot-picker screen; everything else uses the `PabloClient` interface. Phase 6 deletes this extension type — at that point real rooms add bots by inviting humans.

### Error model

The mockClient returns `error: string` (matching the `ClientResult` shape). Error strings:

- Anything that came from `engine.applyMove` is passed through verbatim (so the UI can decode `MoveError` codes).
- `'not_found'`, `'version_mismatch'`, `'game_already_ended'` (for `applyMove` after `status === 'ended'`), `'unsupported_in_mock'` (defensive).

---

## §3 Bot loop

### When do bot moves run?

After **every** state change (initial `startGame`, every successful `applyMove`), `botScheduler.kick(gameId, events)` runs. The scheduler walks the bot list and asks each bot, in order:

1. Are you currently the `currentPlayerId`? → schedule an on-turn move.
2. Else: does `legalMoves(state, botId)` include `call_pablo`? → run the bot's off-turn-Pablo decision. If it decides to call, schedule the call.
3. Else: are you in `peek_phase` and haven't peeked? → schedule a `choose_peek`.

"Schedule" means: call the injected scheduler with a delay (default `420 ms` for on-turn moves, `1200 ms` randomized for off-turn Pablo to avoid herd-call, `200 ms` for peek). The handle is stashed in `pendingBots`; cancelled when the game finishes.

### Why scheduling, not immediate?

- The human needs animations to play between moves; firing the next bot synchronously would collapse multi-event sequences into one frame.
- 420 ms ≈ length of a fly-to-discard animation; we don't gate on the actual animator (that would couple client → UI), but we picked the delay to roughly cover it.
- Tests pass a `scheduler` that runs callbacks immediately (so end-to-end deterministic games complete synchronously).

### Off-turn Pablo decisions

Every bot evaluates `call_pablo` after every state change while the human's hand is in `idle` (i.e. `drawn===null && pendingPower===null`). The decision:

```
shouldCallPablo(view: PlayerView, botId: PlayerId): boolean
  - compute estimated own total via known cards + an "unknown card prior" (= average value of unrevealed cards in catalog given the discard pile)
  - if estimated total <= rules.minHandSize * 2 (≈ "very low" rule of thumb)  → true
  - else → false
```

With multiple bots, this can racey-call: each bot independently decides. We **serialize**: the scheduler awards an off-turn Pablo to the bot with the lowest `(estimatedTotal, playerIndex)` — only one fires. See §15 q3 for the open question on whether to randomize tie-breaks instead.

### Iterating over multiple bots between human turns

```
loop until: human is currentPlayer OR status==='ended':
  bot = currentPlayer
  view = computePlayerView(state, bot)
  move = pickMove(view, botId)
  applyMove(...)   // through the same internal helper used by the human path
  fanout to all subscribers
  yield to scheduler (await next tick) so animations have a chance to run
```

The scheduler keeps issuing one bot move per scheduler-tick until the human is up again. Each move re-runs the off-turn Pablo check for **all** bots before the next on-turn move (so a bot can call Pablo immediately after a previous bot's discard if a power reveal lowered their projected total).

### Bot heuristic module

Location: `apps/mobile/src/supabase/internal/bot.ts`. Signature:

```ts
import type { PlayerView, Move, PlayerId, GameRules, CardId } from '@pablo/engine';
import { cardValue, makeRng } from '@pablo/engine';

export type BotContext = {
  readonly view: PlayerView;
  readonly self: PlayerId;
  readonly rules: GameRules;
  readonly rng: Rng; // seeded once per game/bot
};

export type BotDecision =
  | { readonly kind: 'on_turn'; readonly move: Move }
  | { readonly kind: 'off_turn_pablo'; readonly move: Extract<Move, { type: 'call_pablo' }> }
  | { readonly kind: 'peek'; readonly move: Extract<Move, { type: 'choose_peek' }> }
  | { readonly kind: 'pass' }; // nothing to do this tick

export function decide(ctx: BotContext, legal: ReadonlyArray<Move>): BotDecision;
```

**Honest-bot invariant**: `decide` reads only `ctx.view`. It MUST NOT touch the full `GameState`. The mockClient enforces this at the call site (it never hands `GameState` to the bot module). Eslint can't prove this; we add a one-line ESLint `no-restricted-imports` rule to forbid `bot.ts` from importing anything from `../viewStore`.

### V1 ruleset (as specified by the user)

Implemented in this exact order; first matching rule wins:

1. **Peek (during peek_phase)**: bots deterministically pick slots `[handLength - 1, handLength - 2]` (i.e. the "bottom two"), clamped to `[0..handLength)` and truncated to `rules.initialPeekCount`.
2. **Off-turn Pablo**: if the bot is not the current player and `legalMoves` includes `call_pablo`, and `estimateOwnTotal(view, self, rules) <= 8` (configurable constant `BOT_LOW_TOTAL_THRESHOLD`) → call Pablo. Otherwise `pass`.
3. **On-turn: `match_hand`** if any unordered pair `(i, j)` of own slots have known cards with equal rank AND `view.players[self].handSize - 2 >= rules.minHandSize`.
4. **On-turn: `match_discard`** if `view.discardTopCardId !== null` AND any known own slot has the same rank as the discard top AND `handSize - 1 >= rules.minHandSize`.
5. **On-turn: `draw_from_deck`** otherwise. The decision to draw includes a pre-commit plan for what to do with the drawn card; we re-evaluate when the actual draw resolves:
   1. After draw, if any known own slot has the same rank as the drawn card AND `handSize - 1 >= rules.minHandSize` → `match_drawn`.
   2. Else if the drawn card's value (via `cardValue(card, rules)`) is `<= 4` AND some known own slot has value `>= 9` → `swap_drawn` into that high slot.
   3. Else → `discard_drawn`. **Powers (7/8/9) are handled conservatively** in the next decide call when `pendingPower !== null`:
      - `peek_self`: pick the slot the bot knows least about (i.e. the slot index with no `knownCards` entry, falling back to the highest-value known slot — to verify whether it should be swapped next turn).
      - `peek_opponent`: pick the opponent whose `handSize` is largest (most info value) and the slot with the smallest known-coverage.
      - `swap_blind`: only `use_swap_blind` if our slot value is high (`>= 9`) and an opponent has at least one **unknown** slot to dump it into; else `skip_power`.
6. **On-turn rare random Pablo**: with probability `1/30` per turn via `ctx.rng.next() < 1/30`, if estimated own total is **already very low** (`<= 5`) and the bot would otherwise have made a draw → call Pablo on-turn instead. Conservative; keeps the bot from sandbagging.

Helper functions (in `bot.ts`):

- `estimateOwnTotal(view, self, rules)`: sum `cardValue(catalog[knownCard], rules)` for known slots; for unknown slots, add the mean catalog value (≈ 6.5 with overrides — computed once via `useMemo` per game).
- `knownRanksByIndex(view, self)`: returns `Record<number, Rank>` for the local player's known slots.
- `pickPairWithSameRank(knownRanksByIndex)`: returns `[i, j] | null`.

### Test plan for the heuristic

(See §12 for the full per-file test plan.)

- Termination: 100 deterministic games (seeded RNGs) all reach `status === 'ended'` within `< 200` moves.
- Legality: at every step, the returned move belongs to `legalMoves(state, botId)`. (We use `legalMoves` from the real engine in the assertion, not the bot's internal view.)
- Honesty: a property test stubs `view.players[opponent].knownCards = {}` for all opponents; the bot's behaviour must not change when we corrupt the underlying `GameState`'s opponent hands (i.e. it must depend only on `view`).
- "Never stuck": no `pass` is returned when there's a legal move for the bot.

---

## §4 Route layout

Expo Router groups (parentheses) and dynamic segments (brackets):

```
apps/mobile/app/
├── _layout.tsx                       # root: GestureHandlerRootView + SafeAreaProvider + Stack
├── (home)/
│   ├── _layout.tsx                   # Stack, header hidden
│   ├── index.tsx                     # "Play vs bots" + (dev) Card Lab link
│   └── new-game.tsx                  # 1/2/3 bots picker; tapping starts game and pushes /(game)/[gameId]
├── (game)/
│   ├── _layout.tsx                   # Stack; gesture back disabled
│   └── [gameId]/
│       ├── _layout.tsx               # Wraps children with GameStoreProvider for this gameId
│       ├── index.tsx                 # Main game screen
│       └── result.tsx                # End-of-round screen (optional — see §15 q6)
└── dev/                              # Unchanged (Phase 3 card-lab)
```

Navigation flow:

1. App boots into `(home)/index.tsx`.
2. Tapping **Play vs bots** pushes `(home)/new-game.tsx`.
3. Tapping a count (1/2/3) calls `client.createRoom` + `client.addBotsToRoom` + `client.startGame`, captures the returned `gameId`, and **replaces** the route with `(game)/[gameId]`.
4. Game screen runs through peek → playing → ended in-place. When `status === 'ended'`, the `EndOfRound` overlay slides up.
5. **Play again** in the overlay calls `client.startGame` with a fresh seed for the same room (re-uses bot ids); replaces the route with the new `gameId`. **Home** in the overlay pops back to `(home)/index.tsx`.

Why `(game)` is a group and `[gameId]` is a directory: the group lets us wrap **only** the game in a state-store provider without affecting the home group; `[gameId]` lets us URL-encode the game and (eventually) deep-link to it.

---

## §5 Screens — top-down

### `(home)/index.tsx` — Home

- Title (`t('home.title')`), subtitle (`t('home.subtitle')`).
- Primary CTA button "Play vs bots" → pushes `/(home)/new-game`.
- Dev-only `__DEV__` link to `/dev/card-lab` (preserved from Phase 3).
- All chrome reads from `tokens`. No game logic.

### `(home)/new-game.tsx` — Bot count picker

- Three buttons labelled `1`, `2`, `3` (with `t('home.botCount.label', { count })` for accessibility).
- On tap:
  1. `client.signIn()` (cached if already signed in).
  2. `client.createRoom({ rules: undefined, maxPlayers: count + 1 })`.
  3. `client.addBotsToRoom({ roomId, count })`.
  4. `client.startGame({ roomId })`.
  5. `router.replace(`/(game)/${gameId}`)`.
- Loading state while these resolve (synchronously in mock).
- Error toast via `ToastHost` if any step fails.

### `(game)/[gameId]/index.tsx` — Game screen

Layout, top to bottom:

1. **Top bar** (`SafeAreaView` top inset): turn indicator ("Your turn" / "{opponentName}'s turn"), Pablo-status badge if `pabloCalledBy !== null`, small "Leave" button (goes back to home; pauses bot scheduler).
2. **Opponent rows** (one `<OpponentRow>` per opponent, stacked): face-down hand mini-grid, score, Pablo button enabled iff `selectCanOpponentCallPablo(opp)` returns true. The Pablo button on opponent rows is **disabled and hidden for bots** (the user can't call Pablo for a bot); it's only visible for human opponents. In single-player there are no human opponents, so opponent-row Pablo buttons are effectively never shown. The reason we still keep the affordance in the component is so the same component ships for Phase 6 multiplayer without rewrite.
3. **Deck & discard area** (`<DeckArea>`): deck stack with `deckCount` badge, discard pile with the top card face-up. Tapping the deck during a turn-idle does `draw_from_deck` (when legal). Tapping the discard does nothing in v1 (`draw_from_discard` is gone post-2.5; matching against discard is a separate action).
4. **Own hand grid** (`<HandGrid>`): 2×2 to start, grows as penalty cards arrive, shrinks on successful matches. Stable card-id keyed; Reanimated layout animations between sizes (see §7).
5. **Action bar** (`<ActionBar>`): the five turn options as buttons whose enabled-state comes from selectors (which call `legalMoves`):
   - **Draw** (`draw_from_deck`).
   - **Match hand** (`match_hand` — opens `MatchHandFlow` overlay to pick the two slots).
   - **Match discard** (`match_discard` — opens `MatchDiscardFlow` overlay to pick the slot).
   - **Call Pablo** (`call_pablo`).
   - The fifth contextual button morphs: while `drawn !== null`, the bar becomes `<DrawFlow>` (Swap / Match / Discard); while `pendingPower !== null`, it becomes `<PowerFlow>` (Peek / Swap / Skip).
6. **Overlays** (rendered on top, conditional):
   - `<PeekOverlay>` during `status === 'peek_phase'` and the local player hasn't peeked.
   - `<PowerOverlay>` for slot-picker on `pendingPower` (e.g. `use_peek_opponent` needs both opponent + slot).
   - `<PabloBanner>` when `pabloCalledBy !== null` and `status === 'playing'`.
   - `<EndOfRound>` when `status === 'ended'`.

### `<PeekOverlay>`

- Renders a dimmed background over the play area, instructing `t('game.peek.instruction', { count: rules.initialPeekCount })`.
- The local player taps cards in their hand to flip face-up temporarily. Each tap updates UI state (`uiSlice.peekPicks: ReadonlyArray<number>`).
- When `peekPicks.length === initialPeekCount`, a Confirm button enables; tap dispatches `choose_peek { indices: peekPicks }`.
- For bots, the mock client auto-picks via the bot module (§3 rule 1); the overlay shows `t('game.peek.waitingForBots', { remaining })` while peeks come in (driven by `peek_chosen` events).
- Once `status === 'playing'` (driven by `peek_phase_ended`), the overlay animates out with a quick fade.

### Off-turn Pablo affordance

Each `<OpponentRow>` exposes a Pablo button that:

- Is conceptually wired to `selectLegalCallPablo(playerId)` → boolean.
- For bots: hidden entirely (the human never controls a bot — see §5/2).
- For real human opponents (Phase 6): visible, enabled per selector.

The local player's own Pablo button lives in the `<ActionBar>` (call_pablo on-turn or off-turn — same engine move).

The `<PabloBanner>` shows once `pabloCalledBy !== null`: it persists at the top of the screen with `t('game.pablo.banner', { name })` and a sub-line `t('game.pablo.subline.{onTurn|offTurn}')`.

### `<EndOfRound>`

- Activates as a sheet/overlay when the local view's `status === 'ended'`.
- Sweeps every opponent's hand face-up (left-to-right stagger, see §6 / "reveal sweep").
- Shows per-player totals (read from `view.players[i].score`, which the engine wrote into `state.scores` via `round_ended`).
- Renders the `winners[]` list with `t('result.winners.{single|tie}', { names })`.
- Two buttons:
  - **Play again** → `client.startGame({ roomId })` (same room → same bots; fresh seed) → `router.replace(`/(game)/${newGameId}`)`.
  - **Home** → leaves the room → `router.replace('/(home)')`.

---

## §6 Animation orchestration

The single `applyMove` (whether from the human or a bot) fires a `ReadonlyArray<GameEvent>`. The UI must play each event's animation in order **without** mounting collisions and without dropping events when they arrive faster than animations finish.

### Architecture

Three pieces:

1. **`animator.ts`** (`apps/mobile/src/components/game/animation/`)
   - Owns an in-memory `eventQueue: ReadonlyArray<{ event: GameEvent; gameId: GameId }>`.
   - Exposes `enqueue(events: ReadonlyArray<GameEvent>, gameId: GameId)` and `subscribe((nextEvent) => Promise<void>)`.
   - Serial: drains one event at a time, awaits the consumer's returned promise before advancing.
2. **`handlers.ts`**
   - Maps each `GameEvent['type']` to an `async (event, ctx) => void` handler. Handlers update Reanimated shared values via worklets (no per-frame JS work) and resolve when the animation completes (the handler returns a promise that resolves on the `withTiming` callback's `runOnJS(resolve)` invocation).
3. **`layoutRegistry.ts`**
   - A small ref-keyed registry that lets the animator look up "where is slot 2 of player Alice right now?" for fly-to-discard animations. Cards register their absolute on-screen origin via `onLayout`. Reanimated runs the actual animation, but layout coordinates come from the JS thread (one-time read per event).

### Per-event handler list

| Event                | Handler effect                                                                                                                                                                                                                                  | Approx duration |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `peek_chosen`        | Subtle pulse on the named player's row.                                                                                                                                                                                                         | 200 ms          |
| `peek_phase_ended`   | Fade out the `<PeekOverlay>`; reveal the action bar.                                                                                                                                                                                            | 250 ms          |
| `card_drawn`         | Animate a small card sprite from the deck to a "drawn card" slot above the hand. Face-up only for the drawer (own view's `drawnCardId` set).                                                                                                    | 350 ms          |
| `card_swapped`       | Drawn card flies into the targeted slot; old slot card flies out to the discard.                                                                                                                                                                | 450 ms          |
| `card_discarded`     | Card flies to the discard pile and lands. Stacked if multiple in a row (e.g. `match_succeeded`).                                                                                                                                                | 350 ms          |
| `match_succeeded`    | Targeted slots glow briefly, both cards fly to discard sequentially (350 ms each), then hand compacts via `HandGrid`'s Reanimated layout transition.                                                                                            | ~1000 ms        |
| `match_failed`       | Targeted slots shake (`withSequence(+6, -6, +6, 0)`, 250 ms), `ToastHost` shows `t('game.match.fail.{wrong_rank\|min_hand_size}')` for 1800 ms. For `wrong_rank`, the slot dims to indicate cleared-knowledge.                                  | ~600 ms         |
| `penalty_card_dealt` | Face-down card slides from the deck into the recipient's hand at the new slot.                                                                                                                                                                  | 400 ms          |
| `swapped_blind`      | Two cards (one mine, one opponent's) fly across to each other's slots, both face-down.                                                                                                                                                          | 600 ms          |
| `power_activated`    | The pending-power card (the discard top) glows in the accent color; a small label `t('game.power.{peek_self\|peek_opponent\|swap_blind}')` appears beneath the discard.                                                                         | 250 ms          |
| `peeked`             | If the viewer is the peeker: target slot flips face-up briefly (1500 ms), then back down. Else: target slot pulses to indicate "someone peeked here".                                                                                           | ~1800 ms        |
| `deck_reshuffled`    | The discard pile (minus top) lifts, fans, and settles back as the deck. Subtle.                                                                                                                                                                 | 600 ms          |
| `pablo_called`       | Slide `<PabloBanner>` in from the top.                                                                                                                                                                                                          | 350 ms          |
| `turn_ended`         | Brief crossfade on the turn indicator badge.                                                                                                                                                                                                    | 200 ms          |
| `round_ended`        | Fades to `<EndOfRound>` overlay; the overlay triggers the reveal sweep separately (the engine doesn't model the reveal — it's purely UI). The reveal sweep stagger-flips every opponent's hand left to right with 80 ms delay between siblings. | ~1500 ms        |

Each handler's promise resolves when the **dominant** animation completes (e.g. for `card_swapped`, when the slower of "drawn-in" and "old-out" finishes). Toasts and pulses run alongside and don't gate the queue.

### Why JS-thread queue + worklet-driven animation

- Reanimated worklets own per-frame work; we never compute interpolations on the JS thread.
- The queue is on the JS thread (it's not a per-frame thing — it's "one event at a time").
- Each handler ends by calling `runOnJS(resolveAnimation)` from inside a worklet completion callback. That's how the JS-side queue knows the animation finished.

### Subscribing the UI to events

The mockClient already fans out player views via `subscribePlayerView`. For events:

- The mockClient adds an **in-process** event subscription: `mockClient.__subscribeEvents(gameId, cb)` (underscored prefix because it's NOT in the PabloClient interface — see §15 q4 for the open question on adding it to the interface or keeping it side-channel).
- The `GameStoreProvider` for a route binds the mockClient's event callback into the `animator.enqueue` call.

This split keeps `PabloClient` aligned with what a Phase 6 SQL projection can deliver (views are the contract; events arrive as Realtime broadcasts on a separate channel).

### "What if a power resolves between human turns?"

Example: bot draws a 7, discards it (power_activated → pendingPower=peek_self), bot uses peek_self → next events arrive while the human's previous animation is still playing. The serial queue holds them; no event is dropped; the human sees them in order, just slightly later.

The bot scheduler intentionally yields a tick between bot moves so the human's view has at least one paint cycle to absorb the prior event batch.

---

## §7 Variable hand-size layout

Hand sizes range from 2 (after enough successful matches) to 4 (default initial) up to 7+ (after multiple failed claims with penalty cards). We must:

- Never remount the same card (would re-trigger flip / drag state).
- Animate cards into their new positions when slots shift.
- Keep the grid balanced and tappable at all sizes.

### Layout strategy

- `<HandGrid>` receives a `cards: ReadonlyArray<{ id: CardId | null; faceUp: boolean; knownCardId: CardId | null }>` array (the local view, ordered by handIndex).
- Each card is rendered with a **stable React `key={id}`** — the position is provided via Reanimated `LinearTransition` layout animation OR a manual interpolation off `sharedValue`s (we go with `LinearTransition` from `react-native-reanimated` SDK 4, which exists and works with `<View>`).
- The grid computes column-count via the helper below:

```ts
function gridLayoutFor(handSize: number): { cols: number; rows: number } {
  if (handSize <= 4) return { cols: 2, rows: 2 };
  if (handSize <= 6) return { cols: 3, rows: 2 };
  if (handSize <= 8) return { cols: 4, rows: 2 };
  return { cols: 4, rows: Math.ceil(handSize / 4) };
}
```

Breakpoints rationale: 2×2 is the canonical "real Pablo" layout, 3×2 once a penalty arrives, 4×2 by the time two penalties stack. Anything past 8 looks weird in any case; we choose width 4 and grow downward.

- Card width scales: `cardWidth = (gridWidth - (cols + 1) * gap) / cols`. Height keeps the playing-card aspect ratio (~1.46).

### Slot reindex animation

When `match_succeeded` removes slot 2 from a hand of 4, the engine reports `slotIndices: [2]`. The view's next snapshot has length 3. We:

1. Receive the event (`match_succeeded`).
2. The animator handler asks the layout registry where the removed slot is on screen.
3. Plays the card-discard animation for that card (it leaves the grid via the absolute-positioned overlay).
4. Then commits the **next view** to the store, which triggers `<HandGrid>` to re-render with 3 cards. The remaining 3 cards animate to their new positions via `LinearTransition`.

### Empty placeholder

If `handSize === 0` (defensive — shouldn't happen with `minHandSize >= 2`), `<HandGrid>` renders a single placeholder pip so the layout doesn't collapse.

---

## §8 i18n keys

All new keys land in `apps/mobile/src/i18n/locales/en.json`. No string concatenation in JSX.

```json
{
  "home": {
    "title": "Pablo",
    "subtitle": "Play a round against bots",
    "playVsBots": "Play vs bots",
    "botCount": {
      "title": "How many opponents?",
      "label": "{{count}} bot",
      "labelPlural": "{{count}} bots"
    },
    "start": "Start game"
  },
  "game": {
    "status": {
      "yourTurn": "Your turn",
      "opponentTurn": "{{name}}'s turn",
      "peekPhase": "Peek phase",
      "ended": "Round complete"
    },
    "peek": {
      "instruction": "Tap {{count}} of your cards to peek",
      "instructionConfirm": "Confirm peek",
      "waitingForBots": "Waiting on {{remaining}} opponents…"
    },
    "action": {
      "draw": "Draw",
      "matchHand": "Match in hand",
      "matchDiscard": "Match discard",
      "callPablo": "Pablo!",
      "swap": "Swap",
      "discard": "Discard",
      "match": "Match",
      "skipPower": "Skip",
      "usePeekSelf": "Peek your card",
      "usePeekOpponent": "Peek opponent",
      "useSwapBlind": "Blind swap"
    },
    "actionHint": {
      "afterDraw": "Choose what to do with the drawn card.",
      "pickOwnSlot": "Pick one of your cards.",
      "pickTwoOwnSlots": "Pick two of your cards.",
      "pickOpponentSlot": "Pick an opponent's card."
    },
    "match": {
      "fail": {
        "wrong_rank": "Wrong rank — penalty card.",
        "min_hand_size": "Would drop below the minimum hand size."
      },
      "success": "Match!"
    },
    "power": {
      "peek_self": "Peek your card",
      "peek_opponent": "Peek opponent",
      "swap_blind": "Blind swap"
    },
    "pablo": {
      "banner": "{{name}} called Pablo!",
      "subline": {
        "onTurn": "Round ending — scoring now.",
        "offTurn": "Round ends after {{name}}'s next turn comes around."
      },
      "callButton": "Call Pablo"
    },
    "deck": {
      "count": "Deck: {{count}}",
      "empty": "Deck empty",
      "reshuffled": "Deck reshuffled"
    },
    "leave": "Leave"
  },
  "result": {
    "title": "Round over",
    "winners": {
      "single": "{{name}} wins with {{score}}.",
      "tie": "Tied for the win: {{names}}."
    },
    "totals": "Totals",
    "playAgain": "Play again",
    "home": "Home"
  },
  "error": {
    "generic": "Something went wrong: {{message}}.",
    "move": {
      "not_your_turn": "Not your turn.",
      "must_draw_first": "Draw a card first.",
      "already_drawn": "You've already drawn.",
      "pablo_already_called": "Pablo has already been called.",
      "pablo_blocked": "Can't call Pablo right now.",
      "invalid_hand_index": "That slot is out of range.",
      "same_index": "Pick two different slots.",
      "duplicate_indices": "Pick distinct slots.",
      "invalid_peek_count": "Pick exactly {{count}} cards.",
      "already_peeked": "You've already peeked.",
      "discard_empty": "The discard pile is empty.",
      "power_pending": "Resolve the current power first.",
      "game_already_ended": "This round is over."
    }
  }
}
```

`MoveError` codes are mapped 1:1 to `error.move.*` so the UI surfaces the engine's error directly without bespoke logic.

The `botCount.label` / `botCount.labelPlural` split is the simplest pluralization we can do without pulling in ICU; if we want true ICU select-pluralization, we'll do that in Phase 7 (i18n.mdc allows simple interpolation for v1).

---

## §9 Design tokens

`apps/mobile/src/design/tokens.ts` gains a `game` namespace (and a couple of additions to `color.accent` / `color.surface`). No raw hex in components.

```ts
// appended to tokens:
game: {
  surface: {
    table: '#F1ECDD',       // play area background — warmer than `surface.app`
    actionBar: '#FFFFFF',
    actionBarBorder: '#E5E5E0',
    slotEmpty: 'rgba(0,0,0,0.04)',
    slotSelected: 'rgba(45,106,79,0.18)', // selection halo (uses existing accent)
  },
  accent: {
    pabloOnTurn: '#B23A48',        // urgent red — on-turn Pablo banner
    pabloOffTurn: '#D88C9A',       // softer for off-turn
    penaltyTint: 'rgba(178,58,72,0.12)', // tint behind freshly-dealt penalty cards
    powerActive: '#C77D08',        // pending-power glow
  },
  duration: {
    cardFly: 350,
    cardSwap: 450,
    peekFlip: 1500,
    shake: 250,
    reshuffle: 600,
    revealStagger: 80,
  },
  shake: { offset: 6 },
},
```

Reuses existing tokens for spacing, radius, fonts; only the `game` namespace is genuinely new. We do **not** add new font sizes or weights.

---

## §10 Out of scope

Explicit list (per PLAN.md plus a few we want to be louder about):

- Supabase / auth / networking of any kind.
- Multi-round / best-of-N / persistent scoreboards.
- Bot difficulty tiers (one heuristic; Easy/Medium/Hard postponed to a later phase).
- Locales other than English.
- Sound (`expo-av`) and haptics (`expo-haptics`) — Phase 7.
- Zellige theming polish — Phase 7.
- Hidden-info diff between local move and server confirmation (no server in this phase).
- Card-art / Skia text labels (Phase 7 polish item).
- Drag-to-swap on the hand grid (we use buttons + slot-tap selection; drag is Phase 7 polish).
- New engine features (engine stays at Phase 2.5).
- Animation choreographer for simultaneous animations (we serialize the queue; concurrent multi-event sequences are deferred).

---

## §11 Definition of Done

Concrete checklist, mirroring PLAN.md plus the operational gates.

- [ ] You can install on a real iPhone and play at least one full single round against 1, 2, **and** 3 bots (peek → turns → at least one Pablo termination path → reveal).
- [ ] All five turn options reachable from the UI; each option dispatches the correct `Move` and the engine confirms.
- [ ] `match_failed` toasts distinguish `wrong_rank` and `min_hand_size`.
- [ ] Peek-phase UX runs to completion (local picks N cards, bots auto-pick, `peek_phase_ended` fires, action bar appears).
- [ ] Off-turn `call_pablo` is reachable for the local player via the action bar (single-player ⇒ no opponent-row affordance is shown for bots, but the local player can off-turn-Pablo during a bot's turn — animation is identical).
- [ ] Hand-size grows on a `match_failed` (+ penalty) without re-mounting other cards.
- [ ] Hand-size shrinks on a `match_succeeded` without re-mounting remaining cards.
- [ ] `bun --cwd=apps/mobile run typecheck` clean.
- [ ] `bun run check` clean across the workspace.
- [ ] `docs/PLAN.md` updated: Phase 4 → Done, one decisions row per resolved open question below.
- [ ] PR title `phase 4: single-player vs bot`. PR body includes a screen recording of a full round (or three short ones, one per bot count).
- [ ] No `Math.random`, no `Date.now`, no new dependencies other than `zustand` (justified in §0).

---

## §12 Test plan

`bun test` covers everything that's a pure function. Anything involving Reanimated / Skia / actual layout is verified manually on simulator + device.

### `apps/mobile/src/supabase/internal/room.test.ts`

- Room code is 4 alphanumeric uppercase chars; deterministic with a fixed `seedSource`.
- `createRoom` returns a `Room` whose `hostId === localPlayerId`, `status === 'waiting'`, `members.length === 1`.
- `addBotsToRoom({ count: 3 })` appends 3 bot ids; `room.members.length === 4`; bot ids are stable across calls (`bot1`, `bot2`, `bot3`).

### `apps/mobile/src/supabase/internal/bot.test.ts`

- **Termination**: 100 seeded games (`seed = `bot-test:${i}``for`i in 0..99`) each end within ≤ 200 moves.
- **Legality**: at every move, the returned move is in `legalMoves(state, botId)` (uses the real engine state to assert).
- **Honesty**: a property test that runs the bot with a tampered `view` whose `players[otherPlayer].knownCards = {}`; the bot's chosen move on otherwise identical states must equal the move on the real view (because the bot only reads its own knownCards).
- **Heuristic ordering**: when both `match_hand` and `match_discard` are available, `match_hand` wins (matches the spec). When neither is available, `draw_from_deck` wins.
- **Pablo trigger**: a curated view where the bot's estimated total is `<= 8` triggers `call_pablo`; one that's higher does not.

### `apps/mobile/src/supabase/internal/mockClient.test.ts`

End-to-end deterministic single-round game (`seed: 'mock-e2e-1'`, 3 players, fixed scheduler).

Sequence asserted:

1. `createMockClient` + `createRoom` + `addBotsToRoom(2)` + `startGame` → `gameId` returned.
2. Initial view: `status === 'peek_phase'`, local hand size = 4, deck count = 52 - 12 - 1 = 39, discard top set.
3. Local issues `choose_peek({ indices: [0, 1] })` → view's local `knownCards` populated for slots 0 and 1.
4. Bots auto-`choose_peek`. After the last peek, `peek_phase_ended` fires; status flips to `'playing'`.
5. Scripted local sequence:
   - `draw_from_deck` → `swap_drawn { handIndex: 0 }` (forces a known-card cycle so a later `match_drawn` will succeed deterministically).
   - Wait through bot turns.
   - On next local turn: `match_drawn` with the right index → `match_succeeded`, hand shrinks to 3.
   - On a subsequent local turn: `match_hand { 0, 1 }` with mismatched ranks → `match_failed { reason: 'wrong_rank' }`, hand grows back to 4 (penalty), `penalty_card_dealt`.
   - Off-turn `call_pablo` mid bot turn → `pablo_called`, `pabloCalledBy === localPlayerId`. Bot finishes its turn. Subsequent bot turn skipped → `round_ended`.
6. Final assertions: `status === 'ended'`, `winners` non-empty, `view.players[*].score` populated, the chosen move count is small enough that the bot doesn't accidentally win every game (this is the human's deterministic scripted run; we just verify the engine integration).
7. **Idempotency**: re-issuing the same `applyMove` with the same key returns the cached `{ version }` and does not advance state.
8. **Version mismatch**: an `applyMove` with `expectedVersion: 0` after version has advanced returns `{ ok: false, error: 'version_mismatch' }`.

### `apps/mobile/src/store/selectors.test.ts`

Pure tests over hand-crafted `PlayerView` fixtures (no engine state, no React).

- `selectActionBarItems(view)` returns the correct enabled/disabled state for each of the 5 options across: peek_phase, playing-idle current player, playing-idle non-current player (only `callPablo` shown), playing-drawn, pending_power, ended.
- `selectCanCallPablo(view)` is true iff `view.status === 'playing'` && `view.pabloCalledBy === null` && `view.drawnCardId === null` && `view.pendingPower === null`.
- `selectHandSlots(view)` returns one entry per slot with `faceUp = knownCards[index] !== undefined`.
- `selectIsPeekPhase(view)`, `selectPeekRemaining(view)`, `selectOpponentRows(view)` deliver shape-stable outputs (snapshot-equal between calls when input is equal — to keep React happy).

The selectors call into `legalMoves` from the engine but **do not** themselves implement any rule logic; tests assert against the engine's output rather than re-implementing it.

### `apps/mobile/src/components/game/animation/animator.test.ts`

Pure logic tests with a fake handler map.

- `enqueue(events)` calls the handler once per event, in order.
- `enqueue` while another batch is draining appends to the queue; nothing is dropped.
- Handler error: if a handler rejects, the queue logs and continues with the next event (so a UI bug can't lock the game).
- `subscribe` returns an unsubscribe that stops further deliveries; pending events still drain.

### Manual verification (checklist in PR description)

Run on iOS simulator + a real iPhone:

1. App boots to home; `Play vs bots` visible.
2. Pick 2 bots → game screen renders without flashing.
3. Peek overlay flips two cards face-up momentarily; Confirm dispatches.
4. Action bar enables `Draw`, `Match in hand`, `Match discard`, `Pablo`.
5. `Draw` flow swaps into chosen slot smoothly; opponent rows update.
6. A bot's `match_succeeded` shrinks its visible hand; layout animates.
7. A bot's `match_failed` produces a penalty card animation in their row.
8. Power activation: discard a 7 → peek_self overlay appears; pick a slot → see your card; queue drains.
9. Off-turn Pablo: while a bot is mid-turn, the local Pablo button is enabled in the action bar; tapping it shows the banner and bot finishes its turn; round ends on the next would-be local turn.
10. End-of-round overlay: hands reveal stagger; winners shown correctly; `Play again` creates a fresh game.
11. Hand-size growth/shrink: 5 cards renders 3×2; back to 4 renders 2×2; no card flickers or re-mounts.

---

## §13 Open questions / proposed decisions (need user input before execution)

### 1. Bot timing — fixed delays or scaled-to-animation?

**Question**: Should bot moves wait for the actual animation to finish before queuing the next one, or use a fixed delay tuned to typical animation durations?

**Proposal**: **Fixed delay** (420 ms on-turn, 1200 ms off-turn-Pablo, 200 ms peek). Rationale: gates client → UI coupling (a stuck animation shouldn't deadlock the bot), and tests can drive everything synchronously via the injected scheduler.

**Alternative**: have the animator call back into the bot scheduler when its queue is empty. More accurate; more coupling. We can revisit in Phase 7 if 420 ms feels off on-device.

### 2. `addBotsToRoom` exposure — on `PabloClient` or only on `MockClient`?

**Question**: Should `addBotsToRoom` be on the shared `PabloClient` interface or only on the concrete `MockClient` extension type?

**Proposal**: **Only on `MockClient`** (extension type returned by `createMockClient`). `realClient` will never have bots — Phase 6 adds humans through `joinRoom`. Keeping it off the interface prevents accidental usage from screens that should be backend-agnostic.

**Alternative**: add it to `PabloClient` so the bot-picker screen doesn't need a type cast. Defensible but pollutes the boundary.

### 3. Simultaneous off-turn Pablo by multiple bots

**Question**: If two bots independently decide to call Pablo on the same tick (because their views both look low), which one wins?

**Proposal**: **Lowest `estimatedTotal`, ties broken by lowest player-index**. Deterministic, easy to reason about, no race.

**Alternative**: random via `ctx.rng`. More natural, but harder to reproduce in tests; we'd need to add an explicit RNG snapshot to the test setup.

### 4. Event delivery — extend `PabloClient` or side-channel?

**Question**: The Phase 6 SQL/Realtime model will deliver views via `subscribePlayerView` and likely events via a separate Realtime broadcast channel. Should we add `subscribeGameEvents(gameId, cb)` to `PabloClient` now (so the mock and Phase 6 are aligned) or keep events as a mockClient-only side channel?

**Proposal**: **Add `subscribeGameEvents(gameId, cb: (events: ReadonlyArray<GameEvent>) => void): Unsubscribe` to `PabloClient`**. Implement it now in mockClient; stub it as `throw 'unimplemented'` in `realClient` (already a stub). Saves a future API churn. Cost: tiny — one method on an interface.

**Alternative**: side-channel `__subscribeEvents` for now. Smaller surface change; future Phase 6 has to plumb the new method.

### 5. `now()` injection in `mockClient`

**Question**: The engine bans `Date.now()`. The mobile-app rule (ui.mdc) doesn't explicitly. Should we still avoid `Date.now()` in `mockClient`?

**Proposal**: **Avoid `Date.now()` in `mockClient` internals**. Use an injected `now()` whose runtime default lives in `internal/clock.ts` (the one place that does call `Date.now()` directly, behind a one-line eslint disable with a justification comment). Reason: keeps mockClient deterministic for testing; the only `Date.now()` call site is a documented seam.

**Alternative**: allow `Date.now()` everywhere in the mockClient. Simpler; but then tests need fake timers.

### 6. End-of-round — overlay or dedicated route?

**Question**: PLAN.md says "end-of-round reveal" but doesn't specify whether it's a stacked screen or a sheet/overlay on the game route.

**Proposal**: **Overlay on the game route** (`<EndOfRound>` rendered inside `(game)/[gameId]/index.tsx` when `view.status === 'ended'`). Reasons: the reveal sweep needs access to the same `<HandGrid>` / `<OpponentRow>` instances so cards flip in-place; pushing to a new route would require duplicating layout or passing serialized state. We still allow a `result.tsx` route as a future entry point (e.g. for deep-linking past games in a later phase).

**Alternative**: dedicated `(game)/[gameId]/result.tsx`. Cleaner URL semantics; clunkier animation. Reverted to overlay unless you prefer route-based.

### 7. Drag-to-swap on the hand grid

**Question**: PLAN.md mentions an action bar but doesn't forbid drag-to-swap. Phase 3 already proves drag-to-snap on `<PlayingCard>`. Should we wire drag-to-swap in Phase 4 or keep it for Phase 7?

**Proposal**: **Phase 7**. Reasons: (a) the bar already exposes Swap explicitly; (b) drag-to-swap interacts with off-turn Pablo affordances and the slot-picker overlays in tricky ways; (c) the variants grid and the lab card already exercise the drag system as proof. Out of scope for this PR.

**Alternative**: implement drag-to-swap as a polish item. Defensible — but it grows the surface area meaningfully.

### 8. Bot voices ("bot1", "bot2", "bot3") — names or just IDs?

**Question**: Bots need a display name in `t('game.status.opponentTurn', { name })` and the end-of-round screen.

**Proposal**: **Hardcoded English names with i18n keys**: `t('botName.1')` → `'Cabo Cassette'`, `t('botName.2')` → `'Cambia'`, `t('botName.3')` → `'Pablito'`. Keeps the table fun without UX scope creep.

**Alternative**: anonymized (`Bot 1`, `Bot 2`, …). Functionally fine, less personality. Easy to swap later.

### 9. When to refresh `PlayerView` relative to event playback

**Question**: A single `applyMove` produces a new state **and** N events. Do we update the store's `view` immediately, or batch it after the events finish animating?

**Proposal**: **Update `view` immediately** (snapshot from `subscribePlayerView`), but render off the **prior** view until the animator's queue drains, then swap. Implementation: a tiny "shadow view" pattern — the store holds `view: PlayerView` and `pendingView: PlayerView | null`; components read `view`; the animator promotes `pendingView` to `view` after handling each batch. Avoids cards appearing/disappearing before their animation runs.

**Alternative**: render directly off `view` and hope the animations look right. Simpler; but `match_succeeded` would visually compact the grid before the discarded cards finish flying. Not acceptable.

### 10. State store granularity — one store, or per-game store?

**Question**: Zustand can hold a single global store or one store per game via a React context provider.

**Proposal**: **Per-game store via `GameStoreProvider`** (mounted in `(game)/[gameId]/_layout.tsx`). Lifecycle is tied to the route; "Play again" remounts with a fresh store; no stale state across games.

**Alternative**: single global store keyed by `gameId`. More plumbing; no real upside in single-player.

---

## §14 Sanity audit vs. AGENTS.md hard rules

| Rule                                  | Compliance                                                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #1 Server-authoritative state         | n/a (single-player; the mockClient stands in for the server). The bot still routes every move through `engine.applyMove`. UI never decides legality.                                 |
| #2 Engine purity                      | Engine is untouched this phase. We don't reach into engine internals; we use only the public API exports.                                                                            |
| #3 Never leak hidden cards            | Bots only read `PlayerView`; never `GameState`. Components read selectors over `PlayerView`; never the raw mockClient state. §3 documents the lint we'll add to enforce this.        |
| #4 RLS on every table                 | n/a (no DB).                                                                                                                                                                         |
| #5 Types flow engine → edge → client  | Engine types are imported across the app via `@pablo/engine`; `Move` / `PlayerView` / `GameEvent` / `MoveError` are used verbatim.                                                   |
| #6 No game logic in components        | All conditionals live in selectors and the engine; components consume `selectXxx(...)` and dispatch `Move`s. The bot heuristic is a pure module (not a component).                   |
| #7 No hardcoded user-visible strings  | Every string passes through `t()`; new keys listed in §8.                                                                                                                            |
| #8 No hardcoded colors / spacing      | All chrome reads `tokens.*`; new `game.*` namespace added in §9.                                                                                                                     |
| #9 Plan before you build              | This file, committed in the same PR as implementation. ✅                                                                                                                            |
| Stack discipline (Bun, Expo, Zustand) | Only adds `zustand` (PLAN.md stack table prescribes it). No Redux, no React Query, no animation libs beyond what's already installed (Reanimated 4, Gesture Handler 2.28, Skia 2.2). |

---

## §15 Self-review checklist (run before pushing branch)

Per AGENTS.md "How to self-review before merging":

1. `bun run check` clean across the workspace (format, lint, typecheck, tests).
2. Re-read every file in `git diff main...HEAD`:
   - `mockClient.ts`: idempotency, version mismatch, fanout order, bot scheduler kick.
   - `bot.ts`: only reads `view`; never `Math.random` / `Date.now`; covers all five-option fallbacks.
   - `gameStore.ts` / `selectors.ts`: selectors are pure functions of `PlayerView`; no `applyMove` inside selectors.
   - Every component under `src/components/game/`: no game logic, no string literals, no raw colors / spacings.
   - `animator.ts`: queue invariants; failure handling.
   - `HandGrid.tsx`: stable card-id keys; `LinearTransition` wires correctly; breakpoint helper covers handSize 2..8+.
   - Every screen route: navigation flow matches §4; `useLocalSearchParams` is typed; no `useEffect` chains for game state (the store/event subscription is the single source).
3. Confirm `docs/PLAN.md` updated: Phase 4 → Done; one "Decisions Made" row per resolved open question in §13 (with date, decision, rationale).
4. Confirm `docs/GAME_LOGIC.md` was NOT modified (no rule changes).
5. Confirm `docs/SCHEMA.md` was NOT modified (no DB / edge function changes).
6. Confirm `packages/engine/**` was NOT modified.
7. Confirm one screen recording attached to PR body covering: peek phase, a successful match, a failed match with penalty, an off-turn Pablo, end-of-round reveal.
8. Push branch. Stop. Do NOT merge unless user says "merge".

If anything above is undesired, tell me before I start writing code.
