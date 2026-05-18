# Phase 3 — Card Lab implementation plan

> Status: **draft, awaiting approval** for branch `phase-3-card-lab`.

## One-sentence goal

Prove the visual stack (Skia + Reanimated 4 + Gesture Handler) renders a real `<PlayingCard>` smoothly on an iPhone, with tap-to-flip, pan-to-snap, and one-line theme switching, before we build the full game UI on top of it.

---

## Branch + workflow

- Branch: `phase-3-card-lab` off `main`.
- Plan ships in the **same** PR as implementation (per AGENTS.md hard rule #9).
- Last step before PR: update `docs/PLAN.md` (move Phase 3 → Done, append decisions).
- PR title: `phase 3: card lab` (matches the user's instruction; supersedes `phase 3: card lab prototype` in `docs/PLAN.md` line 79 — minor wording difference, will fix when PLAN.md is updated).
- Default = **do not merge**. Push branch, open PR, stop.

---

## Requirement → file mapping

Every item under PLAN.md "Phase 3 — Must include" mapped to a concrete file.

| Requirement (PLAN.md)                                        | Lands in                                                                                           | Notes                                                                                |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Dev-only screen at `apps/mobile/app/dev/card-lab.tsx`        | `apps/mobile/app/dev/card-lab.tsx`                                                                 | Requires Expo Router (see "Routing prerequisite" below).                             |
| `<PlayingCard>` rendered via Skia, respecting `CardTheme`    | `apps/mobile/src/components/cards/PlayingCard.tsx`                                                 | One component renders every card; props: `card`, `faceUp`, `theme`, optional `size`. |
| Tap to flip (Reanimated `rotateY` worklet with perspective)  | `apps/mobile/src/components/cards/PlayingCard.tsx` (`useAnimatedStyle` + `useSharedValue`)         | Internal to the card; exposed via `onFlip` callback for parent observation.          |
| Pan-to-drag with snap-back on release                        | `apps/mobile/src/components/cards/PlayingCard.tsx` (Gesture Handler `Pan` + `withSpring`)          | Combined with tap via `Gesture.Race`.                                                |
| Theme switcher button toggling between 2 themes              | `apps/mobile/app/dev/card-lab.tsx` (`useState<CardTheme>` + cycle through `cardThemes`)            | Card preserves animation state across theme changes (no remount).                    |
| `defaultCardTheme` + one new variant                         | `apps/mobile/src/design/cardTheme.ts` — add `midnightCardTheme`, append to `cardThemes`            | "Midnight" = dark surface, gold accents. Max visual delta vs `classic-light`.        |
| Verified on iOS simulator AND real device                    | Manual; checklist in this plan's "Manual verification" section                                     | Captured in PR description.                                                          |
| (Implied by hard rule #7) No user-visible literals           | `apps/mobile/src/i18n/{index.ts, locales/en.json}` — minimal `t()` wrapper, no `expo-localization` | Just the keys the lab needs. Full i18n infra is Phase 4 territory.                   |
| (Implied by hard rule #8) No hardcoded colors/spacings/radii | `apps/mobile/src/design/tokens.ts` — app-level semantic tokens                                     | All non-card-surface chrome (buttons, backgrounds, text) reads tokens.               |
| (Implied by hard rule #6) No game logic in components        | n/a — `<PlayingCard>` takes data props only; no engine calls from components                       | Lab screen uses a static fixture (e.g. `7♥`) — no engine state involved.             |
| (Implied by Phase 3 "gated behind `__DEV__`")                | `apps/mobile/app/index.tsx` shows a "Card Lab" link **only when `__DEV__`** is true                | Production builds get a placeholder home; dev builds see the entry point.            |

### Routing prerequisite (proposed decision — see Open Questions)

The mobile app currently has **no `app/` directory** — it boots from `App.tsx` via `registerRootComponent`. Placing a file at `apps/mobile/app/dev/card-lab.tsx` requires Expo Router. Phase 4's "Must include" already lists "Expo Router with route groups", so we'd be doing this work eventually anyway. The proposal:

1. Add `expo-router` (and its peer deps: `expo-linking`, `expo-constants`, `react-native-safe-area-context`, `react-native-screens`) to `apps/mobile/package.json`.
2. Switch the entry from `App.tsx` to `expo-router/entry` via `package.json` `"main"` and `app.json` `"scheme": "pablo"`.
3. Create:
   - `apps/mobile/app/_layout.tsx` — root `Stack` wrapped in `GestureHandlerRootView`.
   - `apps/mobile/app/index.tsx` — minimal home; conditional `Link` to `/dev/card-lab` when `__DEV__`.
   - `apps/mobile/app/dev/_layout.tsx` — nested `Stack`, hidden header on the lab screen.
   - `apps/mobile/app/dev/card-lab.tsx` — the lab.
4. Delete `apps/mobile/App.tsx`.
5. Add `apps/mobile/babel.config.js` exporting `babel-preset-expo` (Reanimated 4 / Worklets plugin is included automatically by the preset in SDK 53+, so no explicit `react-native-worklets/plugin` line needed — Expo will warn if it must be added separately).

Phase 4 will add the `(home)` / `(game)` route groups on top; Phase 3 leaves room for them without locking in their shape.

### Full file tree this PR will touch

```
apps/mobile/
├── app.json                              (modify: add "scheme")
├── package.json                          (modify: + expo-router, peer deps, "main")
├── babel.config.js                       (new)
├── App.tsx                               (delete)
├── index.ts                              (delete — expo-router/entry replaces it)
├── app/                                  (new tree)
│   ├── _layout.tsx                       (new)
│   ├── index.tsx                         (new)
│   └── dev/
│       ├── _layout.tsx                   (new)
│       └── card-lab.tsx                  (new)
└── src/
    ├── components/
    │   └── cards/
    │       ├── PlayingCard.tsx           (new)
    │       └── PlayingCard.test.tsx      (new — pure helpers only)
    ├── design/
    │   ├── tokens.ts                     (new)
    │   ├── cardTheme.ts                  (modify: add midnightCardTheme + helpers)
    │   └── cardTheme.test.ts             (new — registry shape)
    └── i18n/
        ├── index.ts                      (new — tiny t() wrapper)
        ├── locales/
        │   └── en.json                   (new)
        └── i18n.test.ts                  (new — t() resolves keys + interpolates)
docs/
├── PLAN.md                               (modify: Phase 3 → Done + decisions)
└── plans/
    └── phase-3-card-lab.md               (this file)
```

---

## Design tokens — shape & location

**Location: `apps/mobile/src/design/tokens.ts`.** Not `packages/ui`.

**Why not `packages/ui`:**

1. We have exactly one consumer (the mobile app). Splitting into a package adds a workspace edge with zero current benefit.
2. AGENTS.md "Stack — non-negotiable" explicitly says "Do NOT introduce ... a UI library."
3. The design.mdc rule (`apps/mobile/**`) already designates `apps/mobile/src/design/tokens.ts` as the home.
4. If/when the web app exists, we can hoist to a shared package then — the import-path migration is mechanical.

**Why not `apps/mobile/src/theme`:** the design.mdc rule places the file under `design/`, and `cardTheme.ts` already lives there. Keeping all visual tokens in one folder beats inventing a parallel `theme/` directory.

### Shape

Semantic, not raw. Every value used through a name like `tokens.color.surface.app`, never a hex or magic number.

```ts
// apps/mobile/src/design/tokens.ts
export const tokens = {
  color: {
    surface: {
      app: '#FAFAF7', // app background (cream)
      card: '#FFFFFF', // raised surface / sheet
      overlay: 'rgba(0,0,0,0.45)',
    },
    text: {
      primary: '#1A1A1A',
      secondary: '#666666',
      inverse: '#FFFFFF',
    },
    accent: {
      primary: '#2D6A4F', // muted green, matches defaultCardTheme back
      primaryPressed: '#1B4332',
    },
    border: {
      subtle: '#E5E5E0',
      strong: '#9C9C95',
    },
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 6, md: 10, lg: 16, xl: 20, pill: 999 },
  font: {
    size: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28 },
    weight: { regular: '400' as const, semibold: '600' as const },
  },
  shadow: {
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 4, // Android
    },
  },
  duration: { fast: 150, normal: 250, slow: 500 }, // ms
} as const;

export type Tokens = typeof tokens;
```

**Card surfaces remain owned by `CardTheme`**, not `tokens`. Tokens handle app chrome (backgrounds, buttons, text); `CardTheme` handles per-card looks. This boundary lets the card visual system evolve independently of the app shell — the eventual zellige variant changes `CardTheme`, never `tokens`.

### Token contract

- `as const` everywhere → TS infers literal types → mis-typing a key is a compile error.
- No nested function/expression values (keeps tokens tree-shakeable + serializable for any future design-token export).
- Adding a token: append. Renaming: requires updating every callsite — TS catches it.

---

## Reanimated approach

### Shared values per card

```ts
const flipProgress = useSharedValue(0); // 0 = back, 1 = face
const dragX = useSharedValue(0);
const dragY = useSharedValue(0);
```

Only three shared values per card. No JS-thread per-frame work.

### Flip — `withTiming`, not `withSpring`

**Choice: `withTiming(target, { duration: 450, easing: Easing.inOut(Easing.cubic) })`.**

Trade-off explored:

| Option                | Pros                                                                    | Cons                                                                                      |
| --------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `withTiming` (chosen) | Predictable arc; lands at 0 or 1 cleanly; no overshoot at 90° edge case | Less playful                                                                              |
| `withSpring`          | Lively                                                                  | Overshoot at the half-turn momentarily reveals both faces; tuning to avoid that is fiddly |
| `withDecay`           | n/a — not a kinematic motion                                            | Wrong tool                                                                                |

For a card flip specifically, the value crossing the half-turn (90°) is when we swap which face is visible. Springs that overshoot can drag the rotation back through 90° and re-trigger that crossover with the wrong face dominant. Timing avoids that entirely.

### Flip geometry

- Card root view sets a base transform with `perspective: 1000` (so 3D rotations look spatial, not flat).
- **Two stacked absolute children**, one per face:
  - Front face: `rotateY: interpolate(flipProgress.value, [0, 1], [180, 360]) + "deg"`
  - Back face: `rotateY: interpolate(flipProgress.value, [0, 1], [0,   180]) + "deg"`
  - Both set `backfaceVisibility: 'hidden'` so each disappears when rotated past its visible half.
- Front content lives inside a Skia `<Canvas>` sized to the card; back content also Skia. `backfaceVisibility: 'hidden'` is applied to the **wrapper `Animated.View`**, not the Canvas, because Skia canvases ignore the prop.

### Pan + snap

- `Gesture.Pan()`:
  - `.onUpdate(e) { dragX.value = e.translationX; dragY.value = e.translationY; }` (worklet).
  - `.onEnd() { dragX.value = withSpring(0, snapConfig); dragY.value = withSpring(0, snapConfig); }`
- Snap config: `{ damping: 18, stiffness: 220, mass: 1 }` — critically-damped feel, returns home in ~300ms without overshoot.
- Combined with tap via `Gesture.Race(panGesture, tapGesture)` so quick taps don't accidentally start a pan and pans don't fire taps.
- `Gesture.Tap().maxDuration(250).onEnd(() => { flipProgress.value = withTiming(flipProgress.value < 0.5 ? 1 : 0, ...); })`.
- For Phase 3 we lift `<PlayingCard>` to its own layer via `zIndex` while dragging (`useAnimatedReaction` watching whether `dragX` or `dragY` ≠ 0 — but for one card we can just keep it elevated always; full overlay re-parenting is Phase 5 work per cards.mdc).

### Single animated style

```ts
const animatedRootStyle = useAnimatedStyle(() => ({
  transform: [{ perspective: 1000 }, { translateX: dragX.value }, { translateY: dragY.value }],
}));
const animatedFrontStyle = useAnimatedStyle(() => ({
  transform: [
    { perspective: 1000 },
    { rotateY: `${interpolate(flipProgress.value, [0, 1], [180, 360])}deg` },
  ],
}));
const animatedBackStyle = useAnimatedStyle(() => ({
  transform: [
    { perspective: 1000 },
    { rotateY: `${interpolate(flipProgress.value, [0, 1], [0, 180])}deg` },
  ],
}));
```

All three are pure worklet derivations; no JS callbacks per frame.

### Theme switching without remount

- `theme` is a regular prop. When the parent's `useState` flips, React re-renders the card.
- Skia content is memoized with `useMemo(() => buildFacePaint(theme), [theme.id])`, so theme-derived primitives are recomputed only when `theme.id` changes.
- Shared values (`flipProgress`, `dragX`, `dragY`) are tied to the component instance — they persist as long as `<PlayingCard>` does. Same `key` → no remount → animation state preserved.
- Acceptance: pressing "Theme: Midnight" mid-flip continues the flip with the new colors painting on the next frame.

### Performance budget per cards.mdc

- One card on screen for Phase 3 → trivially under budget.
- All Skia paths/paints built inside `useMemo(..., [theme.id, size])` — no per-render allocations.
- Front + back are separate `<Canvas>` instances, each only re-renders when its theme-derived inputs change.
- `<PlayingCard>` itself wrapped in `React.memo` keyed on `(card.id, faceUp, theme.id)`.

---

## `<PlayingCard>` component contract

```tsx
// apps/mobile/src/components/cards/PlayingCard.tsx
import type { Card } from '@pablo/engine';
import type { CardTheme } from '@/design/cardTheme';

export type PlayingCardSize = { width: number; height: number };

export type PlayingCardProps = {
  card: Card; // engine type — { id, suit, rank }
  faceUp: boolean; // initial face state
  theme: CardTheme;
  size?: PlayingCardSize; // default { width: 220, height: 320 }
  draggable?: boolean; // default true on the lab; false in game grids
  flippable?: boolean; // default true on the lab
  onFlip?: (nowFaceUp: boolean) => void;
};

export const PlayingCard: React.FC<PlayingCardProps>;
```

- **No game logic.** It does not know whose turn it is, whether it's legal to flip, etc. (Hard rule #6.)
- The lab screen owns the `useState<CardTheme>` and passes it down.
- Skia drawing helpers (rank glyph, suit pip, back motif) live in `apps/mobile/src/components/cards/internal/` (sibling files) and are pure functions of `(theme, card?, size)`.

---

## Card-lab screen layout

A single screen with two zones, stacked vertically:

1. **Top bar** — title ("Card Lab"), theme cycle button ("Theme: Classic" / "Theme: Midnight").
2. **Interactive zone** — one centered `<PlayingCard draggable flippable>` on a tokens-driven background. Helper text below: "Tap to flip · Drag to move".
3. **Variants grid** (collapsible / scrollable) — 4×3 read-only `<PlayingCard>` rendered as small thumbnails (size ≈ 80×120) covering: one Ace, one 7 (power card), one K♥ (the zero-value override), one 10, each in both themes, face-up and face-down. Lets us eyeball that theme tokens, suit colors, and back motif behave across permutations without writing Storybook.

The variants grid satisfies the "storybook-style screen permutations on web" line in the user's prompt without pulling in Storybook itself (it would be a substantial dep and out of scope for Phase 3).

---

## Test plan

We can't test Skia/Reanimated rendering in `bun test` headlessly without a heavy `jest-expo` / `react-native-testing-library` setup. That setup is **not** justified for one prototype screen. Instead:

### What we can unit-test (with `bun test`)

| File                                                   | Asserts                                                                                                                                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/design/cardTheme.test.ts`             | `cardThemes` contains exactly `defaultCardTheme` and `midnightCardTheme`; every theme has unique `id`; required keys present (`face.palette.bg`, `back.palette.primary`, etc.).          |
| `apps/mobile/src/i18n/i18n.test.ts`                    | `t('dev.cardLab.title')` returns the English string. `t('dev.cardLab.themeButton', { name: 'Midnight' })` interpolates. Unknown key returns the key itself (debuggable fallback).        |
| `apps/mobile/src/components/cards/PlayingCard.test.ts` | Pure helper exports (`cardLabel(card)`, `suitColor(suit, theme)`) — e.g., `cardLabel({ suit: 'H', rank: 'A' })` returns `'A'` and `'♥'` from a small helper module. No component render. |

Three small files, ~15 assertions total, all pure functions. Keeps the `bun test` gate meaningful.

### What requires the simulator / device

A checklist captured in the PR description, executed by the author on iOS Simulator + a real iPhone:

1. App launches, lands on Home, dev-only "Card Lab" link visible.
2. Tap "Card Lab" → lab screen renders without flashing/jank.
3. Tap card → flips to face in ~450 ms; no flicker at the half-turn.
4. Tap again → flips back. Repeat 5× — no degradation.
5. Drag card 100 pt right; release → snaps back to center in ≤ ~400 ms without overshoot.
6. Drag during a flip → flip and translate compose cleanly (no flat appearance).
7. Tap "Theme: Midnight" → card re-skins instantly, no remount (verifiable by mid-flip toggle: the in-progress flip continues with new colors).
8. Variants grid renders all 16 permutations with correct theme colors and back motifs.
9. Profile flip with React Native Performance / Flipper: stays at 60 fps.
10. Repeat (1–8) on a real device.

Output: a screen recording (mp4) attached to the PR description. Performance number from the profiler captured in the PR body.

### Web verification (bonus, not gating)

`bun --cwd=apps/mobile run web` lets us eyeball the variants grid and theme toggle in a browser. Skia renders via WebGL on web; gesture handler + reanimated work but may behave slightly differently. We use web as a fast visual review channel, **not** as a perf bar. The DoD requires real hardware.

---

## i18n keys for this PR

```json
{
  "dev": {
    "cardLab": {
      "title": "Card Lab",
      "tapToFlip": "Tap to flip · Drag to move",
      "themeButton": "Theme: {{name}}",
      "variantsTitle": "Variants",
      "openButton": "Open Card Lab"
    },
    "home": {
      "title": "Pablo",
      "subtitle": "Phase 3 — Card Lab prototype"
    }
  }
}
```

Tiny `t()` wrapper:

```ts
// apps/mobile/src/i18n/index.ts
import en from './locales/en.json';

type Dict = Record<string, unknown>;
function lookup(dict: Dict, key: string): string | undefined {
  /* dot-walk */
}
export function t(key: string, vars?: Record<string, string | number>): string {
  const raw = lookup(en as Dict, key);
  if (typeof raw !== 'string') return key; // fallback = the key itself
  return vars ? raw.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? '')) : raw;
}
```

No `expo-localization`. Phase 4 swaps this for the real implementation when there's more surface area to translate.

---

## Self-review checklist (run before pushing PR)

Per AGENTS.md "How to self-review before merging":

1. `bun run check` — clean.
2. Re-read every changed file (manual diff pass).
3. Hard rule audit:
   - #6 `<PlayingCard>` contains no `useStore`, no engine calls, no conditionals on `turnIndex`/`drawn`. ✅
   - #7 Every visible string in `card-lab.tsx`, `index.tsx`, `_layout.tsx` goes through `t()`. ✅
   - #8 Every color/space/radius in app screens reads from `tokens`; only `<PlayingCard>` reads from `theme` (legitimate — that's `theme`'s job). ✅
   - #9 This plan exists at `docs/plans/phase-3-card-lab.md` and ships in the same PR. ✅
4. `docs/PLAN.md` updated: Phase 3 → Done, new decisions appended.
5. Variants grid + screen recording added to PR body.

---

## Open questions / proposed decisions (need user input before execution)

1. **Add Expo Router now, or do the workaround of putting the lab in `App.tsx`?**
   _Proposed_: add Expo Router now. Reasons (a) PLAN.md path is unambiguous (`apps/mobile/app/dev/card-lab.tsx`), (b) Phase 4 needs it anyway, (c) the alternative (booting from `App.tsx` and faking a route via in-component state) bakes in a permanent home for the lab, which violates the "gated behind `__DEV__`" instruction.
2. **Second theme: `midnight` (dark) — OK?**
   _Proposed_: yes. Maximum visual delta vs `classic-light`, exercises every theme prop including back palette. We deliberately avoid the eventual zellige theme (Phase 6/7).
3. **Add a tiny `t()` wrapper or accept hardcoded strings for "dev-only" screens?**
   _Proposed_: tiny wrapper. AGENTS.md hard rule #7 is unconditional. The wrapper is ~15 lines, no deps, and Phase 4 needs the file structure anyway.
4. **Storybook?**
   _Proposed_: no. The in-app "Variants" grid covers permutations cheaper. Storybook for RN is a meaningful dep + a separate runner; not worth it for one component.
5. **`babel.config.js`** — Reanimated 4 + worklets plugin is bundled in `babel-preset-expo` (SDK 53+), so we just need the standard `module.exports = function (api) { api.cache(true); return { presets: ['babel-preset-expo'] }; };`. Flag if your local dev rig needs an explicit `react-native-worklets/plugin` line.
6. **Drag overlay re-parenting** — cards.mdc recommends re-parenting the dragging card into an overlay layer "so its z-index isn't fighting the grid." For one card this is irrelevant; for the variants grid the small cards aren't draggable. Skipping overlay re-parenting in this PR; revisit in Phase 4 when there's a real grid.
7. **Engine usage in the lab** — the lab needs a few `Card` instances to render. Proposal: build them inline as plain literals (`{ id: '...', suit: 'H', rank: '7' }`) rather than calling `newGame()` and slicing — the lab must not depend on engine state. Confirms hard rule #6.

If you want different answers on any of these, tell me before I switch to the branch.
