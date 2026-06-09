# Phase 4.5 / Package C — Animation polish

> Branch: `phase-4-5-animation-polish` (cut from `phase-4-5-table-layout` after B.1 lands)
> Master plan: `docs/plans/phase-4-5-ux-overhaul.md`
> Predecessor: `docs/plans/phase-4-5-flying-cards.md` (Packages B + B.1)
> Status: **implemented** on `phase-4-5-table-layout`

## One-sentence goal

Replace the current ad-hoc, mostly-linear animation surfaces with a single
motion vocabulary (curves + spring presets + a tight duration scale) so every
flight, cue, overlay, and toast in the app feels deliberate and consistent
without changing what each animation _means_.

## Why this plan exists

Packages B and B.1 made the game readable: cards fly to the right places,
spotlights highlight memory-critical slots, opponent swaps are unmistakable.
But in playtesting the seams still feel prototype:

1. **Motion is monotone.** Every flight uses the same `ease-out` cubic regardless
   of intent; no springs, no overshoot, no anticipation.
2. **Cards translate, they don't behave.** Pure 2D translate; no lift, no
   shadow, no rotation, no flip mid-arc; the hidden inbound on opponent swaps
   pops out of a 1×1 invisible seat anchor.
3. **Cues snap on/off.** Spotlight rings, actor-focus tints, and the table dim
   are all binary toggles; the discard pulse is two raw `withTiming` calls.
4. **Overlays appear flat.** `DrawFlow`, `PeekOverlay`, and `EndOfRound` mount
   without entrance motion; `ToastHost` is a linear opacity fade; `PabloBanner`
   slides in linearly.
5. **Rhythm is off.** Simultaneous flights stack into blobs; bot turns chain
   together with no breath between them.
6. **Tokens are a bag of magic numbers.** `tokens.game.duration` has 14 values
   with no scale relationship; they were tuned per-feature.

None of this is a bug. The game is correct. This plan closes the gap between
"correct" and "feels professional" without changing any choreography semantics.

## Hard principles

1. **Every motion belongs to one of six categories.** Pull curve + duration
   from `tokens.game.motion`. No bespoke `withTiming({ duration: 412, ... })`
   anywhere in the app.
2. **Springs by default.** `withTiming` only when an exact end-time matters
   (i.e. choreography sequences planned by `flightPlanner` / `gameStore`).
3. **Cards are physical objects.** They tilt, lift, cast shadows during flight,
   and visibly flip when face-down → face-up.
4. **Cues have onset / hold / offset.** Nothing toggles instantly.
5. **Stagger > simultaneity.** When two flights share a `delayMs`, separate
   them by 70 ms each in declaration order.
6. **Pacing has breath.** A short quiet beat between batches so chained bot
   turns don't blur.

## Scope

**In scope**

- A `tokens.game.motion` namespace with curves, springs, and a duration scale.
- A small helper module (`apps/mobile/src/feedback/motion.ts`) exporting the
  spring/timing presets for components to consume.
- Refactor every existing animation in `apps/mobile/src/components/**` and
  `FlyingCardLayer` to consume the vocabulary.
- Add lift + shadow + mid-flight flip to `FlyingCardLayer`.
- Add scale-emerge to hidden inbound flights (opponent swap).
- Animate spotlight, actor focus, table dim, discard pulse on/off with springs.
- Spring entrances for `DrawFlow`, `PeekOverlay`, `EndOfRound`,
  `PabloBanner`, `ToastHost`.
- Auto-stagger of co-scheduled flights inside `flightPlanner`.
- Inter-batch breath in `gameStore.startNextBatchIfIdle`.
- Update tests for the planner stagger and for the motion token shape.

**Out of scope**

- Changing _which_ events animate (no choreography redesign).
- New game UI surfaces (no new overlays, no new cues).
- Sound effects.
- Skia-based card art changes.
- The shared transition between the drawn-card flight landing and the
  `DrawFlow` hero card. Visually compelling but expensive; deferred.
- Ambient breathing on idle elements (current-turn seat etc.).
- Haptic mapping (separate, smaller follow-up if we want it).

## Motion vocabulary

Add under `tokens.game.motion`:

```ts
motion: {
  duration: {
    instant: 80,
    quick: 140,
    brisk: 220,
    normal: 320,
    slow: 520,
    heavy: 780,
    deliberate: 1100,
  },
  curve: {
    snap: [0.32, 0.72, 0.0, 1.0],     // sharp ease-out, deck draws & quick movements
    carry: [0.45, 0.05, 0.55, 0.95],  // ease-in-out, swaps & long flights
    reveal: [0.16, 1.0, 0.3, 1.0],    // expo-out, cards landing into discard
    drift: [0.4, 0.0, 0.6, 1.0],      // soft cubic, blind/hidden movement
  } as const,
  spring: {
    settle: { damping: 18, stiffness: 220, mass: 1 },
    pulse:  { damping: 14, stiffness: 280, mass: 1 },
    banner: { damping: 22, stiffness: 180, mass: 1 },
    gentle: { damping: 24, stiffness: 140, mass: 1 },
  } as const,
  /** Quiet beat between batches so bot-after-bot doesn't blur. */
  breath: 180,
  /** Stagger applied to co-scheduled flights inside one batch. */
  stagger: 70,
  /** Lift / shadow shape for in-flight cards. */
  lift: { peakScale: 1.05, peakShadow: 0.18 },
} as const
```

Keep the existing duration tokens as **aliases** that resolve to the new scale,
so we can refactor incrementally without breaking call sites:

```ts
duration: {
  flightFast: 320,        // → motion.duration.normal
  flightSlow: 520,        // → motion.duration.slow
  swapFocusMs: 220,       // → motion.duration.brisk
  swapSpotlightMs: 320,   // → motion.duration.normal
  selfSwapExchangeMs: 780,// → motion.duration.heavy
  // etc.
}
```

After the refactor lands, drop the old keys.

### Helper module

`apps/mobile/src/feedback/motion.ts`:

```ts
export const easings = {
  snap: Easing.bezier(...tokens.game.motion.curve.snap),
  carry: Easing.bezier(...tokens.game.motion.curve.carry),
  reveal: Easing.bezier(...tokens.game.motion.curve.reveal),
  drift: Easing.bezier(...tokens.game.motion.curve.drift),
};

export function timingFor(
  intent: 'snap' | 'carry' | 'reveal' | 'drift',
  durationKey: keyof typeof tokens.game.motion.duration,
): WithTimingConfig;

export function springFor(preset: keyof typeof tokens.game.motion.spring): WithSpringConfig;
```

Components import only from this helper, never from `'react-native-reanimated'`'s
easing API directly.

## Implementation passes

Each pass is independently mergeable. Each one closes a visible gap in feel.
PRs (squash-merges) are pushed in order; we approve and ship one before
starting the next.

### Pass 1 — Tokens + helper module

Files:

- `apps/mobile/src/design/tokens.ts` — add `motion` namespace; alias old keys.
- `apps/mobile/src/feedback/motion.ts` — new file; exports `easings`,
  `timingFor`, `springFor`.

Tests:

- `apps/mobile/src/feedback/motion.test.ts` — verifies every preset returns a
  config with the expected damping/stiffness or duration/easing pair.
- Token shape test (lightweight) confirming the keys exist.

Risk: zero — additive only.

### Pass 2 — Replace ad-hoc curves and timings

Files:

- `apps/mobile/src/components/game/FlyingCardLayer.tsx` — replace `EASE` with
  `easings.carry` (default) and `easings.snap` for `flightFast` flights.
- `apps/mobile/src/components/game/DeckArea.tsx` — discard pulse becomes
  `withSpring(scale, springFor('pulse'))`.
- `apps/mobile/src/components/game/OpponentSeat.tsx` and `OwnHandGrid.tsx` —
  shake stays a `withSequence` (it's intentionally robotic) but the values come
  from `motion.duration.instant`.
- `apps/mobile/src/components/game/PabloBanner.tsx` — `translateY` becomes
  `withSpring(0, springFor('banner'))`.
- `apps/mobile/src/components/game/ToastHost.tsx` — opacity becomes a
  `springFor('gentle')` ramp; add a `translateY` 12 → 0 with the same spring on
  enter, reverse on exit.
- `apps/mobile/src/components/game/EndOfRound.tsx` — entrance: opacity + scale
  via `springFor('settle')`; rows stagger by `motion.stagger`.
- `apps/mobile/src/components/game/actionFlows/DrawFlow.tsx` — sheet slides up
  from below with `springFor('settle')`; on dismiss, slide down with
  `timingFor('snap', 'brisk')`.
- `apps/mobile/src/components/game/PeekOverlay.tsx` — entrance: scale 0.94 → 1
  - opacity 0 → 1 via `springFor('settle')`.

Tests:

- Snapshot the spring/timing configs surfaced by the helpers (shallow tests
  against `springFor('settle')` etc.). We can't visually verify motion in unit
  tests, but we can verify components import from `feedback/motion`.

Risk: low — same end states, just nicer transitions.

### Pass 3 — Cue polish

Files:

- `apps/mobile/src/store/gameStore.ts` — no functional change, but cue payloads
  may want an explicit `onsetMs` / `offsetMs` (default 0) for components to
  read. Add to `flightTypes.ts`.
- `apps/mobile/src/components/game/OpponentSeat.tsx` — `spotlight` border
  becomes a Reanimated style: opacity 0 → 1 via `springFor('pulse')`, hold,
  then fade out via `timingFor('reveal', 'brisk')`. Border color does one
  gentle pulse (color shared value 0 → 1 → 0 over the hold).
- `apps/mobile/src/components/game/OwnHandGrid.tsx` — same spotlight treatment.
- `apps/mobile/app/(game)/[gameId]/index.tsx` — `tableDim` opacity becomes a
  `springFor('gentle')` ramp instead of CSS `opacity` toggle.
- `OpponentSeat.tsx` — `actorFocus` background and name color animate with
  `springFor('gentle')` (opacity values for backgroundColor via interpolated
  shared value, since RN can't spring colors directly).
- `apps/mobile/src/components/game/DeckArea.tsx` — discard pulse is a single
  spring (peak 1.06 → 1) instead of `withSequence`.

Tests:

- New unit test that asserts cue UI components mount and react to a synthetic
  cue array (mostly type-level checks; visual polish isn't unit-testable).

Risk: low — same on/off semantics, smoother edges.

### Pass 4 — Flight depth (lift, shadow, mid-flight flip)

Files:

- `apps/mobile/src/store/flightTypes.ts` — extend `Flight` with optional flags:
  `liftEnabled?: boolean`, `flipMidFlight?: boolean`. Default both to `true`
  for normal flights, `false` for `hiddenSwap`.
- `apps/mobile/src/store/flightPlanner.ts` — set `flipMidFlight: true` only on
  `card_drawn` for self (where the back→face transition is meaningful).
- `apps/mobile/src/components/game/FlyingCardLayer.tsx`:
  - Add `lift` shared value: `0 → 1 → 0` triangle wave across the flight,
    drives `scale = 1 + lift * tokens.game.motion.lift.peakScale`.
  - Add elevated shadow: `shadowOpacity = lift * peakShadow`. Use `boxShadow`
    via `Animated.View` style; on Android, `elevation` interpolation.
  - Add `flipProgress` shared value: 0 → 1 across flight. When
    `flipMidFlight` and `flight.faceUp` is false at start: render a single
    `Animated.View` with `rotateY` interpolated 0 → 180°, swap face/back at
    progress 0.5 by toggling `faceUp` derived from progress.
  - For `emphasis === 'hiddenSwap'` from a seat anchor: scale 0.6 → 1 over the
    first 120 ms (separate `emerge` shared value).
- `apps/mobile/src/store/flightPlanner.test.ts` — assert that `flipMidFlight`
  is true for self `card_drawn` and false for `swapped_blind`.

Risk: medium — most likely to introduce visual regressions. Worth a careful
self-review pass.

### Pass 5 — Stagger and breath

Files:

- `apps/mobile/src/store/flightPlanner.ts` — after planning, post-process
  flights: group by exact `delayMs`, sort within each group by `zRank` then
  insertion order, and apply `delayMs += i * tokens.game.motion.stagger` for
  the i-th member of each group.
- `apps/mobile/src/store/gameStore.ts` — in `dequeueEvents`, before calling
  `startNextBatchIfIdle`, schedule the next start via `setTimeout` with
  `tokens.game.motion.breath` delay. Track the timer with the existing
  `clearAllTimers` so unmount disposes it.
- `apps/mobile/src/store/flightPlanner.test.ts` — new test: a batch with two
  flights at the same delay results in flights at `[0, 0 + stagger]`.

Risk: low — pacing change, no semantic change.

### Pass 6 — Cleanup

- Drop the legacy `tokens.game.duration.flightFast` / `flightSlow` / etc.
  aliases once every callsite consumes the new vocabulary.
- Sweep for any remaining hand-rolled `Easing.bezier(...)` or `withTiming({
duration: 12_345, ... })` in mobile and replace with helpers.
- Update `docs/PLAN.md` "Decisions Made".
- Update this plan's `Status` to `implemented`.

## Test plan

- **Unit**
  - `feedback/motion.test.ts` — preset shape checks.
  - `flightPlanner.test.ts` — stagger applied; `flipMidFlight` flag set
    correctly per event type.
  - `gameStore` test (light) — `breath` timer is scheduled and disposed.
- **Type**
  - All existing planner / store tests must keep passing without changes
    except the additive ones above.
- **Manual on physical iPhone**
  - Self draw → swap → discard sequence: drawn card lifts mid-arc, lands and
    flips; spotlight breathes once on the slot; discard pulse springs cleanly.
  - Opponent draw → swap → discard: actor focus eases in; spotlight breathes;
    hidden inbound emerges from seat (scale 0.6 → 1) instead of teleporting;
    table dim fades, doesn't snap.
  - `DrawFlow` slides up from below; dismisses with a snap-down.
  - Toasts slide + fade; don't pop.
  - PabloBanner slides with spring settle.
  - Two bots taking turns back-to-back: each bot's choreography stands alone,
    no overlap.

## Risks and trade-offs

| Risk                                                                               | Mitigation                                                                                                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Lift / shadow during flight is GPU-expensive on older iPhones.                     | `peakShadow` is small (0.18), only one shadow value at a time; bench on iPhone SE 2nd gen before merging Pass 4.                           |
| Mid-flight flip plus translate plus scale = three concurrent worklets; could jank. | Use a single `useAnimatedStyle` driven by a single `progress` shared value; derive translate, scale, rotateY from it.                      |
| Springs make sequenced timing harder (no exact end time).                          | Springs only on entrances/exits/cues. Choreographed flights stay on `withTiming` so `gameStore.totalDurationMs` stays predictable.         |
| Token aliasing during the refactor could leave us in an inconsistent state.        | Pass 6 (cleanup) is mandatory before merge to `main`; keep the alias period to the lifetime of this branch only.                           |
| Auto-stagger could accidentally desync a flight from its cue.                      | The cue's `delayMs` is computed against the _planned_ flight's adjusted delay (post-stagger), not the original. Add an assertion in tests. |

## Definition of done

- `bun run check` is green.
- Every animation in `apps/mobile` consumes either `springFor(...)` or
  `timingFor(...)`; grep for `withTiming({ duration:` and `Easing.bezier(`
  outside `feedback/motion.ts` returns nothing.
- Every magic-number duration in `apps/mobile/src/components/**` is replaced by
  a `tokens.game.motion.duration.*` lookup.
- Manual playtest checklist (above) ticks every box on a physical iPhone.
- `docs/PLAN.md` Decisions Made has a row for this plan.
- `docs/plans/phase-4-5-animation-polish.md` Status flipped to `implemented`.

## Open questions

1. Should the `breath` between bot batches be deterministic (always 180 ms) or
   only inserted when the next batch is from a _different_ player than the
   last? The latter is more elegant but harder to test.
2. Mid-flight flip on opponent draws is mostly invisible (the inbound is
   face-down anyway). Worth scoping the flip strictly to self-draws where the
   reveal is meaningful, or do it everywhere for consistency?
3. Do we want haptics in the same PR as Pass 6 cleanup, or as a strict
   follow-up? My recommendation: separate, so this plan stays focused on
   visual polish.
4. Lift/shadow on Android — the workaround for `shadowOpacity` non-animation
   support is interpolating `elevation`, which is integer-only and feels
   choppy. Acceptable for v1, or block until we have a real solution?
