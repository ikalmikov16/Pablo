# Lobby names & fixed-size rooms

## Goal (one sentence)

Drop the per-room player-count picker (rooms are always max 4, sized by who actually joins), and let players set a display name before entering a room and edit it live while waiting in the lobby — surfacing real names in the lobby list and in-game.

## Do we need DB changes?

Almost none. Audited the schema (`docs/SCHEMA.md`, migrations):

- **Fixed 4-player rooms** — `rooms.max_players` already defaults to `4` and `createRoom` already sends `4` when nothing is passed. Pure client change (delete the picker). The `>= 2` start gate and `room_full` join rejection already exist.
- **Storing names** — `profiles.display_name` already exists (nullable) with the exact RLS we need: any authenticated user can `SELECT`; a user can `UPDATE` their own row (`20260518100000_init_profiles.sql`). No schema/column change, no edge function.
- **One migration only** — add `profiles` to the `supabase_realtime` publication so a name edit in the lobby broadcasts to the other waiting players (their `subscribeDisplayNames` refetches on the change). RLS still gates per subscriber.

## Approach

### Backend / client interface (`PabloClient`)

Three additive methods (mirrored in `realClient` + `mockClient`, declared in `types.ts`):

- `setDisplayName(name: string): Promise<ClientResult<void>>`
  - real: `profiles.update({ display_name }).eq('id', uid)` (RLS self-update).
  - mock: store in a module-local map keyed by `localPlayerId`.
- `getDisplayNames(ids): Promise<ClientResult<Record<PlayerId, string | null>>>`
  - real: `profiles.select('id, display_name').in('id', ids)`.
  - mock: resolve from the local map (+ leave bots/self to the resolver).
- `subscribeDisplayNames(ids, onChange): Unsubscribe`
  - real: fetch once → `onChange`, then a `postgres_changes` channel on `profiles` filtered `id=in.(…)`; on any change refetch all and `onChange`.
  - mock: emit once from the local map; return a no-op unsub.

No `Room` shape change — `members` stays `ReadonlyArray<PlayerId>` (it feeds `engine.newGame` as player ids). Names ride alongside.

### Name resolution (`src/store/displayName.ts`)

- Add a small module-local registry (`Map<PlayerId,string>`) with `setDisplayNames`, `clearDisplayNames`, `registeredDisplayName`. This is UI-layer state (not engine) — it's the chokepoint that lets the many deep `resolveDisplayName(view, id)` callers (gameStore toasts, flightChoreography, PabloBanner, PeekOverlay) pick up real names without threading a map through ~15 functions.
- `resolveDisplayName(view, id)` resolution order: self → `You`; bot → bot name; registry hit → registry; else short id.
- Add a pure `lobbyMemberName(id, { selfId, names })` for the lobby (no `view` there), kept pure (names passed in) so it's trivially testable.

### Name cache (`src/store/nameCache.ts`)

AsyncStorage-backed `loadCachedName()` / `saveCachedName(name)` so the name field pre-fills everywhere after first use. Key `pablo.displayName`.

### Screens

- `(lobby)/create.tsx` — remove `PLAYER_OPTIONS` / picker. Add a name `TextInput` (pre-filled from cache). On Create: `signIn()` → `setDisplayName` (+ cache) → `createRoom({})` (defaults to 4) → navigate.
- `(lobby)/join.tsx` — add the same name field above/below the code field. On Join: `signIn()` → `setDisplayName` (+ cache) → `joinRoom` → navigate.
- `(lobby)/room/[roomId].tsx` — hold a `names` state fed by `subscribeDisplayNames(room.members)`; pass resolved names to `MemberRow`. Add an inline "edit" affordance on the self row (opens a `TextInput`; Save → `setDisplayName` + cache + optimistic local update). Capacity line stays (`count / 4`).
- `(game)/[gameId]/index.tsx` — on mount/online, `getDisplayNames(view.players ids)` → `setDisplayNames` (registry) so opponent seats / toasts show real names; `clearDisplayNames` on unmount.
- `MemberRow.tsx` — take a resolved `name` prop (+ keep host badge); reuse the `Avatar` component for consistency.

### i18n (`en.json`)

- Add `lobby.create.nameLabel`, `lobby.join.nameLabel`, `lobby.name.placeholder`, `lobby.room.editName`, `lobby.room.saveName`.
- Remove `lobby.create.maxPlayers` (picker gone). Keep `lobby.room.capacity`.

## Test plan

- `displayName.test.ts` — extend: registry hit wins over short id; cleared registry falls back; self/bot precedence unchanged.
- New `displayName` lobby test — `lobbyMemberName` precedence (name > self "You" > bot > short id).
- New `nameCache` test is N/A (AsyncStorage side-effect) — skip; keep the module a thin wrapper.
- `mockClient` test — `setDisplayName` then `getDisplayNames`/`subscribeDisplayNames` returns the set name.
- Existing tests that reference `PLAYER_OPTIONS` / `maxPlayers` picker: none found in suite; verify `bun run check`.

## Decisions / trade-offs

- **Module registry vs threading a names map**: chose a contained UI-layer registry because `resolveDisplayName` is called from non-React planners; threading would touch ~15 functions for no real benefit. Reset on game unmount avoids stale cross-game names.
- **Names not added to `Room`**: keeps `members` as engine-ready ids and avoids rippling through `makeRoom`/`startGame`/mappers.
- **Live lobby updates**: `profiles` added to realtime publication (user-approved) so edits propagate instantly.

## Open questions

- None blocking. Self row in lobby shows the typed name (falls back to "You" if unset).
