# Phase 7 (part 2a) — Visual identity: teal zellige UI

> Status: written 2026-06-11 on branch `phase-7-visual-identity`. This carves
> the "zellige theme" item out of Phase 7 part 2 (launch prep) into its own
> design pass. Sounds, app icon, splash, EAS/TestFlight stay in a later
> branch. **Animations (deal choreography, arc flights, mid-flight 3D flip)
> are explicitly out of scope** — the user deferred them; they get their own
> phase after this one.

## One-sentence goal

Replace every placeholder visual — system fonts, white-rect cards, the
two-rect card back, the flat beige table — with a committed teal-zellige
identity (procedural Skia card art, real typography, felt table, seat
plates) without touching the engine, the store contracts, or the flight
planner.

## Chosen direction (user-approved)

**Deep teal/emerald felt + warm sand chrome + terracotta & gold accents** —
the full Tunisian zellige identity. Starting palette (all values land in
tokens and get tuned on device; nothing hardcodes them):

| Role               | Value                              |
| ------------------ | ---------------------------------- |
| Table felt         | `#0E4F47` center → `#093832` edge  |
| App chrome surface | `#F6F0E4` (sand), `#FFFDF7` (card) |
| Text               | `#221C14` ink / `#6E6354` muted    |
| Action accent      | `#C2552F` terracotta               |
| Highlight / winner | `#C9A227` gold                     |
| Card back          | teal field, gold + sand star motif |

---

## Why this work exists

Audit of the current UI (all confirmed in code):

| #   | Gap                                                                                                                                                      | Where                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| V1  | No font is ever loaded — `fontFamily` appears zero times in the app; everything renders in the system font.                                              | whole app                               |
| V2  | Card faces are a white rect + border with RN-Text rank/glyph overlays; the "center pip" is one oversized glyph. No pip layouts, no court treatment.      | `PlayingCard.tsx`                       |
| V3  | Card back is two nested rects + one rotated diamond — the code itself calls it a placeholder to be replaced by zellige.                                  | `PlayingCard.tsx`                       |
| V4  | `CardTheme` declares `SuitGlyphStyle: 'arabesque'` and `BackPatternStyle: 'zellige' \| 'leather'` but no renderer implements them.                       | `cardTheme.ts`                          |
| V5  | The table is a flat `#F1ECDD` rectangle; deck is a single card with a text label; discard top sits perfectly axis-aligned; opponents are floating text.  | game screen, `DeckArea`, `OpponentSeat` |
| V6  | Home/lobby screens are wireframes (centered title + flat buttons). The home card-fan refresh was explicitly deferred from Phase 7 part 1 (deviation #3). | `(home)/index.tsx`, `(lobby)/*`         |

## Scope split (one branch, four packages, ordered, two device checkpoints)

### Package 1 — Foundations: tokens + fonts

> Detailed implementation plan (written 2026-06-12, before any Package 1
> code). Two findings from the audit shape this package:
>
> 1. `@expo-google-fonts/*` static fonts register **one `fontFamily` name
>    per weight** (`Outfit_400Regular`, `Outfit_600SemiBold`,
>    `Outfit_700Bold`). RN does not synthesize `fontWeight` for custom
>    families reliably, so every `fontWeight: tokens.font.weight.*` style
>    (38 styles across 24 files) must migrate to a family-based text
>    style. We do this mechanically via one new helper, and we **delete
>    `tokens.font.weight`** so the typechecker finds every callsite.
> 2. Repainting `game.surface.table` to deep teal instantly breaks every
>    piece of dark text that sits directly on the felt (`OpponentSeat`
>    names, `DeckArea` labels). Package 1 therefore includes new
>    **on-felt text tokens** and the two component fixes that use them —
>    otherwise the app is unreadable between Packages 1 and 3.

#### Step 1 — Dependencies

```bash
bunx --cwd=apps/mobile expo install expo-font
bun --cwd=apps/mobile add @expo-google-fonts/outfit
```

`expo install` pins the SDK-54-compatible `expo-font`. Expo Go workflow ⇒
runtime loading via `useFonts` (no config-plugin embedding available).

#### Step 2 — `tokens.ts` repaint + new scales

Every change in one file. Exact starting values (tuned on device at
checkpoint 2; the table is the contract, not the hex):

**`tokens.color` (repaint):**

| Token                    | Old → New                                | Note                         |
| ------------------------ | ---------------------------------------- | ---------------------------- |
| `surface.app`            | `#FAFAF7` → `#F6F0E4`                    | warm sand                    |
| `surface.card`           | `#FFFFFF` → `#FFFDF7`                    | warm white                   |
| `surface.overlay`        | `rgba(0,0,0,0.45)` → `rgba(9,40,36,0.5)` | teal-tinted scrim            |
| `text.primary`           | `#1A1A1A` → `#221C14`                    | warm ink                     |
| `text.secondary`         | `#666666` → `#6E6354`                    | warm muted                   |
| `text.inverse`           | `#FFFFFF` → `#FFFDF7`                    |                              |
| `accent.primary`         | `#2D6A4F` → `#C2552F`                    | terracotta (actions/buttons) |
| `accent.primaryPressed`  | `#1B4332` → `#9C3F20`                    |                              |
| `accent.highlight` (new) | `#C9A227`                                | gold (cues/winner/spotlight) |
| `border.subtle`          | `#E5E5E0` → `#E7DEC9`                    |                              |
| `border.strong`          | `#9C9C95` → `#A89A7E`                    |                              |

**`tokens.game.surface` (repaint).** Split rule: **felt-side cues go
gold** (they must read on teal), **chrome-side actions go terracotta**:

| Token                   | New value                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `table`                 | `#0E4F47` (flat for now; gradient is Package 3)                                          |
| `actionBar`             | `#FFFDF7`                                                                                |
| `actionBarBorder`       | `#E7DEC9`                                                                                |
| `slotEmpty`             | `rgba(255,253,247,0.08)` (was dark-on-light; now light-on-felt)                          |
| `slotGhostBorder`       | `rgba(201,162,39,0.55)`                                                                  |
| `slotSelected`          | `rgba(201,162,39,0.22)`                                                                  |
| `currentTurnTint`       | `rgba(201,162,39,0.10)`                                                                  |
| `currentTurnTintStrong` | `rgba(201,162,39,0.26)`                                                                  |
| `winnerRowTint`         | `rgba(201,162,39,0.12)`                                                                  |
| `deckBadgeBg`           | `rgba(9,40,36,0.72)`                                                                     |
| `toastBg`               | `rgba(20,16,10,0.9)`                                                                     |
| `announcementBg`        | `rgba(255,253,247,0.92)`                                                                 |
| `feltOutline` (new)     | `rgba(255,253,247,0.25)` — dashed empty-discard border, replaces `border.subtle` on felt |

**`tokens.game.text` (new section):**

| Token         | Value                    | Used by             |
| ------------- | ------------------------ | ------------------- |
| `onFelt`      | `#F2E9D5`                | opponent names      |
| `onFeltMuted` | `rgba(242,233,213,0.65)` | deck/discard labels |

**`tokens.game.choreography`:** `spotlightBorderColor` → `#C9A227`;
`spotlightBorderTransparent` → `rgba(201,162,39,0)` (must stay the
transparent twin of the spotlight color — it is an `interpolateColor`
endpoint in `OwnHandGrid` / `OpponentSeat`). `tokens.game.accent.pablo*`
shifts to the terracotta family (`pabloOnTurn` `#A93226`, `pabloOffTurn`
`#D98E79`) — flag for device tuning.

**`tokens.font`:**

- New `family: { regular: 'Outfit_400Regular', semibold: 'Outfit_600SemiBold', bold: 'Outfit_700Bold' }`.
- New `letterSpacing: { tight: -0.3, normal: 0, wide: 0.6 }`.
- **Delete `weight`** — the typechecker then enumerates every style that
  needs the Step 4 migration. No style may keep a `fontWeight` with a
  custom family.

**`tokens.shadow`:** add `raised` (y2 / radius 4 / opacity 0.10 /
elevation 2 — buttons, badges) and `floating` (y8 / radius 16 / opacity
0.18 / elevation 8 — sheets, overlays). `card` stays as-is (used by
`FlyingCardLayer` + `DrawFlow`).

#### Step 3 — Typography helper + font loading

**New `src/design/typography.ts`** — the single way components produce
text styles:

```ts
import { tokens } from './tokens';

type SizeKey = keyof typeof tokens.font.size;
type WeightKey = keyof typeof tokens.font.family;

export function textStyle(size: SizeKey, weight: WeightKey = 'regular') {
  return {
    fontFamily: tokens.font.family[weight],
    fontSize: tokens.font.size[size],
    // Large display sizes tighten; body sizes stay neutral.
    letterSpacing:
      size === 'xl' || size === 'lg'
        ? tokens.font.letterSpacing.tight
        : tokens.font.letterSpacing.normal,
  } as const;
}
```

Pure data-in/data-out (no React) ⇒ directly unit-testable. `wide`
spacing is opt-in at the callsite (uppercase labels, room code — later
packages).

**`app/_layout.tsx`:** `useFonts({ Outfit_400Regular, Outfit_600SemiBold,
Outfit_700Bold })`. Render `null` until `loaded || error`; on `error`
proceed — system-font fallback beats a dead app. No splash-screen dep
added this branch.

#### Step 4 — Mechanical text-style migration

Rule, applied everywhere the deleted `tokens.font.weight` breaks the
typecheck plus every remaining `fontSize:` style:

```ts
// Before
title: { fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.semibold, color: … }
// After
title: { ...textStyle('xl', 'semibold'), color: … }
```

Files (from audit, 24 + the no-weight stragglers): `app/(home)/index.tsx`,
`new-game.tsx`, `app/(lobby)/index.tsx`, `create.tsx`, `join.tsx`,
`room/[roomId].tsx`, `app/(game)/[gameId]/index.tsx`, `app/dev/card-lab.tsx`,
`ActionBar`, `AnnouncementBanner`, `DeckArea`, `EndOfRound`, `NetworkBanner`,
`PabloBanner`, `PeekOverlay`, `ToastHost`, `TurnLabel`, `OpponentSeat`,
`MemberRow`, `RoomCodeBadge`, `actionFlows/DrawFlow`, `MatchHandFlow`,
`MatchDiscardFlow`, `PowerFlow`.

Explicit exception: **`PlayingCard.tsx`** keeps its `fontWeight: '800'`
system-font labels this package — card text is rewritten wholesale in
Package 2; migrating it twice is waste.

#### Step 5 — Felt-readability fixes (must land with the repaint)

| Fix                                                                                                                                           | File               |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Seat name color: `text.primary` → `game.text.onFelt`; actor-focus `interpolateColor` endpoints become `[game.text.onFelt, accent.highlight]`. | `OpponentSeat.tsx` |
| Deck/discard labels: `text.secondary` → `game.text.onFeltMuted`; empty-discard dashed border: `border.subtle` → `game.surface.feltOutline`.   | `DeckArea.tsx`     |
| Turn pill + leave button sit on the white top bar (not felt) — verify, no change expected.                                                    | game screen        |

#### Package 1 test plan

- `typography.test.ts` (new): family per weight key; tight spacing iff
  `lg`/`xl`; sizes monotonic; default weight regular.
- `bun run check` after Steps 2–5 (one commit-sized gate; Step 2 alone
  cannot pass typecheck because deleting `font.weight` breaks callsites
  until Step 4 completes — Steps 2–4 are one atomic change).
- Manual (Expo Go): home → lobby → bot game; confirm Outfit renders
  everywhere (the numerals are unmistakable), table is teal, opponent
  names + deck labels readable, gold turn pulse reads on felt, no
  `fontWeight`-with-custom-family styles remain (`rg 'fontWeight'` shows
  only `PlayingCard.tsx`).

#### Package 1 risks

| Risk                                                                                | Mitigation                                                                                  |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Runtime font loading adds a blank first frame in Expo Go                            | Accepted for dev; production builds embed fonts at build time (EAS branch decides then).    |
| Teal felt under the _current_ flat layout (no gradient until Package 3) looks stark | Expected intermediate state; checkpoint judges cards-on-felt, not the flat table.           |
| Terracotta action color fails contrast on sand chrome                               | WCAG-check `#C2552F` on `#FFFDF7` for button text sizes; darken toward `#A8431F` if needed. |
| Gold rgba tints behave differently over teal vs the old cream                       | All four tint stops live in tokens; tune at checkpoint 2 without touching components.       |

### Package 2 — Card art (the centerpiece)

> **Detailed implementation plan:**
> `docs/plans/phase-7-visual-identity-package-2.md` (module signatures, pip
> layout table, zellige theme palette, test plan, risks). The table below
> is the original package-level summary.

All inside the cards module; everything validated in the existing card lab
before any game surface uses it.

| Item                                                                                                                                                                                                                                                                                                               | Files                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| **Suit glyphs as Skia paths.** `suitPath(suit): string` returns an SVG path string in a unit box; components build `SkPath`s once via `useMemo` (`Skia.Path.MakeFromSVGString`). Pure module, no React/Skia imports — testable as data.                                                                            | `src/components/cards/internal/suitPaths.ts` (new)                  |
| **Pip layouts.** `pipLayout(rank)` → array of `{ x, y, rotated }` unit positions for A and 2–10 (classic playing-card arrangement; bottom-half pips rotated 180°). Court ranks return `[]`.                                                                                                                        | `src/components/cards/internal/pipLayout.ts` (new)                  |
| **Court treatment.** J/Q/K get a procedural ornamental frame (geometric border band + corner stars reusing the zellige motif) around a large rank letter + suit path — no illustration pipeline. `courtFrame(rank)` returns the frame config.                                                                      | `src/components/cards/internal/courtFrame.ts` (new)                 |
| **Procedural zellige back.** `zelligeTiles(w, h, tileSize)` → deterministic 8-pointed-star / cross tessellation as transforms + palette-slot tags; rendered as Skia paths colored entirely from `theme.back.palette`. Implements the dormant `BackPatternStyle: 'zellige'`; `'plain'` keeps the current rendering. | `src/components/cards/internal/zellige.ts` (new), `PlayingCard.tsx` |
| **PlayingCard face rewrite.** Center glyph → pip grid (Skia paths); corner rank/suit stay RN Text but adopt `tokens.font.family` + suit path mini-glyph; court frame branch. Sizing additions (`pip`, `courtFrame` insets) extend `sizesFor`.                                                                      | `PlayingCard.tsx`, `internal/cardSizes.ts`                          |
| **`zellige` theme entry** becomes the app default: registry order `[zellige, classicLight, midnight]`; the old `classic-light` object is renamed `classicLightCardTheme` and `defaultCardTheme` now points at zellige (every game surface imports `defaultCardTheme`, so this one alias flips the whole app).      | `src/design/cardTheme.ts`                                           |

**→ Checkpoint 1: card lab on a real iPhone. User approves face + back art
before Package 3 begins.**

### Package 3 — Table & game chrome

> **Detailed implementation plan:**
> `docs/plans/phase-7-visual-identity-package-3.md` (token additions, the
> `nameLineHeight → seatHeaderHeight` rename, `pileDecor` signatures,
> seat-plate spec, chrome elevation table, test plan, risks). The table
> below is the original package-level summary.

| Item                                                                                                                                                                                                                                     | Files                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **`TableBackground`** (new): full-bleed Skia canvas — radial felt gradient, edge vignette, zellige motif at whisper opacity (reuses `zellige.ts`). Mounted under `TableLayout` in the game screen's `tableArea`.                         | `src/components/game/TableBackground.tsx` (new), game screen                                                                              |
| **Deck stack depth**: 1–3 offset back-edge layers behind the top card, stepped by `deckCount` thresholds; deck count restyled into a pill badge (existing `deckBadgeBg` token) instead of a bare label.                                  | `DeckArea.tsx`                                                                                                                            |
| **Discard jitter**: top discard card rotates by a deterministic angle (±4°) hashed from its `cardId` — no `Math.random`, so re-renders never wobble. Helper `discardJitter(cardId): number` is pure + tested.                            | `DeckArea.tsx`, `src/components/game/internal/discardJitter.ts` (new)                                                                     |
| **Seat plates**: opponents get a rounded sand plate — avatar circle with initial (same pattern as lobby `MemberRow`), name, status line — replacing floating text. Active-seat pulse ring and `LinearTransition` reflow preserved as-is. | `OpponentSeat.tsx`                                                                                                                        |
| **Chrome restyle on new tokens** (token + typography swaps, no structural changes): turn pill, action bar, announcement banner, toasts, Pablo banner, network banner, draw/match/power sheets, peek overlay, end-of-round sheet.         | `TurnLabel`, `ActionBar`, `AnnouncementBanner`, `ToastHost`, `PabloBanner`, `NetworkBanner`, `actionFlows/*`, `PeekOverlay`, `EndOfRound` |

### Package 4 — Screens

| Item                                                                                                                                                                                           | Files                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **`Button` primitive** (new): primary / secondary / ghost variants, spring scale-on-press (worklet), `Haptics` tap, all colors from tokens. Replaces the per-screen `TouchableOpacity` styles. | `src/components/ui/Button.tsx` (new), all screens                    |
| **Home hero**: wordmark in display weight + fan of three mini `PlayingCard`s (zellige backs — the Phase 7 part 1 deferred item), buttons via the new primitive.                                | `app/(home)/index.tsx`                                               |
| **New-game + lobby screens**: shared header treatment, `RoomCodeBadge` as the hero element of the room screen, member rows on new tokens.                                                      | `(home)/new-game.tsx`, `(lobby)/*.tsx`, `RoomCodeBadge`, `MemberRow` |

**✅ Done (2026-06-23).** Detailed plan + decisions in
`docs/plans/phase-7-visual-identity-package-4.md`. Shipped the `Button`
primitive (primary/secondary/ghost, spring press, `hapticTap`), home hero
(`display` wordmark + zellige card-back fan), and chrome-screen button swaps;
`RoomCodeBadge` promoted to a sand-card hero. Added the `font.size.display`
(40) token. `bun run check` green.

**→ Checkpoint 2: full app walkthrough on device (home → lobby → bot game →
end of round) before push.**

## Out of scope

- 🚫 **All animation work** — deal choreography, arc flight paths, in-flight rotation, real mid-flight 3D flip, landing settles. Next phase; this branch must not touch `flightPlanner.ts` / `flightChoreography.ts` / `FlyingCardLayer` motion logic (FlyingCardLayer only inherits the new theme via `defaultCardTheme`).
- 🚫 Sounds, app icon, splash screen, EAS/TestFlight (remaining Phase 7 part 2 items).
- 🚫 Engine changes of any kind (no `build:engine-bundle` needed).
- 🚫 New i18n languages / RTL work (logical properties already in use where it matters).
- 🚫 `'leather'` back pattern and `'arabesque'` glyph style — the contracts stay declared; zellige is the only new renderer this pass.

## Test plan

- `pipLayout.test.ts` (new): pip count per rank (A→1 … 10→10, courts→0); all positions inside the unit box; vertical mirror symmetry; `rotated` only on bottom-half pips.
- `suitPaths.test.ts` (new): non-empty, parseable, distinct path strings for all four suits; stable across calls.
- `zellige.test.ts` (new): deterministic output for fixed inputs; tiles cover the requested area within tolerance; every tile carries a valid palette slot.
- `discardJitter.test.ts` (new): deterministic per `cardId`; bounded ±4°; distinct ids spread across the range.
- `cardTheme.test.ts` (extend): zellige theme registered; `defaultCardTheme.id === 'zellige'`; `nextTheme` cycles all three; every palette slot is a non-empty color string.
- `cardSizes` snapshot test (extend): new pip/court size fields proportional and monotonic in width.
- Existing suites stay green; `bun run check` is the gate after every package.
- Manual: checkpoints 1 and 2 on a physical iPhone (Expo Go); card lab variants grid covers all 3 themes × face-up/down.

## Design decisions (trade-offs)

| Decision                                                                                                            | Why / trade-off                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Corner rank/suit labels stay **RN Text** (with the loaded font), not Skia Text                                      | Skia text requires its own font-asset plumbing (`useFont` per size) for marginal gain; the overlay positioning already works. Revisit only if alignment artifacts appear on device. |
| Fonts via `@expo-google-fonts/outfit` rather than bundled TTF assets                                                | One-line install, hashes pinned by the package, works with `useFonts`; no asset-pipeline config.                                                                                    |
| Court cards = procedural ornament, not illustrations                                                                | Illustrated courts are an art-pipeline commitment (4 suits × 3 ranks, theming, licensing). The geometric frame is on-brand, recolorable per theme, and ~a day instead of weeks.     |
| Zellige pattern generated procedurally in Skia                                                                      | `design.mdc` hard rule: no pattern PNGs — patterns must recolor via theme. A tessellation is also resolution-independent for the render-at-max-size flight trick.                   |
| `defaultCardTheme` re-aliased to zellige instead of introducing an `activeCardTheme` setting                        | Every surface already imports `defaultCardTheme`; re-aliasing flips the app in one line. A user-facing theme picker is post-launch scope.                                           |
| Discard jitter hashed from `cardId`, not random                                                                     | Mobile isn't bound by engine purity lint, but deterministic angles survive re-renders (no wobble) and stay reproducible in tests.                                                   |
| Felt background only in the game screen; home/lobby keep flat sand surfaces                                         | Felt = "you are at the table" signifier; using it everywhere dilutes it and costs a Skia canvas per screen.                                                                         |
| `design.mdc` typography rule ("single family, two weights") amended to allow a third weight (bold) + a display slot | The wordmark and winner moments need more range than 400/600. Rule update ships in this branch and is recorded in PLAN.md "Decisions Made" per the style-gate contract.             |
| Deck depth is fake (offset edge layers), not N stacked `PlayingCard`s                                               | Visual parity at a fraction of the Skia surface count; deck never needs per-card identity.                                                                                          |

## Open questions

1. **Avatar art** — initials in colored circles (current lobby pattern) or simple icon set? Plan assumes initials; icons are post-launch.
2. **Discard under-cards** — with only `discardTopCardId` in the view, a real "pile" needs a small client-side history of previous tops. Stretch item inside Package 3; skipped if the rotated top card already reads as a pile on device.
3. **Card-lab felt tile** — add a table-colored preview row to the lab so card/felt contrast is judged in one place? Cheap; planned yes, cut if it drags.

## Definition of Done

- All four packages landed; both device checkpoints explicitly approved by the user.
- No file under `packages/engine`, `supabase/`, or `src/store/flight*` has a motion-logic diff.
- `bun run check` green; new pure helpers have tests per the test plan.
- `docs/PLAN.md` updated (Done + Decisions Made, including the `design.mdc` typography amendment); `design.mdc` updated.
- Branch pushed; **no merge** until the user says so.
