# SCHEMA — Supabase Layer

How the Supabase side fits together. The Phase 3 agent implements this; the engine team can read it for context.

## Philosophy

1. **The client subscribes to per-player projections, never raw `games` rows.** This is how we keep hidden cards hidden.
2. **All state mutations go through edge functions.** No client-side `update` to `games`. RLS denies it.
3. **Engine is the only place rules live.** Edge functions are thin wrappers: load state, validate move via `applyMove`, write back, broadcast.
4. **Idempotency keys on every mutation.** Network retries must not duplicate moves.

## Tables

### `profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | references `auth.users.id` |
| `display_name` | `text` | nullable until user picks one |
| `created_at` | `timestamptz` | default `now()` |

RLS: users can read all profiles; users can only update their own.

### `rooms`

Lobby metadata. Lightweight, fully public read.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `code` | `text` UNIQUE | 6-char join code |
| `host_id` | `uuid` | references `profiles.id` |
| `status` | `text` | `'waiting' \| 'playing' \| 'finished'` |
| `rules` | `jsonb` | a `GameRules` object |
| `max_players` | `int` | default 4 |
| `created_at` | `timestamptz` | |

RLS: anyone can read rooms (so people can join by code). Only the host can update.

### `room_members`

| Column | Type | Notes |
|---|---|---|
| `room_id` | `uuid` | references `rooms.id` |
| `user_id` | `uuid` | references `profiles.id` |
| `seat` | `int` | 0..max_players-1 |
| `joined_at` | `timestamptz` | |
| PK | (room_id, user_id) | |

RLS: members of a room can read the membership list; insert only via `joinRoom` edge function.

### `games`

The full authoritative state. **Restricted.** Clients never read this directly.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `room_id` | `uuid` | references `rooms.id` |
| `state` | `jsonb` | full `GameState` blob (engine type) |
| `version` | `bigint` | monotonic, bumped on every mutation; used for optimistic concurrency |
| `updated_at` | `timestamptz` | |

RLS: deny all client reads and writes. Only `service_role` (edge functions) can touch.

### `game_views` (Postgres view, NOT a table)

A `SECURITY DEFINER` Postgres function `get_player_view(game_id uuid)` that:

1. Loads the `games.state`
2. Verifies `auth.uid()` is a member of the corresponding room
3. Returns the projection for that player (hides other players' hidden card values, hides deck order)

Clients call `supabase.rpc('get_player_view', { game_id })` and subscribe to `games` row changes for that game (broadcast-only, no payload), then re-fetch the projection on change.

### `game_events`

Append-only event log. Useful for replays, audit, and animation timing on the client.

| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial` PK | |
| `game_id` | `uuid` | references `games.id` |
| `version` | `bigint` | matches the `games.version` after the event |
| `event` | `jsonb` | a `GameEvent` from the engine |
| `created_at` | `timestamptz` | |

RLS: room members can read events for games in their room (but events are pre-projected, so they only contain info that player is allowed to see).

## Edge Functions

All live in `supabase/functions/`. All written in TypeScript, run on Deno. All import the engine via a deno-compatible bundle or direct `.ts` imports.

| Function | Purpose | Inputs | Side effects |
|---|---|---|---|
| `joinRoom` | Add caller to a room | `{ roomCode }` | inserts `room_members` row |
| `leaveRoom` | Remove caller from a room | `{ roomId }` | deletes row; if last member, deletes room |
| `startGame` | Host starts the game | `{ roomId }` | calls `engine.newGame`, inserts `games` row, updates `rooms.status` |
| `applyMove` | Submit a move | `{ gameId, move, idempotencyKey, expectedVersion }` | calls `engine.applyMove`, writes new state, appends to `game_events` |
| `callPablo` | Convenience wrapper | `{ gameId, idempotencyKey, expectedVersion }` | calls `applyMove` with a `call_pablo` move |

All functions:

- Verify `auth.uid()` is allowed to perform the action
- Use `expectedVersion` for optimistic concurrency — reject stale moves
- Use `idempotencyKey` (UUID per move attempt) for retry safety
- Return either `{ ok: true, version }` or `{ ok: false, error }`

## Realtime

Clients subscribe to Postgres changes on `games` filtered by `id = <game_id>`. They don't get the payload (RLS blocks it) — they just learn "the state changed" and re-call `get_player_view` to fetch the new projection. This pattern is simple and cheat-proof.

## Migration conventions

- Filename: `YYYYMMDDHHMMSS_short_description.sql`
- Every migration includes its rollback as comments at the bottom (we don't run them automatically; useful for review)
- RLS is enabled in the same migration that creates the table — never separated

## Local dev

```bash
supabase start            # boot Postgres + Realtime + Auth locally (requires Docker)
supabase db reset         # wipe + reapply migrations + seed
supabase functions serve  # serve edge functions for local testing
supabase status           # show local connection details
```
