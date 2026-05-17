# Pablo

A multiplayer card game inspired by the Tunisian classic, built with Expo (React Native) and Supabase.

## Stack

- **Mobile/Web client**: Expo (React Native) + Expo Router + TypeScript + Zustand + Reanimated 3
- **Backend**: Supabase (Postgres + Realtime + Auth + Edge Functions)
- **Game engine**: pure TypeScript, framework-free (`packages/engine`)
- **Package manager**: Bun (workspaces)

## Repo layout

```
pablo/
├── apps/mobile        Expo app
├── packages/engine    Pure TS game logic + tests (no React, no Supabase)
├── supabase/          Schema, migrations, edge functions
├── docs/              GAME_LOGIC.md · SCHEMA.md · PLAN.md
├── .cursor/rules/     Scoped Cursor rules
└── AGENTS.md          Stack, conventions, how to run things
```

## Quick start

```bash
bun install
bun test                 # runs the engine test suite
bun run mobile           # start the Expo dev server
bun run supabase:start   # boot local Supabase (requires Docker)
```

## Where to read next

- `AGENTS.md` — the contract every agent (and human) follows
- `docs/PLAN.md` — current build phase, decisions log
- `docs/GAME_LOGIC.md` — canonical Pablo rules
- `docs/SCHEMA.md` — Supabase tables, RLS philosophy, edge function contracts
