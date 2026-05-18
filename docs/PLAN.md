# PLAN — Pablo

Living plan. Agents MUST update this after meaningful changes — move items between sections, add to "Decisions Made".

## Current phase

**Phase 2 — Engine** ✅ complete. Next up: Phase 3 (Card Lab) or Phase 5 (Supabase) in parallel.

---

## Workflow

Read `AGENTS.md` § "Branch / PR workflow" before starting any phase. TL;DR:

- Each phase has its own branch (`phase-2-engine`, `phase-3-card-lab`, etc.).
- Agents push to their phase branch and stop — they do not merge unless the user explicitly says "merge".
- The agent self-reviews its own diff before squash-merging (no Bugbot).
- Last step before merging: update this file (move items between Done / In Progress / Up Next, append to Decisions Made).

---

## Done

- ✅ Bun workspace structure (`apps/`, `packages/`, `supabase/`, `docs/`).
- ✅ `AGENTS.md`, `docs/PLAN.md`, `docs/GAME_LOGIC.md`, `docs/SCHEMA.md`.
- ✅ `.cursor/rules/` × 6 (engine, supabase, ui, i18n, design, cards) scoped via globs.
- ✅ Git initialized, pushed to `git@github.com:ikalmikov16/Pablo.git`.
- ✅ Bun + Supabase CLI installed.
- ✅ Engine package: types (Card, Move, GameEvent, GameState, MatchState, GameRules, SpecialPower, CardValueOverride, PlayerView, RoundScore), stub implementations, 6 failing contract tests.
- ✅ Mobile app: Expo SDK 54, RN 0.81, React 19, TS strict; deps include `react-native-reanimated@4`, `react-native-gesture-handler@2.28`, `@shopify/react-native-skia@2.2`.
- ✅ Card theming contract (`apps/mobile/src/design/cardTheme.ts`).
- ✅ `PabloClient` interface + mock/real client stubs (`apps/mobile/src/supabase/`).
- ✅ `.cursor/hooks/typecheck.sh` verified — fires after edits, returns errors as `additional_context`.
- ✅ **Phase 2 — Engine implementation** (`phase-2-engine` branch, PR open).
  - Seeded PRNG: cyrb128 + sfc32 (pure TS, no `Math.random`, deterministic across V8/Hermes/Deno).
  - All public functions implemented and pure: `newGame`, `applyMove`, `computePlayerView`, `scoreRound`, `legalMoves`, `newMatch`, `startNextRound`, `endRound`.
  - Per-player knowledge (`knownCards`) lives inside `GameState`.
  - `pendingPower` field tracks power-pending sub-turns.
  - `reshuffleCount` enables deterministic reshuffle sub-seeds.
  - 111 tests, 0 failures, 98.99% line coverage.
  - `bun --cwd packages/engine run typecheck` — 0 errors.
  - Implementation plan saved to `docs/PHASE2_PLAN.md`.

## In progress

- (none)

---

## Up next

### Phase 3 — Card UI prototype (de-risk Skia + Reanimated)

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

### Phase 4 — Single-player vs bot (the playable milestone)

**Branch**: `phase-4-singleplayer` · **Token budget**: $$ · **Model**: claude-4.6-sonnet medium thinking

**Goal**: A fully playable Pablo game on-device against bot opponents. No multiplayer, no Supabase. Validates the rules feel right.

**Must include**

- Expo Router with route groups: `(home)`, `(game)`, `dev/`.
- Home screen: "Play vs bots" button (1–3 bot opponents).
- Game screen: own hand grid (2×2), opponent rows, deck + discard pile, action bar (draw deck / draw discard / call Pablo).
- Zustand store wired to a `mockClient` (in `apps/mobile/src/supabase/mockClient.ts`).
- Mock client uses `@pablo/engine` for all logic and `legalMoves()` to drive simple bot heuristics ("if I can swap for a lower card, do it; else discard drawn; rare random Pablo call").
- Deal animation, discard animation, basic reveal at end of round.
- Multi-round match flow to `maxScore`; cumulative score display.

**Out of scope**

- 🚫 Any Supabase, any auth, any real networking.
- 🚫 i18n strings beyond English (but still go through `t()`).
- 🚫 Sound, haptics, advanced polish — Phase 7.
- 🚫 Online play UI (lobby, room codes) — Phase 6.

**Definition of Done**

- You can install on a real iPhone, play a full match against 2 bots, and the game ends cleanly with a winner.
- `bun --cwd apps/mobile run typecheck` clean.
- PR opened titled `phase 4: single-player vs bot`.

---

### Phase 5 — Supabase backend (can run parallel with Phase 4)

**Branch**: `phase-5-supabase` · **Token budget**: $$ · **Model**: claude-4.6-sonnet medium thinking

**Goal**: Implement the full backend per `docs/SCHEMA.md`. Locally testable; not yet wired into the app.

**Must include**

- Migrations for `profiles`, `rooms`, `room_members`, `games`, `game_events` with RLS in the same migration.
- `get_player_view` SECURITY DEFINER function.
- Edge functions: `joinRoom`, `leaveRoom`, `startGame`, `applyMove`, `callPablo`.
- All edge functions import the engine via Deno-compatible imports; no rule logic duplicated.
- Integration tests against local Supabase (`supabase start` + script that exercises a full game).

**Out of scope**

- 🚫 Modifying anything in `apps/mobile` — Phase 6 does the wiring.
- 🚫 Modifying the engine — use it as-is from Phase 2's output.
- 🚫 Hosted Supabase deployment — local-only for now.

**Definition of Done**

- `supabase start && supabase functions serve` works on a clean machine (Docker assumed).
- Integration test plays a full 2-player game end-to-end via edge functions.
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
- Reconnection handling: rejoining a room mid-game restores the local view.
- Idempotency keys on every move.

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

| Date       | Decision                                                                                       | Why                                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-05-17 | Drop Bugbot; the producing agent self-reviews every PR before squash-merging                   | Lighter loop, less external infra; self-review checklist (re-read every changed file, run `bun run check`, verify PLAN.md updated) replaces it. User says "merge" explicitly to authorise. |
| 2026-05-17 | Prettier + ESLint 9 (flat config) at workspace root; `bun run check` is the single pre-PR gate | Mechanically enforces style + engine purity (no `Math.random`, no `Date.now`, no banned imports); reviews can focus on logic, not whitespace                                               |
| 2026-05-17 | `applyMove` uses a `switch` with `unreachable(_x: never)` default                              | Compile-time exhaustiveness check — adding a new `Move` variant without handling it fails type checking                                                                                    |
| 2026-05-17 | Round-end inside `applyMove` writes `scoreRound`'s `perPlayerRound` into `state.scores`        | Makes `computePlayerView` reflect the round result; otherwise scores stayed at 0 in the projection after a round ended                                                                     |
| 2026-05-17 | PRNG: cyrb128 string hash → sfc32 128-bit generator                                            | Pure TS, no deps, deterministic across V8/Hermes/Deno, period ≈ 2^128; cryptographic strength not needed since seed is server-controlled                                                   |
| 2026-05-17 | `knownCards` lives inside `GameState`, not a sidecar                                           | `GameState` is the persisted unit; `computePlayerView` takes only `state`; threading a sidecar would touch every function with no upside; knowledge is a pure function of moves applied    |
| 2026-05-17 | Pablo caller tied for lowest → caller and tied non-callers all score 0                         | Extends the "tie = 0" rule symmetrically; caller-in-tie should not be penalised                                                                                                            |
| 2026-05-17 | `draw_from_discard` with empty pile → `discard_empty` error                                    | Only possible in an invalid state; engine returns the error cleanly                                                                                                                        |
| 2026-05-17 | Engine has no auto-pass or disconnect move                                                     | Disconnect handling belongs to the edge function (Phase 5); engine only knows about concrete move types                                                                                    |
| 2026-05-17 | `reshuffleCount` on `GameState` enables deterministic reshuffle sub-seeds                      | Sub-seed = `${seed}:rs${reshuffleCount}`; increments each reshuffle; replays reproduce the exact deck order                                                                                |
| 2026-05-17 | `pendingPower` on `GameState` models the between-discard-and-resolution sub-state              | Allows applyMove to be a pure state machine; `legalMoves` reads it to restrict moves while a power is pending                                                                              |
| ---        | ---                                                                                            | ---                                                                                                                                                                                        |
| 2026-05-17 | Bun for the workspace + tests                                                                  | One tool replaces npm + ts-node + Jest; first-class Expo support; fast                                                                                                                     |
| 2026-05-17 | Engine in TypeScript, not Python/Rust                                                          | Same engine runs in client (optimistic UI) and Supabase Edge Functions (Deno); shared types end-to-end; no extra infra                                                                     |
| 2026-05-17 | Supabase Realtime, not custom WebSocket server                                                 | Pablo is turn-based; Realtime fits perfectly; one fewer thing to host                                                                                                                      |
| 2026-05-17 | Server-authoritative state with per-player projections                                         | Cheat-proof by construction; reconnection is trivial (DB is source of truth)                                                                                                               |
| 2026-05-17 | Anonymous auth by default                                                                      | Higher conversion than gating first game behind sign-up                                                                                                                                    |
| 2026-05-17 | English-only for v1, but `t()` everywhere                                                      | Cheap to add now, painful to retrofit                                                                                                                                                      |
| 2026-05-17 | Light monorepo (`apps/`, `packages/`, `supabase/`)                                             | Engine package boundary mechanically enforces "engine stays pure"                                                                                                                          |
| 2026-05-17 | Zellige aesthetic as design seed                                                               | User preference; keep components themeable so we can lean in during Phase 7                                                                                                                |
| 2026-05-17 | Default powers: 7=peek_self, 8=peek_opponent, 9=swap_blind                                     | User's house rules (Tunisian variant); 10/J/Q have no power                                                                                                                                |
| 2026-05-17 | Default king value = 10, except K♥ = 0                                                         | User's house rules; expressed via `GameRules.cardValueOverrides` so other variants are config-only                                                                                         |
| 2026-05-17 | `GameRules` carries `powers` map + `cardValueOverrides`                                        | Full per-game customizability without code changes                                                                                                                                         |
| 2026-05-17 | Card stack: Skia + Reanimated 4 + Gesture Handler                                              | Themable card surfaces, animatable shaders, hardware-accelerated. No Moti — Reanimated worklets give us full control.                                                                      |
| 2026-05-17 | `CardTheme` type + `cardThemes` registry from day one                                          | Adding a future theme = appending one entry, never touching components                                                                                                                     |
| 2026-05-17 | Single-player vs bots BEFORE multiplayer (phase reordering)                                    | Validate rules feel + UI quality with real play before committing to multiplayer infra                                                                                                     |
| 2026-05-17 | Insert Card Lab phase (Phase 3)                                                                | De-risk the visual stack on real hardware before building the full game UI on top of it                                                                                                    |
| 2026-05-17 | `PabloClient` interface with mock + real implementations                                       | Lets mobile (Phase 4) and Supabase (Phase 5) work proceed in parallel; Phase 6 swaps one import                                                                                            |
| 2026-05-17 | `MatchState` separated from `GameState` in engine                                              | Engine cleanly separates "single round" from "multi-round match to score cap"; avoids baking the wrong assumption into Phase 2                                                             |
| 2026-05-17 | Each phase = its own branch + PR (no direct commits to main)                                   | Required to safely parallelize background agents; Bugbot reviews each PR                                                                                                                   |
| 2026-05-17 | iOS-first; web supported as a side-effect, not a polish target                                 | Don't break web, don't optimize for it                                                                                                                                                     |

## Proposed decisions (need user input)

_(none right now)_

## Open questions

- Final Pablo special-card scheme is locked, but should the K♥ rule apply only to the King OF Hearts, or also the Heart suit in general? Currently: only K♥. Validate with a real game.
- Bot difficulty levels — do we want Easy/Medium/Hard in Phase 4, or single difficulty for v1?
- Should "quick play" exist as a single-round mode in addition to multi-round matches?
