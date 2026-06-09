# Phase 4.5 — UX overhaul: poker-table layout + card-flight animations

> Status: **approved master plan (2026-05-18).** Decisions resolved with the user
> on the open questions; see "Decisions resolved" below. Detailed per-branch
> plans:
>
> - Package A → `docs/plans/phase-4-5-table-layout.md` (in progress on
>   `phase-4-5-table-layout`).
> - Package B → `docs/plans/phase-4-5-flying-cards.md` (implemented on
>   `phase-4-5-table-layout`; Package B.1 memory-critical swap/discard clarity
>   plan added and awaiting approval).

## One-sentence goal

Make Phase 4 actually playable as a memory game: every player has a
fixed-position 2×2 grid arranged around a virtual table, opponent cards never
leak through after a peek, and every swap / discard / penalty has a visible
motion connecting source → destination so the player can mentally track
where each card went.

---

## Why this work exists

Phase 4 shipped a functionally-correct game UI that vertically stacks
opponent rows above the local hand. Playtesting surfaced three problems
that, together, undermine the core memory mechanic:

1. **Opponent peek leak (bug).** `OpponentRow` renders any slot whose
   `knownCards[i]` is set as face-up. Once the local player resolves a 7-
   or 8-card power that targets an opponent slot, that card stays face-up
   on the opponent row forever. The reveal sheet already exists for the
   "tap to read" moment; the persistent leak is unintended.
2. **No spatial anchor.** The vertical strip layout doesn't tell the
   player which opponent is "where". When a `use_swap_blind` happens or a
   bot calls Pablo, the player has to read the name label instead of
   recognising the seat. This also conflicts with the eventual 2×2-grid-
   everywhere idea — opponents currently render as a wrapped row of mini
   cards, not a grid.
3. **No motion = no memory.** When the local player taps "Discard" or
   "Match", the affected slot's content simply changes between frames.
   The visual instant tells the player _what_ happened but not _which_
   card moved _where_. For a game whose entire challenge is memorising
   four positions, that's the central UX failure.

(1) is a one-line fix and rides along with (2). (2) and (3) are
sequenceable and largely independent, so they split cleanly across two
branches. Both packages preserve every Phase 1–5 hard rule (engine
purity, RLS, no game logic in components, no hardcoded strings/colors).

---

## Scope split

```
Package A — Poker-table layout (and opponent-peek bug fix)
    Branch:  phase-4-5-table-layout
    Effort:  ~1 day
    Ships:   Independently; no dependency on Package B.

Package B — Card-flight animations
    Branch:  phase-4-5-flying-cards
    Effort:  ~3–4 days
    Ships:   Independently; reads the same engine events the store
             already enqueues, so no engine work required.
```

Either order works. Recommended order: **A first**, because the seat
positions become the natural source/destination anchors for Package B's
flights. Doing B before A would mean re-anchoring every flight after the
seats move.

---

## Package A — Poker-table layout (and opponent-peek bug fix)

### Goal

Replace the current top-stacked opponent rows with a fixed poker-table
seating arrangement, where every seat renders its hand through the same
`CardSlotGrid` component (with face-down placeholders), and the
deck/discard pair sits at the visual centre.

### What lands

| Item                                                                                                                                                          | File(s)                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `OpponentSeat` component (replaces `OpponentRow`) — name above the cards, score, face-down 2×2 via `CardSlotGrid`. **No Pablo button.**                       | `apps/mobile/src/components/game/OpponentSeat.tsx` (new); delete `OpponentRow.tsx` |
| `TableLayout` component — absolute-positioned seats around a centred deck/discard, safe-area aware                                                            | `apps/mobile/src/components/game/TableLayout.tsx` (new)                            |
| Seat-positioning helper for 1 / 2 / 3 opponents                                                                                                               | `apps/mobile/src/components/game/internal/seatLayout.ts` (new)                     |
| Pull `DeckArea` into the centre of the table                                                                                                                  | `apps/mobile/src/components/game/DeckArea.tsx` (modify styles + accept a size)     |
| Unify grids: `OwnHandGrid` thin wrapper that builds `CardSlot[]` from the store and renders via `CardSlotGrid` with selection / `LinearTransition` plumbing   | `apps/mobile/src/components/game/OwnHandGrid.tsx` (new); delete `HandGrid.tsx`     |
| Extend `CardSlotGrid` if needed to support the own-hand wrapper (e.g. expose `layoutTransition` / per-slot render override). Keep the API minimal and tested. | `apps/mobile/src/components/game/internal/CardSlotGrid.tsx` (modify)               |
| Wire `GameScreen` to the new layout                                                                                                                           | `apps/mobile/app/(game)/[gameId]/index.tsx`                                        |
| Bug fix: opponent slots render `faceUp={false}` always — knownCards stays in the view (used by reveal sheet) but the seat shows the back                      | covered by `OpponentSeat` (which uses `CardSlotGrid` defaults)                     |
| Pablo-called toast on the `pablo_called` event (banner already exists; add a one-shot toast)                                                                  | `apps/mobile/src/store/gameStore.ts` (`enqueueEvents` reducer); `displayName.ts`   |
| `resolveDisplayName(view, id)` helper shared by banner + toast                                                                                                | `apps/mobile/src/store/displayName.ts` (new)                                       |
| New design tokens for table sizing                                                                                                                            | `apps/mobile/src/design/tokens.ts`                                                 |
| Tests for `seatLayout` (positions are deterministic per opponent count and respect insets)                                                                    | `apps/mobile/src/components/game/internal/seatLayout.test.ts` (new)                |

### Seat assignment

```
1 opponent:                 2 opponents:                3 opponents:
┌────────────┐              ┌─────┐  ┌─────┐            ┌────┬────┬────┐
│   Bot 1    │              │Bot1 │  │Bot2 │            │Bot1│Bot2│Bot3│
├────────────┤              ├─────┴──┴─────┤            ├────┴────┴────┤
│  DECK/DSC  │              │   DECK/DSC   │            │   DECK/DSC   │
├────────────┤              ├──────────────┤            ├──────────────┤
│    You     │              │     You      │            │     You      │
└────────────┘              └──────────────┘            └──────────────┘
```

The 3-opponent layout is a **top row of three**, not the original side-flanking
layout. Side seats forced opponent card width down to ~56px on a 4.7" iPhone
and made the deck-centre region cramped. A top row keeps every opponent's 2×2
at a readable ~60–72px and uses the screen's vertical headroom instead.

The seat positions are computed by `seatLayout(opponentCount, screenW, screenH, insets)`
returning **absolute `SeatBox` rectangles** (`top` / `left` / `width` / `height`) plus
pinned card widths. `TableLayout` positions children with `position: 'absolute'`.
Pure function of geometry; trivially unit-testable. Safe-area insets (notch / home
indicator) are read via `useSafeAreaInsets()` and threaded in. Absolute boxes are
deliberate: they give Package B stable flight anchors without a second layout pass.

### Design decisions

| Decision                      | Choice                                                                                                                                                                                                                          | Rationale                                                                                                                                                                                                                                                                                                                                                | Alternatives rejected                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orientation of opponent grids | **All upright (same orientation as own hand)**                                                                                                                                                                                  | Card text is readable; no rotation math; slot-0 means "top-left" for every seat (consistent spatial language).                                                                                                                                                                                                                                           | Rotated 180° / 90° per seat: looks more skeumorphic but kills legibility on a phone screen and complicates flight animations. Hybrid frame: cosmetic only, defer to Phase 7. |
| Sizing                        | Card max-width scales with seat region. Own hand keeps `ownCardMax = 96`; opponent seats use **token-driven** `opponentCardMd ≈ 72` (1 / 2 bots) and `opponentCardSm ≈ 60` (3 bots).                                            | Visual hierarchy: the player's own cards are the focus; opponents are reference. Tokens replace the magic numbers the original draft inlined.                                                                                                                                                                                                            | Constant 96px everywhere overflows on 3-opponent layouts; shrinking below ~56px hurts tap targets and readability.                                                           |
| 3-opponent layout             | **Top row of three opponents** (Bot1 / Bot2 / Bot3), deck and discard at table centre below them, You at the bottom.                                                                                                            | Phones have more vertical room than horizontal. Side-flanking forced cards down to ~56px and made the deck cramped between two narrow columns. A top row preserves a readable 2×2 per opponent and keeps the deck centred on its own band.                                                                                                               | Side flanking (original draft): cramped cards, awkward deck anchor. Narrowing cards below ~56px: hurts taps and the memory mechanic.                                         |
| Deck/discard placement        | Absolute-positioned at table centre.                                                                                                                                                                                            | The deck/discard pair is the gameplay focal point; positioning it last in a flex flow means it reflows when an opponent's name wraps. Absolute = stable focal point.                                                                                                                                                                                     | Flex flow: reflows on layout-affecting changes, breaks Package B flight anchors.                                                                                             |
| Opponent name placement       | **Always above the cards.**                                                                                                                                                                                                     | Consistent rule for every seat (1-bot, 2-bot, 3-bot). Easier to scan in a top-row 3-bot layout, and avoids the hybrid above/below/side rule from the original draft.                                                                                                                                                                                     | Above/below/side per seat: noisy, harder to RTL later, no real win.                                                                                                          |
| Pablo button                  | **One Pablo button only — in the action bar.** No per-seat Pablo button.                                                                                                                                                        | The existing `OpponentRow` Pablo button was confusing: it dispatched `call_pablo` for `self` regardless of which opponent it sat under, and its `pabloCallable` flag was keyed off the _opponent's_ legal moves. The action bar already exposes `call_pablo` for the local player when legal (both on- and off-turn). One source of truth removes drift. | Per-seat Pablo (original draft): redundant, semantically wrong, breaks symmetry between on-turn and off-turn paths.                                                          |
| Notification of caller        | `PabloBanner` (already present) shows the caller's name. **Add a 1.8 s toast** ("Cabo Cassette called Pablo!") on the `pablo_called` event so the moment is registered if a flow is on top.                                     | Banner is z-index 20 but flows / overlays can still steal attention. The toast is a cheap memory aid and matches the existing `ToastHost` style.                                                                                                                                                                                                         | Banner only: easy to miss while a flow is open. Sound: deferred to Phase 7.                                                                                                  |
| Bot Pablo behaviour           | **No engine change.** Bots already call Pablo (off-turn ≤ 8, on-turn ≤ 5 with 1/30 chance — see `apps/mobile/src/supabase/internal/bot.ts`). Threshold tuning is left to post-playtest.                                         | Bots calling Pablo is already wired through `botScheduler.ts` and tested in `bot.test.ts`. Phase 4.5 is a UX overhaul; rebalancing bot aggression belongs to a follow-up after playtesting the new table layout.                                                                                                                                         | Tune in A: premature without playtest data.                                                                                                                                  |
| Grid unification              | **`CardSlotGrid` + a thin `OwnHandGrid` wrapper.** Delete the standalone `HandGrid` layout math; reuse `CardSlotGrid` for both own and opponent seats.                                                                          | `HandGrid` and `CardSlotGrid` already duplicate the same column math, gap, max-width cap, and chunking. Unifying removes drift between flows and seats. The own-hand specifics (Zustand selection, `LinearTransition` on slot wrappers) live in the wrapper.                                                                                             | Keep both: ongoing drift, two places to update for Package B anchors.                                                                                                        |
| `CardSlotGrid` API            | **Extend in place** with two optional props: `cardWidth?` (pin slot size from the table) and `slotWrapper?` (render-prop so `OwnHandGrid` wraps each slot in `Animated.View` + `LinearTransition`). Existing callers unchanged. | One layout engine for flows, opponents, and own hand. A separate overlay grid in `OwnHandGrid` would fork layout math and break when column rules change.                                                                                                                                                                                                | Fork `OwnHandGrid` layout: duplicate math, drift risk. Touch `CardSlotGrid` internals without props: breaks flow callers.                                                    |
| Pablo toast trigger           | Fire inside the **`enqueueEvents` store reducer**, not in `GameScreen`. One toast per `pablo_called` event when the event enters the queue; never on `promoteView` / re-render.                                                 | The store owns the event queue and already de-dupes by `eventId`. Keeps `GameScreen` presentational and avoids double-firing when the view promotes.                                                                                                                                                                                                     | Toast in `GameScreen` `useEffect`: re-fires on re-renders; couples layout screen to event plumbing.                                                                          |
| Caller display names          | Extract **`resolveDisplayName(view, id)`** to `apps/mobile/src/store/displayName.ts`; use from `PabloBanner` and the Pablo toast. Unit-test the three cases (bot / self / human).                                               | Banner and toast must show the same name; duplicating `botName` / `t('game.you')` logic in two components invites drift. Small refactor of `PabloBanner` is in scope for Package A.                                                                                                                                                                      | Inline duplicate logic in the reducer: works once, breaks on the next caller surface.                                                                                        |
| Seat geometry output          | **`seatLayout` returns absolute `SeatBox` pixels**, not flex weights or normalized 0–1 anchors. `TableLayout` applies `position: 'absolute'` per box.                                                                           | Stable screen-space regions for Package B `measureInWindow` / anchor registration. Flex-only table layout would require a second measurement pass before flights.                                                                                                                                                                                        | Flex column layout: reflows on name wrap; harder to anchor flights. Normalized coords: extra multiply step in every consumer.                                                |
| Safe-area handling            | `TableLayout` reads `useSafeAreaInsets()` and pads seats / deck inside the safe region. Phone-only; iPad and web are out of scope for v1.                                                                                       | Avoids notches and home indicators clipping seats or the deck centre.                                                                                                                                                                                                                                                                                    | Pin to screen edges: clipped on modern iPhones.                                                                                                                              |
| `OpponentRow.tsx`             | Deleted, not deprecated.                                                                                                                                                                                                        | It has one consumer (`GameScreen`). Keeping it around invites drift.                                                                                                                                                                                                                                                                                     | Mark as deprecated: zero callers means dead code, fail lint.                                                                                                                 |

### Test plan

- `seatLayout.test.ts`: for each opponent count (1, 2, 3), the returned coords are within the screen bounds, no seat overlaps the deck, all seats are non-overlapping, and the local player is at the bottom. Math only — no rendering.
- Existing `selectors.test.ts` keeps passing (no selector changes).
- Snapshot tests for `OpponentSeat` are NOT planned — Skia rendering is hard to snapshot meaningfully; the engine + selector tests already lock the data flow.
- Manual verification checklist in the branch's detailed plan: 1-bot, 2-bot, 3-bot games launched from the home screen; verify Pablo button positions, deck centre stable, peek-then-close → opponent card returns face-down.

### Definition of Done (Package A)

- All four seats (you + 1 / 2 / 3 opponents) render through `CardSlotGrid` (own hand via the `OwnHandGrid` wrapper) with the matching grid layout (2×2 for 4-card hands).
- 3-opponent games use the **top-row** layout, not side flanking.
- Opponent names sit **above** the cards for every seat.
- Opponent cards remain face-down in `OpponentSeat` even after a `use_peek_opponent` reveal — the reveal sheet is the only place that card face is shown.
- The deck/discard pair is at a stable centre of the screen across all opponent counts, padded inside the safe area.
- The Pablo button lives **only** in the action bar; per-seat Pablo is gone.
- When any player (bot or human) calls Pablo, the existing `PabloBanner` AND a one-shot toast announce the caller.
- Pablo toast fires from **`enqueueEvents` only**; `resolveDisplayName` in `displayName.ts` is shared with `PabloBanner`.
- `CardSlotGrid` extended with optional `cardWidth?` + `slotWrapper?`; `OwnHandGrid` does not fork layout math.
- `seatLayout` returns absolute pixel `SeatBox`es; `TableLayout` uses absolute positioning.
- `OpponentRow.tsx` and `HandGrid.tsx` are deleted; no stale imports.
- New tokens (`tokens.game.size.ownCardMax`, `opponentCardMd`, `opponentCardSm`, `tokens.game.table.seatPadding`) replace inline numeric literals in the new components.
- `seatLayout` is unit-tested for 1 / 2 / 3 opponents on representative phone sizes with insets.
- All `bun run check` gates green.

### Out of scope for Package A

- 🚫 Animated transitions between seats (Package B).
- 🚫 Rotated card text per seat.
- 🚫 Score panel / per-round details — keep the current inline score label.
- 🚫 Bot Pablo threshold tuning (post-playtest follow-up).
- 🚫 iPad / web layout — phone-only for v1.
- 🚫 Any change to `packages/engine`.

---

## Package B — Card-flight animations

### Goal

Every move that visibly affects a hand or the discard renders the
affected card(s) flying between their source and destination anchors,
so the player can track the spatial outcome without rereading the
discard top.

### What lands

| Item                                                                                                                                                                                                                                              | File(s)                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `FlyingCardLayer` — screen-root absolute overlay that owns a queue of in-flight cards                                                                                                                                                             | `apps/mobile/src/components/game/FlyingCardLayer.tsx` (new)           |
| `AnchorRegistry` — module-level registry (no React context); reads return absolute screen `Rect`s                                                                                                                                                 | `apps/mobile/src/store/anchorRegistry.ts` (new)                       |
| `useAnchor(id)` hook — wraps a `View` with `onLayout` + `measureInWindow`, registers under id, unregisters on unmount                                                                                                                             | `apps/mobile/src/components/game/internal/useAnchor.ts` (new)         |
| Flight planner — pure function from `GameEvent[] + PlayerView + AnchorSnapshot` → `ReadonlyArray<Flight>`                                                                                                                                         | `apps/mobile/src/store/flightPlanner.ts` (new)                        |
| Store additions: `flights: ReadonlyArray<Flight>`, actions `pushFlights`, `removeFlight`; remove dead `pendingView` machinery; fire **discard toast** in the `enqueueEvents` reducer                                                              | `apps/mobile/src/store/gameStore.ts` (modify)                         |
| `selectIsAnimating` selector — true while flights pending or animQueue non-empty; gates action bar and flow taps                                                                                                                                  | `apps/mobile/src/store/selectors.ts` (modify)                         |
| Anchor instrumentation on the components A just built: deck, discard, drawn-card preview, each own slot, each opponent slot, each opponent seat-centre                                                                                            | `DeckArea.tsx`, `OwnHandGrid.tsx`, `OpponentSeat.tsx`, `DrawFlow.tsx` |
| Slot **shake** animation on `match_failed` (200 ms horizontal jiggle; penalty flight starts after the shake)                                                                                                                                      | `OwnHandGrid.tsx`, `OpponentSeat.tsx` (modify)                        |
| Mount `FlyingCardLayer` as a sibling of `SafeAreaView`. The planner is invoked **synchronously inside `enqueueEvents`** (between the `receiveView` update and React's next render) so anchors that are about to mount/unmount are still readable. | `apps/mobile/app/(game)/[gameId]/index.tsx` (modify)                  |
| Permanent invisible **drawn landing zone** in `TableLayout` that owns the `drawn` anchor whether `DrawFlow` is mounted or not                                                                                                                     | `apps/mobile/src/components/game/TableLayout.tsx` (modify)            |
| Replace the 300 ms `eventDrain` timer with a flight-aware batch drain (the planner consumes one batch, then `dequeueEvents` runs when its flights complete; view promotion is immediate)                                                          | same file                                                             |
| Block the action bar while `selectIsAnimating === true`                                                                                                                                                                                           | `ActionBar.tsx` (modify)                                              |
| New tokens (`flightFast`, `flightSlow`, `flightShakeMs`, `flightDiscardToastMs`, `flightOverlayZ`, plus optional easing params)                                                                                                                   | `apps/mobile/src/design/tokens.ts`                                    |
| New i18n key `game.flight.discardToast = "{{name}} discarded {{card}}"`                                                                                                                                                                           | `apps/mobile/src/i18n/locales/en.json`                                |
| Tests for `flightPlanner`, `anchorRegistry`, `selectIsAnimating`                                                                                                                                                                                  | new `*.test.ts` files                                                 |

### The flight queue contract

```ts
type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

type AnchorId =
  | { readonly kind: 'deck' }
  | { readonly kind: 'discard' }
  | { readonly kind: 'drawn' } // permanent drawn-card landing zone
  | { readonly kind: 'ownSlot'; readonly index: number }
  | { readonly kind: 'opponentSlot'; readonly playerId: PlayerId; readonly index: number }
  | { readonly kind: 'opponentSeat'; readonly playerId: PlayerId }; // seat centroid

type Flight = {
  readonly id: string; // unique; used as the React key
  readonly fromAnchor: AnchorId; // for debugging / tests
  readonly toAnchor: AnchorId;
  readonly fromCoords: Rect; // absolute screen coords, snapshotted at planner time
  readonly toCoords: Rect; // absolute screen coords, snapshotted at planner time
  readonly cardId: CardId | null; // null = render face-down back only
  readonly faceUp: boolean; // false = render the card-back through the whole flight
  readonly durationMs: number; // 350 baseline, 500 for cross-table swap
  readonly delayMs: number; // 0 unless this flight follows a shake
};
```

`flightPlanner(batch, view, anchorSnapshot)` is a **pure function** that takes
one event batch (one `applyMove` worth of events), the current `PlayerView`,
and a snapshot of the anchor registry, and returns the flights to run.
Every flight bakes its source/destination coords in at planner time, so the
layer never reads the registry mid-flight. The layer mounts one
`Animated.View` per flight, positioned absolutely, interpolating
`translateX`/`translateY` from `fromCoords` to `toCoords` over `durationMs`
(with `Easing.bezier(0.25, 0.46, 0.45, 0.94)` for a slight ease-out). On
completion, `removeFlight(id)` fires; when the last flight in a batch
completes, `dequeueEvents()` runs and the planner is invoked on the next
batch (if any).

### Event → flight mapping

The planner receives one batch (events from one `applyMove` call) and the
**current** `PlayerView`. It produces flights for **both perspectives** —
self moves and bot/human-opponent moves. Source/destination anchors are
chosen by inspecting the event payload (`playerId` resolves self vs.
opponent; `cardId` resolves which face the flight renders).

#### Self perspective (`event.playerId === view.self`)

| Engine event                                | Flights                                                                                                                                                                                  | `faceUp` | Notes                                                                                                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `card_drawn`                                | `deck → drawn` (350 ms)                                                                                                                                                                  | true     | View has already promoted by planner time. The permanent drawn landing zone owns the destination anchor; card identity is read from the now-current `view.drawnCardId`. |
| `card_swapped` (drawn ↔ slot N)             | parallel: `drawn → ownSlot(N)` (new card, faceUp from `view.players[self].knownCards[N]` if known else faceDown), and `ownSlot(N) → discard` (old card, `event.discardedCardId`, faceUp) | mixed    | The two cards trade places; `event.discardedCardId` resolves the rank/suit for the discard flight.                                                                      |
| `card_discarded` (lone)                     | `drawn → discard` (350 ms)                                                                                                                                                               | true     | Discard button path. Triggered for the discarded drawn card; `cardId` from the event resolves the face.                                                                 |
| `match_succeeded` kind=`match_hand`         | parallel: `ownSlot(A) → discard` + `ownSlot(B) → discard`                                                                                                                                | true     | Both `discardedCardIds` map to the two slot flights.                                                                                                                    |
| `match_succeeded` kind=`match_drawn`        | parallel: `drawn → discard` + `ownSlot(N) → discard`                                                                                                                                     | true     | The drawn card and the chosen slot's card both go to discard.                                                                                                           |
| `match_succeeded` kind=`match_discard`      | `ownSlot(N) → discard`                                                                                                                                                                   | true     | One flight.                                                                                                                                                             |
| `match_failed`                              | **No flight.** Triggers a 200 ms slot-shake on `event.slotIndices`.                                                                                                                      | n/a      | Penalty flight is keyed off `penalty_card_dealt`, not `match_failed` (separation lets us tune shake/penalty independently).                                             |
| `penalty_card_dealt` (recipient = self)     | `deck → ownSlot(handSize − 1)` (350 ms, **delayMs = 200** so the shake plays first)                                                                                                      | false    | Engine has already pushed the penalty card; `view.players[self].handSize` reflects the new size, so `handSize − 1` is the destination slot index.                       |
| `peeked` (peek_self / peek_opponent powers) | **No flight.**                                                                                                                                                                           | n/a      | `PowerFlow`'s reveal sheet owns the visible-to-player part. The seat itself stays face-down (Package A bug fix).                                                        |
| `peek_one_chosen` (initial peek phase)      | **No flight.**                                                                                                                                                                           | n/a      | `PeekOverlay` already shows the picked card with a flip; we reuse its existing animation.                                                                               |
| `swapped_blind`                             | parallel: `ownSlot(N) → opponentSlot(target, M)` + `opponentSlot(target, M) → ownSlot(N)` (500 ms)                                                                                       | false    | Cross-table swap. Both cards stay face-down throughout — neither side learns the other's card from this move.                                                           |
| `card_discarded` (already in a swap/match)  | dropped (the swap/match rows above already produced the discard flight)                                                                                                                  | —        | Avoid double-flighting the same physical card.                                                                                                                          |

#### Opponent perspective (`event.playerId !== view.self`)

| Engine event                                | Flights                                                                                                                          | `faceUp` | Notes                                                                                                                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `card_drawn`                                | `deck → opponentSeat(playerId)` (350 ms)                                                                                         | false    | We don't render a "their drawn preview"; the seat-centre anchor is the destination.                                                                                            |
| `card_swapped`                              | parallel: `opponentSeat(playerId) → opponentSlot(playerId, N)` + `opponentSlot(playerId, N) → discard` (`event.discardedCardId`) | mixed    | The opponent slot stays face-down for its inbound flight; the discard flight flips face-up at the source moment because the engine reveals the discarded `cardId` to everyone. |
| `card_discarded` (lone)                     | `opponentSeat(playerId) → discard`                                                                                               | true     | Discard button path for an opponent.                                                                                                                                           |
| `match_succeeded` kind=`match_hand`         | parallel: `opponentSlot(playerId, A) → discard` + `opponentSlot(playerId, B) → discard`                                          | true     | Mirrors self-side.                                                                                                                                                             |
| `match_succeeded` kind=`match_drawn`        | parallel: `opponentSeat(playerId) → discard` + `opponentSlot(playerId, N) → discard`                                             | true     | Same as self but with seat-centre instead of `drawn`.                                                                                                                          |
| `match_succeeded` kind=`match_discard`      | `opponentSlot(playerId, N) → discard`                                                                                            | true     |                                                                                                                                                                                |
| `match_failed`                              | **No flight.** Slot-shake on `opponentSlot(playerId, idx)` for each `event.slotIndices[i]`.                                      | n/a      |                                                                                                                                                                                |
| `penalty_card_dealt` (recipient = opponent) | `deck → opponentSlot(playerId, handSize − 1)` (delayMs = 200)                                                                    | false    |                                                                                                                                                                                |
| `peeked` (opponent uses 7- or 8-power)      | **No flight.**                                                                                                                   | n/a      | If self is the target, the reveal sheet already owns it. If self is _not_ involved, no UI cue is needed (it's their private knowledge).                                        |
| `swapped_blind` (opponent ↔ third party)    | parallel: `opponentSlot(p1, N) → opponentSlot(p2, M)` + `opponentSlot(p2, M) → opponentSlot(p1, N)` (500 ms)                     | false    | Three-bot games only; both cards face-down.                                                                                                                                    |

#### No-flight events (every batch can drain immediately if it contains only these)

`turn_ended`, `peek_chosen`, `peek_phase_ended`, `power_activated`,
`pablo_called`, `deck_reshuffled`, `round_ended`. Banner / overlay /
toast surfaces own them; the planner returns `[]`.

### Design decisions

| Decision                                                       | Choice                                                                                                                                                                                                                                                                                                        | Rationale                                                                                                                                                                                                                                                                                              | Alternatives rejected                                                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flight overlay                                                 | Screen-root absolute `View`, mounted as a sibling of `SafeAreaView` (not a child), above all overlays via a token z-index                                                                                                                                                                                     | `measureInWindow` returns absolute screen coords; placing the overlay anywhere with non-zero offset would shift every flight by that offset.                                                                                                                                                           | Inside `SafeAreaView`: introduces a hidden offset that every consumer of the registry would have to subtract.                                                     |
| **View promotion timing**                                      | **Promote-first.** `receiveView(newView)` updates `view` unconditionally; the flight queue animates the transition that just happened. Anchors snapshot at planner time, so flights survive subsequent unmounts.                                                                                              | State stays current; animations describe what just happened. The previous "promote when flights drain" idea forced every consumer that owns an anchor to render against `pendingView`, leaking flight-layer concerns everywhere.                                                                       | Promote-after-flight: drowns `GameScreen` and `DrawFlow` in `pendingView` plumbing.                                                                               |
| **Planner trigger**                                            | Run the planner **synchronously inside the `enqueueEvents` reducer**, between the prior `receiveView` (which has just updated `view`) and React's next render. At this moment, components that are about to unmount (e.g. `DrawFlow` after a swap) are still mounted and their anchors are still registered.  | Anchors snapshot at planner time. A `useLayoutEffect`-based trigger fires after commit, by which time `DrawFlow` has already unmounted on a swap. `applyAndFanout` calls view subs first, event subs second — so the planner sees the new view but the still-mounted-from-the-old-view component tree. | Planner in `useLayoutEffect`: misses anchors of components that unmount on the new view (e.g. `drawn` after a swap).                                              |
| **`drawn` anchor presence**                                    | **Permanent invisible landing zone** in `TableLayout`, registered as the `drawn` anchor whether `DrawFlow` is mounted or not. `DrawFlow` overlays the same coords when present.                                                                                                                               | Solves the symmetric chicken-and-egg: `card_drawn`'s destination doesn't exist pre-promotion (DrawFlow not yet mounted), and `card_swapped`'s source disappears post-promotion (DrawFlow unmounted). A persistent zone is the simplest fix and removes one race entirely.                              | Snapshot-only without a permanent zone: fails on `card_drawn` (drawn anchor never existed); registry-races: brittle.                                              |
| **Destination-slot placeholder**                               | Any anchor that is the **destination** of an active flight (i.e. listed as `to` in the current `flights` array) renders its content with `opacity: 0` until the flight lands. Source anchors render normally — view has promoted, so the slot already shows its post-event content, which is fine.            | With promote-first, a destination slot already shows the new card (the swapped-in card, the matched discard, the penalty). Without a placeholder, the flight overlay would visibly deliver the card "on top of itself". Hiding the destination until landing makes the flight legible.                 | No placeholder: visual ghost where the destination shows the card before the flight lands; sources don't need this because the overlay carries the leaving card.  |
| Anchor coords baked into the flight                            | `flightPlanner` reads a registry snapshot once at planner time and stores `fromCoords` / `toCoords` on the `Flight` object. The layer never reads the registry mid-flight.                                                                                                                                    | Anchors registered by ephemeral components can disappear before a flight completes. Snapshotting decouples flight rendering from anchor lifecycle and removes the worst class of race condition.                                                                                                       | Read registry on every frame: races on unmount; complicates worklets.                                                                                             |
| Anchor registry                                                | Module-level `Map<AnchorKey, Rect>` (keyed by stringified `AnchorId`); `useAnchor(id)` registers on `onLayout` via `measureInWindow` and unregisters on unmount. **No React context** — the registry is read by the planner outside the React tree.                                                           | The only writer is `useAnchor`; the only reader is `flightPlanner`. A context adds re-render fan-out for zero benefit.                                                                                                                                                                                 | React context: triggers re-renders when anchors update; not needed.                                                                                               |
| Flight duration                                                | 350 ms baseline, 500 ms for cross-table swaps. Sourced from `tokens.game.duration.flightFast` / `flightSlow`.                                                                                                                                                                                                 | Fast enough that gameplay isn't slow, long enough that the eye can follow.                                                                                                                                                                                                                             | 200 ms / 800 ms: too fast to track / drags out chains.                                                                                                            |
| Easing                                                         | `Easing.bezier(0.25, 0.46, 0.45, 0.94)` (CSS ease-out)                                                                                                                                                                                                                                                        | Natural-looking deceleration; matches phone OS animations.                                                                                                                                                                                                                                             | Linear: mechanical. Spring: overshoot wrong for positional move.                                                                                                  |
| Parallel vs sequential within one move                         | All flights from one batch resolve **in parallel**. Penalty-card flight after a `match_failed` is the one exception: `delayMs = tokens.game.duration.flightShakeMs` so the shake completes first.                                                                                                             | Matches how the engine produces events (one `applyMove` → one batch). Sequential within a batch would make `match_hand` feel slow.                                                                                                                                                                     | All-sequential: drags chain choreography.                                                                                                                         |
| Slot shake on `match_failed`                                   | **In scope for B.** 200 ms horizontal jiggle on each slot in `event.slotIndices`. Implemented in `OwnHandGrid` / `OpponentSeat` via Reanimated `withSequence(withTiming(±n), …)` triggered when a `match_failed` event whose `slotIndices` includes that slot enters the queue. No state in the global store. | Visually marks "you matched the wrong rank" before the penalty card arrives. Lives in the seat components rather than the flight layer because it's a slot-local effect, not a cross-component flight.                                                                                                 | Defer to Phase 7: the penalty flight without a shake reads as "deck just dealt me a card for no reason."                                                          |
| Discard toast                                                  | Always-on, fired in the **`enqueueEvents` reducer** for every `card_discarded` (lone or as part of a swap/match) and every `match_succeeded.discardedCardIds` entry. Template `game.flight.discardToast = "{{name}} discarded {{card}}"`; `name` via shared `resolveDisplayName`; `card` via `view.catalog`.  | Memory aid for every discard, regardless of who discarded. Reuses the Pablo-toast pattern (reducer-side side-effects gated on the event queue's de-dupe).                                                                                                                                              | Self-only: misses opponent discards (also a memory-game moment). Per-flight callback: ties the toast to flight completion timing rather than to the engine event. |
| Discard-toast deduplication                                    | One toast per **distinct `cardId` per batch**. A `card_swapped` batch contains both `card_swapped` and a `card_discarded` for the same swap; the toast fires once.                                                                                                                                            | The engine emits both events for one physical discard; users would see double-toasts otherwise.                                                                                                                                                                                                        | Two toasts: noisy, confusing.                                                                                                                                     |
| Mid-flight interactions                                        | A new selector `selectIsAnimating` returns `flights.length > 0 \|\| animQueue.pending.length > 0`. The action bar disables every item while `selectIsAnimating === true`. Flow overlays (`DrawFlow`, `MatchHandFlow`, `MatchDiscardFlow`, `PowerFlow`) gate their **dispatch** taps on the same selector.     | One source of truth. Engine already rejects out-of-version moves; this selector is purely a UX shield.                                                                                                                                                                                                 | Per-component disable flags: drift between surfaces.                                                                                                              |
| Removal of `pendingView`                                       | `gameStore.pendingView` and the queue-empty branch in `dequeueEvents` are deleted. `receiveView` always sets `view` immediately; `enqueueEvents`/`dequeueEvents` keep the batch queue solely as input to the planner.                                                                                         | With promote-first, `pendingView` is dead state. Removing it shrinks the store and removes one source of confusion.                                                                                                                                                                                    | Leave `pendingView` as a no-op: dead state attracts new misuse.                                                                                                   |
| Skia choreography (the "all cards on one canvas" architecture) | Deferred to Phase 7                                                                                                                                                                                                                                                                                           | Higher fidelity but a much heavier rewrite; the per-flight `Animated.View` approach reuses every existing `PlayingCard` instance.                                                                                                                                                                      | Build Skia now: 2–3× the work, locks in rendering pipeline before we know we need it.                                                                             |

### Test plan

- `flightPlanner.test.ts`: for **every** `GameEvent` variant from `packages/engine/src/types.ts` (currently 16 variants) and **both perspectives** (self and opponent), assert the planner returns the correct flight list — anchor IDs, durations, delays, parallelism, `faceUp` flag, `cardId` resolution. The planner is a pure function and is the most important test surface in Package B.
- `anchorRegistry.test.ts`: register / read / unregister round-trips; reading an unknown anchor returns `null`; re-registering with a new `Rect` overwrites cleanly.
- `useAnchor.test.tsx` (light): a mount harness verifies registration on `onLayout` and unregistration on unmount.
- `selectors.test.ts` extension: `selectIsAnimating` is `true` when either `flights` or `animQueue.pending` is non-empty, `false` otherwise.
- Discard-toast deduplication: `flightPlanner.test.ts` (or a sibling unit) asserts one toast per distinct `cardId` per batch when given a `card_swapped` batch (`card_swapped` + `card_discarded` for the same physical card).
- Existing engine, selector, and bot tests stay green.
- Manual checklist: a full 1-bot, 2-bot, and 3-bot game where the human and bots between them exercise: draw + discard, draw + swap, match_hand, match_drawn, match_discard, match_failed (penalty), peek_self, peek_opponent, swap_blind, Pablo. Every flight visible, every destination correct, no double-discard-toasts, no card jumps.

### Definition of Done (Package B)

- Every event variant in the planner table above produces the listed flights, with the right anchors, `faceUp` flag, durations, and `delayMs`.
- The promote-first model is in place: `view` updates immediately on `receiveView`, `pendingView` is removed, anchors snapshot at planner time.
- `match_failed` triggers a 200 ms slot shake on `event.slotIndices`; the corresponding `penalty_card_dealt` flight starts after the shake (delay = `flightShakeMs`).
- Cross-table `swapped_blind` animates own slot ↔ opponent slot (face-down on both legs).
- Every `card_discarded` cardId — whether lone, in a swap, or in a match — fires the `game.flight.discardToast` toast exactly once per batch via `enqueueEvents`. Both bot and self discards are announced.
- `selectIsAnimating` gates the action bar; flow overlays gate their dispatch on the same selector.
- `FlyingCardLayer` is a screen-root sibling of `SafeAreaView`; flights land within ±2 px of the registered anchor on iPhone 14 simulator (manual check).
- All planner / registry / selector unit tests pass.
- `bun run check` green.
- `docs/PLAN.md` updated under "Phase 4.5 — Card flights".

### Out of scope for Package B

- 🚫 Sound effects (Phase 7).
- 🚫 Haptics on flight landing (Phase 7).
- 🚫 Skia choreography (Phase 7).
- 🚫 Deck-shuffle animation (Phase 7).
- 🚫 Pablo banner choreography (already present, untouched).
- 🚫 Any change to `packages/engine` or to `supabase/functions/*`.

---

## Hard rules respected (both packages)

- **No engine changes.** All work is in `apps/mobile`. `packages/engine` and the bundle stay untouched.
- **No game logic in components.** The planner is a pure function from `GameEvent → Flight[]`; it reads what the engine published, never decides game state.
- **All user-visible strings via `t()`.** New toast keys go in `apps/mobile/src/i18n/locales/en.json`.
- **No hardcoded colors / spacings / durations.** New numerical constants go through `tokens` (`tokens.game.duration.flightFast`, `tokens.game.duration.flightSlow`, etc.).
- **Reanimated only on the UI thread.** Every flight uses `withTiming` inside a worklet; no JS-thread per-frame work.
- **Stable slot keys.** The 2×2 visual order is preserved by keying every slot by its `index`, never by its `cardId`.

---

## Decisions resolved (2026-05-18)

The open questions from the draft were settled with the user. Recording them
here so the per-branch plans don't re-litigate:

1. **3-opponent layout.** Use a **top row of three** rather than side flanking, so opponent cards stay readable (~60–72px) and the deck stays on its own band. Phone-only — iPad / web revisited post-v1.
2. **Opponent name placement.** Always **above the cards**, every seat. Drops the hybrid above/below/side rule.
3. **Grid unification.** Replace `HandGrid` with an `OwnHandGrid` wrapper that uses `CardSlotGrid` underneath. Single layout engine for both own and opponent seats.
4. **Pablo button.** **Action bar only.** Remove the per-seat Pablo button from the new `OpponentSeat`. `PabloBanner` + a one-shot toast announce every caller (bot or human).
5. **Bot Pablo behaviour.** Already implemented in `bot.ts` (off-turn ≤ 8, on-turn ≤ 5 with 1/30 prob.). **No change in Package A**; rebalance after playtest.
6. **Discard toast (memory aid).** A 1.5 s toast naming the discarded card. **Belongs to Package B**, not A, because Package B owns the discard-event animation and deduplication surface.
7. **Safe areas.** Use `useSafeAreaInsets()` in `TableLayout`. Phone-only.
8. **Tokens.** New size + spacing tokens (`ownCardMax`, `opponentCardMd`, `opponentCardSm`, `table.seatPadding`) replace inline numbers.
9. **Branch names.** `phase-4-5-table-layout` (A) and `phase-4-5-flying-cards` (B).
10. **Order.** A → B. Confirmed.
11. **Plan locations.** Master plan = this doc. Branch plans = `docs/plans/<branch>.md`, committed in the same branch as the implementation per AGENTS.md #9.
12. **`CardSlotGrid` API.** Extend with optional `cardWidth?` + `slotWrapper?`; do not fork layout in `OwnHandGrid`.
13. **Pablo toast.** Wire in `enqueueEvents` reducer, not `GameScreen`.
14. **Display names.** `resolveDisplayName` in `apps/mobile/src/store/displayName.ts`; refactor `PabloBanner` to use it.
15. **Seat geometry.** `seatLayout` returns absolute pixel `SeatBox`es; `TableLayout` uses absolute positioning (Package B anchor prep).
16. **Package B — view promotion.** Promote-first. `receiveView` updates `view` unconditionally; flight coords snapshot at planner time. The `pendingView` field is removed from the store.
17. **Package B — penalty flight trigger.** Keyed off `penalty_card_dealt`, not `match_failed`. `match_failed` triggers a 200 ms slot shake on `event.slotIndices`; the penalty flight starts at `delayMs = flightShakeMs`.
18. **Package B — opponent flights.** Explicit, not derived. Opponent draws / swaps / matches / penalties have their own mapping using `opponentSeat(playerId)` and `opponentSlot(playerId, idx)` anchors. Cross-table `swapped_blind` animates between two opponents in 3-bot games.
19. **Package B — discard toast.** Always-on, fired in `enqueueEvents`. Template `game.flight.discardToast = "{{name}} discarded {{card}}"`. Name via shared `resolveDisplayName`, card via `view.catalog`. One toast per distinct `cardId` per batch (de-dupe across `card_swapped` + `card_discarded`).
20. **Package B — animation gating.** `selectIsAnimating` selector (true while flights pending or animQueue non-empty) gates the action bar and every flow overlay's dispatch.
21. **Package B — `FlyingCardLayer` mount point.** Sibling of `SafeAreaView` at the screen root. `measureInWindow` returns absolute screen coords, so any non-zero overlay offset would shift every flight uniformly.
22. **Package B — anchor registry.** Module-level `Map`, no React context. `useAnchor(id)` registers on `onLayout` via `measureInWindow`, unregisters on unmount. Planner reads once at planning time.
23. **Package B — planner trigger.** Run **synchronously inside the `enqueueEvents` reducer**. `applyAndFanout` calls view subs first, event subs second, so by the time `enqueueEvents` fires, `view` is already promoted but React has not yet re-rendered. Components about to mount/unmount on the new view are still in the tree, so their anchors are still readable. A `useLayoutEffect` trigger would fire after commit and miss anchors that just unmounted.
24. **Package B — `drawn` anchor presence.** Permanent invisible "drawn landing zone" registered by `TableLayout`. `DrawFlow` overlays the same coords when mounted. Solves both `card_drawn` (destination doesn't exist pre-promotion) and `card_swapped` (source disappears post-promotion).
25. **Package B — destination-slot placeholder.** Any anchor that is a `to` of an active flight renders its content with `opacity: 0` until the flight lands. Sources don't need this — the flight overlay carries the leaving card and the source slot's post-event content (whatever it is) is fine to show.

---

## Estimated timeline

| Package          | Detailed-plan write | Implementation | Self-review + gates | Total     |
| ---------------- | ------------------- | -------------- | ------------------- | --------- |
| A — Table layout | ~30 min             | ~1 day         | ~1 hour             | ~1.5 days |
| B — Card flights | ~1 hour             | ~3 days        | ~3 hours            | ~3.5 days |

Tokens: roughly $$ for A, $$$ for B (matching the PLAN.md token-budget convention).

---

## What goes into `docs/PLAN.md` after each merge

- **After A merges**: append a "Phase 4.5 — Table layout" Done section; add decisions for orientation = upright, deck-at-centre, deletion of `OpponentRow`. Mark the opponent-peek bug fixed.
- **After B merges**: append a "Phase 4.5 — Card flights" Done section; add decisions for promote-first flight animations, parallel-within-move flights, toast-on-discard, Skia deferred to Phase 7.

Both updates also belong in the AGENTS.md self-review checklist (the producer of each branch is responsible for the PLAN.md update before squash-merging).

---

## What this plan deliberately does NOT do

- **Does not modify the engine.** `peek_one_chosen`, `use_peek_*`, `use_swap_blind`, and `penalty_card_dealt` are all already in the engine event/move surface. We're only changing how the client renders the events they emit.
- **Does not change RLS, edge functions, or the engine bundle.** Phase 5 work is untouched.
- **Does not introduce a new dependency.** Reanimated 4 (already present, with `react-native-worklets`), gesture-handler (already present), Skia (already present). No `react-native-shared-element`, no `lottie-react-native`.
- **Does not redesign the action bar, peek overlay, match flows, or power flows.** All five already underwent the rewrite we just shipped; this overhaul lives one layer up (table layout) and one layer above (flight overlay).
