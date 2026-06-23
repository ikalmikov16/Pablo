# Phase 7 — Visual identity, Package 3: table & game chrome

> Child plan of `docs/plans/phase-7-visual-identity.md` (Package 3 row),
> written 2026-06-12 on branch `phase-7-visual-identity`, after Package 2
> (card art) passed its device checkpoint. Same contract as the Package 2
> plan: module signatures and token values here are the implementation
> spec; hex values are starting points to be tuned on device.

## One-sentence goal

Make the game screen read as a real card table — felt with depth, a deck
that looks like a stack, a discard pile that looks tossed, opponents on
proper seat plates — and give the surrounding chrome (sheets, banners,
toasts) the elevation it's missing, **without touching flight/motion
logic or building the Package-4 `Button` primitive**.

## Current state (audited 2026-06-12)

- The felt is a flat `tokens.game.surface.table` background color on the
  game screen root. No gradient, no vignette, no motif.
- `DeckArea` renders one face-down card with a bare text label under it
  (`game.deck.count`); the discard top card sits perfectly axis-aligned
  with a permanent "Discard" label under it.
- `OpponentSeat` renders a floating cream name string above the 2×2 grid.
  `tokens.game.table.nameLineHeight = 18` is baked into `seatLayout`'s
  band math.
- Chrome survey: **zero hardcoded colors** anywhere (good), but
  `tokens.shadow.raised` / `floating` are completely unused; every bottom
  sheet, the peek panel, and the toast render shadow-less; `NetworkBanner`
  reuses the Pablo-call red for an unrelated "reconnecting" state.

## Step 1 — Tokens (one file, `src/design/tokens.ts`)

New entries (append-only except the one rename):

| Token                     | Value                                                                                           | Used by                                |
| ------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------- |
| `game.surface.tableEdge`  | `#093832`                                                                                       | felt gradient outer stop + vignette    |
| `game.surface.tableMotif` | `rgba(242,233,213,0.05)`                                                                        | whisper zellige stars on the felt      |
| `game.surface.seatPlate`  | `rgba(255,253,247,0.92)`                                                                        | opponent seat plate background         |
| `game.surface.networkBg`  | `rgba(20,16,10,0.92)`                                                                           | `NetworkBanner` (decoupled from Pablo) |
| `game.avatar.palette`     | 5 colors (teal `#14554B`, terracotta `#C2552F`, gold `#C9A227`, olive `#6B6B2E`, ink `#243B36`) | avatar circles                         |

**Rename (intentional break):** `game.table.nameLineHeight` →
`game.table.seatHeaderHeight`, value `18 → 36`. The seat header is no
longer a bare text line but an avatar plate; renaming forces the
typechecker to surface every layout-math consumer (`seatLayout.ts` and
its tests) the same way deleting `font.weight` did in Package 1.

## Step 2 — `TableBackground` (new) + mount

**New `src/components/game/TableBackground.tsx`** — a memoized,
non-interactive, full-bleed Skia canvas:

1. Measures itself via `onLayout` (renders `null` until sized — Skia
   needs concrete dimensions).
2. Draws, bottom to top:
   - **Radial felt gradient**: full-rect `RadialGradient` shader, center
     `(w/2, h*0.42)` (slightly above middle — light falls from above),
     radius `0.75 × hypot(w, h)`, stops `[game.surface.table,
game.surface.tableEdge]`.
   - **Zellige motif**: `zelligeTiles(w, h, MOTIF_TILE)` (reuses the
     Package-2 module unchanged; `MOTIF_TILE ≈ 96`), every star drawn in
     `game.surface.tableMotif` — one whisper color, ignoring the
     checkerboard slot (the back's two-tone scheme would be noise here).
   - **Edge vignette**: second full-rect `RadialGradient`, transparent
     until ~0.65 then ramping to `game.surface.tableEdge` at the corners.

**Mount**: game screen `tableArea`, as the first child (under
`TableDimOverlay` and `TableLayout`). The screen root keeps
`backgroundColor: game.surface.table` so the safe-area top/bottom and any
canvas-load frame blend instead of flashing.

Static scene, one canvas, drawn once per layout — no animation, no
re-render on game state.

## Step 3 — Deck stack & discard jitter (`DeckArea.tsx`)

**New pure module `src/components/game/internal/pileDecor.ts`:**

```ts
/** How many fake edge layers render under the deck top card. */
export function deckDepthLayers(deckCount: number): 0 | 1 | 2 | 3;
// 0–1 cards → 0; 2–9 → 1; 10–24 → 2; ≥25 → 3

/** Deterministic tossed-card rotation, degrees in [-4, +4]. */
export function discardJitter(cardId: string): number;
// FNV-1a hash of the id → mapped to the range. No Math.random:
// re-renders never wobble, tests are exact.
```

**DeckArea changes:**

- **Depth layers**: `deckDepthLayers(deckCount)` absolute `View`s behind
  the top card, each offset `+2px` down per layer, `width/height` of the
  card, `borderRadius: radiusFor(cardWidth)`, background
  `defaultCardTheme.back.palette.primary` at stepped opacity
  (0.9 / 0.65 / 0.4). Fake edges, not `PlayingCard`s — visual parity at a
  fraction of the Skia surface count (parent-plan decision).
- **Count badge**: the bare label under the deck becomes a pill —
  `deckBadgeBg` background, `game.text.onFelt` text via
  `textStyle('xs', 'semibold')`, `radius.pill`, `shadow.raised`. Same
  in-flow position (the `seatLayout` deck band already reserves the
  height; the badge stays ≤ `seatHeaderHeight`).
- **Discard jitter**: the top discard `PlayingCard` is wrapped in a
  `View` with `transform: [{ rotate: `${discardJitter(id)}deg` }]`.
  Order matters: the rotation wrapper goes **inside** the
  `discardAnchor` measured view, so flight landings still target the
  unrotated slot box. The pulse `Animated.View` stays outermost.
- **Label cleanup**: the muted "Discard" caption renders only when the
  pile is empty (the dashed outline needs naming; a face-up card doesn't).

## Step 4 — Seat plates (`OpponentSeat.tsx` + new `Avatar`)

**New `src/components/ui/Avatar.tsx`** — initial-in-circle, the lobby
`MemberRow` pattern promoted to a shared primitive:

```ts
type AvatarProps = {
  readonly name: string; // initial = first grapheme, uppercased
  readonly seedId: string; // stable hash → game.avatar.palette index
  readonly size?: number; // default 24
};
```

Pure color pick via exported `avatarColor(seedId): string` (testable).
`MemberRow` migrates to it in **Package 4**, not now — this package does
not touch lobby files.

**OpponentSeat changes:**

- The floating name becomes a **plate**: horizontal row of
  `Avatar (24)` + name, on `game.surface.seatPlate` background,
  `radius.pill`, `paddingHorizontal: space.sm`, `paddingVertical:
space.xs`, `shadow.raised`, height pinned to
  `game.table.seatHeaderHeight`.
- **Status line** inside the plate, after the name, `textStyle('xs')`,
  `text.secondary`: hand count via new i18n key `game.seat.cards`
  (`"{{count}}"` + a small suit-free card glyph is overkill — plain
  count), overridden by `game.seat.pablo` (`"Pablo!"` in
  `accent.primary`) when `view.pabloCalledBy === entry.id`.
- **Color flips on the plate** (text moves from felt to sand):
  name `game.text.onFelt` → `color.text.primary`; the actor-focus
  `interpolateColor` endpoints become
  `[color.text.primary, color.accent.primary]` (gold has weak contrast
  on sand; terracotta is the chrome-side accent per the Package-1 split
  rule).
- **Unchanged**: the gold breathing turn-pulse (outer container tint
  around plate + grid), spotlight rings, ghosting, shake, and the
  `LinearTransition` grid reflow. No anchor key changes — flights are
  untouched.

**`seatLayout.ts`**: the rename in Step 1 forces the update; the band
math itself only changes constant names (`seatHeaderHeight` replaces
`nameLineHeight`). Its tests update the same way.

## Step 5 — Chrome elevation & fixes (mechanical, no structure)

From the survey; every line is a token spread or color swap:

| File                                                         | Change                                                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `DrawFlow`, `MatchHandFlow`, `MatchDiscardFlow`, `PowerFlow` | sheet container gains `...tokens.shadow.floating`                                             |
| `EndOfRound`                                                 | sheet gains `shadow.floating`; magic `width: 80 / 52 / maxHeight: 280` → `tokens.game.size.*` |
| `PeekOverlay`                                                | center panel gains `shadow.floating`                                                          |
| `ToastHost`                                                  | toast gains `shadow.floating`                                                                 |
| `TurnLabel`                                                  | active pill gains `shadow.raised`                                                             |
| `AnnouncementBanner`                                         | pill gains `shadow.raised`                                                                    |
| `ActionBar`                                                  | enabled buttons gain `shadow.raised` (disabled stay flat)                                     |
| `NetworkBanner`                                              | background `game.accent.pabloOnTurn` → `game.surface.networkBg` (reconnecting ≠ Pablo alarm)  |
| `PabloBanner`                                                | drop the non-token `marginTop: 2` (line spacing comes from the text styles)                   |

Explicitly **not** here: button restyling/pressed-states — that is the
Package-4 `Button` primitive; touching every `TouchableOpacity` twice is
waste.

## Test plan

- `pileDecor.test.ts` (new):
  - `deckDepthLayers`: exact thresholds (0→0, 1→0, 2→1, 9→1, 10→2,
    24→2, 25→3, 52→3); monotonic non-decreasing over 0–60.
  - `discardJitter`: deterministic (same id twice ⇒ identical); bounded
    (`|angle| ≤ 4` over 200 generated ids); spread (≥ 10 distinct values
    over those ids); known-vector check for one fixed id.
- `avatar.test.ts` (new): `avatarColor` deterministic; always returns a
  member of `game.avatar.palette`; distinct seeds hit ≥ 3 palette slots
  over a 20-id sample.
- `seatLayout.test.ts` (update): rename-driven compile fixes; band
  heights re-asserted against `seatHeaderHeight = 36`.
- No component test for `TableBackground` (React + Skia + layout — not
  unit-testable here); its only logic, `zelligeTiles`, is already
  covered by `zellige.test.ts`.
- Gate: `bun run check` after each step; one commit series on the
  existing branch.
- Manual (device, end of package): felt gradient + motif subtle but
  present; dim overlay still covers the whole table during choreography;
  deck reads as a stack at 25+ / thins as it drains; two successive
  discards land at visibly different angles and never wobble on
  re-render; seat plates readable at 1–3 opponents without clipping
  (`seatGap` 24 at three seats is the tight case); every sheet/toast
  casts a shadow; reconnect banner no longer looks like a Pablo call.

## Risks

| Risk                                                                              | Mitigation                                                                                                                                 |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Full-screen Skia canvas behind every frame hurts low-end GPU                      | Scene is static (no animation, no state subscription); memoized; if profiling complains, drop the motif layer first.                       |
| Plate (36px) + grid overflows the opponent band on small screens with 3 opponents | `seatHeaderHeight` is the single knob `seatLayout` already consumes; tests pin the band math; tune on device.                              |
| Discard rotation breaks flight landing alignment                                  | Rotation wrapper sits inside the measured anchor view; flights target the unrotated box; max 4° keeps the visual delta < 6px at deck size. |
| Depth-layer Views bleed outside the card silhouette during the discard pulse      | Layers live under the deck (never pulsed); only the discard side pulses.                                                                   |
| Sand plates over a dark felt gradient may strobe with the gold turn pulse         | Pulse tints the container behind the plate, not the plate; checked at the manual pass; both colors are tokens.                             |

## Out of scope

- 🚫 `Button` primitive, pressed-state styling, home/lobby screens
  (Package 4).
- 🚫 Any change to `flightPlanner` / `flightChoreography` /
  `FlyingCardLayer` motion logic, anchors, or z-indexes.
- 🚫 Discard under-card history (parent open question #2 stays open —
  revisit only if the jittered top card fails to read as a pile on
  device).
- 🚫 Animations (deal choreography, arc flights) — next phase.
- 🚫 Engine, store contracts, Supabase.

## Definition of done

- Steps 1–5 landed; `bun run check` green; `pileDecor` + `avatarColor`
  tested per plan; `seatLayout` tests updated for the rename.
- Manual device checklist above completed.
- Parent plan's Package 3 row annotated with a pointer to this file;
  `docs/PLAN.md` untouched until the branch-level merge step (per
  AGENTS.md the PLAN.md update happens before merging).
