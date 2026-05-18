# Phase 5 — Supabase backend implementation plan

> Status: **draft, awaiting user approval** for branch `phase-5-supabase` (off `main`).
>
> This plan, together with the same-PR rewrite of `docs/SCHEMA.md`, lands first. **No migrations, edge functions, or code are written until the user explicitly approves the plan** (per `AGENTS.md` hard rule #9).

## One-sentence goal

Stand up the full Supabase backend for Pablo — five tables with RLS, two SECURITY DEFINER SQL functions, six edge functions, and broadcast realtime — wired to `@pablo/engine` via a shared Deno import map, locally testable end-to-end through `@supabase/supabase-js`, without touching `apps/mobile` and without modifying the engine.

---

## Branch + workflow

- Branch: `phase-5-supabase` off `main`.
- This plan + the `docs/SCHEMA.md` rewrite ship in the same PR as the implementation (`AGENTS.md` hard rule #9).
- Default = **do not merge**. Push the branch and stop. The user says "merge" before any squash.
- `bun run check` (format + lint + typecheck + tests) must be clean on the final commit.
- New tests added: `bun test` covers (a) the redaction helper as a pure unit, and (b) an end-to-end integration test that boots `supabase start` and plays a full round through the edge functions.

### Hard constraints we will not violate

| Constraint                                                                                   | Where this plan enforces it                                                                                     |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `packages/engine` is read-only this phase                                                    | §3, §6. Any rule bug found here is flagged in `Open questions` and stopped before changing the engine.          |
| `apps/mobile` is read-only this phase                                                        | §0 only adds `apps/mobile/.env.example` and `apps/mobile/.env.local.example`-style hint files. No code changes. |
| Engine purity: no `expo`/`react`/`react-native`/`@supabase/*`/Node imports inside the engine | The Deno import map points at `packages/engine/src/index.ts` directly; the engine has no Deno-only branches.    |
| RLS in the same migration as `CREATE TABLE`                                                  | §1. Every migration is one table + its RLS + its indices.                                                       |
| `games` and `game_events` are service-role-only                                              | §1 migrations + §2 functions. Verified by an integration test that asserts `select` as `anon` returns 0 rows.   |
| Server-controlled seeds                                                                      | §4 `startGame` mints the seed via `crypto.getRandomValues` server-side. Client never supplies one.              |
| All randomness via `makeRng`                                                                 | §3 engine is reused as-is; no Deno `Math.random`.                                                               |
| Idempotency on every move                                                                    | §4 `applyMove` requires it; §2 `apply_move_atomic` enforces it via UNIQUE.                                      |
| Server-authoritative state                                                                   | §4 `applyMove` is the only path that mutates `games.state`; no client writes anywhere.                          |

---

## §0 Requirement → file mapping

Every "Must include" bullet in `docs/PLAN.md` § Phase 5, plus every change agreed in the SCHEMA rewrite, mapped to a concrete file.

| Requirement                                                                                                         | Lands in                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Migrations for `profiles`, `rooms`, `room_members`, `games`, `game_moves`, `game_events` with RLS in same migration | `supabase/migrations/20260518100000_init_profiles.sql` … `20260518100500_init_game_events.sql` (one file per table) |
| `auth.users` → `profiles` autoinsert trigger                                                                        | `supabase/migrations/20260518100000_init_profiles.sql`                                                              |
| `create_room` SECURITY DEFINER SQL function                                                                         | `supabase/migrations/20260518100600_fn_create_room.sql`                                                             |
| `apply_move_atomic` SECURITY DEFINER SQL function                                                                   | `supabase/migrations/20260518100700_fn_apply_move_atomic.sql`                                                       |
| Engine import via Deno imports map                                                                                  | `supabase/functions/deno.json` (`imports.@pablo/engine` → `../../packages/engine/src/index.ts`)                     |
| `joinRoom` edge function                                                                                            | `supabase/functions/joinRoom/index.ts` + `joinRoom.test.ts`                                                         |
| `leaveRoom` edge function                                                                                           | `supabase/functions/leaveRoom/index.ts` + `leaveRoom.test.ts`                                                       |
| `startGame` edge function                                                                                           | `supabase/functions/startGame/index.ts` + `startGame.test.ts`                                                       |
| `applyMove` edge function (handles all 12 Move variants, on/off-turn Pablo)                                         | `supabase/functions/applyMove/index.ts` + `applyMove.test.ts`                                                       |
| `getPlayerView` edge function                                                                                       | `supabase/functions/getPlayerView/index.ts` + `getPlayerView.test.ts`                                               |
| `getEventsSince` edge function with per-`auth.uid()` redaction                                                      | `supabase/functions/getEventsSince/index.ts` + `getEventsSince.test.ts`                                             |
| Per-player event redaction helper (pure)                                                                            | `supabase/functions/_shared/redact.ts` + `redact.test.ts`                                                           |
| Shared error/response shape matching `ClientResult<T>`                                                              | `supabase/functions/_shared/respond.ts`                                                                             |
| Shared `auth.uid()` extractor + room-membership guard                                                               | `supabase/functions/_shared/auth.ts`                                                                                |
| Anonymous auth enabled in `config.toml`                                                                             | `supabase/config.toml` (flip `[auth].enable_anonymous_sign_ins` to `true`)                                          |
| Integration test that plays full game including peek, match success+fail, off-turn Pablo, reshuffle                 | `tests/integration/supabase.test.ts` + `tests/integration/helpers.ts`                                               |
| `.env` example + gitignore hygiene                                                                                  | `apps/mobile/.env.example`, `supabase/functions/.env.example`, `.gitignore` additions                               |
| `docs/SCHEMA.md` updated to match reality                                                                           | `docs/SCHEMA.md` (rewritten in the same PR as this plan; see commit)                                                |
| `docs/PLAN.md` updated (Phase 5 → Done, Decisions Made appended)                                                    | `docs/PLAN.md` (last commit before merge)                                                                           |

Files **not** touched:

- `packages/engine/**` — read-only.
- `apps/mobile/**` — Phase 6 swaps the client; Phase 5 only adds `apps/mobile/.env.example`.
- `docs/GAME_LOGIC.md` — no rule changes.

### Full file tree this PR will touch

```
supabase/
├── config.toml                                       (modify: enable_anonymous_sign_ins = true)
├── migrations/
│   ├── 20260518100000_init_profiles.sql              (new)
│   ├── 20260518100100_init_rooms.sql                 (new)
│   ├── 20260518100200_init_room_members.sql          (new)
│   ├── 20260518100300_init_games.sql                 (new)
│   ├── 20260518100400_init_game_moves.sql            (new)
│   ├── 20260518100500_init_game_events.sql           (new)
│   ├── 20260518100600_fn_create_room.sql             (new)
│   └── 20260518100700_fn_apply_move_atomic.sql       (new)
└── functions/
    ├── deno.json                                     (new — imports map)
    ├── .env.example                                  (new — SUPABASE_URL + keys)
    ├── _shared/
    │   ├── auth.ts                                   (new)
    │   ├── respond.ts                                (new)
    │   ├── redact.ts                                 (new — per-player event redaction)
    │   ├── supabaseAdmin.ts                          (new — service-role client factory)
    │   └── redact.test.ts                            (new)
    ├── joinRoom/
    │   ├── index.ts                                  (new)
    │   └── joinRoom.test.ts                          (new)
    ├── leaveRoom/
    │   ├── index.ts                                  (new)
    │   └── leaveRoom.test.ts                         (new)
    ├── startGame/
    │   ├── index.ts                                  (new)
    │   └── startGame.test.ts                         (new)
    ├── applyMove/
    │   ├── index.ts                                  (new)
    │   └── applyMove.test.ts                         (new)
    ├── getPlayerView/
    │   ├── index.ts                                  (new)
    │   └── getPlayerView.test.ts                     (new)
    └── getEventsSince/
        ├── index.ts                                  (new)
        └── getEventsSince.test.ts                    (new)

apps/mobile/
└── .env.example                                      (new — EXPO_PUBLIC_SUPABASE_URL + anon key placeholder)

tests/
└── integration/
    ├── supabase.test.ts                              (new — full-round end-to-end against local stack)
    └── helpers.ts                                    (new — anon sign-in, RPC wrappers)

.gitignore                                            (modify — explicit supabase/functions/.env coverage)
docs/SCHEMA.md                                        (rewritten — same PR as plan)
docs/PLAN.md                                          (modify — Phase 5 → Done, Decisions Made)
docs/plans/phase-5-supabase.md                        (this file)
```

---

## §1 Migrations (one table per file, RLS inline)

Each migration: `CREATE TABLE` → indices → `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` → `CREATE POLICY` × N → rollback comments at the bottom.

### `20260518100000_init_profiles.sql`

- `profiles` table per `docs/SCHEMA.md` § profiles.
- Trigger: `handle_new_user()` function + `AFTER INSERT ON auth.users` trigger that inserts a matching `profiles` row.
- Policies: `select_profiles_all` (any authenticated), `update_own_profile` (`id = auth.uid()`).

### `20260518100100_init_rooms.sql`

- `rooms` per SCHEMA.
- Policy: `select_rooms_authenticated`, `update_own_room` (`host_id = auth.uid()`). No `INSERT`/`DELETE` policies — only `create_room()` (SECURITY DEFINER) inserts; `leaveRoom` deletes via service role.

### `20260518100200_init_room_members.sql`

- `room_members` per SCHEMA.
- `(room_id, seat) UNIQUE` index inline.
- Policy: `select_room_members_for_members_only` (`EXISTS (...)`). `INSERT`/`DELETE` via edge functions (service role bypasses RLS).

### `20260518100300_init_games.sql`

- `games` per SCHEMA, including `engine_version`, `created_at`.
- Partial unique index `games_one_live_per_room`.
- Policy: `deny_all_games_for_authenticated` (`USING (false)` and `WITH CHECK (false)`).

### `20260518100400_init_game_moves.sql`

- `game_moves` per SCHEMA, including `(game_id, idempotency_key) UNIQUE`.
- Policy: `deny_all_game_moves_for_authenticated`.

### `20260518100500_init_game_events.sql`

- `game_events` per SCHEMA, including `(game_id, version, seq) UNIQUE` + `(game_id, version)` btree.
- Policy: `deny_all_game_events_for_authenticated`.

### `20260518100600_fn_create_room.sql`

- `create_room(p_rules jsonb, p_max_players int) RETURNS rooms` SECURITY DEFINER.
- Generates code (base32, no ambiguous chars), retries on UNIQUE collision up to 5x, inserts row + seat 0 member atomically.
- `GRANT EXECUTE` to `authenticated`.

### `20260518100700_fn_apply_move_atomic.sql`

- `apply_move_atomic(...)` SECURITY DEFINER per SCHEMA.
- `GRANT EXECUTE` to `service_role` only (edge functions call it directly).

---

## §2 Shared edge-function helpers

### `supabase/functions/deno.json`

```json
{
  "imports": {
    "@pablo/engine": "../../packages/engine/src/index.ts",
    "supabase": "https://esm.sh/@supabase/supabase-js@2"
  },
  "lint": { "rules": { "tags": ["recommended"] } }
}
```

Verified locally that this resolves engine imports without a build step (Deno reads TS sources directly; the engine has no runtime deps).

### `_shared/respond.ts`

```ts
export type ClientErrorCode = /* mirrors apps/mobile/src/supabase/types.ts */;
export const ok = <T>(data: T) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
export const err = (code: ClientErrorCode, status = 200) => new Response(JSON.stringify({ ok: false, error: code }), { status, headers: { 'Content-Type': 'application/json' } });
```

### `_shared/auth.ts`

- `getCallerId(req: Request): Promise<{ uid: string } | { error: 'unauthenticated' }>` — extracts and verifies the JWT.
- `assertRoomMember(supabase, uid, roomId)` — single SELECT against `room_members`.

### `_shared/supabaseAdmin.ts`

- Returns a service-role-keyed supabase client from `Deno.env.get('SUPABASE_URL')` + `SUPABASE_SERVICE_ROLE_KEY`. Singleton per worker.

### `_shared/redact.ts`

Pure function: `redactEventsFor(uid: string, events: GameEvent[]): GameEvent[]`. Table-driven:

- `peeked` where `playerId !== uid`: replace `cardId` with `null` (or omit; integration test verifies the null branch).
- All other event types: pass through unchanged.

The redaction is intentionally narrow — every other engine event was designed in Phase 2.5 to be public-safe.

### `_shared/redact.test.ts`

- Pure unit test under `bun test` (Deno-side functions are pure TS so they execute under Bun).
- Cases: (a) peeked-by-me passes through, (b) peeked-by-other gets cardId nulled, (c) all 14 other event types pass through unchanged, (d) order preserved.

---

## §3 Engine reuse from Deno

- Engine is consumed via the import map.
- The engine has no Deno-incompatible code today (verified: no `process`, no `Buffer`, no `Node:*`).
- We deliberately do **not** vendor or bundle the engine into `supabase/functions/_shared/`. The import map is the single source.
- If a future engine change adds Deno-incompatible code, the lint rule in `packages/engine/.eslintrc` (no Node built-ins) will flag it first.

---

## §4 Edge functions (per-function plan)

All functions:

1. Verify caller via `getCallerId` (return `unauthenticated` if absent).
2. Validate input shape (return `internal_error` with a logged message if malformed).
3. Run the per-function logic below.
4. Return JSON via `_shared/respond.ts`.

### `joinRoom` — `POST { code: string }`

- Look up `rooms` by `code`. If not found → `not_found`.
- If `status !== 'waiting'` → `room_not_joinable`.
- Count current members. If `>= max_players` → `room_full`.
- Find lowest unused seat. Insert into `room_members(room_id, user_id, seat)`.
- Return `{ room: Room }`.

### `leaveRoom` — `POST { roomId: string }`

- Verify caller is a member.
- Delete the row.
- If the room is now empty, delete the room (cascades to games/moves/events).
- Return `{}`.

### `startGame` — `POST { roomId: string }`

- Verify caller is the host of the room.
- Verify room `status === 'waiting'`.
- Load `room_members` ordered by `seat ASC`; build `players: PlayerId[]`.
- Mint seed: `crypto.randomUUID()` server-side.
- Call `engine.newGame({ id: crypto.randomUUID(), players, seed, rules: room.rules })`.
- Insert `games` row with `state`, `version=0`, `engine_version=1`.
- Update `rooms.status='playing'`.
- Broadcast `{ version: 0 }` on `game:{gameId}`.
- Return `{ gameId }`.

### `applyMove` — `POST { gameId, move, idempotencyKey, expectedVersion }`

- Verify caller is a member of the game's room.
- Verify `move.playerId === auth.uid()` (the only authority on whose move it is).
- Load `games` row for `gameId`. If not found → `not_found`.
- If `games.version !== expectedVersion` → `version_mismatch`.
- Check `game_moves` for an existing row with the same `idempotency_key`. If found, return its cached `{ version }`.
- Call `engine.applyMove(state, move)`. If `!ok` → return the engine's `error` verbatim (it's a valid `ClientErrorCode` because `MoveError ⊂ ClientErrorCode`).
- Call `apply_move_atomic(gameId, newState, version+1, engine_version, move, events, uid, idempotencyKey)`.
- Broadcast `{ version: version+1 }` on `game:{gameId}`.
- Return `{ version: version+1 }`.

### `getPlayerView` — `POST { gameId }`

- Verify caller is a member of the game's room.
- Load `games.state` + `version`.
- Return `{ view: engine.computePlayerView(state, uid), version }`.

### `getEventsSince` — `POST { gameId, sinceVersion }`

- Verify caller is a member of the game's room.
- Load `game_events WHERE game_id = $1 AND version > $2 ORDER BY version ASC, seq ASC`.
- Load current `games.version`.
- `events = redactEventsFor(uid, rows.map(r => r.event))`.
- Return `{ events, currentVersion }`.

---

## §5 Realtime broadcast

- Channel name: `game:{gameId}` (a single channel per game).
- Publisher: the `applyMove` and `startGame` edge functions, using the service-role supabase client's `channel(...).send({ type: 'broadcast', event: 'tick', payload: { version } })`.
- Subscriber (Phase 6's `realClient`): `supabase.channel('game:' + gameId).on('broadcast', { event: 'tick' }, cb).subscribe()`.
- Phase 5 verifies the broadcast lands via the integration test (subscribes from the test process and asserts a tick fires per move).

---

## §6 Engine boundary

- Engine is imported as `@pablo/engine` everywhere on the Deno side.
- `engine.newGame`, `engine.applyMove`, `engine.computePlayerView` are the only entry points used by edge functions.
- No engine module is mutated, copied, or re-implemented.
- Test plan asserts that an unmodified engine works under Deno (the integration test will fail loudly if Deno can't load the engine sources).

---

## §7 Integration test plan (`tests/integration/supabase.test.ts`)

A single Bun test file that:

1. Asserts `supabase status` is healthy (skip with a clear message otherwise — local-only test).
2. Resets the local DB via `supabase db reset` to a known state.
3. Creates four anonymous users via `supabase.auth.signInAnonymously()` (one host + three players).
4. Host calls `create_room` → joins via RPC; other three call `joinRoom`.
5. Host calls `startGame`. Asserts the game is in `peek_phase` via `getPlayerView`.
6. Each player calls `applyMove({ type: 'choose_peek', indices: [0, 1] })`. After the last one, `getPlayerView` shows `status='playing'` and `currentPlayerId === players[0]`.
7. Drive a scripted sequence of moves through `applyMove` that exercises:
   - One successful `match_drawn` (deterministic via seed manipulation).
   - One failed `match_discard` → assert a penalty `card_drawn` event fires + hand grows.
   - One off-turn `call_pablo` → assert `pabloCalledBy` set, current player can finish their turn.
   - One forced reshuffle (engineer the scenario via a tiny seed that exhausts the deck within a few turns).
8. After `round_ended`, `getPlayerView` shows `status='ended'` and `scores` are populated.
9. Repeats `getEventsSince(gameId, 0)` from each player's auth context and asserts:
   - All four see the same number of events.
   - Only the peeker sees the real `cardId` on `peeked` events; others see `null`.
10. Concurrency: submit the same move twice with the same `idempotencyKey` and assert only one version bump.
11. Optimistic-concurrency: submit a move with a stale `expectedVersion` and assert `version_mismatch`.

> **Determinism note.** The engine's seed determines deck order. To make the test reliably exercise `match_drawn` etc., the test will iterate seeds until it finds one that puts the target ranks where it needs them; the seed is then pinned in the test file. This is the same pattern Phase 4's mock-client tests use.

---

## §8 Local dev workflow this PR validates

1. `bun install` (no new package deps on the Bun side — integration test uses `@supabase/supabase-js`, which we'll add as a workspace devDep at the root).
2. `bun run supabase:start` (boots Docker stack; first run pulls ~1.5 GB of images).
3. Copy printed `anon key` → `apps/mobile/.env.local`, `service_role key` → `supabase/functions/.env`.
4. `bun run supabase:functions` (serves edge functions on `localhost:54321/functions/v1`).
5. `bun test tests/integration/supabase.test.ts` — passes.
6. `bun run check` — clean.

---

## §9 Design decisions (settled with the user in this round)

These mirror the locked answers in the "open questions" exchange. I'm restating them here so future readers don't have to mine the chat.

| #   | Decision                                                                                                                                                  | Why                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Realtime view stream is a **broadcast** message on `game:{gameId}`, not `postgres_changes` on `games`.                                                    | `games` is service-role deny-all; `postgres_changes` respects RLS and would deliver nothing. Broadcast bypasses RLS for the publisher.         |
| 2   | `game_events` is **service-role deny-all**; clients fetch via `getEventsSince` which redacts per `auth.uid()`.                                            | The `peeked` event carries a private `cardId`. Row-level read access would leak.                                                               |
| 3   | `get_player_view` is an **edge function**, not a SQL function.                                                                                            | The projection logic lives in TypeScript (`packages/engine/src/playerView.ts`). Re-implementing in PL/pgSQL would violate engine-purity rule.  |
| 4   | Engine imported via Deno `imports` map in `supabase/functions/deno.json`, aliasing `@pablo/engine` → relative path.                                       | Cheapest option; no build step; matches Bun-side specifier; one file to maintain.                                                              |
| 5   | Idempotency primary key lives on a new **`game_moves` table** (`UNIQUE (game_id, idempotency_key)`).                                                      | Multiple events per move makes "which event row" ambiguous; a 1:1 moves table is cleaner and supports future replay/audit.                     |
| 6   | `auth.users` insert trigger auto-creates the matching `profiles` row.                                                                                     | Less ceremony in the client; the row is always there post-sign-in.                                                                             |
| 7   | `enable_anonymous_sign_ins = true` flipped in `supabase/config.toml`.                                                                                     | Anonymous-first is in `AGENTS.md` § Stack.                                                                                                     |
| 8   | Bots are NOT modelled as `room_members` in Phase 5. The mock client keeps owning the single-player-vs-bots mode. Online bots are a future-phase question. | Bots are a single-player concept; adding a bot scheduler edge function is meaningful work that doesn't validate the multiplayer happy path.    |
| 9   | Hosted Supabase project is NOT provisioned in Phase 5. Local-only.                                                                                        | PLAN.md is explicit; Phase 6 prep will handle provisioning.                                                                                    |
| 10  | Integration tests run under `bun test` driving `@supabase/supabase-js` against the local stack.                                                           | Stays in the existing test runner; covered by `bun run check`.                                                                                 |
| 11  | Drop `rooms.status = 'finished'`. Rooms only have `'waiting'` and `'playing'`; "dead" rooms get hard-deleted.                                             | Phase 2.5 single-round games make `'finished'` meaningless ("game over, click play again" loops back to waiting/playing); deletion is cleaner. |
| 12  | Add `(room_id, seat) UNIQUE` on `room_members`, `games_one_live_per_room` partial unique on `games`, `(game_id, version)` index on `game_events`.         | Defense-in-depth + query performance for catch-up. Cheap.                                                                                      |
| 13  | Add `games.engine_version int NOT NULL DEFAULT 1`, `games.created_at`.                                                                                    | Future engine state-shape changes need a discriminator; `created_at` is hygiene.                                                               |
| 14  | Server mints `seed` for `engine.newGame` via `crypto.randomUUID()` in `startGame`.                                                                        | Clients cannot influence randomness; cheat-proofing.                                                                                           |

---

## §10 Open questions for the user (small, can be answered alongside plan approval)

These are tractable enough that I'll proceed with my recommendation if you don't push back, but flagging so we don't have to retrofit.

1. **Code character set.** I'm proposing base32-no-ambiguous (no `O`, `0`, `I`, `1`, `L`) for `rooms.code` — 27 chars, 6 long, ~387M permutations. Good for human-typing; collisions are statistically negligible at our scale. **Default: yes, this.** Push back if you'd rather have a different scheme.
2. **`max_players` ceiling.** SCHEMA caps `2..6`. Engine supports `2..N` in principle but `cardCatalog` is 52 cards, so > ~6 starts to feel cramped. **Default: keep `CHECK (max_players BETWEEN 2 AND 6)`.**
3. **`leaveRoom` of the host with other members present.** Options: (a) reject; (b) promote the next seat to host; (c) allow and let the room run with a missing host (host_id stays pointing at the gone profile until the room dies). **Default: (b).** Cheap and unsurprising.
4. **Engine-level `MoveError` codes the edge function should map to client-transport codes.** Most pass through as-is. The only one that's ambiguous is `not_in_game` — should that map to `not_authorized` for callers who aren't members? **Default: yes**, so we don't leak game existence to non-members.
5. **Integration test budget.** End-to-end test that boots Docker + plays a full game = ~30s on a warm laptop, slower on first run. **Default: gate it behind an env flag** (`PABLO_RUN_INTEGRATION=1 bun test`) so `bun run check` stays fast for everyday iteration. Default `bun run check` skips it; CI / pre-merge runs it explicitly.
6. **Realtime broadcast channel name.** `game:{gameId}` is direct; an alternative is `room:{roomId}` (so spectators of a single room can follow many games in sequence). **Default: `game:{gameId}`.** One game per room at a time anyway.

---

## §11 Risks and how this plan mitigates them

| Risk                                                                      | Mitigation                                                                                                                                                     |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deno can't resolve `@pablo/engine` via import map                         | §2 verified manually; if it fails, fall back to a relative import — engine is still the single source.                                                         |
| Service-role key accidentally lands in `apps/mobile/`                     | `.gitignore` covers `apps/mobile/.env*`; `apps/mobile/.env.example` only references `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Lint check in §13.                        |
| `peeked.cardId` leaks                                                     | `game_events` is deny-all; `redact.ts` is unit-tested for every event variant.                                                                                 |
| Two clients call `applyMove` concurrently with the same `expectedVersion` | `apply_move_atomic` updates `games WHERE id = ... AND version = expected`; one wins, the other gets 0 rows updated → edge function returns `version_mismatch`. |
| Network retry causes duplicate `applyMove`                                | `(game_id, idempotency_key) UNIQUE` on `game_moves`; the function catches the conflict and returns the cached version.                                         |
| Engine throws inside the edge function (unexpected bug)                   | Wrap `engine.applyMove` in `try/catch`; on throw, log and return `internal_error` — never persist partial state.                                               |
| Local stack not running when integration test fires                       | §10 question 5: gate behind env flag; non-gated runs skip with a clear message.                                                                                |
| `supabase functions serve` doesn't pick up the import map                 | Shared `deno.json` lives at `supabase/functions/deno.json` which the CLI auto-detects. Verified during §2.                                                     |

---

## §12 Out of scope (do not implement in this PR)

- Anything in `apps/mobile/` beyond `.env.example`.
- Modifying the engine.
- Hosted Supabase project.
- Multi-round / best-of-N / `sessions` table.
- Friends / matchmaking / lobby browser.
- Push notifications.
- Soft delete for rooms or games (hard delete via cascade is the v1 contract).
- Admin / moderation surfaces.
- A `getMoveLog` / replay endpoint (table exists, endpoint deferred).

---

## §13 Self-review checklist (run before pushing the branch)

Per `AGENTS.md` § "How to self-review before merging":

- [ ] `bun run check` — typecheck + lint + format-check + tests all green (including the redact unit test).
- [ ] `PABLO_RUN_INTEGRATION=1 bun test tests/integration/supabase.test.ts` — passes against a fresh `supabase start` + `supabase db reset`.
- [ ] Re-read every file in the diff (`git diff main...HEAD`). Specifically check:
  - No `Math.random()` or `Date.now()` in edge functions (engine-purity rule extended).
  - No `service_role` key referenced from any file under `apps/mobile/`.
  - Every `CREATE TABLE` is followed by `ENABLE ROW LEVEL SECURITY` in the same file.
  - `getEventsSince` redacts before returning (not after).
  - `applyMove` checks `move.playerId === auth.uid()` before calling the engine.
  - All edge function responses are 200 unless 4xx is semantic; the discriminator is in the body.
- [ ] `docs/SCHEMA.md` matches the migrations exactly.
- [ ] `docs/PLAN.md` updated — Phase 5 moved to Done; new Decisions Made rows appended for the locked items in §9.
- [ ] `docs/GAME_LOGIC.md` untouched (no rule changes in this PR).
- [ ] Self-fork lint: an `apps/mobile`-side `grep` for `SUPABASE_SERVICE_ROLE_KEY` returns zero hits.

---

## §14 Definition of Done (from `docs/PLAN.md`)

- `bun run supabase:start && bun run supabase:functions` works on a clean machine (Docker assumed).
- Integration test plays a full game end-to-end through edge functions, exercising peek_phase → matches → off-turn Pablo → round_ended.
- `docs/SCHEMA.md` matches reality; any deviations documented.
- Branch pushed; user explicitly says "merge" before any squash to `main`.
