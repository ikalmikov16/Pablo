# Phase 6 — Multiplayer wiring

**Branch**: `phase-6-multiplayer` · **Status**: squash-merged to `main` (2026-06-10) · **Token budget**: $$$
**Model**: claude-4.6-sonnet medium thinking + Opus for the tick sequencer / reconnection race bits.

> Read `AGENTS.md` § "Branch / PR workflow" and `docs/SCHEMA.md` before touching code.
> The plan ships in the same PR as the implementation. Do NOT merge until the user says "merge".

---

## Goal (one sentence)

Make two real iPhones play a full Pablo game against each other over Supabase by giving the
app a real `PabloClient` (Supabase-backed), a lobby (create / join-by-code / start), persisted
anonymous auth, and cold-launch reconnection — **without breaking the existing single-player
vs-bots flow**, which keeps running on the in-process mock.

---

## Context: what already exists (so this is mostly wiring)

- **Backend is complete (Phase 5, on `main`).** Edge functions `joinRoom`, `leaveRoom`,
  `startGame`, `applyMove`, `getPlayerView`, `getEventsSince`; the `create_room` SQL RPC;
  `apply_move_atomic`. Every successful mutation broadcasts a `{ version }` tick on channel
  `game:{gameId}`.
- **The seam is clean.** The whole app talks to one `PabloClient` interface
  (`apps/mobile/src/supabase/types.ts`). `mockClient.ts` implements it in-process today;
  `realClient.ts` is a stub that throws.
- **`docs/SCHEMA.md` already specifies the real-client mapping** (§ "PabloClient contract",
  § "Realtime"): `subscribePlayerView` = subscribe to broadcast + `getPlayerView` on tick;
  `subscribeGameEvents` = same channel + `getEventsSince(lastSeen)` on tick; `subscribeRoom`
  = `postgres_changes` on `rooms` / `room_members`.
- **`@supabase/supabase-js` is already a workspace dep** (used by `tests/integration`), but is
  **not yet a dependency of `apps/mobile`** and is not wired for React Native.
- **`.env.example`** exists for mobile (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`).

### Decisions locked with the user before this plan

1. **Keep BOTH clients.** Mock for offline vs-bots, real for multiplayer, selected **per route**
   (no single global singleton). `createRealClient()` does NOT implement `addBotsToRoom`.
2. **Add `getActiveSession()` to `PabloClient`** — resolves the player's in-progress room + game
   on launch, implemented in both mock and real.
3. **Accept round-trip latency for online moves** (the client holds only a `PlayerView`, not the
   full `GameState`, so it cannot authoritatively predict the next view for hidden-card moves).
   Mask latency with the existing flight animations + a "submitting" input lock. The optimistic-UI
   rule in `.cursor/rules/ui.mdc` is explicitly relaxed for online play (documented below).

---

## Gaps in the current backend this phase must close

These were discovered while writing the plan; they are small and additive.

### G1 — Non-host members (and reconnecting clients) cannot discover the `gameId`

`games` is **service-role deny-all** to clients, and there is no link from a room to its current
game that a client can read. The host learns `gameId` from `startGame`'s return value, but:

- **Joiners never learn it.** When the host starts the game, members only see (via
  `postgres_changes` on `rooms`) that `status` flipped to `'playing'`. They have no `gameId`, so
  they cannot subscribe to `game:{gameId}`.
- **Reconnection can't resolve it.** A relaunching client can read its `room_members` / `rooms`
  rows (RLS allows it) but cannot read `games`.

**Fix (chosen): add a nullable `current_game_id uuid` column to `rooms`** (RLS-readable by all
authenticated users, same as the rest of the row). `startGame` sets it; round-end / `leaveRoom`
clears it. This single RLS-readable field solves BOTH lobby "the game started, here's the id" and
reconnection in one place, with no new edge function. New migration (never edit an applied one).

> Alternative considered: a `getActiveGame({ roomId })` edge function. Rejected — more RPC surface
> and an extra round-trip for something a single readable column expresses declaratively, and which
> `postgres_changes` can push to the lobby for free.

### G2 — "Play again" online has no path

`startGame` requires `rooms.status='waiting'`, but after a game the room is `'playing'`. Single-round
"play again" needs to return the room to `'waiting'` (and clear `current_game_id`) before the host can
start a fresh game. See Workstream E.

---

## Architecture: per-route client selection

The `(game)/[gameId]` route is shared by offline and online games, so we cannot pick the client by
route group alone. Approach:

- **`apps/mobile/src/supabase/ClientProvider.tsx`** — a React context exposing `usePabloClient()`.
- The **client kind is carried in the route param**: `/(game)/[gameId]?mode=online|offline`. The
  game `_layout.tsx` reads `mode`, resolves the matching client (memoised module singletons:
  `getMockClient()` / `getRealClient()`), and provides it via `ClientProvider`.
- **Cold launch into a game is always `online`** (offline games don't survive a process kill), so
  the reconnection resolver always hands back `mode=online`.
- The game screen (`index.tsx`) and layout stop importing the `client` singleton directly and read
  `usePabloClient()` instead. `GameStoreProvider` already takes `client` as a prop — feed it the
  context value.

`apps/mobile/src/supabase/client.ts` (today: `export const client = createMockClient()`) is replaced
by these memoised accessors. This is the one "swap the import" point the comments promised, now
generalised to "choose per route."

> Alternative considered: a mutable module-level `setActiveClient()` registry set by the entry flow.
> Rejected — implicit global state that breaks under deep-link / cold-launch; the route param is
> explicit and deep-linkable.

---

## Requirement → file mapping

### Workstream A — Supabase JS client + persisted anonymous auth

| Requirement                             | File(s)                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Add `@supabase/supabase-js` to mobile   | `apps/mobile/package.json` (+ `@react-native-async-storage/async-storage`, `react-native-url-polyfill`) |
| URL polyfill import at app entry        | `apps/mobile/app/_layout.tsx` (top-of-file `import 'react-native-url-polyfill/auto'`)                   |
| Singleton Supabase client w/ RN storage | `apps/mobile/src/supabase/internal/supabaseBrowser.ts` (new)                                            |
| Read env (`EXPO_PUBLIC_*`)              | same; via `expo-constants` / `process.env.EXPO_PUBLIC_*`                                                |

The Supabase client MUST be configured for React Native:
`auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }`.
Without persisted storage the anon `auth.uid()` changes on every cold launch and reconnection is
impossible (the user would no longer be a `room_members` row for their own game).

### Workstream B — `realClient.ts` implements `PabloClient`

| `PabloClient` method  | Implementation                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `signIn`              | `supabase.auth.getSession()` → if none, `supabase.auth.signInAnonymously()`; resolve `user.id`. Idempotent.    |
| `createRoom`          | `supabase.rpc('create_room', { p_rules, p_max_players })`; map returned row → `Room`.                          |
| `joinRoom`            | `supabase.functions.invoke('joinRoom', { code })`; map `{ room }` → `Room`.                                    |
| `leaveRoom`           | `supabase.functions.invoke('leaveRoom', { roomId })`.                                                          |
| `startGame`           | `supabase.functions.invoke('startGame', { roomId })` → `{ gameId }`.                                           |
| `applyMove`           | `supabase.functions.invoke('applyMove', { gameId, move, idempotencyKey, expectedVersion })` → `{ version }`.   |
| `subscribeRoom`       | `postgres_changes` on `rooms` (filter `id`) **and** `room_members` (filter `room_id`); re-read + emit `Room`.  |
| `subscribePlayerView` | Subscribe broadcast `game:{gameId}`; on tick (and once on subscribe) call `getPlayerView`, emit `(view, ver)`. |
| `subscribeGameEvents` | Same channel; on tick call `getEventsSince(lastSeenVersion)`, emit batch; advance `lastSeenVersion`.           |
| `getActiveSession`    | Query `room_members` for `auth.uid()` → join `rooms` where `status='playing'` → read `current_game_id` (G1).   |

Files:

- `apps/mobile/src/supabase/realClient.ts` — replace the stub; compose the helpers below.
- `apps/mobile/src/supabase/internal/realtimeTick.ts` (new) — the **tick sequencer** (see below).
- `apps/mobile/src/supabase/internal/edgeInvoke.ts` (new) — wraps `functions.invoke`, maps the
  `{ ok, data } | { ok, error }` envelope to `ClientResult<T>`, and maps transport failures
  (network / 401 / non-200) to the right `ClientErrorCode` (`network_error`, `unauthenticated`,
  `internal_error`).
- `apps/mobile/src/supabase/internal/roomMapper.ts` (new) — DB row ⇄ `Room` mapper, shared by
  `createRoom` / `joinRoom` / `subscribeRoom`.

#### The tick sequencer (the genuinely tricky part — Opus)

The `PabloClient` contract REQUIRES, for each applied move, that `subscribePlayerView` callbacks
fire **before** `subscribeGameEvents` callbacks (the flight planner reads the promoted `view` from
`getAnchorSnapshot()` at plan time — see `gameStore.startNextBatchIfIdle`). In the real client a
single broadcast tick triggers **two independent** network fetches, so we must serialise:

1. On tick `{ version: v }` (or on initial subscribe), run an **awaited sequence per `gameId`**:
   `getPlayerView` → emit `(view, version)` to view subscribers → `getEventsSince(lastSeen)` →
   emit events → set `lastSeen = currentVersion`.
2. **Coalesce ticks**: hold a single in-flight pump per game; if ticks arrive while pumping, set a
   "dirty" flag and re-pump once on completion (don't fan out N concurrent fetch pairs).
3. **Version-skew guard**: if `getEventsSince` returns a `currentVersion` greater than the version
   the view fetch reflected (a newer move committed between the two calls), re-pump rather than
   emit events ahead of the view. The store tolerates a view that is one tick stale for a frame,
   but never events ahead of the view.
4. **Missed-tick recovery**: because the broadcast payload is only a version and `getEventsSince`
   takes `lastSeen`, a dropped tick self-heals on the next tick (the next fetch catches up all
   intervening events in version+seq order). On channel `SUBSCRIBED` / resubscribe, force one pump.

This sequencer is shared by `subscribePlayerView` and `subscribeGameEvents` for the same `gameId`
(they register into one per-game pump), which is the only way to honour the ordering guarantee.

### Workstream C — `getActiveSession` + reconnection

| Requirement                                    | File(s)                                                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| New interface method                           | `apps/mobile/src/supabase/types.ts` (`getActiveSession()`)                                                                                |
| Real impl (query room_members → rooms)         | `apps/mobile/src/supabase/realClient.ts`                                                                                                  |
| Mock impl (return last live game/room or null) | `apps/mobile/src/supabase/mockClient.ts`                                                                                                  |
| Launch resolver routes back into the game      | `apps/mobile/app/index.tsx` or `(home)/index.tsx` boot effect                                                                             |
| Restore peek_phase / pabloCalledBy on rejoin   | falls out for free: `getPlayerView` returns the authoritative projection (status `'peek_phase'`, `pabloCalledBy`); no special client code |

`getActiveSession(): Promise<ClientResult<{ roomId; gameId; mode: 'online' } | null>>`. On app
launch (after `signIn`), call it; if non-null, `router.replace('/(game)/${gameId}?mode=online')`.
Because state lives in the DB and `getPlayerView` is authoritative, "restore peek_phase / off-turn
Pablo" needs no bespoke logic — the freshly fetched view already carries `status` and `pabloCalledBy`,
and the store's `receiveView` derives `peekOverlayVisible` / `endOfRoundVisible` from it.

### Workstream D — Lobby UI + per-route client wiring

New route group `(lobby)`:

| Screen / file                                 | Purpose                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/app/(lobby)/_layout.tsx`         | Stack; provides the **real** client via `ClientProvider`.                                                                                         |
| `apps/mobile/app/(lobby)/index.tsx`           | Choice: "Create room" / "Join by code".                                                                                                           |
| `apps/mobile/app/(lobby)/create.tsx`          | Create room (maxPlayers picker) → navigate to room.                                                                                               |
| `apps/mobile/app/(lobby)/join.tsx`            | Code entry (uppercased, alphabet from `room.ts`) → `joinRoom`.                                                                                    |
| `apps/mobile/app/(lobby)/room/[roomId].tsx`   | Member list (live via `subscribeRoom`), host-only "Start", "Leave". On `current_game_id` set → `router.replace('/(game)/${gameId}?mode=online')`. |
| `apps/mobile/src/supabase/ClientProvider.tsx` | `usePabloClient()` context (see Architecture).                                                                                                    |
| `apps/mobile/src/components/lobby/*`          | `MemberRow`, `RoomCodeBadge`, etc. (presentational, tokens + `t()` only).                                                                         |

Edits to existing files:

- `apps/mobile/app/(home)/index.tsx` — add a "Play online" button → `/(lobby)`. Keep "Play vs bots".
- `apps/mobile/app/(home)/new-game.tsx` — wrap with `ClientProvider` supplying the **mock**, OR pass
  `mode=offline` through to the game route so the game layout picks the mock. (Keeps vs-bots intact.)
- `apps/mobile/app/(game)/[gameId]/_layout.tsx` — read `mode` param, resolve client via accessor,
  wrap in `ClientProvider`, pass to `GameStoreProvider`.
- `apps/mobile/app/(game)/[gameId]/index.tsx` — replace `import { client }` with `usePabloClient()`;
  `dispatch` uses the context client. Add the **submitting lock** (below). The "Leave" button calls
  `leaveRoom` for online games before navigating.
- `apps/mobile/src/supabase/client.ts` — replace the single mock singleton with
  `getMockClient()` / `getRealClient()` memoised accessors.

#### Submitting lock (latency masking — decision 3)

`dispatch` already early-returns while `isAnimating`. Add a store flag `ui.submitting` set true
around an online `applyMove` round-trip and OR it into the existing input-gate selectors
(`selectCanDraw`, action-bar enable, etc., via `selectIsBusy = isAnimating || submitting`). On
result it clears; the subsequent broadcast tick promotes the new view. The mock resolves
synchronously, so the flag is a no-op there. This keeps taps from double-firing during the network
gap without faking optimistic state we can't compute.

### Workstream E — "Play again" online (G2)

- `startGame` currently rejects unless `status='waiting'`. Add a small server step so a finished
  game can be replayed: either extend `leaveRoom`-style logic with a `resetRoom`/`returnToLobby`
  edge function that sets `rooms.status='waiting'` + `current_game_id=null` (host only), or have
  round-end clear `current_game_id` and flip status back to `'waiting'`.
- Online `EndOfRound` "Play again" → `returnToLobby` → back to `(lobby)/room/[roomId]` so the host
  can re-`startGame`. Offline "Play again" keeps `router.replace('/(home)/new-game')`.
- **Decision needed** (open question Q1): auto-return-to-waiting at round-end vs explicit host action.

### Workstream F — Schema migration + type cleanups

| Requirement                                       | File(s)                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `rooms.current_game_id uuid NULL` (G1)            | `supabase/migrations/<ts>_add_rooms_current_game_id.sql` (new)               |
| `startGame` sets `current_game_id`                | `supabase/functions/startGame/index.ts`                                      |
| Clear `current_game_id` on round-end / leave (G2) | `supabase/functions/leaveRoom/index.ts` (+ E's reset path)                   |
| `Room.status` drop `'finished'`                   | `apps/mobile/src/supabase/types.ts` (Phase 5 already dropped it server-side) |
| `Room` gains optional `currentGameId`             | `apps/mobile/src/supabase/types.ts` + mappers + mock                         |
| Rebuild engine bundle IF engine changes           | not expected this phase — but if touched: `bun run build:engine-bundle`      |
| i18n keys for lobby + new errors                  | `apps/mobile/src/i18n/locales/en.json` (`lobby.*`, any new `error.*`)        |

> No engine changes are expected in Phase 6. If that assumption breaks, the bundle rebuild is
> mandatory (`.cursor/rules/debugging.mdc` gotcha #1).

---

## Test plan

Per `AGENTS.md`: new behaviour ships with new tests; `bun run check` is the gate.

### Unit / pure (run in default `bun test`, no Docker)

1. **`realtimeTick` sequencer** — `apps/mobile/src/supabase/internal/realtimeTick.test.ts`:
   - view callback fires before events callback for a tick (ordering contract);
   - tick coalescing: N ticks during one in-flight pump → exactly one extra pump;
   - version-skew guard: events `currentVersion` ahead of view version → re-pump, no early event emit;
   - missed-tick recovery: `getEventsSince(lastSeen)` advances `lastSeen` correctly across gaps.
     Inject fake `getPlayerView` / `getEventsSince` / channel (no network).
2. **`edgeInvoke` envelope mapping** — maps `{ ok:false, error }`, network throw, 401, non-200
   to the correct `ClientErrorCode`.
3. **`roomMapper`** — DB row ⇄ `Room` round-trips; `current_game_id` ↔ `currentGameId`.
4. **`getActiveSession` (mock)** — returns the live game while playing, `null` after end / none.
5. **`Room` type cleanup** — existing `mockClient` tests stay green after `'finished'` removal.

### Integration (gated `PABLO_RUN_INTEGRATION=1`, against local Supabase)

Extend `tests/integration/supabase.test.ts` (or a sibling `supabase.multiplayer.test.ts`):

6. **Two-client full game via the REAL client** (not raw `callFn`): build two `createRealClient()`
   instances with two anon sessions; host `createRoom` → player2 `joinRoom` → host `startGame` →
   **player2 discovers `gameId` via `subscribeRoom` `current_game_id`** (proves G1) → both peek →
   alternate turns through `applyMove` → one `match_*` success + one failure-with-penalty → off-turn
   Pablo → `round_ended`. Assert both clients' `subscribePlayerView` converge and hidden cards never
   leak across players.
7. **Reconnection**: after several moves, drop player2's client, build a fresh one with the **same**
   persisted session, call `getActiveSession` → resubscribe → assert the restored view matches the
   authoritative state (including `peek_phase` if mid-peek, and `pabloCalledBy` if a Pablo is in flight).
8. **Idempotency over the wire**: submit the same `applyMove` twice with one `idempotencyKey` →
   single state advance, both calls return the same `version`.
9. **`version_mismatch`**: submit with a stale `expectedVersion` → `version_mismatch`; client
   resubscribes and recovers.

### Manual / on-device (Definition of Done)

10. Two real iPhones: create/join by code, both see the member list update live, host starts, full
    round plays, result screen shows correct winners.
11. Kill the app mid-game on one phone, reopen → lands back in the game with correct state.

---

## Definition of Done (from `docs/PLAN.md` Phase 6 + this plan)

- [ ] Two real iPhones play a full match against each other via Supabase.
- [ ] Killing the app mid-game and reopening restores state (persisted anon session + `getActiveSession`).
- [ ] Single-player vs-bots still works unchanged (mock client, offline route).
- [ ] Lobby: create room, join by code, live member list, host start, leave.
- [ ] Animation triggers fan out from the Phase 2.5 event set over the real event stream.
- [ ] `bun run check` clean; integration suite green under `PABLO_RUN_INTEGRATION=1`.
- [ ] `docs/PLAN.md` (Done + Decisions Made) and `docs/SCHEMA.md` (`rooms.current_game_id`,
      `getActiveSession`, "play again" path) updated.
- [ ] Plan committed in the same PR. PR titled `phase 6: multiplayer wiring`. **Do not merge** until told.

---

## Decisions made (to append to `docs/PLAN.md` on completion)

| Decision                                                                                                           | Why                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep both clients; select per route via a `?mode=` param + `ClientProvider` context                                | vs-bots is an offline/mock concept; multiplayer is the real client; the shared `(game)` route needs an explicit, deep-link-safe selector.                                   |
| `getActiveSession()` added to `PabloClient`                                                                        | DoD requires cold-launch reconnection; no existing method located the player's in-progress game.                                                                            |
| Add `rooms.current_game_id` (RLS-readable) instead of a `getActiveGame` edge fn                                    | `games` is deny-all to clients; one readable column lets the lobby AND reconnection discover the game, and `postgres_changes` pushes "game started" for free.               |
| Online moves are NOT optimistic; mask latency with a submitting lock + flights                                     | The client holds only a `PlayerView`; it cannot authoritatively compute the next view for hidden-card moves. Relaxes the `ui.mdc` optimistic rule for online play.          |
| One per-game tick pump shared by view + events subscriptions                                                       | Only way to honour the "view before events" ordering contract when each is a separate network fetch.                                                                        |
| RN Supabase client uses AsyncStorage + `persistSession` + `detectSessionInUrl:false`                               | Persisted anon session is a hard precondition for reconnection; otherwise `auth.uid()` changes each launch.                                                                 |
| "Play again": explicit host "Back to lobby" returns room to `'waiting'`; non-hosts see "waiting for host"          | Avoids surprise teleports back to the lobby; the host owns the game lifecycle, matching `startGame` being host-only. (Resolved Q1.)                                         |
| No turn timeout / auto-skip for disconnected players in v1; rely on reconnection                                   | Reconnection (persisted session + `getActiveSession`) makes a stalled turn recoverable; timeouts add engine/edge complexity not needed to validate the loop. (Resolved Q2.) |
| Connection status = a minimal reconnecting banner driven by the `network_error` code; no presence indicators in v1 | Cheapest signal that conveys "we're offline"; full presence is polish, deferred to Phase 7. (Resolved Q4.)                                                                  |

---

## Resolved questions (user-approved 2026-06-09)

The recommendations below were approved and are now part of the plan (also captured in the
Decisions table above). They are no longer open.

- **Q1 — "Play again" semantics → RESOLVED.** Explicit host action: the result screen stays until
  the host taps "Back to lobby", which returns the room to `'waiting'` (clears `current_game_id`);
  non-hosts see a "waiting for host" state. Drives Workstream E.
- **Q2 — Host leaves / disconnects mid-game → RESOLVED.** No turn timeout / auto-skip in v1; rely on
  reconnection (Phase 5's `leaveRoom` still promotes the lowest-seat member to host on a clean leave).
- **Q3 — Client selection mechanism → RESOLVED.** Use the `?mode=online|offline` route param +
  `ClientProvider` (not a module-level active-client registry).
- **Q4 — Connection-status UI → RESOLVED.** Minimal reconnecting banner driven by `network_error`;
  no presence indicators in v1 (full presence deferred to Phase 7).

## Open questions

_(none — all resolved above; ready to build on the next prompt.)_
