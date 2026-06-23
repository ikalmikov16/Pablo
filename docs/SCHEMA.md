# SCHEMA — Supabase Layer

How the Supabase side fits together. The Phase 5 agent implements this; the engine team can read it for context. The mobile app (`apps/mobile`) consumes the backend through the `PabloClient` interface — see the "PabloClient contract" section at the bottom for what Phase 5 must expose.

Last revised: 2026-06-09 (Phase 6 — `rooms.current_game_id`, `returnToLobby`, `getActiveSession`, real client wiring).

## Philosophy

1. **The client subscribes to per-player projections, never raw `games` rows.** This is how we keep hidden cards hidden.
2. **All state mutations go through edge functions.** No client-side `update` to `games`. RLS denies it.
3. **Engine is the only place rules live.** Edge functions are thin wrappers: load state, validate move via `applyMove`, write back, broadcast. Postgres functions never re-implement game rules.
4. **`game_events` and `games.state` are equally privileged.** Both are service-role-only. Anything a client reads goes through an edge function that runs `auth.uid()`-aware redaction.
5. **Idempotency keys on every mutation that takes one.** Network retries must not duplicate moves; the move log is the source of truth.
6. **Server-controlled randomness.** Seeds for `engine.newGame` are minted server-side; clients never inject them.

## Tables

### `profiles`

| Column         | Type          | Notes                                          |
| -------------- | ------------- | ---------------------------------------------- |
| `id`           | `uuid` PK     | references `auth.users.id` `ON DELETE CASCADE` |
| `display_name` | `text`        | nullable until user picks one                  |
| `created_at`   | `timestamptz` | default `now()`                                |

- **Trigger**: `AFTER INSERT ON auth.users` → insert empty `profiles` row, so anonymous sign-ins auto-provision.
- **RLS**: any authenticated user can `SELECT`; users can only `UPDATE` their own row; no client-side `INSERT` or `DELETE`.

### `rooms`

Lobby metadata. Lightweight, fully public read.

| Column            | Type          | Notes                                                                                     |
| ----------------- | ------------- | ----------------------------------------------------------------------------------------- |
| `id`              | `uuid` PK     | default `gen_random_uuid()`                                                               |
| `code`            | `text` UNIQUE | 6-char base32-no-ambiguous join code (no `O`, `0`, `I`, `1`)                              |
| `host_id`         | `uuid`        | references `profiles.id`                                                                  |
| `status`          | `text`        | `CHECK (status IN ('waiting','playing'))` — see "Room lifecycle"                          |
| `rules`           | `jsonb`       | a `GameRules` object (template for new games)                                             |
| `max_players`     | `int`         | `CHECK (max_players BETWEEN 2 AND 6)`; default 4                                          |
| `current_game_id` | `uuid` NULL   | references `games.id` `ON DELETE SET NULL` — RLS-readable link to the live game (Phase 6) |
| `created_at`      | `timestamptz` | default `now()`                                                                           |

- **RLS**: any authenticated user can `SELECT` (so people can join by code); only `host_id = auth.uid()` can `UPDATE`; `INSERT` only via the `create_room()` SQL function (SECURITY DEFINER); `DELETE` only via `leaveRoom` edge function when the last member leaves.

> **Room lifecycle.** A room is `waiting` until the host calls `startGame`, then `playing` while a live game is linked via `current_game_id`. After a round ends, the host explicitly calls `returnToLobby` (sets `status='waiting'`, clears `current_game_id`) before starting another game. Non-hosts see a "waiting for host" state on the result screen. `leaveRoom` removes a member; when the last member leaves the room is deleted (CASCADE removes games). There is no `'finished'` terminal status.

### `room_members`

| Column      | Type               | Notes                                                                |
| ----------- | ------------------ | -------------------------------------------------------------------- |
| `room_id`   | `uuid`             | references `rooms.id` `ON DELETE CASCADE`                            |
| `user_id`   | `uuid`             | references `profiles.id` `ON DELETE CASCADE`                         |
| `seat`      | `int`              | `CHECK (seat >= 0)`; uniqueness enforced by `(room_id, seat) UNIQUE` |
| `joined_at` | `timestamptz`      | default `now()`                                                      |
| PK          | (room_id, user_id) |                                                                      |

- **Indices**: `(room_id, seat) UNIQUE` (prevents two members in the same seat — turn-order safety); `(user_id)` (for "what rooms am I in?").
- **RLS**: members of a room can `SELECT` the membership list. The check is implemented via the `is_room_member(p_room_id, p_user_id)` SECURITY DEFINER helper function (declared in the same migration) — a naive `EXISTS (SELECT 1 FROM room_members ...)` policy would recurse into itself and fail with `infinite recursion detected in policy for relation "room_members"`. `INSERT`/`DELETE` only via `joinRoom`/`leaveRoom` edge functions.

### `games`

The full authoritative state. **Restricted to `service_role`.** Clients never read this directly.

| Column           | Type          | Notes                                                                  |
| ---------------- | ------------- | ---------------------------------------------------------------------- |
| `id`             | `uuid` PK     | default `gen_random_uuid()`                                            |
| `room_id`        | `uuid`        | references `rooms.id` `ON DELETE CASCADE`                              |
| `state`          | `jsonb`       | full `GameState` blob (engine type, opaque to Postgres)                |
| `version`        | `bigint`      | starts at 0, bumped on every successful `applyMove`                    |
| `engine_version` | `int`         | starts at 1; bump in lockstep with a breaking `GameState` shape change |
| `created_at`     | `timestamptz` | default `now()`                                                        |
| `updated_at`     | `timestamptz` | bumped by `apply_move_atomic`                                          |

- **Index**: `games_one_live_per_room` partial unique on `(room_id) WHERE (state->>'status') <> 'ended'` — prevents two simultaneously-live games per room.
- **Index**: `(room_id)` for `getCurrentGame(room_id)` lookups.
- **RLS**: `DENY ALL` for `authenticated`. Only `service_role` (edge functions) and SECURITY DEFINER functions touch this table.

### `game_moves`

Append-only log of every move applied to a game. **Service-role-only.** Carries the idempotency key.

| Column            | Type                       | Notes                                          |
| ----------------- | -------------------------- | ---------------------------------------------- |
| `game_id`         | `uuid`                     | references `games.id` `ON DELETE CASCADE`      |
| `version`         | `bigint`                   | equals `games.version` after this move applied |
| `player_id`       | `uuid`                     | references `profiles.id`                       |
| `move`            | `jsonb`                    | engine `Move` variant                          |
| `idempotency_key` | `text`                     | client-supplied UUID per attempt               |
| `created_at`      | `timestamptz`              | default `now()`                                |
| PK                | (game_id, version)         |                                                |
| UNIQUE            | (game_id, idempotency_key) | enforces idempotency at write time             |

- **RLS**: `DENY ALL`. Clients never read or write directly.
- **Why a separate table?** Idempotency needs a UNIQUE constraint. One move can produce many events; making `(game_id, version)` carry the key on `game_events` would require choosing "which row" and tracking it. A 1:1 moves table is cheaper and supports clean replay/audit later.

### `game_events`

Append-only event log. Drives client-side animation timing. **Service-role-only.**

| Column       | Type           | Notes                                                                    |
| ------------ | -------------- | ------------------------------------------------------------------------ |
| `id`         | `bigserial` PK |                                                                          |
| `game_id`    | `uuid`         | references `games.id` `ON DELETE CASCADE`                                |
| `version`    | `bigint`       | matches `games.version` after the move that produced this event          |
| `seq`        | `int`          | ordering within a version (one move can emit multiple events, 0-indexed) |
| `event`      | `jsonb`        | a `GameEvent` from the engine (raw — may contain private `cardId`s)      |
| `created_at` | `timestamptz`  | default `now()`                                                          |

- **Index**: `(game_id, version, seq) UNIQUE` (uniqueness + the natural read order).
- **Index**: `(game_id, version)` for `getEventsSince(game_id, since_version)` range scans.
- **RLS**: `DENY ALL`. Clients fetch via the `getEventsSince` edge function which performs per-player redaction (see "Hidden-info contract" below).

> **Why deny-all on `game_events`?** Several engine events carry private data, most notably `peeked { cardId }`. If the row were readable by all room members, anyone could `SELECT event->>'cardId' FROM game_events WHERE event->>'type' = 'peeked'` and bypass the projection. Treating events the same as state — service-role-only, redact at read — closes the leak.

## SQL functions

All `SECURITY DEFINER`, `SET search_path = public, pg_temp`. None of them implement game rules; they only orchestrate writes.

### `create_room(p_rules jsonb, p_max_players int) RETURNS rooms`

Generates a `code`, retries up to 5x on UNIQUE collision, inserts the room, and inserts the caller into `room_members(seat=0)` — all in one transaction.

### `apply_move_atomic(p_game_id, p_new_state, p_new_version, p_engine_version, p_move, p_events, p_player_id, p_idempotency_key) RETURNS bigint`

Called by the `applyMove` edge function after `engine.applyMove` succeeds. In one transaction:

1. `UPDATE games SET state, version = p_new_version, engine_version, updated_at = now() WHERE id = p_game_id AND version = p_new_version - 1` (optimistic concurrency).
2. `INSERT INTO game_moves (...) VALUES (...)`.
3. `INSERT INTO game_events (...) VALUES (...) ...` (one row per event, with `seq` 0..N-1).

Returns `p_new_version` on success. On `(game_id, idempotency_key)` UNIQUE conflict, returns the cached version from the existing `game_moves` row (so retries are safe). On optimistic-concurrency mismatch, raises — the edge function catches and returns `version_mismatch`.

## Edge functions

All live in `supabase/functions/`. All written in TypeScript, run on Deno 2 (`config.toml` already sets `deno_version = 2`). All import the engine via a shared `supabase/functions/deno.json` `imports` map aliasing `@pablo/engine` to `./_shared/engine.bundle.js` — a pre-built ESM bundle of `packages/engine/src/index.ts` produced by `bun run build:engine-bundle`. (We bundle rather than import the engine sources directly because Supabase's Deno edge runtime doesn't reliably resolve extensionless TypeScript imports inside Bun workspace packages.) **The bundle must be regenerated whenever `packages/engine` changes** — `AGENTS.md` calls this out; forgetting it means the edge functions silently run a stale engine.

| Function         | Purpose                                  | Inputs                                              | Side effects / Outputs                                                                                                                               |
| ---------------- | ---------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `joinRoom`       | Add caller to a room                     | `{ code }`                                          | Inserts `room_members`. Rejects if room `status='playing'` or full. Returns `{ room }`.                                                              |
| `leaveRoom`      | Remove caller from a room                | `{ roomId }`                                        | Deletes row; if last member, deletes the room and any of its games. Returns `{}`.                                                                    |
| `startGame`      | Host starts the game                     | `{ roomId }`                                        | Calls `engine.newGame`, inserts `games` row in `status='peek_phase'`, sets `rooms.status='playing'` + `current_game_id`, broadcasts `game:{id}` v=0. |
| `returnToLobby`  | Host returns room after a round          | `{ roomId }`                                        | Host only. Sets `rooms.status='waiting'`, `current_game_id=null`. Enables another `startGame`.                                                       |
| `applyMove`      | Submit any move (all 13 `Move` variants) | `{ gameId, move, idempotencyKey, expectedVersion }` | Loads game, runs `engine.applyMove`, calls `apply_move_atomic`, broadcasts `game:{id}` v=new. Returns `{ version }`.                                 |
| `getPlayerView`  | Per-player projection (read)             | `{ gameId }`                                        | Loads game, runs `engine.computePlayerView(state, auth.uid())`. Returns `{ view, version }`.                                                         |
| `getEventsSince` | Per-player event catch-up (read)         | `{ gameId, sinceVersion }`                          | Loads events, redacts per `auth.uid()` (see below). Returns `{ events, currentVersion }`.                                                            |

> Phase 2.5 collapsed `callPablo` into `applyMove`. `call_pablo` is just one of `Move`'s variants — no separate endpoint.

All functions:

- Verify `auth.uid()` is allowed to perform the action (caller is a member of the room / is the host / is the player named in the move / etc.).
- For mutations: use `expectedVersion` for optimistic concurrency — reject stale moves with `version_mismatch`.
- For mutations: use `idempotencyKey` (UUID per attempt) — duplicate POSTs return the cached version.
- Return JSON shaped to match the mobile `ClientResult<T>`: `{ ok: true, data }` or `{ ok: false, error }` where `error` is a `ClientErrorCode`.
- HTTP status is always 200 unless the request is malformed (then 400) or unauthenticated (then 401); the discriminator is in the body.

## Realtime

### View stream — broadcast (not postgres_changes)

After every successful `applyMove`, the edge function publishes a Realtime **broadcast** message on channel `game:{gameId}` with payload `{ version: number }`. Clients:

1. Subscribe to `game:{gameId}` on game enter.
2. On every tick, call `getPlayerView({ gameId })` and emit the new `(view, version)` pair to `PabloClient.subscribePlayerView`.

**Why broadcast, not `postgres_changes` on `games`:** `postgres_changes` respects RLS. `games` is service-role deny-all for clients, so `postgres_changes` would deliver nothing. Broadcast bypasses RLS for the publisher (service role) and delivers to channel subscribers. No leak — payload is just the version.

### Event stream — same channel, batched fetch

Events ride the same `game:{gameId}` channel. Each broadcast tick prompts a `getEventsSince(gameId, lastSeenVersion)` call, which delivers all rows with `version > lastSeenVersion` in version+seq ascending order. Each batch is emitted to `PabloClient.subscribeGameEvents`. Events drive the animation layer; the view stream remains the source of truth for state.

**Initial sync (reconnection):** the first successful sync after subscribing snaps `lastSeenVersion` to the current version _without_ emitting the historical catch-up batch. Reconnecting into an in-progress match therefore shows the current state immediately (from the view stream) instead of replaying every past move's animation; only deltas applied after reconnect are animated.

### Room subscriptions — postgres_changes (safe)

`rooms` and `room_members` are RLS-readable by room members, so the mobile app can subscribe directly to `postgres_changes` filtered by `room_id`. No edge function in the path.

Both tables are added to the `supabase_realtime` publication (migration `20260609130000`) — `postgres_changes` delivers nothing for unpublished tables. The filter columns (`rooms.id`, `room_members.room_id`) are part of each primary key, so DELETE events carry them without `REPLICA IDENTITY FULL`.

### Display-name subscriptions — postgres_changes on `profiles`

`profiles` is SELECT-able by any authenticated user, so the lobby can subscribe directly to `postgres_changes` on `profiles` filtered by `id=in.(…member ids…)`. This powers `subscribeDisplayNames`: a player editing their name while waiting in the lobby broadcasts to the other waiting players, who refetch the affected names. `profiles` is added to the `supabase_realtime` publication in migration `20260623000000`. `profiles.id` is the primary key and the only filter column, so UPDATE events carry it without `REPLICA IDENTITY FULL`. Display names are stored on `profiles.display_name` (no new column was needed); `setDisplayName` is a direct RLS-guarded `UPDATE` on the caller's own row.

This pattern is simple and cheat-proof: clients never see hidden data, and the two streams arrive in the order moves were applied (version-monotonic).

## Hidden-info contract

`getPlayerView` is the projection edge function. It loads `games.state`, validates `auth.uid()` is a room member, and runs `engine.computePlayerView(state, auth.uid())` directly. Same hidden/visible split as documented in `docs/GAME_LOGIC.md` § Hidden-info contract — no rule duplication.

`getEventsSince` performs **per-player redaction**:

| Event type        | Redaction (when caller ≠ `playerId`)                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `peeked`          | Replace `cardId` with `null`. Caller learns "alice peeked bob's slot 2" but not what card it was.                                     |
| `peek_one_chosen` | Replace `cardId` **and** `handIndex` with `null`. Initial-peek picks are fully private — both the card identity and the chosen index. |
| `card_drawn`      | No redaction needed (no `cardId` in payload).                                                                                         |
| All others        | No redaction — all other event payloads are public-safe (peek_chosen carries no indices, etc.).                                       |

The redaction table is encoded as a tiny pure function in `supabase/functions/_shared/redact.ts` so it can be unit-tested alongside the engine.

## Migration conventions

- Filename: `YYYYMMDDHHMMSS_short_description.sql` (use `supabase migration new`).
- Every migration includes its rollback as comments at the bottom (we don't run them automatically; useful for review).
- RLS is enabled in the same migration that creates the table — never separated.
- Never edit a migration after it's been applied to a shared environment. Add a new one instead.

## Local dev

```bash
bun run supabase:start          # boots Postgres + Realtime + Auth locally (requires Docker Desktop)
supabase db reset               # wipe + reapply migrations + seed
bun run supabase:functions      # serve edge functions for local testing
supabase status                 # show local connection details + keys
```

After `supabase start`, copy the printed `anon key` to `apps/mobile/.env.local` and the `service_role key` to `supabase/functions/.env`. See `apps/mobile/.env.example` and `supabase/functions/.env.example` for the exact variable names.

## PabloClient contract (what the mobile app expects)

The mobile app talks to the backend through the `PabloClient` interface defined in `apps/mobile/src/supabase/types.ts`. Phase 4 ships a mock implementation backed by `@pablo/engine` running in-process. Phase 6 swaps the import in `apps/mobile/src/supabase/index.ts` to a real implementation backed by this Supabase schema. The real client must match this surface exactly, because the app code never references mock-specific types.

```ts
type PabloClient = {
  signIn(): Promise<ClientResult<PlayerId>>;
  setDisplayName(name: string): Promise<ClientResult<void>>;
  getDisplayNames(ids: ReadonlyArray<PlayerId>): Promise<ClientResult<DisplayNameMap>>;
  subscribeDisplayNames(
    ids: ReadonlyArray<PlayerId>,
    onChange: (names: DisplayNameMap) => void,
  ): Unsubscribe;
  createRoom(opts: {
    rules?: Partial<GameRules>;
    maxPlayers?: number;
  }): Promise<ClientResult<Room>>;
  joinRoom(opts: { code: string }): Promise<ClientResult<Room>>;
  leaveRoom(opts: { roomId: RoomId }): Promise<ClientResult<void>>;
  startGame(opts: { roomId: RoomId }): Promise<ClientResult<GameId>>;
  returnToLobby(opts: { roomId: RoomId }): Promise<ClientResult<void>>;
  getActiveSession(): Promise<ClientResult<{ roomId; gameId; mode: 'online' } | null>>;
  applyMove(opts: {
    gameId: GameId;
    move: Move;
    idempotencyKey: string;
    expectedVersion: number;
  }): Promise<ClientResult<{ version: number }>>;
  subscribeRoom(roomId: RoomId, onChange: (room: Room) => void): Unsubscribe;
  subscribePlayerView(
    gameId: GameId,
    onChange: (view: PlayerView, version: number) => void,
  ): Unsubscribe;
  subscribeGameEvents(
    gameId: GameId,
    onChange: (events: ReadonlyArray<GameEvent>) => void,
  ): Unsubscribe;
};

type ClientResult<T> = { ok: true; data: T } | { ok: false; error: ClientErrorCode };
```

Mapping to this schema:

| `PabloClient` method    | Supabase implementation                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `signIn`                | `supabase.auth.signInAnonymously()`; resolves to the anon user id. The `auth.users` insert trigger auto-creates the `profiles` row. |
| `setDisplayName`        | `profiles.update({ display_name }).eq('id', auth.uid())` (RLS `update_own_profile`).                                                |
| `getDisplayNames`       | `profiles.select('id, display_name').in('id', ids)` (RLS `select_profiles_all`).                                                    |
| `subscribeDisplayNames` | One-shot fetch + `postgres_changes` channel on `profiles` filtered `id=in.(…)`; refetches on change.                                |
| `createRoom`            | RPC into the `create_room` SQL function (atomic room + first member insert).                                                        |
| `joinRoom`              | Edge function `joinRoom`.                                                                                                           |
| `leaveRoom`             | Edge function `leaveRoom`.                                                                                                          |
| `startGame`             | Edge function `startGame` (host only).                                                                                              |
| `returnToLobby`         | Edge function `returnToLobby` (host only, after round end).                                                                         |
| `getActiveSession`      | Query `room_members` → `rooms` where `status='playing'` and `current_game_id IS NOT NULL`.                                          |
| `applyMove`             | Edge function `applyMove` (idempotency + expectedVersion required).                                                                 |
| `subscribeRoom`         | `postgres_changes` subscription on `rooms` and `room_members` filtered by `room_id`.                                                |
| `subscribePlayerView`   | View stream: subscribe to broadcast `game:{gameId}`, fetch `getPlayerView` on tick. Callback receives `(view, version)`.            |
| `subscribeGameEvents`   | Event stream: same channel, on tick call `getEventsSince(lastSeenVersion)`. Callback receives batched events in version+seq order.  |

### `ClientErrorCode`

`ClientResult.error` is a typed discriminated union, not a free-form string. The current set lives in `apps/mobile/src/supabase/types.ts`. New error codes must be added there first so the mobile UI can surface a translated message via `error.<code>` in the i18n bundle.

- **Client/transport errors**: `not_found`, `version_mismatch`, `network_error`, `unauthenticated`, `not_authorized`, `room_full`, `room_not_joinable`, `internal_error`.
- **Engine `MoveError` codes** (passed through verbatim from `applyMove`): `not_your_turn`, `must_draw_first`, `already_drawn`, `pablo_already_called`, `pablo_blocked`, `invalid_hand_index`, `same_index`, `duplicate_indices`, `invalid_peek_count`, `already_peeked`, `discard_empty`, `power_pending`, `game_already_ended`, `not_in_game`, `not_peek_phase`, `peek_phase_active`, `unknown_move`, etc. (See `packages/engine/src/types.ts` for the full list.)

### Idempotency + versioning

- Every `applyMove` call carries a unique `idempotencyKey` (UUID per attempt, retried with the same key). The mock client caches successful results by key. The real client relies on `(game_id, idempotency_key) UNIQUE` on `game_moves`: a duplicate POST hits the conflict, the function `SELECT`s the cached version, and returns it without re-applying.
- `expectedVersion` is the version the client saw most recently in `subscribePlayerView`. The server compares against `games.version`; mismatch returns `version_mismatch` and the client should resubscribe (which triggers a fresh `getPlayerView`).

## Environment variables

Two `.env` files matter for local dev. Examples are committed, real values are gitignored.

### `apps/mobile/.env.local` (mobile client; `EXPO_PUBLIC_*` is inlined into the bundle)

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<from `supabase start` output>
```

The anon key is safe in the client (RLS is the line of defense). Do not put the service role key here.

### `supabase/functions/.env` (edge functions; loaded by `supabase functions serve`)

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<from `supabase start` output>
SUPABASE_ANON_KEY=<from `supabase start` output>
```

The service role key only ever appears in this file (and in hosted-project secrets once we deploy). It must never appear in `apps/mobile/`.
