# Pablo — Agent Contract

This document is the single source of truth for _how_ we build Pablo. Read this before doing anything in this repo. The scoped rules in `.cursor/rules/` give finer detail per area.

## Project in one sentence

Pablo is a multiplayer card game (same family as Cabo / Cambio) shipping first on iOS, then Android and web, built with Expo + Supabase.

## Stack — non-negotiable

| Layer           | Choice                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| Package manager | **Bun** (workspaces)                                                                                         |
| Mobile/Web      | **Expo SDK 54+** with **Expo Router**, **TypeScript strict**                                                 |
| State (client)  | **Zustand**                                                                                                  |
| Animations      | **Reanimated 3** + (later) **react-native-skia** for card art                                                |
| Backend         | **Supabase** — Postgres, Realtime, Auth (anonymous-first), Edge Functions                                    |
| Edge runtime    | **Deno** (Supabase Edge Functions)                                                                           |
| Game logic      | **Pure TypeScript** in `packages/engine` — runs in client (optimistic UI) and edge functions (authoritative) |
| Tests           | **Bun test** for engine; integration tests for edge functions                                                |
| i18n            | `expo-localization` — English only for v1, structured so French/Arabic drop in later                         |

Do NOT introduce: Redux, Jest, npm/pnpm, Socket.io, a separate Node server, an ORM, or a UI library. If you think you need one of these, write the reason in `docs/PLAN.md` under "Proposed Decisions" and stop.

## Hard rules

1. **Server-authoritative game state, always.** The client never decides what's in the deck, what an opponent holds, or whether a move is legal. All mutations go through a Supabase Edge Function that calls `packages/engine` to validate and apply the move.
2. **Engine purity.** `packages/engine` must not import from `expo`, `react`, `react-native`, `@supabase/*`, or any Node-only API. Pure functions over plain data only. If you reach for `Date.now()` or `Math.random()`, inject them.
3. **Never leak hidden cards.** Clients subscribe to a _per-player projection_ of game state, never the raw `games` row. Computing the projection lives in an edge function or a Postgres view with RLS.
4. **RLS on every table, from the first migration.** No exceptions, no "I'll add it later."
5. **Types flow one way: engine → edge function → client.** When the engine's types change, every other layer updates to match. The engine is the schema.
6. **No game logic in components.** Components read state from Zustand selectors and dispatch moves. Logic lives in the engine.
7. **No hardcoded user-visible strings in components.** Always go through `t()`. Even though we're English-only now.
8. **No hardcoded colors.** Use design tokens. We will evolve toward a zellige-inspired identity.
9. **Plan before you build.** Every phase or non-trivial feature gets a written implementation plan in `docs/plans/<branch-slug>.md` (e.g. `docs/plans/phase-3-card-lab.md`) **before any code is written**. The plan must cover: goal in one sentence, mapping of requirements to specific files/functions, full test plan, design decisions with trade-offs, and open questions. The plan is committed in the same PR as the implementation. Existing plans in `docs/plans/` are the reference for how detailed to go.

## How to run things

```bash
bun install                 # install everything across the workspace
bun test                    # run the engine test suite
bun run typecheck           # typecheck every workspace package
bun run lint                # ESLint across the whole repo
bun run lint:fix            # ESLint --fix where possible
bun run format              # Prettier --write the whole repo
bun run format:check        # verify Prettier would not change anything
bun run check               # typecheck + lint + format:check + test (the canonical pre-commit gate)
bun run mobile              # start Expo dev server (apps/mobile)
bun run mobile:ios          # start Expo dev server + launch iOS Simulator
bun run mobile:web          # start Expo dev server in browser-only mode
bun run supabase:start      # local Supabase stack (requires Docker Desktop)
bun run supabase:functions  # serve edge functions locally
bun run build:engine-bundle # rebuild supabase/functions/_shared/engine.bundle.js
                            # — REQUIRED whenever packages/engine source changes,
                            # since the bundle is what Deno edge functions import.
                            # Forgetting this means edge functions run a stale engine.
```

Note: cross-workspace bun invocations must use `--cwd=<path>` (with the equals sign — `bun --cwd <path>` is silently broken on Bun 1.3.14).

```bash
# ✅ works
bun --cwd=packages/engine run typecheck
bun --filter='@pablo/mobile' run typecheck

# ❌ broken — prints help instead of running
bun --cwd packages/engine run typecheck
```

## After making changes

Every meaningful change must, in order:

1. **`bun run format`** — Prettier-format the changed files (run automatically over the whole repo is fine).
2. **`bun run lint`** — must pass with 0 errors. Warnings are allowed but should be addressed if they touch the diff you just authored.
3. **`bun run typecheck`** — must pass with 0 errors.
4. **`bun test`** — must pass. Engine changes must include new tests.
5. Update `docs/PLAN.md` — move the relevant item between Done / In Progress / Up Next, and add anything notable to "Decisions Made".
6. Update `docs/GAME_LOGIC.md` if you changed any rule semantics.
7. Update `docs/SCHEMA.md` if you changed any Supabase table, RLS policy, or edge function contract.

The single command `bun run check` runs steps 1–4 (format-check + lint + typecheck + tests). Run it before pushing any branch.

### Lint / formatter setup (read once)

- Formatter is **Prettier** (`.prettierrc.json`). Single quotes, semicolons, trailing commas, 100-col print width, LF line endings.
- Linter is **ESLint 9 flat config** (`eslint.config.mjs`) using `typescript-eslint` recommended + `eslint-config-prettier` (so the two never disagree).
- The engine package has extra restrictions (`packages/engine/**`): no `Math.random`, no `Date.now`, no imports from `expo` / `react` / `react-native` / `@supabase/*` / Node built-ins. These are mechanically enforced; if you see an engine purity violation, the lint step will fail.

## Branch / PR workflow

This repo runs multiple background agents in parallel. To avoid stepping on each other:

1. **Every phase gets its own branch.** Naming: `phase-N-short-slug` (e.g. `phase-2-engine`, `phase-5-supabase`). See `docs/PLAN.md` for the canonical branch name per phase.
2. **Never commit directly to `main`.** Always work on a phase branch and squash-merge into `main` when the user says "merge".
3. **No GitHub PRs.** Do not open pull requests. Push the branch, then stop. The merge happens locally via `git merge --squash` when the user approves.
4. **Agent self-reviews before merging.** The agent that produced the change is responsible for one critical pass over the diff: re-reading every changed file, sanity-checking edge cases, and verifying every "After making changes" gate before merging.
5. **Squash-merge** to keep `main` linear and readable.
6. **Last step before merging**: update `docs/PLAN.md` — move items between Done / In Progress / Up Next, append to "Decisions Made". A merge without a PLAN.md update is incomplete.
7. **Default is do-not-merge.** When the user spawns a background agent, the agent pushes the branch and stops. The user explicitly says "merge" before the agent squash-merges into `main`.

When the user spawns a background agent, the prompt should explicitly include:

> Work on branch `<branch-name>`. **First, write the implementation plan to `docs/plans/<branch-name>.md` and wait for approval.** Then execute. When all "Definition of Done" criteria from the matching phase in `docs/PLAN.md` are met, push the branch and stop. Do NOT merge unless I tell you to.

### How to self-review before merging

Before squash-merging into `main`, the agent must:

1. Run `bun run check` on the branch — typecheck + lint + format-check + tests all green.
2. Re-read every file in the diff (`git diff main...HEAD`). Look for: dead code, off-by-ones, leaky abstractions, missing tests for new branches, mutation of arguments where purity is expected, and any rule listed in the relevant `.cursor/rules/*.mdc`.
3. Verify all "Must include" items in the matching `docs/PLAN.md` phase are present.
4. Confirm `docs/PLAN.md` was updated (Done / Decisions Made).
5. Confirm `docs/GAME_LOGIC.md` and `docs/SCHEMA.md` are up-to-date if their domains were touched.
6. Only then squash-merge to `main` and delete the branch.

## Phase tracker

See `docs/PLAN.md`. Each phase has a goal, must-include list, out-of-scope list, definition of done, branch name, token budget, and model recommendation.

Phase 1 (Scaffold) and Phase 2 (Engine) are done. **Phase 3 (Card Lab) is next.**

## When you're unsure

Read the relevant doc:

- Game rules question → `docs/GAME_LOGIC.md`
- DB / edge function question → `docs/SCHEMA.md`
- "Should I build it this way?" → `docs/PLAN.md` "Decisions Made"
- "How did we build the last phase?" → the matching file in `docs/plans/`
- Engine boundaries → `.cursor/rules/engine.mdc`

If the doc doesn't answer it, propose a decision in `docs/PLAN.md` under "Proposed Decisions" with the trade-offs, and ask the user.
