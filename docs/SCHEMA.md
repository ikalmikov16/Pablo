# SCHEMA — Supabase Layer

How the Supabase side fits together. The Phase 5 agent implements this; the engine team can read it for context. The mobile app (`apps/mobile`) consumes the backend through the `PabloClient` interface — see the "PabloClient contract" section at the bottom for what Phase 5 must expose.

## Philosophy

1. **The client subscribes to per-player projections, never raw `games` rows.** This is how we keep hidden cards hidden.
2. **All state mutations go through edge functions.** No client-side `update` to `games`. RLS denies it.
3. **Engine is the only place rules live.** Edge functions are thin wrappers: load state, validate move via `applyMove`, write back, broadcast.
4. **Idempotency keys on every mutation.** Network retries must not duplicate moves.

## Tables

### `profiles`

| Column         | Type          | Notes                         |
| -------------- | ------------- | ----------------------------- |
| `id`           | `uuid` PK     | references `auth.users.id`    |
| `display_name` | `text`        | nullable until user picks one |
| `created_at`   | `timestamptz` | default `now()`               |

RLS: users can read all profiles; users can only update their own.

### `rooms`

Lobby metadata. Lightweight, fully public read.

| Column        | Type          | Notes                                  |
| ------------- | ------------- | -------------------------------------- |
| `id`          | `uuid` PK     |                                        |
| `code`        | `text` UNIQUE | 6-char join code                       |
| `host_id`     | `uuid`        | references `profiles.id`               |
| `status`      | `text`        | `'waiting' \| 'playing' \| 'finished'` |
| `rules`       | `jsonb`       | a `GameRules` object                   |
| `max_players` | `int`         | default 4                              |
| `created_at`  | `timestamptz` |                                        |

RLS: anyone can read rooms (so people can join by code). Only the host can update.

### `room_members`

| Column      | Type               | Notes                    |
| ----------- | ------------------ | ------------------------ |
| `room_id`   | `uuid`             | references `rooms.id`    |
| `user_id`   | `uuid`             | references `profiles.id` |
| `seat`      | `int`              | 0..max_players-1         |
| `joined_at` | `timestamptz`      |                          |
| PK          | (room_id, user_id) |                          |

RLS: members of a room can read the membership list; insert only via `joinRoom` edge function.

### `games`

The full authoritative state. **Restricted.** Clients never read this directly.

| Column       | Type          | Notes                                                                |
| ------------ | ------------- | -------------------------------------------------------------------- |
| `id`         | `uuid` PK     |                                                                      |
| `room_id`    | `uuid`        | references `rooms.id`                                                |
| `state`      | `jsonb`       | full `GameState` blob (engine type)                                  |
| `version`    | `bigint`      | monotonic, bumped on every mutation; used for optimistic concurrency |
| `updated_at` | `timestamptz` |                                                                      |

RLS: deny all client reads and writes. Only `service_role` (edge functions) can touch.

### `game_views` (Postgres view, NOT a table)

A `SECURITY DEFINER` Postgres function `get_player_view(game_id uuid)` that:

1. Loads the `games.state`
2. Verifies `auth.uid()` is a member of the corresponding room
3. Returns the projection for that player (hides other players' hidden card values, hides deck order)

Clients call `supabase.rpc('get_player_view', { game_id })` and subscribe to `games` row changes for that game (broadcast-only, no payload), then re-fetch the projection on change.

### `game_events`

Append-only event log. Useful for replays, audit, and animation timing on the client.

| Column       | Type           | Notes                                       |
| ------------ | -------------- | ------------------------------------------- |
| `id`         | `bigserial` PK |                                             |
| `game_id`    | `uuid`         | references `games.id`                       |
| `version`    | `bigint`       | matches the `games.version` after the event |
| `event`      | `jsonb`        | a `GameEvent` from the engine               |
| `created_at` | `timestamptz`  |                                             |

RLS: room members can read events for games in their room (but events are pre-projected, so they only contain info that player is allowed to see).

## Edge Functions

All live in `supabase/functions/`. All written in TypeScript, run on Deno. All import the engine via a deno-compatible bundle or direct `.ts` imports.

| Function    | Purpose                   | Inputs                                              | Side effects                                                                                                                                                                         |
| ----------- | ------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `joinRoom`  | Add caller to a room      | `{ roomCode }`                                      | inserts `room_members` row                                                                                                                                                           |
| `leaveRoom` | Remove caller from a room | `{ roomId }`                                        | deletes row; if last member, deletes room                                                                                                                                            |
| `startGame` | Host starts the game      | `{ roomId }`                                        | calls `engine.newGame`, inserts `games` row in `status='peek_phase'`, updates `rooms.status`                                                                                         |
| `applyMove` | Submit any move           | `{ gameId, move, idempotencyKey, expectedVersion }` | calls `engine.applyMove`, writes new state, appends to `game_events`. Handles `choose_peek`, the five turn options, power resolution, and `call_pablo` (on- and off-turn) uniformly. |

> Phase 2.5 collapsed `callPablo` into `applyMove`. `call_pablo` is just one of `Move`'s variants — no separate endpoint.

All functions:

- Verify `auth.uid()` is allowed to perform the action
- Use `expectedVersion` for optimistic concurrency — reject stale moves
- Use `idempotencyKey` (UUID per move attempt) for retry safety
- Return either `{ ok: true, version }` or `{ ok: false, error }`

## Realtime

Two parallel streams per game, both filtered by `game_id`:

1. **View stream** — clients subscribe to Postgres changes on `games` for their `game_id`. The payload is blocked by RLS; the change is just a "state changed" tick. On every tick the client calls `get_player_view(game_id)` and emits the new `(view, version)` pair to the in-app `PabloClient.subscribePlayerView` callback. (`version` comes from the `games.version` column.)
2. **Event stream** — clients subscribe to `INSERT`s on `game_events` for their `game_id`, batching all rows whose `version > lastSeenVersion`. Each batch is emitted to `PabloClient.subscribeGameEvents`. Events drive the animation layer; the view stream remains the source of truth for state.

This pattern is simple and cheat-proof: clients never see hidden data, and the two streams arrive in the order moves were applied (version-monotonic).

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

## PabloClient contract (what the mobile app expects)

The mobile app talks to the backend through the `PabloClient` interface defined in `apps/mobile/src/supabase/types.ts`. Phase 4 ships a mock implementation backed by `@pablo/engine` running in-process. Phase 6 swaps the import in `apps/mobile/src/supabase/index.ts` to a real implementation backed by this Supabase schema. The real client must match this surface exactly, because the app code never references mock-specific types.

```ts
type PabloClient = {
  signIn(): Promise<ClientResult<PlayerId>>;
  createRoom(opts: {
    rules?: Partial<GameRules>;
    maxPlayers?: number;
  }): Promise<ClientResult<Room>>;
  joinRoom(opts: { code: string }): Promise<ClientResult<Room>>;
  leaveRoom(opts: { roomId: RoomId }): Promise<ClientResult<void>>;
  startGame(opts: { roomId: RoomId }): Promise<ClientResult<GameId>>;
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

| `PabloClient` method  | Supabase implementation                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `signIn`              | `supabase.auth.signInAnonymously()`; resolves to the anon user id.                                                        |
| `createRoom`          | RPC into a `create_room` SQL function (so RLS is enforced + atomic).                                                      |
| `joinRoom`            | Edge function `joinRoom` (checks code, inserts `room_members`).                                                           |
| `leaveRoom`           | Edge function `leaveRoom`.                                                                                                |
| `startGame`           | Edge function `startGame` (host only).                                                                                    |
| `applyMove`           | Edge function `applyMove` (idempotency + expectedVersion required).                                                       |
| `subscribeRoom`       | Postgres-changes subscription on `rooms` + `room_members` filtered by `room_id`.                                          |
| `subscribePlayerView` | View stream above. Callback receives the new projection and `games.version`.                                              |
| `subscribeGameEvents` | Event stream above. Callback receives one or more `game_events` rows since the last delivery, in version-ascending order. |

### `ClientErrorCode`

`ClientResult.error` is a typed discriminated union, not a free-form string. The current set lives in `apps/mobile/src/supabase/types.ts`. New error codes must be added there first so the mobile UI can surface a translated message via `error.<code>` in the i18n bundle.

- **Client/transport errors**: `not_found`, `version_mismatch`, `network_error`, `unauthenticated`, `not_authorized`, `room_full`, `room_not_joinable`, `internal_error`.
- **Engine `MoveError` codes** (passed through verbatim from `applyMove`): `not_your_turn`, `must_draw_first`, `already_drawn`, `pablo_already_called`, `pablo_blocked`, `invalid_hand_index`, `same_index`, `duplicate_indices`, `invalid_peek_count`, `already_peeked`, `discard_empty`, `power_pending`, `game_already_ended`, `not_in_game`, `not_peek_phase`, `peek_phase_active`, `unknown_move`, etc. (See `packages/engine/src/types.ts` for the full list.)

### Idempotency + versioning

- Every `applyMove` call carries a unique `idempotencyKey` (UUID per attempt, retried with the same key). The mock client caches successful results by key; the real client persists the (gameId, idempotencyKey) → version mapping so a duplicate POST returns the same version without re-applying.
- `expectedVersion` is the version the client saw most recently in `subscribePlayerView`. The server compares against `games.version`; mismatch returns `version_mismatch` and the client should resubscribe.
