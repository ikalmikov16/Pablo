# PLAN — Pablo

Living plan. Agents MUST update this after meaningful changes — move items between sections, add to "Decisions Made".

## Current phase

**Phase 7 — Polish & animations** is next up (not started). **Phase 6 — Multiplayer wiring** (`phase-6-multiplayer`) squash-merged to `main` (2026-06-10): `realClient`, lobby UI, `getActiveSession` reconnection, `rooms.current_game_id`, `returnToLobby`, realtime publication for lobby subscriptions, tick-pump initial-sync snap. Manual two-device pass validated (simulator + physical iPhone via Expo Go).

---

## Workflow

Read `AGENTS.md` § "Branch / PR workflow" before starting any phase. TL;DR:

- Each phase has its own branch (`phase-2-engine`, `phase-3-card-lab`, etc.).
- **Every phase/feature starts with a written plan in `docs/plans/<branch-slug>.md`** — committed in the same PR as the implementation.
- Agents push to their phase branch and stop — they do not merge unless the user explicitly says "merge".
- The agent self-reviews its own diff before squash-merging (no Bugbot).
- Last step before merging: update this file (move items between Done / In Progress / Up Next, append to Decisions Made).

---

## Done

- ✅ Bun workspace structure (`apps/`, `packages/`, `supabase/`, `docs/`).
- ✅ `AGENTS.md`, `docs/PLAN.md`, `docs/GAME_LOGIC.md`, `docs/SCHEMA.md`.
- ✅ `.cursor/rules/` × 7 (engine, supabase, ui, i18n, design, cards, debugging) scoped via globs.
- ✅ Git initialized, pushed to `git@github.com:ikalmikov16/Pablo.git`.
- ✅ Bun + Supabase CLI installed.
- ✅ Engine package: types (Card, Move, GameEvent, GameState, MatchState, GameRules, SpecialPower, CardValueOverride, PlayerView, RoundScore), stub implementations, 6 failing contract tests.
- ✅ Mobile app: Expo SDK 54, RN 0.81, React 19.1, TS strict (5.9.x); deps include `react-native-reanimated@~4.1`, `react-native-worklets@0.5`, `react-native-gesture-handler@~2.28`, `@shopify/react-native-skia@2.2`. (SDK 55 attempted; rolled back — see decisions.)
- ✅ Card theming contract (`apps/mobile/src/design/cardTheme.ts`).
- ✅ `PabloClient` interface + mock/real client stubs (`apps/mobile/src/supabase/`).
- ✅ `.cursor/hooks/typecheck.sh` verified — fires after edits, returns errors as `additional_context`.
- ✅ **Phase 2 — Engine implementation** (`phase-2-engine` branch, PR open).
  - Seeded PRNG: cyrb128 + sfc32 (pure TS, no `Math.random`, deterministic across V8/Hermes/Deno).
  - All public functions implemented and pure: `newGame`, `applyMove`, `computePlayerView`, `scoreRound`, `legalMoves`. (Note: `newMatch`/`startNextRound`/`endRound` were removed in Phase 2.5 when multi-round logic moved out of the engine.)
  - Per-player knowledge (`knownCards`) lives inside `GameState`.
  - `pendingPower` field tracks power-pending sub-turns.
  - `reshuffleCount` enables deterministic reshuffle sub-seeds.
  - 111 tests, 0 failures, 98.99% line coverage.
  - `bun --cwd=packages/engine run typecheck` — 0 errors.
  - Implementation plan saved to `docs/PHASE2_PLAN.md`.
- ✅ **Phase 2.5 — Engine rules revision** (`phase-2.5-engine` branch, PR open).
  - `peek_phase` status added: game starts in `peek_phase`, players each call `choose_peek` (C(4,2)=6 options) before play begins.
  - Variable hand size: `HandIndex` widened to `number`; `removeSlots` + `reindexKnowledgeForPlayer` keep knowledge maps accurate.
  - Three new matching moves: `match_drawn` (draw-and-match), `match_hand` (two own slots), `match_discard` (slot vs discard top).
  - Off-turn Pablo: any player in idle state may call Pablo; current player finishes their turn, round ends when the turn pointer next reaches the caller.
  - Penalty cards: `drawPenaltyCard` helper (internal); face-down to owner (no knownCards entry); handles deck exhaustion + reshuffle.
  - `finaliseRound` extracted to `internal/finalise.ts` to avoid circular imports.
  - `match.ts` and `match.test.ts` deleted (multi-round match removed from engine scope).
  - `scoreRound` simplified: no caller penalty, returns `winners: PlayerId[]` (multi-element on tie).
  - Public API expanded: `makeRng`, `cardValue`, `cardId`, `buildCatalog` exported from `@pablo/engine` for edge functions + bot.
  - 207 tests, 0 failures; `bun run check` clean; `@pablo/mobile typecheck` clean.
  - Implementation plan at `docs/plans/phase-2.5-engine.md`.
- ✅ **Phase 3 — Card Lab** (`phase-3-card-lab` branch, PR open).
  - Expo Router 6 wired up (SDK-54-compatible); entry point swapped to `expo-router/entry`.
  - `<PlayingCard>` in `apps/mobile/src/components/cards/PlayingCard.tsx`: Skia Canvas for back/face surfaces, Reanimated 4 `rotateY` flip (withTiming, 450 ms), pan-to-snap (withSpring), `Gesture.Race` for tap/pan.
  - Two themes: `classic-light` (existing) + `midnight` (new dark/gold); `nextTheme()` utility cycles the registry.
  - Design tokens at `apps/mobile/src/design/tokens.ts`; all app chrome reads from tokens.
  - Minimal `t()` i18n wrapper at `apps/mobile/src/i18n/` (same call signature as the future full implementation).
  - Dev-only lab screen at `apps/mobile/app/dev/card-lab.tsx` with interactive card + variants grid.
  - `__DEV__`-gated entry link on the home screen.
  - 152 tests, 0 failures (`bun run check` clean).
  - Implementation plan at `docs/plans/phase-3-card-lab.md`.
- ✅ **Phase 4 — Single-player vs bot** (`phase-4-singleplayer` squash-merged to `main`, 2026-05-18).
  - Expo Router groups `(home)`, `(game)`, `dev/`; home → new game with 1–3 bots; full game UI (hand grid, opponents, deck/discard, action bar, peek, powers, Pablo, end-of-round).
  - `mockClient` + internal bot scheduler; `PabloClient` with versioned `subscribePlayerView`, `subscribeGameEvents`, typed `ClientErrorCode`; singleton in `apps/mobile/src/supabase/client.ts`.
  - Zustand per-game store + `GameStoreProvider`; PowerFlow for J/Q/K resolution.
  - Pre–Phase 5 audit on branch: doc sync (`GAME_LOGIC`, `PLAN`, `SCHEMA` PabloClient section), flat `error.*` i18n for all move/transport codes, game tokens for rgba/magic timings.
  - `bun run check` clean; implementation plan at `docs/plans/phase-4-singleplayer.md`.
- ✅ **Phase 5 — Supabase backend** (`phase-5-supabase` squash-merged to `main`, 2026-05-18).
  - 8 migrations: `profiles`, `rooms`, `room_members`, `games`, `game_moves`, `game_events`, `create_room()`, `apply_move_atomic()`.
  - 6 edge functions: `joinRoom`, `leaveRoom`, `startGame`, `applyMove`, `getPlayerView`, `getEventsSince`.
  - Shared helpers: `respond`, `auth`, `supabaseAdmin`, `supabaseAnon`, `redact`, `broadcast`.
  - Deno import map aliasing `@pablo/engine` to engine source.
  - Per-player event redaction for `peeked.cardId` privacy (`redact.ts` + unit tests).
  - Integration test gated behind `PABLO_RUN_INTEGRATION=1` (`tests/integration/supabase.test.ts`).
  - `.env.example` files for mobile and edge functions; `.gitignore` updated.
  - `bun run check` clean.
- ✅ **Phase 4.5 — UX overhaul + card clarity** (`phase-4-5-card-clarity` squash-merged to `main`, 2026-06-09).
  - Package A: poker-table `TableLayout`, `OpponentSeat`, `seatLayout` helper; opponent peek leak fixed.
  - Package B / B.1: `FlyingCardLayer`, flight planner, promote-first view, staged swap/discard choreography.
  - Package C: motion vocabulary (`feedback/motion.ts`, lift/shadow/stagger).
  - Package D: display-view latch, slot ghosts, proportional `PlayingCard` art, opponent `LinearTransition` reflow.
  - Pass 5: uniform flight scale, deck→drawn hero spring, `drawnBandH` aspect fix.
  - `.cursor/rules/debugging.mdc` — deterministic root-cause debugging loop.
  - Plans: `docs/plans/phase-4-5-*.md`; `bun run check` clean.
- ✅ **Phase 6 — Multiplayer wiring** (`phase-6-multiplayer` squash-merged to `main`, 2026-06-10).
  - `realClient` (Supabase JS + edge invoke + `GameTickPump` view/event sequencer); per-route mock vs real via `ClientProvider` + `?mode=online|offline`.
  - Lobby: create / join-by-code / room screen with live member list; host start; guest `currentGameId` discovery.
  - `getActiveSession` cold-launch reconnection; `returnToLobby` edge function; `rooms.current_game_id` migration; realtime publication on `rooms` + `room_members`.
  - Online move latency masking (`submitting` lock, `NetworkBanner`); non-host follow-the-host after round end.
  - Integration tests in `tests/integration/multiplayer.test.ts`; plan at `docs/plans/phase-6-multiplayer.md`; `bun run check` clean.

## In progress

(none — Phase 7 is next)

---

## Up next

### ✅ Phase 3 — Card UI prototype (de-risk Skia + Reanimated) — DONE, PR open

**Branch**: `phase-3-card-lab` · **Token budget**: $ (short foreground) · **Model**: claude-4.6-sonnet

**Goal**: Prove the visual stack delivers the quality we want on a real iPhone before we build the whole game UI on top of it.

**Must include**

- A dev-only screen at `apps/mobile/app/dev/card-lab.tsx`.
- A real `<PlayingCard>` component in `apps/mobile/src/components/cards/PlayingCard.tsx` rendered via Skia, respecting `CardTheme`.
- Tap to flip (Reanimated `rotateY` worklet with perspective).
- Pan-to-drag (Gesture Handler) that snaps back to origin on release.
- A theme switcher button toggling between 2 themes (use `defaultCardTheme` + one new variant).
- Verified on iOS simulator AND a real device.

**Out of scope**

- 🚫 Any game logic, any deck/discard, any layout beyond a single card.
- 🚫 Multi-card animations (deal, reveal sweep) — those come in Phase 5.
- 🚫 Permanent route — this is a dev-only screen, gated behind `__DEV__`.

**Definition of Done**

- Flip animation feels smooth (60 fps + on a real device).
- Drag returns to origin cleanly.
- Theme toggle re-skins the card without remounting.
- PR opened titled `phase 3: card lab prototype`.

---

### ✅ Phase 4 — Single-player vs bot (the playable milestone) — DONE (merged to `main`)

**Branch**: `phase-4-singleplayer` (merged) · **Token budget**: $$ · **Model**: claude-4.6-sonnet medium thinking

**Goal**: A fully playable Pablo game on-device against bot opponents. No multiplayer, no Supabase. Validates the new (Phase 2.5) rules feel right.

> ⚠ Updated after Phase 2.5. Older Phase 4 drafts that mention `draw_from_discard`, "final turns remaining", or multi-round `maxScore` are stale — see `docs/GAME_LOGIC.md` for the current rules and the section below for the new requirements.

**Must include**

- Expo Router with route groups: `(home)`, `(game)`, `dev/`.
- Home screen: "Play vs bots" button (1–3 bot opponents).
- Game screen: own hand grid (initial 2×2 but **grows with penalty cards and shrinks with successful matches** — Phase 2.5 widened `HandIndex` to `number`), opponent rows, deck + discard pile, action bar.
- **Peek-phase UX** (Phase 2.5): after the deal, before the first turn, prompt the local player to tap exactly `rules.initialPeekCount` cards in their hand. Bots auto-pick (e.g. always slots 2 and 3). Surface a "peeking…" indicator for opponents until everyone has chosen, then animate the `peek_phase_ended` transition.
- **Action bar must surface five turn options** (Phase 2.5):
  - **Draw** (then choose: swap into slot N / discard / match-drawn into slot N)
  - **Match hand** (pick two of your own slots — bot can suggest pairs whose ranks it remembers from peek_self / its choose_peek picks)
  - **Match discard** (pick one of your slots against the discard top)
  - **Call Pablo** (always available off-turn for opponents too — see next bullet)
- **Off-turn Pablo UI**: every opponent row should expose a "Pablo!" affordance whenever `legalMoves(state, opponent)` includes `call_pablo`. For bots, fold "call Pablo off-turn" into the heuristic. Once `pabloCalledBy !== null`, show a banner and let the current player finish their turn; the engine ends the round automatically when `advanceTurn` next reaches the caller.
- **Match-result animations**:
  - `match_succeeded`: discarded cards fly from hand slot(s) to the discard pile; remaining slots compact.
  - `match_failed { reason: 'wrong_rank' }`: shake the targeted slot(s); slide the drawn card (if any) + penalty card into the hand.
  - `match_failed { reason: 'min_hand_size' }`: same animation but with a different toast ("would drop below minimum hand size") so the rule is teachable.
  - `penalty_card_dealt`: face-down card slides into the recipient's hand.
- Zustand store wired to a `mockClient` (in `apps/mobile/src/supabase/mockClient.ts`).
- Mock client uses `@pablo/engine` for all logic and `legalMoves()` to drive bot heuristics. Recommended baseline heuristic:
  1. If any pair of own slots with **known** same-rank cards exists AND removing them respects `minHandSize` → `match_hand`.
  2. If a **known** own slot matches the discard top AND `minHandSize` permits → `match_discard`.
  3. Else `draw_from_deck`, then:
     - If drawn card matches a **known** own slot and `minHandSize` permits → `match_drawn`.
     - Else if drawn card is "low" (≤ 4) and a **known** "high" (≥ 9) own slot exists → `swap_drawn` into that slot.
     - Else `discard_drawn` (and use any activated power conservatively — peek own/opponent always; swap_blind only if it likely lowers your total).
  4. Rare random off-turn or on-turn `call_pablo` when estimated own hand value is low.
- Deal animation, discard animation, end-of-round reveal (flip every opponent's hand face-up; show `round_ended.winners` and per-player totals).

**Single-round only (v1)**

- One game = one round. "Play again" creates a fresh `newGame` with a new seed; no cumulative scoreboard, no best-of-N. Lowest hand wins, end of story.
- Multi-round / session orchestration may be reconsidered post-launch.

**Out of scope**

- 🚫 Any Supabase, any auth, any real networking.
- 🚫 i18n strings beyond English (but still go through `t()`).
- 🚫 Sound, haptics, advanced polish — Phase 7.
- 🚫 Online play UI (lobby, room codes) — Phase 6.

**Definition of Done**

- You can install on a real iPhone, play at least one full round against 2 bots (peek → turns → off-turn or on-turn Pablo → reveal), and the result screen shows the correct winners.
- All five turn options + peek phase are reachable from the UI.
- Hand-size growth/shrinkage animates without layout glitches.
- `bun --cwd=apps/mobile run typecheck` clean.
- PR opened titled `phase 4: single-player vs bot`.

---

### Phase 5 — Supabase backend (can run parallel with Phase 4)

**Branch**: `phase-5-supabase` · **Token budget**: $$ · **Model**: claude-4.6-sonnet medium thinking

**Goal**: Implement the full backend per `docs/SCHEMA.md`. Locally testable; not yet wired into the app.

> ⚠ Updated after Phase 2.5. Re-read `docs/SCHEMA.md` before starting — the engine type shape changed (no `roundNumber`/`finalTurnsRemaining`; new `pendingPower`/`reshuffleCount`; `status` includes `'peek_phase'`). The schema is stored as opaque `jsonb`, so no migrations are forced, but anything that pattern-matches on field names inside `state` needs updating.

**Must include**

- Migrations for `profiles`, `rooms`, `room_members`, `games`, `game_events` with RLS in the same migration.
- `get_player_view` SECURITY DEFINER function that delegates to `engine.computePlayerView` (don't re-implement projection logic in SQL).
- Edge functions: `joinRoom`, `leaveRoom`, `startGame`, `applyMove`. **No separate `callPablo` function** — `call_pablo` is just one of `Move`'s variants and goes through `applyMove` like every other move (Phase 2.5 simplification).
- `startGame` must leave the game in `status='peek_phase'`. Clients then issue one `choose_peek` per player via `applyMove` before the first turn fires.
- All edge functions import the engine via Deno-compatible imports; no rule logic duplicated.
- Integration tests against local Supabase (`supabase start` + script that exercises a full game).
- Integration test coverage must include: peek phase (each player calls `choose_peek`, status flips to `'playing'`), at least one `match_*` success and one `match_*` failure with penalty, one off-turn Pablo, and a deck-exhaustion reshuffle.

**Out of scope**

- 🚫 Modifying anything in `apps/mobile` — Phase 6 does the wiring.
- 🚫 Modifying the engine — use it as-is from Phase 2.5's output.
- 🚫 Hosted Supabase deployment — local-only for now.
- 🚫 Multi-round / best-of-N session tracking — see the Phase 4 multi-round decision; if we go with option B and want it server-side, that's a separate phase.

**Definition of Done**

- `supabase start && supabase functions serve` works on a clean machine (Docker assumed).
- Integration test plays a full game end-to-end through edge functions, exercising peek_phase → matches → off-turn Pablo → round_ended.
- `docs/SCHEMA.md` matches reality; any deviations documented.
- PR opened titled `phase 5: supabase schema + edge functions`.

---

### Phase 6 — Multiplayer wiring

**Branch**: `phase-6-multiplayer` · **Token budget**: $$$ · **Model**: claude-4.6-sonnet medium thinking + Opus 4.7 for tricky bits (race conditions, reconnection)

**Goal**: Swap the mobile app from `mockClient` to `realClient` (Supabase). Add lobby UI.

**Must include**

- `realClient.ts` implements `PabloClient` using `@supabase/supabase-js`.
- Anonymous sign-in on first launch.
- Lobby UI: create room, join by code, see members update via Realtime.
- Per-player view subscribed via `supabase.rpc('get_player_view')` + broadcast on `games` change.
- Reconnection handling: rejoining a room mid-game restores the local view (including `peek_phase` if peeks are still outstanding, and `pabloCalledBy` if an off-turn Pablo is in flight).
- Idempotency keys on every move.
- Animation triggers fan out from the new Phase 2.5 events: `peek_chosen`, `peek_phase_ended`, `match_succeeded`, `match_failed`, `penalty_card_dealt`, `swapped_blind`, `power_activated`, `deck_reshuffled`, `pablo_called`, `round_ended`.

**Out of scope**

- 🚫 Push notifications.
- 🚫 Hosted Supabase project — still local-only or a free dev project.

**Definition of Done**

- Two real iPhones can play a full match against each other via Supabase.
- Killing the app mid-game and reopening it restores state.
- PR opened titled `phase 6: multiplayer wiring`.

---

### Phase 7 — Polish + launch prep

**Branch**: `phase-7-polish` · **Token budget**: $ · **Model**: composer-2-fast for grunt, sonnet for design choices

**Goal**: Ship-ready iOS app.

**Must include**

- Sounds (deal, flip, swap, Pablo call) via `expo-av`.
- Haptics on key actions (`expo-haptics`).
- Zellige-inspired card back theme + matching app theme.
- App icon + splash screen.
- All English strings still hit `t()` (Arabic/French to come post-launch).
- EAS Build config + TestFlight submission walkthrough.

**Out of scope**

- 🚫 Android polish — that's a separate pass.
- 🚫 New game features.

**Definition of Done**

- App passes basic store-readiness checks (icon, splash, no debug screens visible).
- TestFlight build uploaded.

---

## Decisions made

| Date       | Decision                                                                                                                      | Why                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-17 | Every phase / non-trivial feature has a written plan in `docs/plans/<branch-slug>.md` before any code is written              | Forces requirement → file/function mapping, test plan, and trade-offs to surface upfront. Plan ships in the same PR. Filename matches the branch slug for 1:1 lookup.                                                                                                                                                                                                                       |
| 2026-05-17 | Drop Bugbot; the producing agent self-reviews every PR before squash-merging                                                  | Lighter loop, less external infra; self-review checklist (re-read every changed file, run `bun run check`, verify PLAN.md updated) replaces it. User says "merge" explicitly to authorise.                                                                                                                                                                                                  |
| 2026-05-17 | Prettier + ESLint 9 (flat config) at workspace root; `bun run check` is the single pre-PR gate                                | Mechanically enforces style + engine purity (no `Math.random`, no `Date.now`, no banned imports); reviews can focus on logic, not whitespace                                                                                                                                                                                                                                                |
| 2026-05-17 | `applyMove` uses a `switch` with `unreachable(_x: never)` default                                                             | Compile-time exhaustiveness check — adding a new `Move` variant without handling it fails type checking                                                                                                                                                                                                                                                                                     |
| 2026-05-17 | Round-end inside `applyMove` writes `scoreRound`'s `perPlayerRound` into `state.scores`                                       | Makes `computePlayerView` reflect the round result; otherwise scores stayed at 0 in the projection after a round ended                                                                                                                                                                                                                                                                      |
| 2026-05-17 | PRNG: cyrb128 string hash → sfc32 128-bit generator                                                                           | Pure TS, no deps, deterministic across V8/Hermes/Deno, period ≈ 2^128; cryptographic strength not needed since seed is server-controlled                                                                                                                                                                                                                                                    |
| 2026-05-17 | `knownCards` lives inside `GameState`, not a sidecar                                                                          | `GameState` is the persisted unit; `computePlayerView` takes only `state`; threading a sidecar would touch every function with no upside; knowledge is a pure function of moves applied                                                                                                                                                                                                     |
| 2026-05-17 | ~~Pablo caller tied for lowest → caller and tied non-callers all score 0~~ — **superseded by Phase 2.5**                      | Phase 2.5 removed the Pablo penalty / caller-special-case entirely; `scoreRound` returns all players tied for lowest as winners, no caller branch.                                                                                                                                                                                                                                          |
| 2026-05-17 | ~~`draw_from_discard` with empty pile → `discard_empty` error~~ — **superseded by Phase 2.5**                                 | `draw_from_discard` was removed. `discard_empty` lives on, now used only by `match_discard` when the discard pile is empty.                                                                                                                                                                                                                                                                 |
| 2026-05-17 | Engine has no auto-pass or disconnect move                                                                                    | Disconnect handling belongs to the edge function (Phase 5); engine only knows about concrete move types                                                                                                                                                                                                                                                                                     |
| 2026-05-17 | `reshuffleCount` on `GameState` enables deterministic reshuffle sub-seeds                                                     | Sub-seed = `${seed}:rs${reshuffleCount}`; increments each reshuffle; replays reproduce the exact deck order                                                                                                                                                                                                                                                                                 |
| 2026-05-17 | `pendingPower` on `GameState` models the between-discard-and-resolution sub-state                                             | Allows applyMove to be a pure state machine; `legalMoves` reads it to restrict moves while a power is pending                                                                                                                                                                                                                                                                               |
| ---        | ---                                                                                                                           | ---                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-05-17 | Bun for the workspace + tests                                                                                                 | One tool replaces npm + ts-node + Jest; first-class Expo support; fast                                                                                                                                                                                                                                                                                                                      |
| 2026-05-17 | Engine in TypeScript, not Python/Rust                                                                                         | Same engine runs in client (optimistic UI) and Supabase Edge Functions (Deno); shared types end-to-end; no extra infra                                                                                                                                                                                                                                                                      |
| 2026-05-17 | Supabase Realtime, not custom WebSocket server                                                                                | Pablo is turn-based; Realtime fits perfectly; one fewer thing to host                                                                                                                                                                                                                                                                                                                       |
| 2026-05-17 | Server-authoritative state with per-player projections                                                                        | Cheat-proof by construction; reconnection is trivial (DB is source of truth)                                                                                                                                                                                                                                                                                                                |
| 2026-05-17 | Anonymous auth by default                                                                                                     | Higher conversion than gating first game behind sign-up                                                                                                                                                                                                                                                                                                                                     |
| 2026-05-17 | English-only for v1, but `t()` everywhere                                                                                     | Cheap to add now, painful to retrofit                                                                                                                                                                                                                                                                                                                                                       |
| 2026-05-17 | Light monorepo (`apps/`, `packages/`, `supabase/`)                                                                            | Engine package boundary mechanically enforces "engine stays pure"                                                                                                                                                                                                                                                                                                                           |
| 2026-05-17 | Zellige aesthetic as design seed                                                                                              | User preference; keep components themeable so we can lean in during Phase 7                                                                                                                                                                                                                                                                                                                 |
| 2026-05-17 | Default powers: 7=peek_self, 8=peek_opponent, 9=swap_blind                                                                    | User's house rules (Tunisian variant); 10/J/Q have no power                                                                                                                                                                                                                                                                                                                                 |
| 2026-05-17 | Default king value = 10, except K♥ = 0                                                                                        | User's house rules; expressed via `GameRules.cardValueOverrides` so other variants are config-only                                                                                                                                                                                                                                                                                          |
| 2026-05-17 | `GameRules` carries `powers` map + `cardValueOverrides`                                                                       | Full per-game customizability without code changes                                                                                                                                                                                                                                                                                                                                          |
| 2026-05-17 | Card stack: Skia + Reanimated 4 + Gesture Handler                                                                             | Themable card surfaces, animatable shaders, hardware-accelerated. No Moti — Reanimated worklets give us full control.                                                                                                                                                                                                                                                                       |
| 2026-05-17 | `CardTheme` type + `cardThemes` registry from day one                                                                         | Adding a future theme = appending one entry, never touching components                                                                                                                                                                                                                                                                                                                      |
| 2026-05-17 | Single-player vs bots BEFORE multiplayer (phase reordering)                                                                   | Validate rules feel + UI quality with real play before committing to multiplayer infra                                                                                                                                                                                                                                                                                                      |
| 2026-05-17 | Insert Card Lab phase (Phase 3)                                                                                               | De-risk the visual stack on real hardware before building the full game UI on top of it                                                                                                                                                                                                                                                                                                     |
| 2026-05-17 | `PabloClient` interface with mock + real implementations                                                                      | Lets mobile (Phase 4) and Supabase (Phase 5) work proceed in parallel; Phase 6 swaps one import                                                                                                                                                                                                                                                                                             |
| 2026-05-17 | ~~`MatchState` separated from `GameState` in engine~~ — **superseded by Phase 2.5**                                           | Phase 2.5 deleted `MatchState` and `match.ts`/`match.test.ts`. The engine models a single round; multi-round / best-of-N session bookkeeping lives outside the engine (mock client for Phase 4; possibly a `sessions` table later).                                                                                                                                                         |
| 2026-05-17 | Each phase = its own branch + PR (no direct commits to main)                                                                  | Required to safely parallelize background agents; Bugbot reviews each PR                                                                                                                                                                                                                                                                                                                    |
| 2026-05-17 | iOS-first; web supported as a side-effect, not a polish target                                                                | Don't break web, don't optimize for it                                                                                                                                                                                                                                                                                                                                                      |
| 2026-05-17 | Add Expo Router in Phase 3 (not Phase 4)                                                                                      | PLAN.md prescribes the route at `apps/mobile/app/dev/card-lab.tsx`; Phase 4 needs it anyway; adding it now avoids a double-migration                                                                                                                                                                                                                                                        |
| 2026-05-17 | Design tokens live in `apps/mobile/src/design/tokens.ts`, not a shared `packages/ui`                                          | One consumer today; hoisting to a package adds workspace complexity for zero gain; mechanical import-path migration when/if a web app arrives                                                                                                                                                                                                                                               |
| 2026-05-17 | Flip uses `withTiming` (not `withSpring`) for `rotateY`                                                                       | Springs can overshoot past 90° and re-trigger the face-swap crossover with the wrong face dominant; timing gives a clean arc with no flicker at the half-turn                                                                                                                                                                                                                               |
| 2026-05-17 | `Gesture.Race(pan, tap)` — tap wins under 250 ms, pan wins above drag threshold                                               | Prevents quick taps from accidentally starting a drag, and drags from firing a tap                                                                                                                                                                                                                                                                                                          |
| 2026-05-17 | Skia Canvas for back + front surface background; RN Text overlay for rank/suit labels                                         | Avoids font-file loading complexity in the prototype; Skia still owns the card surface (background, border, decorative pattern) — label rendering via Skia Text is a Phase 7 polish item                                                                                                                                                                                                    |
| 2026-05-17 | Second theme is `midnight` (dark surface, gold accents)                                                                       | Maximum visual delta vs `classic-light`; exercises every palette slot without committing to the eventual zellige motif (Phase 7)                                                                                                                                                                                                                                                            |
| 2026-05-17 | In-app Variants grid instead of Storybook                                                                                     | Storybook-RN is a substantial dep + separate runner; the grid in the lab screen covers 16 permutations (4 cards × 2 themes × face-up/down) at near-zero cost                                                                                                                                                                                                                                |
| 2026-05-17 | Minimal `t()` wrapper in Phase 3 (no `expo-localization`)                                                                     | AGENTS.md hard rule #7 is unconditional even for dev screens; the 15-line wrapper shares the same call signature as the full Phase 4 implementation, so no component changes are needed                                                                                                                                                                                                     |
| 2026-05-17 | Phase 2.5 — `peek_phase` status instead of auto-peeking two bottom cards in `newGame`                                         | Gives the UI a state to animate ("peek now") and aligns engine semantics with the real-world deal-and-peek flow; `newGame` starts with empty `knownCards`                                                                                                                                                                                                                                   |
| 2026-05-17 | Phase 2.5 — `finaliseRound` extracted to `internal/finalise.ts`                                                               | `penalty.ts` needs to call it; putting it in `applyMove.ts` would create a circular import; the dedicated internal module breaks the cycle cleanly                                                                                                                                                                                                                                          |
| 2026-05-17 | Phase 2.5 — Off-turn Pablo deferred to `advanceTurn`                                                                          | Simplest model; `call_pablo` off-turn only sets `pabloCalledBy`; `advanceTurn` detects "next player = caller" and calls `finaliseRound`; no separate flag needed                                                                                                                                                                                                                            |
| 2026-05-17 | Phase 2.5 — `match.ts` / `match.test.ts` deleted; multi-round logic removed from engine                                       | Rules pivot: the engine models a single round; match/session bookkeeping is the edge function's responsibility                                                                                                                                                                                                                                                                              |
| 2026-05-17 | Phase 2.5 — `wrong_rank` clears targeted slot knowledge; `min_hand_size` preserves it                                         | Player demonstrates a memory error on `wrong_rank`; on `min_hand_size` the rank memory was correct so it's preserved                                                                                                                                                                                                                                                                        |
| 2026-05-17 | Phase 2.5 — penalty cards are face-down to their owner (no `knownCards` entry written)                                        | Game rule: penalty is opaque; owner receives it without learning the rank                                                                                                                                                                                                                                                                                                                   |
| 2026-05-18 | Phase 2.5 self-review — rewrote `docs/GAME_LOGIC.md` to match the implemented engine                                          | The previous doc still described Phase 2 rules (auto-peek, `draw_from_discard`, multi-round matches, Pablo penalty). AGENTS.md hard rule #6 makes the doc canonical; engine and doc had drifted out of sync.                                                                                                                                                                                |
| 2026-05-18 | Phase 2.5 self-review — `peek_chosen` event is `{ type, playerId }` only; no indices                                          | Indices are private to the picker. Test now asserts the event has no other fields so we can't accidentally regress and leak picks to spectators.                                                                                                                                                                                                                                            |
| 2026-05-18 | Phase 4 absorbs the new five-turn-option UI, peek-phase UX, and off-turn Pablo affordance                                     | These all surface engine state that Phase 2.5 added; no engine work is required for them, just UI wiring in Phase 4. Plan section rewritten in this commit to reflect the new requirements.                                                                                                                                                                                                 |
| 2026-05-18 | Phase 5 collapses `callPablo` edge function into `applyMove`                                                                  | Phase 2.5 made `call_pablo` a plain `Move` variant. A dedicated endpoint adds no value — the move is uniformly validated by `applyMove`. SCHEMA.md updated to remove the row.                                                                                                                                                                                                               |
| 2026-05-18 | v1 ships single-round only (one game = one round); no multi-round / best-of-N mode                                            | Engine is single-round after Phase 2.5; multi-round bookkeeping (mock-client or `sessions` table) is meaningful work that doesn't validate the core gameplay loop. Reconsider post-launch.                                                                                                                                                                                                  |
| 2026-05-18 | Phase 4 — `addBotsToRoom` on `MockClient` extension type only, not on `PabloClient`                                           | Phase 6 rooms are joined by human players; bots are a single-player-mode concept. The asymmetry is explicit; `createRealClient()` doesn't implement it.                                                                                                                                                                                                                                     |
| 2026-05-18 | Phase 4 — `subscribeGameEvents` added to `PabloClient`                                                                        | Events drive animation; the mock fires them in-process; the real client will broadcast via a Supabase Realtime channel. Adding it now means Phase 6 only needs to fill in the broadcast plumbing.                                                                                                                                                                                           |
| 2026-05-18 | Phase 4 — Bot heuristic reads `PlayerView` only, not `GameState`                                                              | Honesty contract: bots must not cheat. The `bot.ts` module only receives a `PlayerView` from the bot scheduler; `GameState` is never passed in. Lint and types enforce the boundary.                                                                                                                                                                                                        |
| 2026-05-18 | Phase 4 — Animation drain is a 300 ms setTimeout per batch (Phase 7 gets Reanimated choreography)                             | Getting the game playable is higher priority than polished animations at this stage. The async animator contract means the Phase 7 upgrade is a drop-in handler swap. **Superseded by Phase 4.5 Package B** (Reanimated flights + promote-first view).                                                                                                                                      |
| 2026-05-18 | Phase 4.5 Package B — promote-first view + snapshotted anchor flights                                                         | `receiveView` updates `view` immediately; `planFlights` runs synchronously in `enqueueEvents` using `measureInWindow` rects captured at plan time. `selectIsAnimating` gates input. See `docs/plans/phase-4-5-flying-cards.md`.                                                                                                                                                             |
| 2026-05-18 | Phase 4.5 Package B.1 — staged swap/discard choreography + delayed toasts                                                     | `FlightPlan` adds `cues` / `toasts` / `totalDurationMs`; opponent swaps get actor focus, slot spotlight, readable discard leg, discard pulse, and table dim. Input gating uses `animQueue.pending` (batch hold), not in-flight card count. See `docs/plans/phase-4-5-flying-cards.md` § Package B.1.                                                                                        |
| 2026-05-18 | Phase 4.5 Package C — animation polish (motion vocabulary)                                                                    | `tokens.game.motion` + `feedback/motion.ts`; springs on overlays/cues; flight lift/shadow/flip; `applyFlightStagger` + inter-batch `breath`. See `docs/plans/phase-4-5-animation-polish.md`.                                                                                                                                                                                                |
| 2026-05-18 | Phase 4 — Bot Pablo threshold: 8 pts estimated total for off-turn Pablo; 5 pts + 1/30 chance for on-turn Pablo                | Calibrated for a 4-card hand with catalog-average prior (~6.5/card). Ensures bots call Pablo occasionally without being trivially predictable. Revisit with playtesting.                                                                                                                                                                                                                    |
| 2026-05-18 | Phase 4 — Per-game Zustand store via context provider, not a global singleton                                                 | A singleton would retain state between games; context mounts/unmounts with the route so teardown is free.                                                                                                                                                                                                                                                                                   |
| 2026-05-18 | Phase 4 — Bot names: Cabo Cassette, Cambia, Pablito                                                                           | Thematic names that fit the aesthetic without being generic ("Bot 1"). Pablito is a deliberate reference to the game name.                                                                                                                                                                                                                                                                  |
| 2026-05-18 | Phase 4 squash-merge to `main`                                                                                                | User-authorised merge; linear history via squash; `phase-4-singleplayer` branch can be deleted on remote after push.                                                                                                                                                                                                                                                                        |
| 2026-05-18 | `ClientResult.error` is `ClientTransportError \| MoveError` (`ClientErrorCode`)                                               | Phase 5 edge functions return the same discriminant set the UI translates; free-form strings are ruled out at compile time.                                                                                                                                                                                                                                                                 |
| 2026-05-18 | Phase 5 plan — realtime view stream is a **broadcast** on `game:{gameId}`, not `postgres_changes` on `games`                  | `games` is service-role deny-all; `postgres_changes` respects RLS and would deliver nothing. Broadcast bypasses RLS for the publisher, payload is just the version — no leak.                                                                                                                                                                                                               |
| 2026-05-18 | Phase 5 plan — `game_events` is **service-role deny-all**; clients fetch via `getEventsSince` with per-`auth.uid()` redaction | The `peeked` event carries a private `cardId`. Row-level read would let any room member `SELECT` other players' peeks. Treating events the same as `games.state` closes the leak.                                                                                                                                                                                                           |
| 2026-05-18 | Phase 5 plan — `get_player_view` is an **edge function**, not a SQL function                                                  | The projection logic lives in TypeScript (`packages/engine/src/playerView.ts`). Re-implementing in PL/pgSQL would violate the engine-is-the-only-rule-source hard rule.                                                                                                                                                                                                                     |
| 2026-05-18 | Phase 5 plan — engine imported via Deno `imports` in `supabase/functions/deno.json`                                           | Cheapest option; no build step; the engine is pure TS and Deno reads `.ts` sources directly; matches the Bun-side specifier `@pablo/engine`.                                                                                                                                                                                                                                                |
| 2026-05-18 | Phase 5 plan — idempotency primary key on a new **`game_moves` table** (`UNIQUE (game_id, idempotency_key)`)                  | Multiple events per move would make "which event row carries the key" ambiguous on `game_events`. A 1:1 moves table keeps idempotency clean and gives us free move-log / replay later.                                                                                                                                                                                                      |
| 2026-05-18 | Phase 5 plan — drop `rooms.status = 'finished'`; rooms are `'waiting' \| 'playing'` only                                      | Phase 2.5's single-round games loop waiting → playing → waiting; `'finished'` was meaningless. Dead rooms get hard-deleted by `leaveRoom`-last-member.                                                                                                                                                                                                                                      |
| 2026-05-18 | Phase 5 plan — `auth.users` insert trigger auto-provisions `profiles`                                                         | One fewer round-trip on sign-in; the profile row is always there, no client-side defensive code needed.                                                                                                                                                                                                                                                                                     |
| 2026-05-18 | Phase 5 plan — `startGame` server-mints the seed via `crypto.randomUUID()`                                                    | Clients cannot influence engine randomness; cheat-proofs deck order even against modified clients.                                                                                                                                                                                                                                                                                          |
| 2026-05-18 | Phase 5 plan — bots are NOT modelled as `room_members`; mock client keeps owning single-player vs bots                        | Bots are a single-player concept; an online-bot scheduler is meaningful work that doesn't validate the multiplayer happy path. Revisit in/after Phase 6.                                                                                                                                                                                                                                    |
| 2026-05-18 | Phase 5 plan — integration tests gated behind `PABLO_RUN_INTEGRATION=1`                                                       | End-to-end Docker-backed test is ~30s on a warm laptop. Default `bun run check` stays fast for everyday iteration; CI / pre-merge runs it explicitly.                                                                                                                                                                                                                                       |
| 2026-05-18 | Phase 5 impl — `leaveRoom` promotes lowest-seat remaining member to host when host departs                                    | Cheap and unsurprising; prevents dead rooms with a missing host; aligns with §10 Q3 default decision.                                                                                                                                                                                                                                                                                       |
| 2026-05-18 | Phase 5 impl — Realtime broadcast via HTTP REST (`/realtime/v1/api/broadcast`), not WebSocket                                 | Edge functions don't maintain persistent WebSocket; REST API is fire-and-forget, lower latency, no state leaks across requests.                                                                                                                                                                                                                                                             |
| 2026-05-18 | Phase 5 impl — `tests/` added as Bun workspace; `redact.test.ts` at workspace root `tests/`                                   | Allows bun to resolve `@pablo/engine` and the relative `redact.ts` import without a separate Deno test runner or a build step.                                                                                                                                                                                                                                                              |
| 2026-05-18 | Phase 5 impl — engine bundled to `_shared/engine.bundle.js` for Deno edge runtime                                             | The Supabase edge runtime (Deno v2) does not fully support import map `scopes` for extensionless TypeScript imports inside workspace packages. Bundling with `bun build --format esm` produces a self-contained JS module Deno loads cleanly; bundle committed in repo; `engine.bundle.js` excluded from Prettier via `.prettierignore`.                                                    |
| 2026-05-18 | Phase 5 impl — idempotency check runs BEFORE version check in `applyMove`                                                     | A client resending a previously-successful move with a now-stale `expectedVersion` must get the cached result, not `version_mismatch`. Swapping order ensures a successful key always returns its committed version regardless of re-send timing.                                                                                                                                           |
| 2026-05-18 | Phase 5 impl — integration test verifies `peek_chosen` events, not `peeked` events                                            | `choose_peek` emits `peek_chosen { type, playerId }` (public, no card info). `peeked { cardId }` events are emitted by `use_peek_self` / `use_peek_opponent` power moves (rank 7/8). Redaction logic for `peeked` is covered by the unit test `tests/redact.test.ts`; the integration test verifies the API contract for events instead.                                                    |
| 2026-05-18 | Attempted Expo SDK 54 → 55 then rolled back to 54                                                                             | Expo Go on the iOS App Store doesn't yet ship the SDK-55 runtime (Apple-review lag after a fresh SDK GA), so on-device testing via Expo Go was blocked. Reverting keeps development unblocked; the diff is mechanical to re-apply once the App Store version of Expo Go covers SDK 55. ESLint 10 / Context7 / `types: ["bun"]` / Reanimated-doc-drift wins from the same session were kept. |
| 2026-05-18 | Bump ESLint 9 → 10, eslint-config-prettier 9 → 10, `@eslint/js` 9 → 10                                                        | Flat-config-only (which we already use); zero breakage besides a single new `no-useless-assignment` violation in a test file. Buys us another year on the supported-version curve.                                                                                                                                                                                                          |
| 2026-05-18 | Tried TypeScript 6.0; rolled back to ~5.9 because Expo SDK 55's `expo install --fix` actively downgrades it                   | Expo CLI declares TS 6 incompatible (pins to `~5.9.2`). Living with the downgrade noise on every install is worse than waiting for Expo SDK 56. Revisit then.                                                                                                                                                                                                                               |
| 2026-05-18 | Added `"types": ["bun"]` to `apps/mobile/tsconfig.json` and `@types/bun` to `apps/mobile/package.json` devDeps                | Expo's tsconfig.base relies on auto-discovery of ambient `@types/*`, which the TS-6 upgrade attempt exposed as fragile (bun:test stopped resolving). Making the dependency explicit is portable across TS versions.                                                                                                                                                                         |
| 2026-05-18 | Context7 MCP server wired in `.cursor/mcp.json` (project-level)                                                               | Gives every agent in the repo on-demand versioned docs for the libraries we use, so version-specific code stays accurate without manual indexing per machine. Free tier — add a `CONTEXT7_API_KEY` header to bypass rate limits when needed.                                                                                                                                                |
| 2026-05-18 | Phase 4.5 Package D — card clarity (`phase-4-5-card-clarity`)                                                                 | Flying cards render at max(source, destination) size and scale down (sharp Skia); proportional `cardSizes` helpers; `displayView` latch for hand grids + DrawFlow timing only (deck/discard stay live on `view`); slot ghost outlines + `selectSourceAnchorKeys`; opponent `LinearTransition` on reflow. See `docs/plans/phase-4-5-card-clarity.md`.                                        |
| 2026-06-09 | Phase 4.5 Package D Pass 5 — deck↔drawn shared transition + uniform flight scale                                              | Flights animate one uniform `scale` (no aspect skew); removed orphaned `discardReadableScale`; `DrawnCardHero` springs in from deck size via `springFor('settle')`; `drawnBandH` matches deck card height; `flightMotionIntent` `toAnchor==='drawn'` ⇒ `carry`. See `docs/plans/phase-4-5-card-clarity.md` § Pass 5.                                                                        |
| 2026-06-09 | `.cursor/rules/debugging.mdc` — deterministic root-cause debugging methodology                                                | Scoped to `packages/engine/**`, `supabase/functions/**`, `**/*.test.ts`. Collapse bugs into failing pure engine tests before changing code; Pablo-specific gotcha checklist (stale `engine.bundle.js`, engine-throw = impossible bug, hidden-card leaks, version races, optimistic/authoritative divergence).                                                                               |
| 2026-06-09 | Phase 4.5 squash-merged to `main` on `phase-4-5-card-clarity`                                                                 | User-authorised merge after on-device pass of deck→drawn transition. Linear history via squash; branch can be deleted. Phase 6 (multiplayer wiring) is next.                                                                                                                                                                                                                                |

## Proposed decisions (need user input)

_(none right now)_

## Open questions

- Final Pablo special-card scheme is locked, but should the K♥ rule apply only to the King OF Hearts, or also the Heart suit in general? Currently: only K♥. Validate with a real game.
- Bot difficulty levels — do we want Easy/Medium/Hard in Phase 4, or single difficulty for v1?
