# Phase 4.5 / Package D — Card clarity & art polish

> Branch: `phase-4-5-card-clarity` (cut from `phase-4-5-table-layout` after C lands)
> Master plan: `docs/plans/phase-4-5-ux-overhaul.md`
> Predecessors: `docs/plans/phase-4-5-flying-cards.md` (B + B.1),
> `docs/plans/phase-4-5-animation-polish.md` (C)
> Status: **implemented**

## One-sentence goal

Make every "what just happened to that card?" moment unambiguous, fix the
visible blur/size jitter on flying cards, and tighten the card art so rank
and suit read instantly at every size with a back design that scales like a
real card instead of a fixed-pixel sketch.

## Why this plan exists

After Packages B / B.1 / C, the game animates correctly but four problems
still make it feel prototype:

1. **Match / discard ambiguity.** When a player discards via match, the
   engine drops `handSize` 4 → 3 immediately. The grid re-renders with three
   slots and no LinearTransition on opponent seats. The player sees "4 cards
   → 3 cards" with no cue at all about which one left.
2. **Penalty card teleport.** The penalty flies to a slot that didn't exist
   in the previous render, so it visually appears out of nowhere at the right
   edge.
3. **Flight blur and size jitter.** `FlyingCardLayer` renders the card at the
   _source_ anchor's pixel size, then scales it up to (much larger)
   destination + `discardReadable` 1.18×. A 52 px opponent card upscaled to
   ~104 px is visibly soft. The animated card also doesn't match either anchor
   visually mid-flight.
4. **Card art proportions.** The card-back inner panel uses a hardcoded `8 px`
   inset on every side regardless of card width, so at 220 px it looks tight
   and at 44 px it almost eats the card. The face's center suit is rendered
   at `W * 0.25` — small and easy to miss on opponent cards. The corner radius
   comes from `theme.border.radius = 12`, fixed pixels, which makes a 44 px
   card look almost pill-shaped while a 220 px card looks barely rounded.

## Hard principles

1. **Every visible card scales identically.** Border radius, stroke width,
   panel insets, font sizes — all proportional to the card's rendered width.
   Same card at any size looks _proportionally_ identical.
2. **A flying card is rendered at its largest visible size and scaled down.**
   Skia surfaces stay sharp under downscale; upscale blurs.
3. **The grid does not reflow until the player has seen the change.** Hand
   layout for any player is latched to the pre-batch state for the whole
   choreography duration, then reflows once with `LinearTransition` after the
   batch ends.
4. **Source and destination slots both stay visible during the flight, just
   without their cards.** A faint outline holds the spot, so the eye never
   loses track of "this is where the card came from / went to".

## Scope

**In scope**

- Display-view latch in `gameStore` so hand grids show the pre-batch hand
  during a choreography batch.
- `selectSourceAnchorKeys` mirror of the destination selector + slot wrappers
  show empty placeholders (faint dashed outline) during a flight.
- `LinearTransition` on opponent slots so the post-batch reflow animates.
- `FlyingCardLayer` renders flights at the larger of source/destination anchor
  size and scales _down_ to the source size at flight start.
- `PlayingCard` art polish: proportional radius, proportional back inset,
  larger center suit and corner labels, slightly bolder border stroke.
- One simple back motif (centred suit-style mark sized to the inner panel).
- Tests for the new selectors, view latch, and proportional sizing helper.

**Out of scope**

- New card themes (the existing `defaultCardTheme` palette stays).
- Image-based assets (PNG / SVG). Skia stays the renderer.
- Engine event changes.
- Sound / haptics.
- Re-tuning durations (Package C tokens stay).
- ~~The shared transition between drawn-card flight and `DrawFlow` hero card.~~
  **Now in scope — see Pass 5 below.**

## Implementation passes

Each pass is independently mergeable. PRs in this order:

### Pass 1 — Flight size & sharpness

The fastest, most visible fix.

Files:

- `apps/mobile/src/components/game/FlyingCardLayer.tsx`
- `apps/mobile/src/store/flightTypes.ts` (no schema change; consumer logic only)

Changes:

- Inside `FlightCard`, compute `renderSize` as the larger of `flight.fromCoords`
  and `flight.toCoords`, with `discardReadable` flights bumped up by the
  `discardReadableScale` factor so peak scale never exceeds 1.0.
- Render `<PlayingCard size={renderSize}>`.
- Animate `scale` from `fromCoords.w / renderSize.w` at `t = 0` →
  `toCoords.w / renderSize.w` at `t = 1`, with the lift/peak still sitting on
  top.
- Adjust `translateX/Y` to centre the rendered card on the anchor at every
  `t` (since width now exceeds source width). The anchor rect is the
  top-left, so we offset by `(renderSize.w - currentVisibleW) / 2`.

Test:

- `flightPlanner.test.ts` is unchanged (planner output unchanged).
- New visual check on device: opponent → discard flight is sharp throughout.

Risk: low — single component, no API change.

### Pass 2 — Card art polish

Files:

- `apps/mobile/src/components/cards/PlayingCard.tsx`
- `apps/mobile/src/components/cards/PlayingCard.test.ts` (extend)

Changes:

- Replace the fixed `theme.border.radius` with a proportional value: define
  `radiusFor(W)` returning `Math.round(W * 0.075)` clamped to `[4, 22]`.
  Use this for every `RoundedRect` corner in both faces.
- Replace the back's hardcoded `8` inset with a proportional one:
  `inset = Math.max(4, Math.round(W * 0.075))`. Use it consistently for x, y,
  and width/height subtractions on the inner panel.
- Bump font sizes in `sizesFor(W)`:
  - `rank` → `Math.round(W * 0.18)` (was 0.10)
  - `suitSmall` → `Math.round(W * 0.12)` (was 0.075)
  - `centerSuit` → `Math.round(W * 0.45)` (was 0.25)
  - `cornerInsetX` → `Math.max(4, Math.round(W * 0.07))`
  - `cornerInsetY` → `Math.max(4, Math.round(W * 0.06))`
  - `borderStroke` → `Math.max(1, Math.round(W * 0.012))` (was 0.008)
- Set `rankText.fontWeight` to `'800'` (was `'700'`).
- Add a centred motif on the back: a single suit glyph (♠) drawn via Skia
  `Text` is too font-dependent for now; instead, render a centred concentric
  rounded-rect "diamond" — outer rounded rect rotated 45°, sized
  `0.5 * inner panel`, in `theme.back.palette.accent`. Pure Skia, vector,
  scales perfectly. Same look on every card size.
- Update `tokens.game.choreography.spotlightBorderColor` consumer note: since
  card radius is now proportional, the spotlight ring on slots should also
  use the slot's effective card radius. We already drive that ring via slot
  wrappers — they use `tokens.radius.md`. Add a token note that ring radius
  must visually match the card radius; for v1 we accept ~1 px difference at
  the small opponent size, and add a token `tokens.game.choreography.ringRadiusFraction = 0.075`
  - a helper used by both the card and the wrappers.

Tests:

- `PlayingCard.test.ts` — unit-test `radiusFor(W)` and `sizesFor(W)` outputs
  at 44, 88, 220 px. Snapshot a JSON of the derived sizes.
- `cardTheme.test.ts` — unchanged; theme contract is unchanged.

Risk: low — visual change, but the component contract and test surface are
unchanged.

### Pass 3 — Display-view latch + slot ghosts (the big one)

This is the clarity fix. After Passes 1 + 2 the cards already look better;
this pass is what makes match/penalty visually unambiguous.

#### Store changes (`apps/mobile/src/store/gameStore.ts`)

- Add `displayView: PlayerView | null` and `displayVersion: number` fields
  alongside `view` / `version`.
- On `receiveView(view, version)`:
  - Always update `view` / `version` (engine truth — selectors that need it
    keep working).
  - Update `displayView` immediately **only if** there is no active
    choreography batch (`flightQueue.activeBatchId === null` and
    `animQueue.pending.length === 0`).
  - Otherwise leave `displayView` untouched; it'll catch up when the batch
    completes.
- After `scheduleBatchCompletionHold` fires its callback (i.e. the batch
  finished), set `displayView = view` and `displayVersion = version` in the
  same set as `dequeueEvents`.
- Add an explicit `displayView` selector and update consumers below.

#### Selectors (`apps/mobile/src/store/selectors.ts`)

- `selectDisplayView` — returns `s.displayView`.
- `selectMyHandSlotsDisplay` — same shape as `selectMyHandSlots` but driven by
  `displayView`.
- `selectOpponentEntriesDisplay` — same shape, off `displayView`.
- `selectSourceAnchorKeys` — mirror of `selectDestinationAnchorKeys`,
  returning `Set<string>` of `anchorKey(flight.fromAnchor)` for every active
  flight whose `fromAnchor` is a hand slot.
- `selectIsAnimating` already gates input correctly; it stays unchanged.

#### Component changes

- `apps/mobile/src/components/game/OwnHandGrid.tsx`:
  - Read hand from `selectMyHandSlotsDisplay` (was `selectMyHandSlots`).
  - Read both `destKeys` and `sourceKeys`. Slot is "ghosted" when its
    anchorKey is in either set: card content opacity 0, slot wrapper still
    visible with a faint dashed border (token below).
- `apps/mobile/src/components/game/OpponentSeat.tsx`:
  - Build `slots` from `displayView`'s entry handSize (we add a small helper
    in `selectors.ts` so the seat doesn't read `displayView` directly).
  - Same ghost logic for source/destination keys.
  - Add `LinearTransition.springify().damping(20).stiffness(180)` to the seat
    grid wrapper, so when the post-batch hand is smaller, the surviving cards
    spring into their new positions.
  - Key each slot wrapper by `slot-${slot.index}` (unchanged), but since the
    grid renders against `displayView`, the index numbers stay stable through
    the choreography.
- `apps/mobile/app/(game)/[gameId]/index.tsx`:
  - Read opponents from `selectOpponentEntriesDisplay`.
  - Read drawnCardId from `displayView` so the DrawFlow open/close timing is
    coupled with the same latch.

#### Tokens

- `apps/mobile/src/design/tokens.ts`:
  - `tokens.game.surface.slotGhostBorder = 'rgba(45,106,79,0.4)'`
  - `tokens.game.choreography.ringRadiusFraction = 0.075` (also used by
    `PlayingCard.radiusFor`, see Pass 2).

#### Tests

- `gameStore.test.ts` (new):
  - Receiving a view while a batch is active does not change `displayView`.
  - After batch completion, `displayView` equals the latest `view`.
  - Receiving multiple views while a batch is active keeps the displayView
    pinned to the pre-batch state and snaps to the latest view at completion.
- `selectors.test.ts`:
  - `selectSourceAnchorKeys` returns the same Set ref for the same flights.
  - Empty when no flights, includes only hand-slot sources.
- `flightPlanner.test.ts` — unchanged.

Risk: medium — behaviour change. Manual regression checklist required.

### Pass 4 — Final sweep & docs

- Run `bun run check`.
- Manual checklist on a physical iPhone (see Test plan below).
- Update `docs/PLAN.md` "Decisions Made" with one row.
- Flip this plan's `Status` to `implemented`.

### Pass 5 — deck↔drawn shared transition (follow-on)

Originally deferred (out of scope above); folded back in as a small follow-on
since it shares the same flight-scaling code touched in Pass 1.

Files:

- `apps/mobile/src/components/game/FlyingCardLayer.tsx`
- `apps/mobile/src/components/game/actionFlows/DrawFlow.tsx`
- `apps/mobile/src/components/game/internal/seatLayout.ts`
- `apps/mobile/src/feedback/motionIntent.ts` (+ `motion.test.ts`)

Changes:

- Flights now animate a **single uniform `scale`** (`Math.min(rectW/renderW,
rectH/renderH)`) instead of independent `scaleX`/`scaleY`, so a card never
  skews its aspect ratio mid-flight. Removed the `discardReadable` peak bump
  and the now-orphaned `tokens.game.choreography.discardReadableScale`.
- `DrawnCardHero` springs in from deck size (`HERO_INTRO_SCALE = deckCard /
drawnFlowCard`) to full size via `springFor('settle')`, so the drawn card
  visually continues the deck→drawn flight instead of popping in.
- `seatLayout.drawnBandH` now equals the deck card height so the deck→drawn
  flight target keeps the card aspect ratio (no vertical squash).
- `flightMotionIntent` gains an optional `toAnchor`; flights landing on the
  `drawn` anchor use the `carry` curve regardless of duration.

Test: `motion.test.ts` asserts a quick flight to the `drawn` anchor resolves
to `carry`. `bun run check` green.

## Detailed sizing reference

Constants we'll use throughout (after this plan lands):

```ts
function radiusFor(W: number): number {
  return Math.max(4, Math.min(22, Math.round(W * 0.075)));
}

function sizesFor(W: number) {
  return {
    rank: Math.round(W * 0.18),
    suitSmall: Math.round(W * 0.12),
    centerSuit: Math.round(W * 0.45),
    cornerInsetX: Math.max(4, Math.round(W * 0.07)),
    cornerInsetY: Math.max(4, Math.round(W * 0.06)),
    borderStroke: Math.max(1, Math.round(W * 0.012)),
    backInset: Math.max(4, Math.round(W * 0.075)),
  };
}
```

Snapshot at three reference widths:

| W (px) | radius | rank | suitSmall | centerSuit | borderStroke | backInset |
| -----: | -----: | ---: | --------: | ---------: | -----------: | --------: |
|     44 |      4 |    8 |         5 |         20 |            1 |         4 |
|     88 |      7 |   16 |        11 |         40 |            1 |         7 |
|    220 |     17 |   40 |        26 |         99 |            3 |        17 |

The 220 px hero (DrawFlow) reads the rank at `40 pt` weight 800 — large and
clearly card-shaped. The 44 px end-of-round thumbnail still has a 20 pt
suit at the centre — readable but not crowding the corners. The 88 px deck
card lands in the middle, instantly recognisable.

## Display-view latch — semantics in detail

To avoid surprises, the latch follows these rules:

1. **Engine truth always wins for legality.** `view` / `version` update the
   instant `receiveView` is called. `selectors` that drive _move legality_
   (`selectActionBarItems`, `selectMatchHandPairs`, `selectIsMyTurn`,
   `selectCanDraw`, etc.) read from `view`, not `displayView`.
2. **Display truth latches during animation.** Only the hand-grid display
   (own + opponents) and the drawn-card-id read by DrawFlow timing read from
   `displayView`. This means: while a batch is animating, the grid keeps
   showing the pre-batch hand layout, but the action bar correctly reflects
   that it is or isn't the player's turn.
3. **Latch boundary is the batch.** `displayView` updates the moment a batch
   completes (i.e. when `scheduleBatchCompletionHold`'s timer fires). Between
   batches it follows `view` immediately.
4. **Multiple queued batches are still individually latched.** If a batch is
   active and another is queued, `displayView` snaps to the post-batch state
   each time. The user sees one reflow per batch, never a multi-step jumble.
5. **Pablo and end-of-round are unaffected.** They don't depend on the latch
   because they're driven by `selectPabloCalledBy` and
   `selectEndOfRoundVisible`, which read from `view`.

This means input is gated by `selectIsAnimating` (already wired), the grid is
gated by the latch, and the engine view is always live. No new race surfaces.

## Test plan

### Unit

- `PlayingCard.test.ts` — proportional sizing helper outputs at 44 / 88 / 220.
- `gameStore.test.ts` — display-view latch behaviour (3 cases above).
- `selectors.test.ts` — `selectSourceAnchorKeys` reference stability.
- `flightPlanner.test.ts` — unchanged; planner is pure.

### Type & lint

- `bun run check` clean (0 errors, 0 lint warnings introduced).

### Manual on physical iPhone (mandatory before squash)

- Self `match_drawn` at slot 1: drawn card and slot 1 fly to discard, then
  the empty slot 1 outline holds for ~250 ms before the remaining 3 cards
  reflow into a 2 + 1 layout with a spring.
- Self `match_hand` at slots 0 and 3: both source slots empty out, then the
  middle two slots reflow.
- Opponent `match_drawn` at slot 2: same — slot 2 outline holds, the other
  three reflow.
- `match_failed`: source slot rings shake, _then_ the penalty card flies into
  a visible empty placeholder slot, _then_ the placeholder dissolves.
- Self draw → swap at slot 0: the slot 0 ring holds during the discard leg,
  the new card lands face-down into the same outlined slot.
- Cards are sharp throughout every flight (no blur on opponent → discard).
- Card backs at all sizes look proportionally identical (no over-rounded
  44 px card, no under-rounded 220 px card).
- Card fronts: rank and centre suit are clearly readable at 44 px; weight 800
  rank glyphs read crisply at 220 px.
- Two consecutive bot turns: each one's batch runs to completion, the
  `breath` (180 ms) separates them, and you can clearly see each move.

### Regression checklist

- DrawFlow opens at the right moment (after the deck → drawn flight settles).
- Power overlay timing unchanged.
- Peek phase reveals still flip via `PlayingCard`'s prop-driven flip
  (proportional radius makes them look better, but timing is identical).
- End-of-round score sheet renders with the larger fonts; rows still fit.

## Risks and trade-offs

| Risk                                                                                                           | Mitigation                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Display-view latch could silently desync from engine view if `scheduleBatchCompletionHold` ever fails to fire. | Add a watchdog: if `flightQueue.activeBatchId === null` and `animQueue.pending.length === 0` for any reason, `displayView` is force-set to `view` in `dequeueEvents`. Already part of the spec.  |
| `LinearTransition` on opponent slots could overshoot when handSize jumps by 2 (match_hand).                    | Use `damping = 20` rather than the 18 used on own hand; slightly stiffer to prevent visible bounce.                                                                                              |
| Larger center suit on small (44 px) cards could overlap the corner labels.                                     | Sizing snapshot table above shows centerSuit = 20 pt at 44 px width × 64 px height — 31% of width, 22% of height — leaves room. Test on the iPhone SE simulator; back off centerSuit if cramped. |
| Flight render-at-larger could increase memory for in-flight cards.                                             | Negligible: at most 4 in-flight cards at peak (match_hand pair + drawn flight + hidden inbound), each at ~104 × 152 Skia surface. Already well within budget.                                    |
| Proportional radius helper is duplicated between `PlayingCard` and slot wrappers.                              | Export `radiusFor(W)` from a small helper module (`apps/mobile/src/components/cards/internal/cardSizes.ts`) and import from both. One source of truth.                                           |

## Definition of done

- `bun run check` is green.
- Every entry in the manual checklist above passes on a physical iPhone.
- `docs/PLAN.md` Decisions Made has a row for this plan.
- This plan's `Status` is flipped to `implemented`.
- No new `// TODO` markers introduced; no `eslint-disable` comments added
  without an explanatory comment.

## Open questions

1. Latch granularity: I've assumed the latch only covers hand-grid display,
   not deck-count / discard-top. Is that right? The deck pile and discard
   top reflect engine truth immediately; only the hand reflow is latched.
   (My recommendation: yes, leave deck/discard live. They're the targets of
   flights and need to update so flights land correctly.)
2. Back motif: I've spec'd a centred rotated rounded-rect ("diamond") in the
   accent colour. Acceptable, or do you want a specific glyph (e.g. ♠)? Glyphs
   require font work that I'd rather defer to the Phase 7 zellige push.
3. The `radiusFor` clamp at `[4, 22]`: 4 px feels right for the smallest end;
   22 px is for very large cards (e.g. zoomed peek-overlay 80 px wide → 6 px,
   never hits the cap, so the cap is just a safety net). Confirm acceptable.
