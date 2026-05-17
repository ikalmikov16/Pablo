# PLAN — Pablo

Living plan. Agents MUST update this after meaningful changes.

## Current phase

**Phase 1 — Scaffold** (in progress)

## Done

- Created Bun workspace structure (`apps/`, `packages/`, `supabase/`, `docs/`).
- Wrote `AGENTS.md`, `docs/PLAN.md`, `docs/GAME_LOGIC.md`, `docs/SCHEMA.md`.
- Wrote scoped Cursor rules under `.cursor/rules/`.
- Initialized git, added GitHub remote `git@github.com:ikalmikov16/Pablo.git`.
- Installed Bun and Supabase CLI (via Homebrew).

## In progress

- (none — Phase 1 nearly complete)

## Up next

### Phase 2 — Engine (assign to a background agent)

Implement `packages/engine` per `docs/GAME_LOGIC.md`:

- [ ] Deterministic shuffle (seeded) so games are reproducible for tests + audit
- [ ] `deal(state, options)` — build initial state for N players
- [ ] `applyMove(state, move)` — single source of truth for all rule logic
- [ ] `computePlayerView(state, playerId)` — projection that hides others' hidden cards
- [ ] `score(state)` — round and cumulative scoring including Pablo penalty
- [ ] Comprehensive Bun tests for every rule path (deal, draw, swap, discard, special cards, Pablo call, edge cases)
- [ ] No imports from `expo`, `react`, `react-native`, `@supabase/*`, or Node-only APIs

Exit criteria: `bun test` is green with >90% coverage of `packages/engine/src`.

### Phase 3 — Supabase (can run in parallel with Phase 2 once engine types are stubbed)

Implement per `docs/SCHEMA.md`:

- [ ] Migrations for `profiles`, `rooms`, `room_members`, `games`, `game_events`
- [ ] RLS policies (see SCHEMA.md "RLS Philosophy")
- [ ] Edge functions: `joinRoom`, `leaveRoom`, `startGame`, `applyMove`, `callPablo`
- [ ] Edge functions wrap `packages/engine` for all rule logic — no duplication
- [ ] Per-player view computed in an edge function or via a SECURITY DEFINER function
- [ ] Integration tests against local Supabase

### Phase 4 — Mobile shell

- [ ] Expo Router with `(auth)`, `(lobby)`, `(game)` route groups
- [ ] Anonymous Supabase auth on first launch
- [ ] Lobby: create room, join by code, see room members update via Realtime
- [ ] Zustand store wired to per-player view subscription

### Phase 5 — Game UI

- [ ] Card components + Reanimated flip/drag animations
- [ ] Game screen: own hand grid, opponents row, deck/discard, action bar
- [ ] Optimistic moves via local engine, reconciled on server confirm
- [ ] End-of-round reveal animation + score display

### Phase 6 — Polish

- [ ] Sounds (deal, flip, swap, Pablo call)
- [ ] Haptics on key actions
- [ ] Zellige-inspired visual identity pass
- [ ] App icon + splash screen
- [ ] App Store + TestFlight prep

## Decisions made

| Date | Decision | Why |
|---|---|---|
| 2026-05-17 | Bun for the workspace + tests | One tool replaces npm + ts-node + Jest; first-class Expo support; fast |
| 2026-05-17 | Engine in TypeScript, not Python/Rust | Same engine runs in client (optimistic UI) and Supabase Edge Functions (Deno); shared types end-to-end; no extra infra |
| 2026-05-17 | Supabase Realtime, not custom WebSocket server | Pablo is turn-based; Realtime fits perfectly; one fewer thing to host |
| 2026-05-17 | Server-authoritative state with per-player projections | Cheat-proof by construction; reconnection is trivial (DB is source of truth) |
| 2026-05-17 | Anonymous auth by default | Higher conversion than gating first game behind sign-up |
| 2026-05-17 | English-only for v1, but `t()` everywhere | Cheap to add now, painful to retrofit |
| 2026-05-17 | Light monorepo (`apps/`, `packages/`, `supabase/`) | Engine package boundary mechanically enforces "engine stays pure" |
| 2026-05-17 | Zellige aesthetic as design seed | User preference; keep components themeable so we can lean in during Phase 6 |

## Proposed decisions (need user input)

_(none right now)_

## Open questions

- Final Pablo special-card scheme — see `docs/GAME_LOGIC.md` "Variants" section. We've picked a default but should validate with a real game before locking in.
- Should single-round play exist as a "quick game" mode, or always multi-round to a score cap?
