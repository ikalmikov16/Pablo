# Phase 4.5 — UX overhaul: poker-table layout + card-flight animations

> Status: **draft, awaiting approval.**
> This is the high-level master plan covering two independently-shippable
> branches. Each branch will get its own detailed plan at
> `docs/plans/<branch-slug>.md` before any code is written, per AGENTS.md
> hard rule #9.

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

| Item                                                                                                                                     | File(s)                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `OpponentSeat` component (replaces `OpponentRow`) — name, score, face-down 2×2 grid via `CardSlotGrid`, optional Pablo button            | `apps/mobile/src/components/game/OpponentSeat.tsx` (new); delete `OpponentRow.tsx` |
| `TableLayout` component — absolute-positioned seats around a centred deck/discard                                                        | `apps/mobile/src/components/game/TableLayout.tsx` (new)                            |
| Seat-positioning helper for 1 / 2 / 3 opponents                                                                                          | `apps/mobile/src/components/game/internal/seatLayout.ts` (new)                     |
| Pull `DeckArea` into the centre of the table                                                                                             | `apps/mobile/src/components/game/DeckArea.tsx` (modify styles only)                |
| Wire `GameScreen` to the new layout                                                                                                      | `apps/mobile/app/(game)/[gameId]/index.tsx`                                        |
| Bug fix: opponent slots render `faceUp={false}` always — knownCards stays in the view (used by reveal sheet) but the seat shows the back | covered by `OpponentSeat` (which uses `CardSlotGrid` defaults)                     |
| Tests for `seatLayout` (positions are deterministic per opponent count)                                                                  | `apps/mobile/src/components/game/internal/seatLayout.test.ts` (new)                |

### Seat assignment

```
1 opponent:                 2 opponents:                3 opponents:
┌────────────┐              ┌─────┐  ┌─────┐            ┌────────────┐
│   Bot 1    │              │Bot1 │  │Bot2 │            │   Bot 1    │
├────────────┤              ├─────┴──┴─────┤            ├────┬───┬───┤
│  DECK/DSC  │              │   DECK/DSC   │            │Bot2│DEC│Bot3│
├────────────┤              ├──────────────┤            │    │/DS│    │
│    You     │              │     You      │            ├────┴───┴───┤
└────────────┘              └──────────────┘            │    You     │
                                                        └────────────┘
```

The seat positions are computed by `seatLayout(opponentCount, screenW, screenH)`
returning `{ top?, left?, right?, bottom: 'self', deck: {x, y} }`. Pure function
of geometry; trivially unit-testable.

### Design decisions

| Decision                      | Choice                                                                                                                              | Rationale                                                                                                                                                            | Alternatives rejected                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orientation of opponent grids | **All upright (same orientation as own hand)**                                                                                      | Card text is readable; no rotation math; slot-0 means "top-left" for every seat (consistent spatial language).                                                       | Rotated 180° / 90° per seat: looks more skeumorphic but kills legibility on a phone screen and complicates flight animations. Hybrid frame: cosmetic only, defer to Phase 7. |
| Sizing                        | Card max-width scales with seat region. Own hand keeps `MAX_CARD_WIDTH=96`; opponent seats use 56–72px depending on opponent count. | Visual hierarchy: the player's own cards are the focus; opponents are reference.                                                                                     | Constant 96px everywhere makes 3-opponent layouts overflow the screen.                                                                                                       |
| Deck/discard placement        | Absolute-positioned at table centre.                                                                                                | The deck/discard pair is the gameplay focal point; positioning it last in a flex flow means it reflows when an opponent's name wraps. Absolute = stable focal point. | Flex flow: reflows on layout-affecting changes, breaks Package B flight anchors.                                                                                             |
| 3-opponent side seats         | Vertical grid (one card per row, 2 rows of 2).                                                                                      | A `[▪][▪]` row at 56px wide × 4 cards = 240px wide which overflows narrow side regions. Stacking 2×2 keeps the seat footprint compact.                               | Force 1×4 horizontal: requires shrinking cards to ~28px, illegible.                                                                                                          |
| Pablo button                  | Stays per-seat. For 3-bot layouts the button anchors at the bottom of the seat region.                                              | Phase 4 already exposes off-turn `call_pablo` per-opponent. No reason to centralise.                                                                                 | Single shared "Call Pablo on…" button with picker: more taps, breaks symmetry with side info.                                                                                |
| `OpponentRow.tsx`             | Deleted, not deprecated.                                                                                                            | It has one consumer (`GameScreen`). Keeping it around invites drift.                                                                                                 | Mark as deprecated: zero callers means dead code, fail lint.                                                                                                                 |

### Test plan

- `seatLayout.test.ts`: for each opponent count (1, 2, 3), the returned coords are within the screen bounds, no seat overlaps the deck, all seats are non-overlapping, and the local player is at the bottom. Math only — no rendering.
- Existing `selectors.test.ts` keeps passing (no selector changes).
- Snapshot tests for `OpponentSeat` are NOT planned — Skia rendering is hard to snapshot meaningfully; the engine + selector tests already lock the data flow.
- Manual verification checklist in the branch's detailed plan: 1-bot, 2-bot, 3-bot games launched from the home screen; verify Pablo button positions, deck centre stable, peek-then-close → opponent card returns face-down.

### Definition of Done (Package A)

- All four seats (you + 1/2/3 opponents) render through `CardSlotGrid` with face-down cards in the matching 2×2 (or 2×2 grouping for 4-card hands).
- Opponent cards remain face-down in `OpponentSeat` even after a `use_peek_opponent` reveal — the reveal sheet is the only place that card face is shown.
- The deck/discard pair is at a stable centre of the screen across all opponent counts.
- `OpponentRow.tsx` is deleted; no stale imports.
- All `bun run check` gates green.

### Out of scope for Package A

- 🚫 Animated transitions between seats.
- 🚫 Rotated card text per seat.
- 🚫 Score panel / per-round details — keep the current inline score label.
- 🚫 Any change to `packages/engine`.

---

## Package B — Card-flight animations

### Goal

Every move that visibly affects a hand or the discard renders the
affected card(s) flying between their source and destination anchors,
so the player can track the spatial outcome without rereading the
discard top.

### What lands

| Item                                                                                                                     | File(s)                                                                       |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `FlyingCardLayer` — root-level absolute overlay that owns a queue of in-flight cards                                     | `apps/mobile/src/components/game/FlyingCardLayer.tsx` (new)                   |
| `AnchorRegistry` — context that components use to register their on-screen position by anchor id                         | `apps/mobile/src/components/game/internal/anchorRegistry.ts` (new)            |
| `useAnchor(id)` hook — wraps a `View` with `onLayout` + `measureInWindow`, registers under id                            | `apps/mobile/src/components/game/internal/useAnchor.ts` (new)                 |
| Flight planner — pure function from `GameEvent` → `ReadonlyArray<Flight>`                                                | `apps/mobile/src/components/game/internal/flightPlanner.ts` (new)             |
| Store additions: `flights: ReadonlyArray<Flight>`, actions `pushFlight`, `removeFlight`                                  | `apps/mobile/src/store/gameStore.ts` (modify)                                 |
| Anchor instrumentation on existing components: deck, discard, drawn-card preview, each own slot, each opponent slot      | `DeckArea.tsx`, `HandGrid.tsx`, `OpponentSeat.tsx` (modify)                   |
| Wire `enqueueEvents` to also call the planner and push flights                                                           | `apps/mobile/src/store/provider.tsx` (modify) or middleware in `gameStore.ts` |
| Replace the current 300 ms eventDrain timer with a flight-aware drain (promote view only after the flight queue empties) | `apps/mobile/app/(game)/[gameId]/index.tsx` (modify)                          |
| Tests for `flightPlanner` and `useAnchor`                                                                                | new `*.test.ts` files                                                         |

### The flight queue contract

```ts
type Flight = {
  readonly id: string; // unique per flight, used as the React key
  readonly cardId: string | null; // null = animate the face-down back only
  readonly from: AnchorId;
  readonly to: AnchorId;
  readonly durationMs: number; // typically 350–500
  readonly delayMs: number; // for parallel/staggered chains
};

type AnchorId =
  | { kind: 'deck' }
  | { kind: 'discard' }
  | { kind: 'drawn' } // drawn-card preview slot
  | { kind: 'ownSlot'; index: number }
  | { kind: 'opponentSlot'; playerId: PlayerId; index: number };
```

`flightPlanner(events: ReadonlyArray<GameEvent>)` returns the flights
the layer should run; the layer mounts an `Animated.View` per flight,
positioned absolutely, interpolating `translateX/Y` from
`anchorRegistry.get(flight.from)` to `anchorRegistry.get(flight.to)`
over `durationMs` (with `Easing.bezier(0.25, 0.46, 0.45, 0.94)` for a
slight ease-out). On completion, `removeFlight(id)` fires; when the
flight queue is empty AND the engine event queue is empty, `promoteView`
runs and the destination renders the new card.

### Event → flight mapping

| Engine event                                                                | Flights                                                                                                                                    | Notes                                                                                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `card_drawn`                                                                | `deck → drawn` (350ms)                                                                                                                     | The drawn-card preview anchor lives inside `DrawFlow` while it's mounted; otherwise it falls back to the deck position. |
| `card_discarded` (no swap, no match)                                        | `drawn → discard` (350ms)                                                                                                                  | The "Discard" button path.                                                                                              |
| `card_swapped`                                                              | parallel: `drawn → ownSlot(N)` + `ownSlot(N) → discard`                                                                                    | The two cards literally trade places. The toast (see below) tells the player which card was just discarded.             |
| `match_succeeded` (match_hand, two slots)                                   | parallel: `ownSlot(A) → discard` + `ownSlot(B) → discard`                                                                                  | After both flights resolve, `HandGrid` re-layouts via `LinearTransition`.                                               |
| `match_succeeded` (match_drawn)                                             | parallel: `drawn → discard` + `ownSlot(N) → discard`                                                                                       | The drawn card and the chosen slot's card both go to discard.                                                           |
| `match_succeeded` (match_discard)                                           | `ownSlot(N) → discard`                                                                                                                     | One flight.                                                                                                             |
| `match_failed` (any reason)                                                 | `deck → ownSlot(handSize)` (delayed 100ms so the shake plays first)                                                                        | The penalty card arrives at the new last position.                                                                      |
| `peeked` (peek_self, peek_opponent powers and `peek_one` during peek phase) | **No flight.** The card flips in place via `PlayingCard`'s existing prop-driven flip; the reveal sheet handles the visible-to-player part. | We rely on the existing flip animation we already wired in the last round.                                              |
| `swapped_blind`                                                             | parallel: `ownSlot(N) → opponentSlot(target, M)` + `opponentSlot(target, M) → ownSlot(N)`                                                  | The cross-table swap. Both cards stay face-down throughout.                                                             |
| `power_activated`                                                           | No flight.                                                                                                                                 | The PowerFlow overlay handles the resolution UI.                                                                        |
| `deck_reshuffled`                                                           | No flight (toast only).                                                                                                                    | Phase 7 polish item for a deck-shuffle animation.                                                                       |
| `pablo_called`                                                              | No flight (banner only).                                                                                                                   | Existing `PabloBanner`.                                                                                                 |
| `round_ended`                                                               | No flight (overlay only).                                                                                                                  | Existing `EndOfRound`.                                                                                                  |
| `peek_phase_ended`                                                          | No flight.                                                                                                                                 |                                                                                                                         |

### Design decisions

| Decision                                                       | Choice                                                                                                                                                                                    | Rationale                                                                                                                                                                                                      | Alternatives rejected                                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Flight overlay                                                 | Root-level absolute-positioned `View` above all overlays                                                                                                                                  | Cross-component motion (slot → discard) needs to live outside the source/destination's parent tree.                                                                                                            | Per-component fade-in/out: doesn't connect source and destination; fails the memory mechanic.                  |
| Anchor registration                                            | `AnchorRegistry` context + `useAnchor(id)` hook that calls `measureInWindow` on mount and on layout change                                                                                | `measureInWindow` returns absolute screen coords, which is what the overlay needs. Registry context survives re-renders.                                                                                       | Reading refs imperatively from each component: leaks ref handling into every component, no central registry.   |
| Flight duration                                                | 350 ms baseline, 500 ms for cross-table swaps                                                                                                                                             | Fast enough that gameplay isn't slow, long enough that the eye can follow.                                                                                                                                     | 200 ms baseline: too fast to track; 800 ms: drags out 4-bot multi-flight choreography.                         |
| Easing                                                         | `Easing.bezier(0.25, 0.46, 0.45, 0.94)` (CSS ease-out)                                                                                                                                    | Natural-looking deceleration; matches phone OS animations.                                                                                                                                                     | Linear: feels mechanical. Spring: overshoot is wrong for a positional move.                                    |
| Parallel vs sequential within one move                         | All flights inside a single move resolve in parallel (same start time, possibly different durations)                                                                                      | Matches how the engine produces these events: one `applyMove` produces one batch.                                                                                                                              | Sequential: makes match_hand feel slow (2 flights × 350 ms = 700 ms per turn).                                 |
| View promotion timing                                          | Promote `pendingView` exactly when the flight queue empties (not on a fixed timer)                                                                                                        | The existing 300 ms `eventDrain` timer was a placeholder. Flight-aware drain makes the visual state match the engine state.                                                                                    | Keep the fixed timer: animations and state get out of sync; cards land before or after the view says they did. |
| Toast on discard                                               | After every flight whose destination is `discard`, fire a 1.5 s toast: "Discarded the **4♥**". The card is known (it was in `knownCards` for the discarder or was the public drawn card). | Memory aid — the only moment the player sees that card otherwise was a one-tap reveal sheet, easy to miss.                                                                                                     | No toast: misses a cheap memory-game win. Permanent label: clutters the UI.                                    |
| Mid-flight interactions                                        | Block taps on the action bar while `flights.length > 0`                                                                                                                                   | Prevents dispatching a new move while the previous one is still animating. The engine already gates this via `expectedVersion`, but UX-wise the user should see the animation complete before the next prompt. | Allow taps: race conditions are confusing even if engine-safe.                                                 |
| Skia choreography (the "all cards on one canvas" architecture) | Deferred to Phase 7                                                                                                                                                                       | Higher fidelity but a much heavier rewrite; the per-flight `Animated.View` approach reuses every existing `PlayingCard` instance and supports the same animation language.                                     | Build Skia now: 2–3× the work, locks in rendering pipeline before we know we need it.                          |

### Test plan

- `flightPlanner.test.ts`: for each `GameEvent` variant, assert the planner returns the correct flight list (anchors, durations, parallelism). Pure function over engine events; the most important test surface.
- `anchorRegistry.test.ts`: registering an anchor returns its bounds; unregistering removes it; reading an unknown anchor returns `null`.
- `useAnchor` tested indirectly via a small mount harness.
- Existing selector tests stay green (selectors unchanged).
- Manual verification: a full 1-bot game where the human discards, swaps, matches, fails a match, and uses each of the three powers — every flight visible, every destination correct, view promotion timed to flight completion.

### Definition of Done (Package B)

- Every `GameEvent` listed above produces a visible flight from the correct source anchor to the correct destination anchor.
- View promotion happens after the flight queue is empty (no early reveal, no late reveal).
- Cross-table `swap_blind` animates from own slot to opponent slot and back (both face-down).
- Discard-destined flights fire a "Discarded the X" toast.
- Action bar is non-interactive while flights are in flight.
- All `bun run check` gates green.

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

## Open questions

These are the items I'd like a yes/no/your-preference on before writing
the per-branch detailed plans. Defaults shown are my recommendations.

1. **Side seats in 3-bot games.** Side opponents will render their 2×2 grid at ~56–64 px card width. On a 4.7"-class iPhone that's borderline tight. Acceptable, or should 3-bot games scroll horizontally / use a different layout?
   _Default: accept tight ~56px; revisit in Phase 7._

2. **Toast on discard.** "You discarded the 4♥" 1.5 s toast after every discard-flight. Helpful memory aid, mild visual noise.
   _Default: yes, include._

3. **Opponent name placement.** Top of the seat (above cards) for top seat; below cards for bottom seat; side of cards for left/right seats. OK as a rule?
   _Default: yes._

4. **Branch names.** Proposed:
   - `phase-4-5-table-layout`
   - `phase-4-5-flying-cards`
     _Default: use these unless you want different slugs._

5. **Order of work.** Package A → Package B (recommended) versus reverse?
   _Default: A first, because the seat anchors become Package B's source/destination points._

6. **Plan in same PR as implementation (AGENTS.md hard rule #9).** This master plan ships in `docs/plans/phase-4-5-ux-overhaul.md`. Each branch gets its own detailed plan at `docs/plans/<branch>.md` written before code in that branch. Confirm this is what you want, or do you prefer that this master plan ships with the first branch's implementation?
   _Default: this doc lands now (as a doc-only commit on `main` or carried along with Package A); detailed plans land with their branches._

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
- **After B merges**: append a "Phase 4.5 — Card flights" Done section; add decisions for flight-aware view promotion, parallel-within-move flights, toast-on-discard, Skia deferred to Phase 7.

Both updates also belong in the AGENTS.md self-review checklist (the producer of each branch is responsible for the PLAN.md update before squash-merging).

---

## What this plan deliberately does NOT do

- **Does not modify the engine.** `peek_one`, `use_peek_*`, `use_swap_blind` are all already in the engine. We're only changing how the client renders the events they emit.
- **Does not change RLS, edge functions, or the engine bundle.** Phase 5 work is untouched.
- **Does not introduce a new dependency.** Reanimated 4 (already present, with `react-native-worklets`), gesture-handler (already present), Skia (already present). No `react-native-shared-element`, no `lottie-react-native`.
- **Does not redesign the action bar, peek overlay, match flows, or power flows.** All five already underwent the rewrite we just shipped; this overhaul lives one layer up (table layout) and one layer above (flight overlay).
