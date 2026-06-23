# Phase 7 (part 2a) — Package 2: card art

> Status: written 2026-06-12 on branch `phase-7-visual-identity`, before any
> Package 2 code. Parent plan: `docs/plans/phase-7-visual-identity.md`
> (Package 1 — tokens + fonts — is implemented and green). This file is the
> detailed implementation plan for Package 2 only.

## One-sentence goal

Replace the placeholder card surfaces — white rect + system-font text
overlays, two-rect back — with procedural Skia art (suit paths, real pip
layouts, ornamental court frames, zellige back) behind the existing
`CardTheme` contract, so that re-aliasing `defaultCardTheme` to the new
`zellige` theme reskins every card in the app with zero component changes
outside the cards module.

## Current state (verified in code)

- **Face** (`PlayingCard.tsx`): Skia `RoundedRect` bg + stroke border; rank
  - suit are RN `<Text>` with unicode glyphs and `fontWeight: '800'`
    (system font — the only file Package 1 deliberately skipped); the
    "center pip" is one oversized glyph regardless of rank.
- **Back**: two nested `RoundedRect`s + one rotated rounded square. The
  comment in the file calls it a placeholder for the zellige pass.
- **Dormant contracts**: `BackPatternStyle = 'plain' | 'zellige' | 'leather'`
  and `SuitGlyphStyle = 'classic' | 'minimal' | 'arabesque'` are declared
  in `cardTheme.ts`; only `'plain'`/text-glyphs are implemented.
- **Theme plumbing**: every game surface gets its theme from the single
  `defaultCardTheme` export (`DeckArea`, `CardSlotGrid`, `FlyingCardLayer`,
  `DrawFlow`, card lab). No surface picks a theme independently — the
  re-alias is the whole rollout.
- **Existing tests that this package breaks on purpose**:
  - `cardTheme.test.ts` asserts exactly 2 themes, registry order
    `[classic-light, midnight]`, `defaultCardTheme.face.palette.bg === '#FFFFFF'`,
    and `nextTheme` cycle order — all change.
  - `PlayingCard.test.ts` asserts the `sizesSnapshot` reference table
    (gains new fields) and `suitGlyph` unicode returns (helper is deleted,
    see Step 5).

## Design spec

### The `zellige` theme (new app default)

| Slot                     | Value                               | Rationale                                             |
| ------------------------ | ----------------------------------- | ----------------------------------------------------- |
| `back.palette.primary`   | `#0B3B34`                           | field — darker than table felt `#0E4F47` so backs pop |
| `back.palette.secondary` | `#14554B`                           | border band + alternating stars                       |
| `back.palette.accent`    | `#C9A227`                           | gold stars — matches `tokens.color.accent.highlight`  |
| `face.palette.bg`        | `#FFFDF7`                           | matches chrome card surface                           |
| `face.palette.red`       | `#B3402A`                           | terracotta-leaning red, on-identity                   |
| `face.palette.black`     | `#243B36`                           | deep teal-ink instead of pure black                   |
| `face.palette.border`    | `#E0D5BC`                           | warm sand hairline                                    |
| `border`                 | width 1, radius 12, color `#D9CDB2` |

`face.suitGlyphs: 'classic'`, `back.pattern: 'zellige'`,
`cornerLayout: 'spacious'`. `classic-light` and `midnight` keep rendering
through the `'plain'` path — proof the theme contract held.

### Face, by rank class

- **A, 2–10**: classic pip arrangements (table below), suit shapes drawn as
  Skia paths inside the main face `<Canvas>`. Ace renders its single pip at
  `centerSuit` size; 2–10 at `pip` size.
- **J/Q/K**: ornamental geometric frame (inner border band + four corner
  stars reusing the zellige star path) around a large rank letter
  (RN Text, Outfit bold) with a suit path beneath. No illustrated courts.
- **Corners**: rank label stays RN Text but moves to Outfit bold
  (`tokens.font.family.bold`); the small suit glyph under it becomes a Skia
  path in the canvas (the unicode-glyph `<Text>` goes away).

### Back

Field in `primary`; inset border band stroked in `secondary`; tessellation
of 8-pointed stars alternating `accent` / `secondary` on a square grid
(checker pattern). Tile size derived from card width ⇒ constant tile count
(~5 columns) at every render size, so thumbnails don't turn to noise and
flights (render-at-max-size + scale) stay sharp — everything is vector.

## Implementation steps

### Step 1 — `internal/suitPaths.ts` (new, pure)

```ts
export function suitPath(suit: Suit): string; // SVG path, unit box [0,1]²
```

Hand-authored path strings: heart (two cubic arcs + point), diamond
(rhombus with slightly curved sides), spade (inverted heart + stem
flare), club (three lobes + stem). No React/Skia imports — returns
strings only. The component parses them once via
`Skia.Path.MakeFromSVGString` and fits them with `Group` transforms
(translate + uniform scale), never re-parsing per frame.

### Step 2 — `internal/pipLayout.ts` (new, pure)

```ts
export type Pip = { readonly x: number; readonly y: number; readonly rotated: boolean };
export function pipLayout(rank: Rank): ReadonlyArray<Pip>; // unit pip-area coords
```

Coordinate system: unit square mapped by the renderer onto the **pip
area** — the inset rect between the corner labels (see Step 6 sizing).
Columns at x ∈ {0, 0.5, 1}, `rotated: true` ⇔ y > 0.5 (bottom-half pips
draw upside down, like real cards).

| Rank  | Layout                                            |
| ----- | ------------------------------------------------- |
| A     | center                                            |
| 2     | (0.5,0) (0.5,1)                                   |
| 3     | (0.5,0) (0.5,0.5) (0.5,1)                         |
| 4     | corners: (0,0) (1,0) (0,1) (1,1)                  |
| 5     | 4 + center                                        |
| 6     | side cols × rows {0, 0.5, 1}                      |
| 7     | 6 + (0.5, 0.25)                                   |
| 8     | 6 + (0.5, 0.25) (0.5, 0.75)                       |
| 9     | side cols × rows {0, ⅓, ⅔, 1} + center            |
| 10    | side cols × rows {0, ⅓, ⅔, 1} + (0.5, ⅙) (0.5, ⅚) |
| J/Q/K | `[]` (court frame instead)                        |

### Step 3 — `internal/zellige.ts` (new, pure)

```ts
export function starPathSvg(points?: number, innerRatio?: number): string; // unit 8-point star
export type ZelligeTile = {
  readonly cx: number;
  readonly cy: number;
  readonly scale: number;
  readonly slot: 'accent' | 'secondary';
};
export function zelligeTiles(w: number, h: number, tileSize: number): ReadonlyArray<ZelligeTile>;
```

`starPathSvg` generates the {8/3}-style star polygon (16 vertices,
alternating outer radius 0.5 / inner ≈ 0.21). `zelligeTiles` lays a square
grid of star centers covering `w × h`, alternating `slot` in a checker
pattern, deterministic for fixed inputs. **Package 3 reuses this module
for the felt `TableBackground`** — that's why it's a standalone generator
rather than inline in `PlayingCard`.

### Step 4 — `internal/courtFrame.ts` (new, pure)

```ts
export type CourtFrame = {
  readonly bandInsetFrac: number; // inner band inset as fraction of W
  readonly starScaleFrac: number; // corner star size as fraction of W
  readonly letterYFrac: number; // rank letter center, fraction of H
  readonly suitYFrac: number; // suit pip center, fraction of H
};
export function courtFrame(): CourtFrame; // same frame for J/Q/K
```

One frame for all three courts (differentiated by the letter) — per-rank
ornament variation is a future-polish lever, not v1 scope.

### Step 5 — `PlayingCard.tsx` face/back rewrite

- **Front canvas** draws: bg, border stroke, then either the pip grid
  (`pipLayout` × suit path, rotated pips via `Group` rotate π) or the
  court frame (band `RoundedRect` stroke + 4 corner stars + suit path).
- **Corner overlays**: rank RN Text moves to `tokens.font.family.bold`;
  corner mini suit-paths move into the canvas; the unicode suit `<Text>`
  elements are deleted.
- **Court letter**: RN Text (Outfit bold, `courtLetter` size) — Skia text
  stays out of scope (font-asset plumbing not worth it, per parent plan).
- **Back canvas**: branch on `theme.back.pattern` — `'zellige'` renders
  field + band + `zelligeTiles` stars; `'plain'` keeps the existing
  two-rect + diamond rendering byte-for-byte (midnight/classic regression
  safety). `'leather'` stays unimplemented (falls back to `'plain'`).
- **Memoization**: all `SkPath` objects built in `useMemo` keyed on
  `(theme.id, W)`; one shared path instance per suit/star drawn many times
  via transforms (cards.mdc: no path allocation in render).
- **Untouched**: gestures, flip animation, `suppressFlipAnimation`, props
  contract, memo comparison.
- **`cardHelpers.ts`**: `suitGlyph` (unicode) loses its last consumer —
  delete it and its tests (dead-code rule). `rankLabel`, `isRedSuit`,
  `suitColor` stay.

### Step 6 — `internal/cardSizes.ts` extensions

`sizesFor(width)` gains: `pip` (≈ 0.16W), `pipAreaInsetX` (≈ 0.22W),
`pipAreaInsetY` (≈ 0.14H via aspect), `cornerSuit` (≈ 0.10W, canvas-drawn),
`courtLetter` (≈ 0.34W), `zelligeTile` (≈ 0.22W). Exact constants tuned in
the lab; the **snapshot test locks them** once approved (same pattern as
the existing 44/88/220 reference table, which gains the new fields).

### Step 7 — `cardTheme.ts`

- Add `zelligeCardTheme` (palette above).
- Rename the current default object to `classicLightCardTheme`; re-point
  `export const defaultCardTheme = zelligeCardTheme` — this one line is
  the app-wide rollout (5 import sites, all read the alias).
- Registry order `[zellige, classicLight, midnight]` so the lab's cycle
  button starts on the new look.

### Step 8 — Card lab additions

- **Felt preview row**: variants row rendered on a `game.surface.table`
  colored tile, so card-on-felt contrast is judged in one screen (parent
  plan open question Q3 — resolved: yes, it's cheap).
- **Rank strip**: one row of A 2 5 8 10 J Q K thumbnails to eyeball every
  pip layout + the court frame per theme.
- New i18n keys (`dev.cardLab.feltPreview`, `dev.cardLab.rankStrip`) in
  `en.json` — lab strings still go through `t()` (hard rule #7).

**→ Checkpoint 1 (from parent plan): card lab on a real iPhone; user
approves face + back art before Package 3.**

## Test plan

Bun tests cannot instantiate native Skia, so all new tests target the pure
modules (strings + numbers), not rendering:

- `suitPaths.test.ts` (new): four distinct, non-empty strings; start with
  `M`; contain only valid SVG path command characters; stable across calls.
- `pipLayout.test.ts` (new): pip count == rank value for A–10 (A=1); empty
  for J/Q/K; all coords in [0,1]; horizontal mirror symmetry (set closed
  under x→1−x); vertical mirror symmetry (set closed under y→1−y);
  `rotated` ⇔ y > 0.5.
- `zellige.test.ts` (new): deterministic for fixed inputs; tiles cover the
  rect (every grid cell has a center within bounds); checker alternation
  of `slot`; `starPathSvg` has 16 vertices and closes (`Z`).
- `courtFrame.test.ts` (new): fractions in (0, 0.5); letter above suit.
- `cardSizes` snapshot (update): reference table at 44/88/220 gains
  `pip` / `pipAreaInsetX` / `cornerSuit` / `courtLetter` / `zelligeTile`;
  all monotonic in width.
- `cardTheme.test.ts` (update): 3 themes, order `[zellige, classic-light,
midnight]`, unique ids, `defaultCardTheme.id === 'zellige'`, full
  `nextTheme` cycle, palette-slot checks extended to the new theme.
- `PlayingCard.test.ts` (update): drop `suitGlyph` describe block.
- Gate: `bun run check` after each step lands; the package is one commit
  series on the existing branch.

## Risks

| Risk                                                                                   | Mitigation                                                                                                          |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Hand-authored SVG suit paths look lumpy at small sizes                                 | Author at unit scale against reference glyphs; the lab thumbnail row (72px) is the acceptance surface.              |
| `Skia.Path.MakeFromSVGString` returns `null` on a malformed string (silent blank suit) | Tests lock string structure; component guards with a dev-only `console.error` + skips drawing rather than crash.    |
| Court letter (RN Text) misaligns with the Skia frame across sizes                      | Both derive from the same `sizesFor`/`courtFrame` fractions; rank strip in the lab shows 72px + 220px side by side. |
| Star path count inflates Skia work on busy tables (~24 backs × ~35 stars)              | One shared `SkPath` drawn via transforms; constant tile count per back; if needed, drop to 4 columns below 60px.    |
| Re-aliasing `defaultCardTheme` changes every surface at once (big visual bang)         | That's the point — but `'plain'` path keeps classic/midnight pixel-identical, so the lab can A/B instantly.         |

## Out of scope

- 🚫 `'arabesque'` glyph style, `'leather'` back, illustrated court cards.
- 🚫 Skia-rendered text (corner ranks / court letters stay RN Text + Outfit).
- 🚫 Any animation change; any file outside `src/components/cards/`,
  `src/design/cardTheme*`, the card lab, and `en.json`.
- 🚫 Theme picker UI — `defaultCardTheme` stays the single switch.

## Definition of done

- All 8 steps landed; `bun run check` green; new pure modules tested per
  the plan; stale assertions updated, none deleted without replacement.
- Card lab shows: zellige back at 3 sizes, full rank strip, felt preview,
  classic/midnight still intact via the cycle button.
- Checkpoint 1 approved on a physical iPhone before Package 3 starts.

## Revision 1 — after the first device checkpoint

Device screenshots surfaced three problems with the first build:

1. **Inconsistent rendering across sizes.** Every element was sized
   independently as `round(width × fraction)` with `max()` clamps, so a
   48 px card was a _different drawing_ than a 220 px card, not a scaled
   copy.
2. **Classic anatomy is illegible at in-game sizes.** All in-game cards
   are 44–120 px wide (`endRoundCard`…`drawnFlowCard`); a 10-pip grid and
   an 18 %-width corner index don't survive that.
3. **Court centers looked broken.** The giant Outfit letter collided with
   the center suit pip ("angry face" Q).

### Decisions

- **Design-space rendering.** The card is authored once in fixed design
  units (`DESIGN_WIDTH = 240`, height derived from the actual aspect) and
  the whole Skia scene renders inside a single `Group` scale transform
  (`scale = width / 240`). Every size is now mathematically the same
  drawing. On-screen corner radius still comes from `radiusFor(width)`
  (divided by scale) so slot rings in `OwnHandGrid` / `OpponentSeat` keep
  matching exactly.
- **Two layout modes** picked by `layoutModeFor(width)` in `cardSizes.ts`
  with threshold `COMPACT_MAX_WIDTH = 128`:
  - `standard` (hero, card lab ≥128 px): classic anatomy — both corner
    indices, pip grid, court frame.
  - `compact` (every in-game surface): **jumbo index** — top-left rank at
    ~35 % of card width with the suit beneath, one large center suit, no
    pip grid, no court frame, no bottom-right index. All flight endpoints
    are < 128 px so the mode never pops mid-animation.
- **Court medallion** (user-selected option: identical for J/Q/K, no
  per-rank variation, no K♥ flourish): the giant letter is gone; the
  frame + corner stars stay; the center is a gold **khatim** — the
  authentic two-overlapping-squares 8-point star (`starPathSvg(8, 0.765)`)
  — with the suit drawn inside. Rank identity lives in the corner
  indices only (and they're jumbo at game sizes).
- **Corner alignment fix**: rank text and corner suit center on a shared
  fixed-width column instead of a font-size guess, so "10" no longer
  drifts off-axis.
- **Card lab** gains the acceptance surfaces that were missing: the rank
  strip renders at a `standard`-mode width (140 px, horizontal scroll)
  and the felt tile now shows the **real in-game token sizes**
  (`drawnFlowCard` 120 → `endRoundCard` 44) so legibility is judged at
  actual game scale.

`sizesFor` / `sizesSnapshot` are replaced by exported design constants +
`layoutModeFor`; tests assert the mode threshold and design-space
invariants instead of the old per-width snapshot table.

## Revision 2 — one simple design everywhere

After reviewing Revision 1 on device, the user chose the compact
("variants") look as the **only** card face design:

- **Layout modes removed.** `layoutModeFor` / `COMPACT_MAX_WIDTH` and the
  `standard` anatomy (pip grids, dual corner indices, court frame +
  khatim medallion + gold corner stars) are deleted. Every card at every
  size renders the same face: jumbo top-left index (rank with suit
  beneath) plus one large center suit. Courts are identified purely by
  the J/Q/K corner index.
- **Deleted modules**: `pipLayout.ts`, `courtFrame.ts` and their tests.
  `suitPaths.ts`, `zellige.ts` (backs) and `cardHelpers.ts` remain.
- **Clubs redrawn as a clover**: three overlapping circles (top,
  lower-left, lower-right) with a flared stem, replacing the lumpy
  bezier silhouette.
- Design-space rendering (single `Group` scale, `DESIGN_WIDTH = 240`)
  from Revision 1 is unchanged — it is what guarantees consistency
  across sizes.
