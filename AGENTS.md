# Pablo — Agent Contract

This document is the single source of truth for *how* we build Pablo. Read this before doing anything in this repo. The scoped rules in `.cursor/rules/` give finer detail per area.

## Project in one sentence

Pablo is a multiplayer card game (same family as Cabo / Cambio) shipping first on iOS, then Android and web, built with Expo + Supabase.

## Stack — non-negotiable

| Layer | Choice |
|---|---|
| Package manager | **Bun** (workspaces) |
| Mobile/Web | **Expo SDK 54+** with **Expo Router**, **TypeScript strict** |
| State (client) | **Zustand** |
| Animations | **Reanimated 3** + (later) **react-native-skia** for card art |
| Backend | **Supabase** — Postgres, Realtime, Auth (anonymous-first), Edge Functions |
| Edge runtime | **Deno** (Supabase Edge Functions) |
| Game logic | **Pure TypeScript** in `packages/engine` — runs in client (optimistic UI) and edge functions (authoritative) |
| Tests | **Bun test** for engine; integration tests for edge functions |
| i18n | `expo-localization` — English only for v1, structured so French/Arabic drop in later |

Do NOT introduce: Redux, Jest, npm/pnpm, Socket.io, a separate Node server, an ORM, or a UI library. If you think you need one of these, write the reason in `docs/PLAN.md` under "Proposed Decisions" and stop.

## Hard rules

1. **Server-authoritative game state, always.** The client never decides what's in the deck, what an opponent holds, or whether a move is legal. All mutations go through a Supabase Edge Function that calls `packages/engine` to validate and apply the move.
2. **Engine purity.** `packages/engine` must not import from `expo`, `react`, `react-native`, `@supabase/*`, or any Node-only API. Pure functions over plain data only. If you reach for `Date.now()` or `Math.random()`, inject them.
3. **Never leak hidden cards.** Clients subscribe to a *per-player projection* of game state, never the raw `games` row. Computing the projection lives in an edge function or a Postgres view with RLS.
4. **RLS on every table, from the first migration.** No exceptions, no "I'll add it later."
5. **Types flow one way: engine → edge function → client.** When the engine's types change, every other layer updates to match. The engine is the schema.
6. **No game logic in components.** Components read state from Zustand selectors and dispatch moves. Logic lives in the engine.
7. **No hardcoded user-visible strings in components.** Always go through `t()`. Even though we're English-only now.
8. **No hardcoded colors.** Use design tokens. We will evolve toward a zellige-inspired identity.

## How to run things

```bash
bun install                 # install everything across the workspace
bun test                    # run the engine test suite
bun run typecheck           # typecheck every workspace package
bun run mobile              # start Expo dev server (apps/mobile)
bun run supabase:start      # local Supabase stack (requires Docker Desktop)
bun run supabase:functions  # serve edge functions locally
```

## After making changes

Every meaningful change must:

1. Pass `bun run typecheck`
2. Pass `bun test` (engine changes must have new tests)
3. Update `docs/PLAN.md` — move the relevant item between Done / In Progress / Up Next, and add anything notable to "Decisions Made"
4. Update `docs/GAME_LOGIC.md` if you changed any rule semantics
5. Update `docs/SCHEMA.md` if you changed any Supabase table, RLS policy, or edge function contract

## Phase tracker

See `docs/PLAN.md`. We are currently in **Phase 1 — Scaffold**.

## When you're unsure

Read the relevant doc:

- Game rules question → `docs/GAME_LOGIC.md`
- DB / edge function question → `docs/SCHEMA.md`
- "Should I build it this way?" → `docs/PLAN.md` "Decisions Made"
- Engine boundaries → `.cursor/rules/engine.mdc`

If the doc doesn't answer it, propose a decision in `docs/PLAN.md` under "Proposed Decisions" with the trade-offs, and ask the user.
