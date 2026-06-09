# Phase 4.5 / Package B — Card-flight animations

> Branch: `phase-4-5-flying-cards`
> Master plan: `docs/plans/phase-4-5-ux-overhaul.md`
> Status: **Package B + B.1 implemented** on `phase-4-5-table-layout`.
> Package B.1 (memory-critical swap/discard choreography) is specified below and
> landed in the same branch.

## One-sentence goal

Add visible, deterministic card-flight animations for draws, swaps, discards,
matches, failed-match penalties, and blind swaps so the player can track each
card's spatial movement without reading changing labels or inferring from state
jumps.

---

## Confirmed implementation decisions (locked)

These decisions replace the earlier "hold the view until flights drain" sketch.
Do not substitute alternatives without updating both this doc and
`docs/plans/phase-4-5-ux-overhaul.md`.

| #   | Decision                     | Locked choice                                                                                                                                                                   | Rejected                                                                                           |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | **View promotion timing**    | Promote-first. `receiveView` always updates `view` immediately. Flights animate the transition that just happened. `pendingView` is removed.                                    | Promote-after-flight: forces every anchor owner to render against `pendingView`.                   |
| 2   | **Flight planning location** | Flight types and planner live in `apps/mobile/src/store/*`; components import the shared anchor types. Measurement hooks live in `components/game/internal`.                    | Store importing component internals.                                                               |
| 3   | **Planner trigger**          | Plan the first queued batch synchronously inside `enqueueEvents`, after `receiveView` has promoted the new view and before React commits the re-render.                         | `useLayoutEffect` trigger: fires after ephemeral anchors have already unmounted.                   |
| 4   | **Anchor registry**          | Module-level registry, keyed by stable `AnchorId` strings. `useAnchor(id)` registers absolute `measureInWindow` rects on layout and unregisters on unmount. No React context.   | Context registry: re-render fan-out with no benefit.                                               |
| 5   | **Drawn anchor**             | Permanent invisible drawn landing zone in `TableLayout`; `DrawFlow` renders its drawn-card preview at that same screen-space anchor.                                            | Let `DrawFlow` own the only drawn anchor: it does not exist for `card_drawn` and unmounts on swap. |
| 6   | **Flight data**              | `Flight` stores both anchor ids and snapshotted absolute coords. `FlyingCardLayer` never reads the registry mid-flight.                                                         | Live registry reads during animation: races with unmounts.                                         |
| 7   | **Destination placeholders** | Any active flight destination hides its underlying card content until the flight lands. Sources render their promoted state normally.                                           | No placeholder: the arriving card appears in the destination before it visibly lands.              |
| 8   | **Failed-match feedback**    | `match_failed` shakes the affected slots for 200 ms. The penalty flight is triggered by `penalty_card_dealt` and delayed until the shake finishes.                              | Penalty flight directly from `match_failed`: conflates two engine events.                          |
| 9   | **Discard toast**            | Always show `game.flight.discardToast = "{{name}} discarded {{card}}"` for distinct discarded cards in a batch. The store dedupes `card_swapped` + `card_discarded` duplicates. | Self-only toasts, or toast on flight completion.                                                   |
| 10  | **Interaction gating**       | `selectIsAnimating` returns true while flights are active or event batches are queued. Action bar and flow dispatch buttons use the same selector.                              | One-off disabled flags in each component.                                                          |
| 11  | **Animation implementation** | Reanimated `withTiming` on UI thread. 350 ms normal flights, 500 ms cross-table swaps, CSS ease-out bezier. No JS per-frame work.                                               | Skia all-card canvas now; deferred to Phase 7.                                                     |

---

## Why this branch exists

Package A gives the game stable table seats and fixed card-grid anchors. Package
B uses those anchors to make state changes physically legible:

- A draw visibly leaves the deck and lands in the drawn-card area.
- A swap shows the drawn card and slot card trading places.
- Matches show the matched cards leaving their slots for the discard.
- Failed matches visibly shake the attempted slots, then deal a face-down penalty
  card.
- Blind swaps cross the table face-down so no hidden card leaks.
- Opponent actions use opponent seat/slot anchors instead of pretending every
  move starts in the local drawn-card preview.

This is intentionally client-only. The engine already emits every event Package
B needs; this branch changes how mobile renders those events.

---

## Package B.1 — Memory-critical swap/discard clarity plan

### One-sentence goal

Make swaps, discards, and match discards slow and unmistakable enough that a
player can remember **which hidden slot changed** and **which public card was
discarded** without reading logs or mentally reconstructing the move afterward.

### Why this follow-up exists

The first Package B implementation proves that cards can fly between anchors,
but playtesting exposed a deeper memory-game requirement: not all card movement
is equally important. A draw-only animation is context; a swap is information.

If an opponent draws, swaps into one of their hidden slots, and discards a 9, the
local player should come away knowing:

- Which exact opponent slot now contains the unknown drawn card.
- The old card from that slot was a visible 9 and went to the discard pile.
- The opponent probably improved that slot, which is actionable memory for later
  matches, blind swaps, and Pablo calls.

The current parallel `opponentSeat -> opponentSlot` plus `opponentSlot ->
discard` flight is technically correct but too easy to miss. Package B.1 turns
high-value memory events into short choreographed sequences.

### Player-facing principles

1. **Show the changed slot before the exchange.** The target slot must pulse or
   ring before the moving cards cross the table, so the player's attention is
   already on the right position.
2. **Keep hidden cards hidden.** An opponent's drawn card and the inbound card
   into their slot are always face-down from the local player's perspective.
3. **Make public discards readable.** Any card moving to discard with a public
   `cardId` should be face-up, slightly larger than normal during the flight,
   and slow enough to read.
4. **Tell, but do not replace, the animation.** Toasts should confirm the move
   ("Cambia swapped and discarded 9") after the animation has made the slot
   obvious. Toasts do not include slot names or indices.
5. **One memory event at a time.** Bot scheduling and batch choreography should
   avoid back-to-back bot moves that overlap or visually blur together.

### Scope

In scope:

- Opponent `card_swapped` choreography.
- Self `card_swapped` choreography, with the same timing but less mystery
  because the player already knows their own drawn card.
- Lone `card_discarded` readability for both self and opponents.
- `match_succeeded` discard readability for hand/drawn/discard matches.
- Swap-specific toasts that include both the action and the discarded card.
- Flight timing and bot pacing adjustments needed to preserve readability.
- Unit tests for choreographed planner output and toast text/dedupe.

Out of scope:

- Engine event changes.
- Persisted memory markers or note-taking UI.
- Sound effects.
- Landing haptics.
- Full Skia table-level choreography.
- Revealing what an opponent drew.
- Toasting hidden-card positions.

### UX choreography

#### Opponent draws then swaps

For `card_swapped` where `event.playerId !== view.self`:

1. **Actor focus, 250 ms**
   - The acting player's name/seat tint pulses.
   - The rest of the table dims slightly (`tableDimOpacity` token).
   - No card moves yet.

2. **Target slot spotlight, 450 ms**
   - `opponentSlot(playerId, event.handIndex)` gets an accent ring.
   - The ring should pulse once and remain visible through the exchange.
   - Other cards in that same opponent grid can dim subtly, but their layout must
     not move.

3. **Exchange, 900 ms**
   - The hidden drawn card flies face-down from `opponentSeat(playerId)` into
     `opponentSlot(playerId, event.handIndex)`.
   - The old slot card flies face-up from
     `opponentSlot(playerId, event.handIndex)` to `discard`.
   - The discard-bound card uses `event.discardedCardId`, scales up slightly
     (`discardReadableScale`) during the middle of the flight, and stays above
     the face-down inbound card in z-order.
   - The inbound card should start about `150 ms` after the discard leg starts,
     so the old slot card visually leaves first, then the new hidden card lands.

4. **Settle, 350 ms**
   - The target slot pulses once after the inbound card lands.
   - The discard pile pulses when the face-up card lands.
   - Toast appears: `Cambia swapped and discarded 9`.

Minimum total perceived time: about `1.8-2.0 s`. This is intentional; opponent
swaps are one of the most important memory events in the game.

#### Self draws then swaps

For `card_swapped` where `event.playerId === view.self`:

1. Spotlight `ownSlot(event.handIndex)` for `300 ms`.
2. Animate the face-up drawn card from `drawn -> ownSlot(N)` and the old card
   from `ownSlot(N) -> discard`.
3. Keep the discard-bound old card face-up and readable.
4. Toast: `You swapped and discarded King`.

Self swaps can be slightly faster than opponent swaps (`700-800 ms` exchange)
because the player initiated the action and already knows the target slot.

#### Lone discard

For `card_discarded` not already represented by a swap or match:

- Self: `drawn -> discard`, face-up, `650 ms`, discard pile pulse on land.
- Opponent: `opponentSeat(playerId) -> discard`, face-up, `750 ms`, actor focus
  first for `200 ms`.
- Toast: `Cambia discarded 9`.

#### Match discards

For `match_succeeded`:

- Keep the source slots ringed while their cards fly to discard.
- `match_hand`: both source slots pulse, then both cards fly face-up to discard
  over `800 ms`.
- `match_drawn`: drawn/seat source plus target slot fly face-up to discard over
  `800 ms`; the target slot is spotlighted first.
- `match_discard`: source slot flies face-up to discard over `700 ms`.
- Toast wording should distinguish match from simple discard when possible:
  `Cambia matched and discarded two 4s` for pairs, or `Cambia matched and
discarded 9` for single-card match-discard.

This can ship after swap-specific toasts if needed, but the data model should
support it now.

### Implementation approach

#### Extend flight types without replacing the planner

Keep `planFlights(batch, view, snapshot, options)` as the central pure planner,
but make it return a richer result.

Current:

```ts
export function planFlights(...): ReadonlyArray<Flight>;
```

Target:

```ts
export type ChoreographyCue =
  | {
      readonly type: 'spotlight';
      readonly anchor: AnchorId;
      readonly delayMs: number;
      readonly durationMs: number;
      readonly tone: 'swap' | 'discard' | 'match' | 'penalty';
    }
  | {
      readonly type: 'actorFocus';
      readonly playerId: PlayerId;
      readonly delayMs: number;
      readonly durationMs: number;
    }
  | {
      readonly type: 'discardPulse';
      readonly delayMs: number;
      readonly durationMs: number;
    };

export type ToastCue = {
  readonly id: string;
  readonly delayMs: number;
  readonly message: string;
};

export type FlightPlan = {
  readonly flights: ReadonlyArray<Flight>;
  readonly cues: ReadonlyArray<ChoreographyCue>;
  readonly toasts: ReadonlyArray<ToastCue>;
  readonly totalDurationMs: number;
};
```

`Flight` should gain only presentation metadata needed by the overlay:

```ts
export type FlightEmphasis = 'normal' | 'discardReadable' | 'hiddenSwap';

export type Flight = {
  // existing fields...
  readonly emphasis?: FlightEmphasis;
  readonly zRank?: number;
};
```

Do not add player-facing text to `Flight`; text belongs in `ToastCue`.

#### Store changes

Update `FlightQueueState`:

```ts
export type FlightQueueState = {
  readonly activeBatchId: string | null;
  readonly flights: ReadonlyArray<Flight>;
  readonly cues: ReadonlyArray<ChoreographyCue>;
  readonly toasts: ReadonlyArray<ToastCue>;
};
```

`startNextBatchIfIdle()` should:

1. Call `planFlights(...)` and receive a `FlightPlan`.
2. Store `flights`, `cues`, and `toasts` together.
3. Schedule `ToastCue`s with `setTimeout` using their `delayMs`.
4. If `flights.length === 0` but `totalDurationMs > 0`, hold the batch until a
   timer completes so cue-only batches still gate input.
5. If both `flights.length === 0` and `totalDurationMs === 0`, drain
   immediately as today.

Add cleanup for toast/hold timers when the store is unmounted or a game leaves
the route. If we do not want timer handles in Zustand state, keep module-local
or closure-local handles inside `createGameStore()`.

#### Selectors

Add selectors:

- `selectActiveChoreographyCues(s)`
- `selectSpotlightAnchorKeys(s)`
- `selectActorFocusPlayerIds(s)`
- `selectIsTableDimmed(s)`

The selectors must return stable references, following the `WeakMap`/shared
empty-array pattern already used for destination anchor keys.

#### UI rendering

`FlyingCardLayer.tsx`:

- Use `flight.emphasis === 'discardReadable'` to scale the card up during the
  middle of the path, then back down before landing.
- Sort or style by `zRank`, so discard-readable cards render above hidden inbound
  cards.
- Keep all completion callbacks on JS via `runOnJS`.

`OwnHandGrid.tsx` and `OpponentSeat.tsx`:

- Read spotlight anchor keys.
- Slot wrappers render an accent border/ring when their anchor is spotlighted.
- For opponent swaps, the target slot ring remains visible until the settle
  phase ends.
- Actor name/seat tint reads actor-focus selectors.

`DeckArea.tsx`:

- Discard anchor wrapper can pulse when `discardPulse` is active.

`TableLayout.tsx` / `GameScreen`:

- Optional dim layer when `selectIsTableDimmed` is true. Keep it below
  `FlyingCardLayer` and above normal table content, with `pointerEvents="none"`.

#### Toast wording

Add i18n keys:

```json
{
  "game": {
    "flight": {
      "discardToast": "{{name}} discarded {{card}}",
      "swapDiscardToast": "{{name}} swapped and discarded {{card}}",
      "matchDiscardToast": "{{name}} matched and discarded {{card}}",
      "matchDiscardPairToast": "{{name}} matched and discarded two {{rank}}s"
    }
  }
}
```

Use existing `formatCardIdLabel(view.catalog, cardId)` for `card`.

For `matchDiscardPairToast`, add a tiny helper that derives a rank label only if
both discarded card IDs share the same rank. If not, fall back to two ordinary
`matchDiscardToast` messages or a joined card label.

### File mapping

| File                                                  | Planned change                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `apps/mobile/src/store/flightTypes.ts`                | Add `FlightPlan`, `ChoreographyCue`, `ToastCue`, `FlightEmphasis`, optional `zRank`; keep `AnchorId` unchanged.                |
| `apps/mobile/src/store/flightPlanner.ts`              | Return `FlightPlan`; add staged timings for swap/discard/match; move toast collection into delayed `ToastCue`s.                |
| `apps/mobile/src/store/flightPlanner.test.ts`         | Assert opponent swap stage order, delays, face-up/face-down flags, readable discard emphasis, toast wording/delay, and dedupe. |
| `apps/mobile/src/store/gameStore.ts`                  | Store cues/toasts with active flights; schedule delayed toasts; hold cue-only batches; clear timers safely.                    |
| `apps/mobile/src/store/selectors.ts`                  | Add stable cue/spotlight/actor-focus/dim selectors; extend existing destination key selector if needed.                        |
| `apps/mobile/src/store/selectors.test.ts`             | Referential-stability tests for cue selectors and expected active keys.                                                        |
| `apps/mobile/src/components/game/FlyingCardLayer.tsx` | Render discard-readable scaling and z-order; keep hidden inbound cards face-down.                                              |
| `apps/mobile/src/components/game/OpponentSeat.tsx`    | Add slot spotlight ring and actor-focus styling.                                                                               |
| `apps/mobile/src/components/game/OwnHandGrid.tsx`     | Add slot spotlight ring for self swaps/matches.                                                                                |
| `apps/mobile/src/components/game/DeckArea.tsx`        | Add discard-pile pulse cue.                                                                                                    |
| `apps/mobile/src/components/game/TableLayout.tsx`     | Optional dim overlay hook-up if table-level dim is implemented here.                                                           |
| `apps/mobile/src/design/tokens.ts`                    | Add memory-choreography durations, dim opacity, ring color/width, readable discard scale.                                      |
| `apps/mobile/src/i18n/locales/en.json`                | Add swap/match discard toast keys.                                                                                             |
| `apps/mobile/src/supabase/internal/botScheduler.ts`   | Increase bot delay enough to leave one full choreography between bot moves.                                                    |

### Tokens

Add under `tokens.game.duration`:

- `swapFocusMs: 250`
- `swapSpotlightMs: 450`
- `selfSwapExchangeMs: 750`
- `opponentSwapExchangeMs: 900`
- `swapInboundLagMs: 150`
- `swapSettleMs: 350`
- `discardReadableMs: 650`
- `matchDiscardMs: 800`
- `botOnTurnDelayMs: 2200` (revisit after phone playtest)

Add under `tokens.game.choreography` or the nearest existing namespace:

- `tableDimOpacity: 0.22`
- `spotlightBorderWidth: 3`
- `discardReadableScale: 1.18`
- `spotlightPulseScale: 1.04`

Use existing color tokens where possible. If a new color is needed, add a
semantic token such as `tokens.game.surface.spotlight` or
`tokens.game.accent.memory`.

### Test plan

Unit tests:

1. `flightPlanner.test.ts`: opponent `card_swapped` returns:
   - actor-focus cue at `0 ms`
   - target-slot spotlight cue
   - discard flight from the exact opponent slot to discard
   - inbound hidden flight to that exact opponent slot
   - discard flight has `cardId = event.discardedCardId`,
     `faceUp = true`, `emphasis = 'discardReadable'`
   - inbound flight has `faceUp = false`
   - inbound flight `delayMs` is later than discard flight delay
   - toast cue says swapped/discarded and is delayed until the readable moment
2. `flightPlanner.test.ts`: self `card_swapped` mirrors the same structure but
   uses `drawn -> ownSlot(N)` for inbound.
3. `flightPlanner.test.ts`: lone `card_discarded` produces discard-readable
   emphasis and plain discard toast.
4. `flightPlanner.test.ts`: `match_succeeded` produces spotlight cues for source
   slots and match-specific toast cues.
5. `flightPlanner.test.ts`: duplicate swap + `card_discarded` batches produce
   one discard flight and one toast.
6. `selectors.test.ts`: spotlight/actor/dim selectors are referentially stable
   when store state has not changed.
7. `gameStore` unit coverage if practical: delayed toast timers fire once and
   are cleared on teardown. If this is awkward with the current test harness,
   cover the pure `ToastCue` output and manually verify store timing.

Manual verification:

1. In a 1-bot game, let the bot draw and swap. Confirm the target slot pulses
   before movement and remains visually marked through the exchange.
2. Confirm the old card from that slot is readable as it flies to discard.
3. Confirm the inbound card remains face-down and lands in the highlighted slot.
4. Confirm the toast says `BotName swapped and discarded X` and does not name a
   slot.
5. Confirm the next bot move does not begin until the first swap choreography is
   visually complete.
6. Repeat with self swap, opponent simple discard, match hand, match drawn, and
   match discard.
7. Repeat on a physical iPhone and the iPhone SE simulator; the discard card
   must remain readable on the smaller screen.

### Acceptance criteria

- A player watching an opponent swap can identify the changed slot without
  looking at the toast.
- The discarded card rank/suit is readable during the animation and repeated in
  the toast.
- No hidden opponent drawn card is revealed.
- Bot moves do not overlap or chain so quickly that two memory events blur
  together.
- `bun run check` passes.

### Risks and mitigations

| Risk                                                    | Mitigation                                                                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Choreography makes the game feel slow.                  | Slow only memory-critical events; keep ordinary draws comparatively short. Tune bot delays after phone playtest.                      |
| Delayed toasts fire after leaving the screen.           | Store timer handles in `createGameStore()` closure and clear them on provider unmount or route teardown.                              |
| Cue selectors recreate arrays and trigger render loops. | Use shared empty arrays/sets and `WeakMap` caches like `selectDestinationAnchorKeys`.                                                 |
| Slot ring leaks "importance" beyond public information. | Ring only the slot named in public engine events (`handIndex`/`slotIndices`). This is already visible through the move, just clearer. |
| Parallel flights still obscure source/destination.      | Stagger discard leg before inbound leg for swaps; raise discard z-rank.                                                               |

### Open questions before build

1. Should opponent swap choreography use a table-wide dim layer, or is slot ring
   - actor focus enough?
2. Should match toasts be implemented in the first pass, or should B.1 start
   with swap/discard toasts only?
3. Is `2.0 s` acceptable for opponent swaps, or should the target be closer to
   `1.5 s` after the first phone playtest?

---

## Files touched

### New

| Path                                                          | Purpose                                                                                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/store/flightTypes.ts`                        | `Rect`, `AnchorId`, `Flight`, batch ids, `anchorKey`, helpers for destination placeholders and tests.                      |
| `apps/mobile/src/store/anchorRegistry.ts`                     | Module-level anchor map with `registerAnchor`, `unregisterAnchor`, `getAnchorSnapshot`, and `resetAnchorRegistryForTests`. |
| `apps/mobile/src/store/flightPlanner.ts`                      | Pure `planFlights(batch, view, anchorSnapshot)` function plus discard-toast collection helpers.                            |
| `apps/mobile/src/store/flightPlanner.test.ts`                 | Exhaustive mapping tests for every engine `GameEvent` variant and both self/opponent perspectives.                         |
| `apps/mobile/src/store/anchorRegistry.test.ts`                | Register/read/update/unregister tests for the anchor map.                                                                  |
| `apps/mobile/src/components/game/FlyingCardLayer.tsx`         | Root-level absolute overlay that renders active flights with Reanimated and calls `removeFlight` on completion.            |
| `apps/mobile/src/components/game/internal/useAnchor.ts`       | Hook that returns `ref` + `onLayout` props for a `View` and registers its measured absolute rect.                          |
| `apps/mobile/src/components/game/internal/useAnchor.test.tsx` | Light mount harness proving registration on layout and unregistration on unmount.                                          |

### Modified

| Path                                                               | Change                                                                                                                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/store/gameStore.ts`                               | Remove `pendingView`/`promoteView`; add `flights`, active batch metadata, `enqueueFlights`/`removeFlight`; plan batches and fire discard toasts.     |
| `apps/mobile/src/store/selectors.ts`                               | Add `selectIsAnimating`, `selectDestinationAnchorKeys`, and any minimal selectors needed by `FlyingCardLayer`.                                       |
| `apps/mobile/src/store/selectors.test.ts`                          | Cover `selectIsAnimating` and destination-anchor placeholder selectors.                                                                              |
| `apps/mobile/src/store/provider.tsx`                               | Keep subscription wiring, but document and test the required ordering: view callbacks fire before event callbacks for the same move.                 |
| `apps/mobile/src/supabase/types.ts`                                | Document the `PabloClient` callback ordering contract.                                                                                               |
| `apps/mobile/src/supabase/internal/mockClient.test.ts`             | Add/extend a test that proves `subscribePlayerView` fires before `subscribeGameEvents` after `applyMove`.                                            |
| `apps/mobile/app/(game)/[gameId]/index.tsx`                        | Remove fixed event-drain timer and `promoteView`; wrap screen in a root `View`; mount `FlyingCardLayer` as a sibling of `SafeAreaView`.              |
| `apps/mobile/src/components/game/TableLayout.tsx`                  | Register permanent `drawn` landing-zone anchor and expose the same geometry to `DrawFlow` through stable screen-space placement.                     |
| `apps/mobile/src/components/game/DeckArea.tsx`                     | Register separate `deck` and `discard` anchors on their card containers.                                                                             |
| `apps/mobile/src/components/game/OwnHandGrid.tsx`                  | Register each local slot anchor, hide active destination content, and run slot-local shake on matching `match_failed` events.                        |
| `apps/mobile/src/components/game/OpponentSeat.tsx`                 | Register opponent seat center and each opponent slot anchor; hide active destinations; shake failed-match slots when the event belongs to that seat. |
| `apps/mobile/src/components/game/actionFlows/DrawFlow.tsx`         | Move the drawn-card preview to the permanent drawn anchor; gate dispatch buttons with `selectIsAnimating`; keep action buttons in the sheet.         |
| `apps/mobile/src/components/game/actionFlows/MatchHandFlow.tsx`    | Gate dispatch buttons with `selectIsAnimating`; no layout rewrite.                                                                                   |
| `apps/mobile/src/components/game/actionFlows/MatchDiscardFlow.tsx` | Gate dispatch buttons with `selectIsAnimating`; no layout rewrite.                                                                                   |
| `apps/mobile/src/components/game/actionFlows/PowerFlow.tsx`        | Gate dispatch buttons with `selectIsAnimating`; no layout rewrite.                                                                                   |
| `apps/mobile/src/components/game/ActionBar.tsx`                    | Disable all items while `selectIsAnimating` is true.                                                                                                 |
| `apps/mobile/src/design/tokens.ts`                                 | Add flight durations, shake timings, z-index, and easing constants/params.                                                                           |
| `apps/mobile/src/i18n/locales/en.json`                             | Add `game.flight.discardToast`.                                                                                                                      |

### Not touched

- `packages/engine/**`
- `supabase/functions/**`
- `supabase/migrations/**`
- Game rules in `docs/GAME_LOGIC.md`
- Schema docs in `docs/SCHEMA.md`

---

## Flight contracts

### Types

The shared types live in `apps/mobile/src/store/flightTypes.ts`.

```ts
export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

export type AnchorId =
  | { readonly kind: 'deck' }
  | { readonly kind: 'discard' }
  | { readonly kind: 'drawn' }
  | { readonly kind: 'ownSlot'; readonly index: number }
  | { readonly kind: 'opponentSlot'; readonly playerId: PlayerId; readonly index: number }
  | { readonly kind: 'opponentSeat'; readonly playerId: PlayerId };

export type Flight = {
  readonly id: string;
  readonly batchId: string;
  readonly fromAnchor: AnchorId;
  readonly toAnchor: AnchorId;
  readonly fromCoords: Rect;
  readonly toCoords: Rect;
  readonly cardId: CardId | null;
  readonly faceUp: boolean;
  readonly durationMs: number;
  readonly delayMs: number;
};
```

`cardId: null` means the overlay renders the card back only. `faceUp: false`
also renders the back even when `cardId` is present; this is required for blind
swaps and penalty cards.

### Anchor registry

`apps/mobile/src/store/anchorRegistry.ts` owns one process-local registry:

```ts
export type AnchorSnapshot = ReadonlyMap<string, Rect>;

export function registerAnchor(id: AnchorId, rect: Rect): void;
export function unregisterAnchor(id: AnchorId): void;
export function getAnchorSnapshot(): AnchorSnapshot;
export function getAnchorRect(snapshot: AnchorSnapshot, id: AnchorId): Rect | null;
export function resetAnchorRegistryForTests(): void;
```

Implementation notes:

- Use `anchorKey(id)` from `flightTypes.ts` as the `Map` key.
- `getAnchorSnapshot()` returns a new `Map` so the planner's input is stable.
- The store reads snapshots only at event-batch boundaries.
- Unknown anchors cause the planner to skip that specific flight, not crash the
  screen. The test suite should assert that skipped flights are intentional and
  limited to missing optional anchors.

### `useAnchor(id)`

The hook lives in `components/game/internal/useAnchor.ts` because it owns React
Native measurement, not store semantics.

```ts
export function useAnchor(id: AnchorId): {
  readonly ref: React.RefObject<View>;
  readonly onLayout: () => void;
};
```

The hook calls `measureInWindow` from `onLayout`, registers `{ x, y, w, h }`, and
unregisters on unmount. It must also re-measure when the `AnchorId` changes
(notably opponent slots if player ids change between games).

---

## Store and data flow

### Current flow before Package B

1. `subscribePlayerView` calls `receiveView`.
2. If an event queue exists, `receiveView` stores the view in `pendingView`.
3. `subscribeGameEvents` calls `enqueueEvents`.
4. `GameScreen` waits `tokens.game.duration.eventDrain` and calls
   `promoteView()` + `dequeueEvents()`.

This is the flow Package B replaces.

### New promote-first flow

1. `subscribePlayerView` calls `receiveView`.
2. `receiveView` immediately sets `view`, `version`, `endOfRoundVisible`, and
   `peekOverlayVisible` from the new view. It never writes `pendingView`.
3. `subscribeGameEvents` calls `enqueueEvents`.
4. `enqueueEvents` appends the batch to `animQueue.pending`, collects discard
   toasts, and starts planning if no batch is active.
5. Planning snapshots anchors with `getAnchorSnapshot()`, calls
   `planFlights(batch, view, snapshot)`, and writes the returned flights.
6. `FlyingCardLayer` renders all active flights in parallel. Each flight calls
   `removeFlight(id)` on completion.
7. When the active batch has no remaining flights, the store calls
   `dequeueEvents()` and starts the next pending batch. If a batch has no
   flights, it drains immediately.

The queue still exists, but it is now an animation-batch queue, not a
view-promotion queue.

### Store shape

`GameStoreState` changes:

```ts
export type FlightQueueState = {
  readonly activeBatchId: string | null;
  readonly flights: ReadonlyArray<Flight>;
};

export type GameStoreState = {
  readonly view: PlayerView | null;
  readonly version: number;
  readonly ui: UiState;
  readonly animQueue: AnimQueueState;
  readonly flightQueue: FlightQueueState;
};
```

`pendingView` is deleted. `promoteView()` is deleted.

Actions:

```ts
enqueueEvents(events: ReadonlyArray<GameEvent>): void;
dequeueEvents(): void;
removeFlight(id: string): void;
```

`dequeueEvents` can remain public for tests, but `GameScreen` should no longer
call it directly.

### Batch ids and flight ids

Use deterministic ids so tests can assert exact output:

- Batch id: `batch-${version}-${batchSeq}` where `batchSeq` is local to the
  store instance.
- Flight id: `${batchId}:${eventIndex}:${flightIndex}:${anchorKey(from)}:${anchorKey(to)}`.

Do not use `Date.now()` or random ids.

---

## Event to flight mapping

The planner must cover every variant in `GameEvent` from
`packages/engine/src/types.ts`. Tests should fail loudly if the union grows.

### Self perspective (`event.playerId === view.self`)

| Engine event                          | Flights                                                          | Face      | Notes                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------- |
| `card_drawn`                          | `deck -> drawn`                                                  | face-up   | Card id comes from `view.drawnCardId`; drawn anchor is the permanent landing zone.      |
| `card_swapped`                        | parallel `drawn -> ownSlot(N)` and `ownSlot(N) -> discard`       | mixed     | Discard leg uses `event.discardedCardId`, face-up. Inbound leg can stay face-up.        |
| `card_discarded` (lone)               | `drawn -> discard`                                               | face-up   | Dropped if the same card is already represented by `card_swapped` or `match_succeeded`. |
| `match_succeeded` / `match_hand`      | parallel `ownSlot(A) -> discard` and `ownSlot(B) -> discard`     | face-up   | Map `slotIndices[i]` to `discardedCardIds[i]`.                                          |
| `match_succeeded` / `match_drawn`     | parallel `drawn -> discard` and `ownSlot(N) -> discard`          | face-up   | Drawn card uses first discarded id if that is how the engine emits it; test this order. |
| `match_succeeded` / `match_discard`   | `ownSlot(N) -> discard`                                          | face-up   | One slot leaves the hand.                                                               |
| `match_failed`                        | no flight                                                        | n/a       | Triggers slot shake only.                                                               |
| `penalty_card_dealt` (recipient self) | `deck -> ownSlot(handSize - 1)`                                  | face-down | `delayMs = flightShakeMs` if the same batch contains `match_failed` for self.           |
| `peeked`                              | no flight                                                        | n/a       | Reveal sheet owns visibility; seats remain face-down.                                   |
| `peek_one_chosen`                     | no flight                                                        | n/a       | Peek overlay owns visibility.                                                           |
| `swapped_blind`                       | parallel `ownSlot(N) -> opponentSlot(target, M)` and reverse leg | face-down | Never leaks either card.                                                                |

### Opponent perspective (`event.playerId !== view.self`)

| Engine event                              | Flights                                                                                    | Face      | Notes                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------ |
| `card_drawn`                              | `deck -> opponentSeat(playerId)`                                                           | face-down | No opponent drawn-card preview exists.                                   |
| `card_swapped`                            | parallel `opponentSeat(playerId) -> opponentSlot(playerId, N)` and slot -> discard         | mixed     | Inbound leg face-down; discard leg face-up with `event.discardedCardId`. |
| `card_discarded` (lone)                   | `opponentSeat(playerId) -> discard`                                                        | face-up   | Dropped if represented by another event in the same batch.               |
| `match_succeeded` / `match_hand`          | parallel `opponentSlot(playerId, A) -> discard` and `opponentSlot(playerId, B) -> discard` | face-up   | Mirrors self-side slots.                                                 |
| `match_succeeded` / `match_drawn`         | parallel `opponentSeat(playerId) -> discard` and `opponentSlot(playerId, N) -> discard`    | face-up   | Seat center stands in for the hidden drawn card.                         |
| `match_succeeded` / `match_discard`       | `opponentSlot(playerId, N) -> discard`                                                     | face-up   | One slot leaves the opponent hand.                                       |
| `match_failed`                            | no flight                                                                                  | n/a       | Triggers slot shake on that opponent's attempted slots.                  |
| `penalty_card_dealt` (recipient opponent) | `deck -> opponentSlot(playerId, handSize - 1)`                                             | face-down | Delay if paired with `match_failed` in the batch.                        |
| `peeked`                                  | no flight                                                                                  | n/a       | Private knowledge stays private.                                         |
| `swapped_blind`                           | `sourceSlot -> targetSlot` and reverse leg                                                 | face-down | Handles self<->opponent and opponent<->opponent.                         |

### Always no-flight events

The planner returns no flights for:

- `pablo_called`
- `turn_ended`
- `deck_reshuffled`
- `round_ended`
- `power_activated`
- `peek_chosen`
- `peek_phase_ended`

Those events are already represented by banners, overlays, or toasts, or they
are bookkeeping events with no spatial card movement.

### Duplicate discard events

Some batches contain both a specific event and a general `card_discarded` event
for the same physical card. The planner and toast collector must dedupe by
`cardId` within the batch:

- `card_swapped.discardedCardId` plus `card_discarded.cardId`
- `match_succeeded.discardedCardIds[]` plus any sibling `card_discarded`

The user sees one flight and one toast per discarded card.

---

## Component design

### `FlyingCardLayer`

Props:

```ts
type Props = {
  readonly catalog: Readonly<Record<CardId, Card>>;
};
```

Reads active flights from the store. Renders a full-screen absolute container
with `pointerEvents="none"` and `zIndex: tokens.game.zIndex.flightOverlay`.
Each flight:

1. Starts at `fromCoords`.
2. Waits `delayMs` if non-zero.
3. Animates `translateX` / `translateY` to `toCoords`.
4. Calls `removeFlight(flight.id)` in the Reanimated completion callback.

The rendered card size uses `fromCoords.w` / `fromCoords.h` so a card can shrink
or grow during movement by interpolating scale from `fromCoords` to `toCoords`.
If scale interpolation is too much for the first pass, keep size fixed to
`fromCoords` and document the trade-off in implementation notes.

### `TableLayout`

Adds a permanent drawn landing zone:

- It is visually invisible when no card is drawn.
- It registers `AnchorId { kind: 'drawn' }`.
- It lives near the deck/discard band, not inside the bottom action sheet.
- `DrawFlow` uses the same anchor for its visible drawn-card preview so
  `deck -> drawn`, `drawn -> discard`, and `drawn -> slot` are spatially
  consistent.

### `DrawFlow`

The action sheet remains responsible for choices, but the drawn-card preview
moves out of the sheet body and into the drawn landing zone. This avoids a jump
from "draw lands on the table" to "preview appears at the bottom sheet."

The sheet still shows:

- hint text
- Swap / Discard / Match actions
- back button in slot-picking stages
- own-hand picker grids when choosing a target

All dispatch buttons no-op or disable when `selectIsAnimating` is true.

### `OwnHandGrid` and `OpponentSeat`

Each slot wrapper registers its anchor. Each wrapper also checks whether its
`anchorKey` is a current destination:

- If yes, hide the slot's card content with `opacity: 0` but keep layout size.
- If no, render normally.

Shake:

- Subscribe to the current event batch (or a selector derived from
  `animQueue.pending[0]`).
- When a `match_failed` event targets this slot, run a local Reanimated
  horizontal shake.
- Do not add per-slot shake state to the global store.

Opponent seats also register `{ kind: 'opponentSeat', playerId }` on a center
wrapper so hidden opponent draws have a visible destination/source.

### `DeckArea`

Register two anchors:

- `{ kind: 'deck' }` on the deck card/back container.
- `{ kind: 'discard' }` on the discard top container.

If the discard pile is empty, still register the discard placeholder container
so early flights have a destination.

### `ActionBar` and flow overlays

`ActionBar` reads `selectIsAnimating`. An item is disabled when either its own
selector says disabled or `selectIsAnimating` is true.

Flow overlays (`DrawFlow`, `MatchHandFlow`, `MatchDiscardFlow`, `PowerFlow`) do
not need visual redesign beyond `DrawFlow`'s preview placement. They should use
the same selector to guard final dispatch handlers so rapid taps cannot submit a
new move while a previous batch is still animating.

---

## Tokens and i18n

### Tokens

Add under `tokens.game.duration`:

- `flightFast: 350`
- `flightSlow: 500`
- `flightShakeMs: 200`
- `flightShakeDelay: 100` if the implementation needs a lead-in before the
  shake, otherwise omit it and use `flightShakeMs` as the penalty delay.
- `flightDiscardToastMs: 1500`

Add under a game z-index namespace:

- `flightOverlay: 45`

If easing params belong in tokens, add:

```ts
flightEaseOut: [0.25, 0.46, 0.45, 0.94] as const;
```

Otherwise keep the bezier in `FlyingCardLayer` with a code comment naming the
curve; do not inline magic duration numbers in components.

### i18n

Add:

```json
{
  "game": {
    "flight": {
      "discardToast": "{{name}} discarded {{card}}"
    }
  }
}
```

`name` comes from `resolveDisplayName(view, playerId)`. `card` should reuse the
existing card-label helper/key if one exists; otherwise add a small helper that
formats rank and suit through existing i18n keys.

---

## Test plan

### Unit tests

| File                     | Coverage                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `flightPlanner.test.ts`  | Every `GameEvent` variant; self and opponent perspectives; anchor ids; durations; delays; face-up flags; dedupe rules; missing-anchor behavior. |
| `anchorRegistry.test.ts` | Register, read snapshot, update, unregister, unknown lookup, reset for tests.                                                                   |
| `useAnchor.test.tsx`     | Registers on layout/measure and unregisters on unmount.                                                                                         |
| `selectors.test.ts`      | `selectIsAnimating`; destination-anchor selectors; existing selectors unchanged.                                                                |
| `mockClient.test.ts`     | View callback fires before event callback after a move, preserving planner assumptions.                                                         |

`flightPlanner.test.ts` should include at least these focused cases:

1. Self `card_drawn`: one `deck -> drawn` flight, face-up, fast duration.
2. Self `card_swapped` plus matching `card_discarded`: two flights, one discard
   toast, no duplicate discard flight.
3. Opponent `card_swapped`: hidden inbound leg, face-up discard leg.
4. `match_succeeded` for each `kind`: correct source anchors and
   `discardedCardIds` mapping.
5. `match_failed` + `penalty_card_dealt`: no failure flight, delayed penalty
   flight.
6. `swapped_blind` self/opponent and opponent/opponent: both legs face-down.
7. Every no-flight event returns `[]`.
8. Missing optional anchor skips only that flight and does not throw.

### Manual verification

Run on iPhone 14 simulator and iPhone SE:

1. Start a 1-bot game.
2. Draw from deck: card flies `deck -> drawn`; drawn preview stays at the same
   table position while the action sheet appears.
3. Discard drawn: card flies `drawn -> discard`; one discard toast appears.
4. Draw and swap into each own slot: drawn card flies to slot; old slot card
   flies to discard; no destination ghost appears before landing.
5. Match in hand: both chosen slots fly to discard together.
6. Match drawn: drawn card and chosen slot fly to discard together.
7. Match discard: chosen slot flies to discard.
8. Fail a match: chosen slot shakes, then penalty card flies `deck -> new slot`.
9. Use peek-self and peek-opponent powers: no flight; reveal sheet still works;
   opponent seat stays face-down after close.
10. Use blind swap with a bot: both cards cross the table face-down.
11. Let bots draw, swap, discard, match, and fail: opponent flights use
    opponent seat/slot anchors; toasts name the bot.
12. In a 3-bot game, verify opponent/opponent blind swap animates between their
    seats face-down.
13. Hammer action buttons during flights: no duplicate moves dispatch.
14. End a round while flights are active: flights finish cleanly; end overlay
    still appears.

### Required gates

Before the branch is considered done:

1. `bun run format`
2. `bun run lint`
3. `bun run typecheck`
4. `bun test`
5. `bun run check`

`bun run check` is the final gate; the separate commands make failures easier to
triage while implementing.

---

## Risks and mitigations

| Risk                                                            | Mitigation                                                                                                                                           |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planner sees a promoted view but stale/missing anchors.         | Use permanent `drawn` anchor; snapshot synchronously in `enqueueEvents`; test callback ordering; skip missing optional flights rather than crashing. |
| Store imports UI internals.                                     | Keep planner/types/registry in `src/store`; only `useAnchor` and component wrappers live under `components/game`.                                    |
| Promote-first creates destination ghosts.                       | Destination-placeholder selector hides any `toAnchor` while its flight is active.                                                                    |
| Discard toast double-fires for swap/match batches.              | Deduplicate by `cardId` per batch before showing toasts.                                                                                             |
| Opponent flights accidentally reveal hidden cards.              | Any flight whose destination/source is an opponent hidden slot is `faceUp: false` unless the destination is discard and the engine event has cardId. |
| Reanimated completion callback races with unmount.              | `FlyingCardLayer` is screen-root and lives for the route lifetime; `removeFlight` tolerates unknown ids.                                             |
| DrawFlow preview relocation makes the sheet feel detached.      | Keep hint/action sheet visually pointing at the table preview; if needed add a small label in the sheet, not a duplicate card.                       |
| Future real Supabase client emits events before view callbacks. | Document `PabloClient` ordering now; Package 5/6 real-client work must preserve it or add versioned buffering before enabling real events.           |

---

## Sequencing

Suggested implementation order:

1. Add flight tokens and i18n key.
2. Add `flightTypes.ts`, `anchorRegistry.ts`, and their tests.
3. Add `flightPlanner.ts` with exhaustive tests using hand-built
   `PlayerView` fixtures and anchor snapshots.
4. Add store state/actions for `flightQueue`; remove `pendingView` and
   `promoteView`; add `selectIsAnimating` and destination-anchor selectors.
5. Update `provider.tsx` / `PabloClient` comments and add mock-client ordering
   test.
6. Add `useAnchor`; instrument `DeckArea`, `OwnHandGrid`, `OpponentSeat`, and
   `TableLayout`.
7. Add the permanent drawn landing zone and move `DrawFlow`'s visible preview to
   that anchor.
8. Add `FlyingCardLayer`; mount it as a sibling of `SafeAreaView`; remove the
   old fixed event-drain effect from `GameScreen`.
9. Gate `ActionBar` and flow dispatch buttons with `selectIsAnimating`.
10. Add slot shake on `match_failed` and penalty-flight delay.
11. Run the manual checklist, then the required gates.
12. Update `docs/PLAN.md` with the Phase 4.5 / Package B done entry and
    decisions.
13. Push the branch and stop. Do not merge without explicit approval.

---

## Definition of Done

- Promote-first store flow is implemented; `pendingView` and `promoteView` are
  gone.
- Every current `GameEvent` variant is covered by planner tests.
- All self and opponent movement cases in the mapping table produce the right
  anchors, durations, delays, `cardId`, and `faceUp` values.
- The permanent `drawn` anchor exists even when `DrawFlow` is not mounted, and
  `DrawFlow`'s preview uses that same screen-space position.
- `FlyingCardLayer` is mounted as a screen-root sibling of `SafeAreaView`.
- Destination slots hide their content until inbound flights complete.
- `match_failed` shakes targeted slots; `penalty_card_dealt` flights start after
  the shake.
- Discard toasts fire once per distinct discarded card per batch and name the
  acting player.
- `selectIsAnimating` gates the action bar and flow dispatch buttons.
- No opponent hidden-card flight renders face-up unless it is a discard-bound
  flight with a public engine `cardId`.
- All tests and `bun run check` pass.
- `docs/PLAN.md` is updated before the branch is pushed.

---

## Out of scope

- Sound effects.
- Haptics on flight landing.
- Deck-shuffle animation.
- Pablo banner choreography.
- Skia all-card choreography.
- Bot Pablo threshold tuning.
- iPad/web layout redesign.
- Engine, edge-function, RLS, or schema changes.

---

## Open questions

None. If implementation surfaces a real contradiction, log it under a new
"Implementation notes" section here and mirror any scope-changing decision in
`docs/plans/phase-4-5-ux-overhaul.md` before continuing.
