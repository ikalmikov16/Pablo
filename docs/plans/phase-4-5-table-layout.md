# Phase 4.5 / Package A — Table layout + grid unification + single Pablo button

> Branch: `phase-4-5-table-layout`
> Master plan: `docs/plans/phase-4-5-ux-overhaul.md`
> Status: **plan — awaiting approval before code.** Per AGENTS.md hard rule #9,
> this doc must be approved before any source change lands on the branch.

## One-sentence goal

Replace the vertically-stacked opponent rows with a fixed, safe-area-aware
poker-table layout where every seat renders through one unified
`CardSlotGrid`, the opponent-peek leak is fixed, and Pablo lives in exactly
one place — the action bar — with a banner + toast announcing whoever calls.

---

## Confirmed implementation decisions (locked)

These were agreed before implementation. Do not substitute alternatives
without updating both this doc and `docs/plans/phase-4-5-ux-overhaul.md`.

| #   | Decision                                            | Locked choice                                                                                                                                                                                                                                                                                                                   | Rejected                                                                                                |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | **Unify grids via `CardSlotGrid`**                  | Extend `CardSlotGrid` with two **optional** props: `cardWidth?` (table-pinned slot size) and `slotWrapper?` (render-prop: `(slot, children) => node`). `OwnHandGrid` passes `slotWrapper` to wrap each slot in `Animated.View` + `LinearTransition`. All existing flow callers keep their current props — no behaviour change.  | A second layout engine inside `OwnHandGrid`; forking `CardSlotGrid` internals without the public props. |
| 2   | **Pablo toast wiring**                              | Fire `showToast` inside the **`enqueueEvents` reducer** when a `pablo_called` event is pushed. Exactly once per event (queue de-dupes by `eventId`). **Never** in `GameScreen` `useEffect` or on `promoteView`.                                                                                                                 | Toast in `GameScreen`: re-fires on re-renders; couples the screen to event plumbing.                    |
| 3   | **Caller display names**                            | Add `apps/mobile/src/store/displayName.ts` with `resolveDisplayName(view, id)`. Refactor **`PabloBanner`** to use it (in scope for A). Toast uses the same helper. Unit-test: bot id → `botName`, `self` → `t('game.you')`, human → entry display name.                                                                         | Duplicate `botName` / `t('game.you')` logic in the reducer and banner.                                  |
| 4   | **`seatLayout` output + `TableLayout` positioning** | `seatLayout` returns **absolute pixel `SeatBox`** (`top`, `left`, `width`, `height`) plus `opponentCardWidth` / `ownCardWidth`. `TableLayout` places every child with `position: 'absolute'` inside a full-screen container. Intentional prep for Package B anchor registration — no flex-only table, no normalized 0–1 coords. | Flex bands that reflow on name wrap; normalized anchors requiring a second conversion step.             |

---

## Why this branch exists

Phase 4 shipped a functional but spatially confusing game UI:

- Opponents render in a vertical strip; no "seat" anchor.
- After a `use_peek_opponent` resolves, the targeted slot stays face-up
  forever on the opponent row (because `OpponentRow` renders any
  `knownCards[i]` as face-up).
- Two Pablo controls exist — the action bar item _and_ a per-opponent
  button — and the per-opponent one dispatches `call_pablo` for `self`
  while its `pabloCallable` gate reads from the opponent's legal moves.
  Confusing; one source of truth wins.
- `HandGrid` and `CardSlotGrid` duplicate the same layout math.

This branch resolves all four in a single coherent change, _without_
animations (Package B owns motion).

---

## Files touched

### New

| Path                                                          | Purpose                                                                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/components/game/OpponentSeat.tsx`            | Name (above), score, face-down 2×2 grid via `CardSlotGrid`. No Pablo button.                             |
| `apps/mobile/src/components/game/OwnHandGrid.tsx`             | Thin wrapper: store → `CardSlot[]` → `CardSlotGrid`, with selection / highlights / `LinearTransition`.   |
| `apps/mobile/src/components/game/TableLayout.tsx`             | Absolute-positioned seats + centred deck/discard, safe-area aware. Owns no game logic.                   |
| `apps/mobile/src/components/game/internal/seatLayout.ts`      | Pure geometry helper. Returns seat boxes + deck anchor for 1 / 2 / 3 opponents.                          |
| `apps/mobile/src/components/game/internal/seatLayout.test.ts` | Unit tests: deterministic boxes, no overlap, deck centred, insets respected.                             |
| `apps/mobile/src/components/game/OpponentSeat.test.tsx`       | (Optional, light) — at minimum a snapshot of name above + face-down regardless of `knownCards` contents. |

### Modified

| Path                                                        | Change                                                                                                                                                                                                                                              |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/components/game/internal/CardSlotGrid.tsx` | Extend to support the own-hand wrapper: accept an optional `slotWrapper` render override (so `OwnHandGrid` can wrap each slot in `Animated.View` with `LinearTransition`) and an optional `cardWidth` override (so the table layout can pin sizes). |
| `apps/mobile/src/components/game/DeckArea.tsx`              | Accept a `cardWidth` prop (tokens) instead of inlined `CARD_W = 72`. Visual / sizing only; behaviour unchanged.                                                                                                                                     |
| `apps/mobile/app/(game)/[gameId]/index.tsx`                 | Replace the `opponents.map(... <OpponentRow />)` block + `<DeckArea />` + `<HandGrid />` triplet with `<TableLayout opponents={...} catalog={...} deck={...} ownHand={<OwnHandGrid ... />} />`. Drop the per-opponent Pablo wiring entirely.        |
| `apps/mobile/src/store/gameStore.ts`                        | In **`enqueueEvents`**: on `pablo_called`, call `showToast` with `resolveDisplayName(view, playerId)`. Not in `GameScreen`. See "Pablo toast wiring".                                                                                               |
| `apps/mobile/src/store/displayName.ts`                      | **`resolveDisplayName(view, id)`** — shared by `PabloBanner` and the Pablo toast. Unit-tested.                                                                                                                                                      |
| `apps/mobile/src/components/game/PabloBanner.tsx`           | Refactor to import `resolveDisplayName` instead of inline name logic. Behaviour unchanged.                                                                                                                                                          |
| `apps/mobile/src/design/tokens.ts`                          | Add `tokens.game.size.ownCardMax`, `opponentCardMd`, `opponentCardSm`; add `tokens.game.table.seatPadding`, `seatGap`, `nameGap`, `deckGap`. Replaces magic numbers in the new components.                                                          |
| `apps/mobile/src/i18n/locales/en.json`                      | Add `game.pablo.calledToast = "{{name}} called Pablo!"`.                                                                                                                                                                                            |

### Deleted

| Path                                              | Why                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/mobile/src/components/game/OpponentRow.tsx` | Single consumer (`GameScreen`); replaced by `OpponentSeat`.                                                        |
| `apps/mobile/src/components/game/HandGrid.tsx`    | Single consumer (`GameScreen`); replaced by `OwnHandGrid` which delegates to `CardSlotGrid` for the layout engine. |

### Not touched

- `packages/engine/**`
- `supabase/functions/**`
- `supabase/migrations/**`
- `apps/mobile/src/supabase/internal/bot.ts` and `botScheduler.ts` — bot Pablo logic already correct.
- `PabloBanner.tsx` — banner stays as-is.
- All `actionFlows/*` — they already use `CardSlotGrid`.

---

## Component design

### `seatLayout(opponentCount, screenW, screenH, insets)` — pure geometry

Pure function. Output is consumed by `TableLayout`. Returns absolute boxes
because that's what we need for stable Package B flight anchors.

```ts
export type SeatBox = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};

export type SeatLayout = {
  readonly opponents: ReadonlyArray<SeatBox>; // length === opponentCount, in turn order
  readonly self: SeatBox;
  readonly deck: SeatBox; // the deck+discard band (a row of two cards)
  readonly opponentCardWidth: number; // shared across all opponent seats
  readonly ownCardWidth: number;
};

export function seatLayout(
  opponentCount: 1 | 2 | 3,
  screenW: number,
  screenH: number,
  insets: { top: number; bottom: number; left: number; right: number },
): SeatLayout;
```

Geometry per opponent count (vertical bands from top to bottom, all
inside the safe area, with `seatPadding` between bands):

| Count | Opponent band                                                        | Deck band                  | Own band                  |
| ----- | -------------------------------------------------------------------- | -------------------------- | ------------------------- |
| 1     | 1 seat centred, `opponentCardMd`                                     | 1 deck+discard row centred | own 2×2 with `ownCardMax` |
| 2     | 2 seats side-by-side, each at half of usable width, `opponentCardMd` | as above                   | as above                  |
| 3     | 3 seats side-by-side, each at one third, `opponentCardSm`            | as above                   | as above                  |

Inside each seat box the contents are laid out by `OpponentSeat` /
`OwnHandGrid`:

```
┌────────────────────┐  <-- SeatBox
│  Name      (1)     │
│  Score (small)     │
│  [2×2 card grid]   │
└────────────────────┘
```

The function is deterministic — same args, same output — and never
reads from React / store / dimensions API; all those are threaded as
arguments. Tests instantiate it with hard-coded phone sizes (SE 320×568,
iPhone 16 Pro Max 430×932) and check boxes don't overlap, fit in screen
minus insets, and the deck is horizontally centred.

### `OpponentSeat`

Props:

```ts
type Props = {
  readonly entry: PlayerViewEntry;
  readonly displayName: string;
  readonly cardWidth: number;
  readonly isCurrent: boolean;
};
```

Renders a vertical stack:

1. Name (single line, truncated with ellipsis).
2. Score label using existing `game.score` key.
3. `CardSlotGrid` with `slots = Array.from({length: handSize}, (_, i) => ({index: i, card: null}))`.

Always face-down (`faceUpFor` not provided → defaults to `false`). The
opponent-peek leak is fixed by construction — `OpponentSeat` does not
consult `entry.knownCards` at all. (`PowerFlow`'s reveal sheet, which is
the only legitimate consumer of `knownCards` from an opponent
perspective, is unchanged.)

Tap targets: opponent seats are non-interactive in idle gameplay; taps
on opponent slots are owned by `PowerFlow` (peek_opponent / swap_blind)
and that flow renders its own `CardSlotGrid` over the table.

### `OwnHandGrid`

Thin wrapper around `CardSlotGrid` that:

1. Reads `selectMyHandSlots` and `selectSelection` from the store.
2. Translates `HandSlot[]` into `CardSlot[]` for `CardSlotGrid`.
3. Passes through `highlightIndices` / `onSlotTap` from props.
4. Wraps each slot in `Animated.View` with `LinearTransition` (today's
   `HandGrid` behaviour) via a new optional `slotWrapper` render-prop on
   `CardSlotGrid`.

Default sizing is `tokens.game.size.ownCardMax`. The component never
touches engine functions directly; selectors do the work.

### `CardSlotGrid` extension (decision #1 — locked)

Two additive props (both optional) to support `OwnHandGrid` and the
table's pinned widths. **Do not** duplicate layout math in `OwnHandGrid`:

```ts
type CardSlotGridProps = {
  // ...existing fields unchanged...
  readonly cardWidth?: number; // pins width instead of computing from gridWidth
  readonly slotWrapper?: (slot: CardSlot, children: React.ReactNode) => React.ReactNode;
};
```

When `cardWidth` is provided, `gridWidth` becomes optional and is only
used as a safety cap. The `slotWrapper` lets `OwnHandGrid` wrap each
slot in `Animated.View` while opponents and flows keep the plain `View`.
Existing callers are not changed (props are optional and backwards-compatible).

Add a focused test (or extend an existing `CardSlotGrid` test file) that
mounts `OwnHandGrid` with a stub `slotWrapper` and asserts the wrapper
receives each slot index — guards the render-prop path without a Skia snapshot.

### `TableLayout` (decision #4 — locked)

Owns no game logic. Reads `useSafeAreaInsets()` and `Dimensions` once;
calls `seatLayout(opponentCount, w, h, insets)`; renders **absolute-
positioned** children (`position: 'absolute'`, `top` / `left` / `width` /
`height` from each `SeatBox`). No flex-based seat bands.

Props:

```ts
type Props = {
  readonly opponents: ReadonlyArray<PlayerViewEntry>;
  readonly displayName: (id: PlayerId) => string;
  readonly currentPlayerId: PlayerId | null;
  readonly deck: React.ReactNode; // a configured DeckArea
  readonly ownHand: React.ReactNode; // a configured OwnHandGrid
};
```

The component is presentational; `GameScreen` continues to own the
dispatch wiring.

### `DeckArea` change

Drop the inlined `CARD_W = 72`. Accept a `cardWidth` prop (defaulted to
`tokens.game.size.opponentCardMd` for backwards-compat). Tests for
`DeckArea` (if any) stay green; this is a styling tweak only.

### Pablo toast wiring (decisions #2 and #3 — locked)

`PabloBanner` already handles the persistent banner. The toast is
additive: when an event batch contains a `pablo_called` event, fire
`showToast({ message: t('game.pablo.calledToast', { name }) })` once.

**Where:** inside **`enqueueEvents`** in `gameStore.ts`, at the moment
the `pablo_called` event is appended to the queue. The reducer already
has access to `view` and `showToast`. **Not** in `GameScreen`.

**Why not `GameScreen`:** the store owns the event queue, de-dupes by
`eventId`, and promoting the view must not re-trigger UI side effects.
`GameScreen` stays presentational after the table rewrite.

**Display name (decision #3):** call `resolveDisplayName(view, event.playerId)`
from `apps/mobile/src/store/displayName.ts`. Refactor `PabloBanner` to use
the same helper so banner and toast never diverge. Cases to unit-test:

- Bot player id → `botName(id)` (e.g. "Cabo Cassette").
- `view.self` → `t('game.you')`.
- Human opponent (Phase 6) → name from `view.players` entry.

---

## State / data flow (no change)

The store, selectors, and engine event flow are untouched. We're only
reshuffling components. Every selector continues to read the same
`PlayerView` it does today. `enqueueEvents → eventDrain → promoteView`
keeps its 300 ms timing (flight-aware drain is Package B).

---

## Test plan

### Unit (Bun test)

| File                                                               | What                                                                                                                                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/components/game/internal/seatLayout.test.ts`      | For each `opponentCount ∈ {1,2,3}` and each device profile (SE 320×568, iPhone 14 390×844, iPhone 16 Pro Max 430×932), assert:                                                        |
|                                                                    | • All seat boxes fall inside the safe area.                                                                                                                                           |
|                                                                    | • No two boxes overlap.                                                                                                                                                               |
|                                                                    | • Deck band is horizontally centred (\|deckCenter - screenCenter\| ≤ 1).                                                                                                              |
|                                                                    | • `opponentCardWidth` matches the chosen token for the count.                                                                                                                         |
|                                                                    | • `ownCardWidth` is exactly `ownCardMax` on all profiles where the band can fit it.                                                                                                   |
| `apps/mobile/src/components/game/OpponentSeat.test.tsx` (optional) | Mount with `entry.knownCards = { 0: 'card-id', 1: 'card-id' }` and assert no rendered text matches the card's rank — i.e. the seat does not leak even when `knownCards` is populated. |
| `apps/mobile/src/store/displayName.test.ts`                        | Bot ids resolve via `botName`; `self` resolves via `t('game.you')`; humans resolve via view entries. (3 cases.)                                                                       |

### Existing tests that must stay green

- `apps/mobile/src/store/selectors.test.ts` — no selector signature change.
- `packages/engine/**` — untouched.
- `apps/mobile/src/supabase/internal/bot.test.ts` — untouched.

### Manual checklist (added to `docs/plans/phase-4-5-table-layout.md` after merge as part of the self-review)

Run on iPhone 14 simulator + iPhone SE (smallest target):

1. Start a 1-bot game.
   - One opponent at the top, name above the 2×2.
   - Deck + discard centred between opponent and own hand.
   - Pablo only in action bar; banner appears when self calls Pablo, and a toast says "You called Pablo!".
2. Start a 2-bot game.
   - Two opponents side-by-side at top, same card size.
   - Deck centred; own hand at bottom.
3. Start a 3-bot game.
   - Three opponents in a top row, each with a readable 2×2 (~60px).
   - No layout overflow / clipped names.
4. Use the peek-self power → reveal sheet shows the card, then closes → the opponent's own slot is face-down on _their_ seat (it always was, but verify nothing leaks now).
5. Use the peek-opponent power on Bot 1 → reveal sheet shows the card, then closes → Bot 1's seat shows _only_ face-down backs (this is the bug fix).
6. Use blind-swap to swap with Bot 1 → afterwards Bot 1's seat is still face-down.
7. Wait for a bot to call Pablo (force the threshold by simulating a low hand if necessary). Confirm the banner shows the bot's name and the toast fires once.
8. Verify on a notched device that the deck and seats are not under the notch / home indicator.

---

## Risks and mitigations

| Risk                                                                                                                  | Mitigation                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CardSlotGrid` extension complicates the API and breaks existing flows.                                               | Both new props are optional and additive; existing callers compile and behave identically. Add a unit test for `OwnHandGrid` that exercises the `slotWrapper` path.                                                                             |
| `LinearTransition` on slot wrappers stops working when wrapped via render-prop.                                       | Snapshot today's `HandGrid` slot key (`slot-${index}`) and reuse the exact same key inside `OwnHandGrid`. Reanimated keys off the React key; identical keys → identical behaviour.                                                              |
| `seatLayout` produces overlap on very small phones.                                                                   | Tests cover SE 320×568. If the band height budget is too tight at 3 opponents, the layout falls back to `opponentCardSm` and clips the score label (single line, truncated). Acceptable for v1; revisit Phase 7.                                |
| The Pablo toast double-fires if `enqueueEvents` is called multiple times with the same batch (e.g. across reconnect). | The event queue already de-dupes by `eventId`. We only fire the toast inside the reducer that pushes the event, not on view promotion, so each event triggers exactly one toast.                                                                |
| Phase 5 lands on `main` between A's branch start and merge.                                                           | This branch only touches `apps/mobile`. Phase 5's diff is in `supabase/**` and `apps/mobile/src/supabase/realClient.ts`. Rebase or merge `main` into `phase-4-5-table-layout` once Phase 5 lands; no expected conflicts in this branch's files. |

---

## Sequencing

A branch typically takes about a day. Suggested order on the branch:

1. Tokens (`tokens.ts`) — additive, no behaviour change.
2. `seatLayout.ts` + tests — pure function, no UI yet.
3. `CardSlotGrid` extension + tests — keep existing callers green.
4. `OwnHandGrid` — swap into `GameScreen` behind a small commit to verify visual parity with `HandGrid`.
5. `OpponentSeat` — render a static 2×2 for one opponent first.
6. `TableLayout` — wire all seats; switch `GameScreen` to it.
7. Remove `OpponentRow.tsx` and `HandGrid.tsx`.
8. Pablo toast wiring + `displayName.ts` helper + i18n key.
9. `DeckArea` size prop.
10. Manual checklist + `bun run check`.
11. Update `docs/PLAN.md` (Done section for Phase 4.5 / A) and decisions table.
12. Push branch; stop. Wait for explicit "merge".

---

## Definition of Done (mirrors master plan)

- All seats render through `CardSlotGrid` (own via `OwnHandGrid`).
- 3-opponent layout is top-row; not side flanking.
- Opponent names always above cards.
- Opponent slots are face-down regardless of `knownCards`.
- Deck/discard centred; safe-area aware.
- Pablo button: action-bar-only; banner + toast announce the caller.
- Pablo toast fires from **`enqueueEvents` only**; `resolveDisplayName` shared with `PabloBanner`.
- `CardSlotGrid` extended with `cardWidth?` + `slotWrapper?`; `OwnHandGrid` does not fork layout math.
- `seatLayout` returns absolute `SeatBox` pixels; `TableLayout` uses absolute positioning.
- `OpponentRow.tsx` and `HandGrid.tsx` deleted; no stale imports.
- New tokens used; no magic numbers in new components.
- `seatLayout` unit-tested for 1 / 2 / 3 opponents and inset handling.
- `bun run check` green.
- `docs/PLAN.md` updated.

---

## Out of scope (Package B owns these)

- Card-flight animations / `FlyingCardLayer` / `AnchorRegistry`.
- Discard toast ("You discarded the 4♥").
- Flight-aware view promotion.
- Cross-table swap_blind animation.
- Bot Pablo threshold tuning.
- iPad / web layouts.
- Engine, edge functions, RLS changes.

---

## Open questions

None — product decisions are in `docs/plans/phase-4-5-ux-overhaul.md`
"Decisions resolved"; implementation mechanics are locked in
**"Confirmed implementation decisions"** above. If anything surfaces
during implementation it gets logged under a new "Implementation notes"
section here (and mirrored in the master plan if it changes scope), not
silently absorbed.
