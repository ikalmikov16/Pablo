# Phase 7 (part 2a) — Visual identity Package 4: Screens

> Detailed plan for Package 4 of `docs/plans/phase-7-visual-identity.md`, written
> 2026-06-23 on branch `phase-7-visual-identity`. Packages 1–3 (tokens/fonts,
> card art, table + game chrome) are landed. This package finishes the
> non-game screens: a shared `Button` primitive, the home hero, and the
> lobby/new-game polish — so the chrome screens match the table's identity.

## One-sentence goal

Replace the per-screen `TouchableOpacity` button styles with one themed `Button` primitive, give the home screen a real hero (wordmark + fan of zellige card backs), and make the room code the hero of the lobby — no engine/store/flight changes.

## Scope (what changes)

| Item                                                                                                                                                                                                                        | Files                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **`Button` primitive** — `primary` / `secondary` / `ghost` variants, spring scale-on-press (Reanimated worklet), light haptic tap, `loading` + `disabled` states, optional `fullWidth`; all colors/space/radii from tokens. | `src/components/ui/Button.tsx` (new)     |
| **Display type slot** — add `tokens.font.size.display` (40) for the wordmark; `textStyle` applies tight letter-spacing to `display` too.                                                                                    | `tokens.ts`, `typography.ts`             |
| **UI haptic** — `hapticTap()` (selection) for button presses.                                                                                                                                                               | `feedback/haptics.ts`                    |
| **Home hero** — `Pablo` wordmark in display/bold + a fan of three face-down `PlayingCard`s (zellige backs); CTAs via `Button`.                                                                                              | `app/(home)/index.tsx`                   |
| **New-game screen** — bot-count CTAs via `Button` (primary), shared header.                                                                                                                                                 | `app/(home)/new-game.tsx`                |
| **Lobby hub** — create/join via `Button` (primary/secondary).                                                                                                                                                               | `app/(lobby)/index.tsx`                  |
| **Create / Join** — confirm button via `Button` (keeps the name/code `TextInput`s from the lobby-names work).                                                                                                               | `app/(lobby)/create.tsx`, `join.tsx`     |
| **Room lobby** — start/leave via `Button`; `RoomCodeBadge` becomes the hero element.                                                                                                                                        | `app/(lobby)/room/[roomId].tsx`          |
| **RoomCodeBadge hero** — sand card surface, border, larger spaced code, tap-to-feel affordance kept simple (display the code prominently).                                                                                  | `src/components/lobby/RoomCodeBadge.tsx` |

## Button primitive — contract

```ts
type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant; // default 'primary'
  disabled?: boolean;
  loading?: boolean; // shows ActivityIndicator, blocks press
  fullWidth?: boolean; // default true (chrome screens are column layouts)
  style?: StyleProp<ViewStyle>;
};
```

- Press feel: `Pressable` + a shared `scale` value; `onPressIn` → `withSpring(0.96)`, `onPressOut` → `withSpring(1)` via `springFor('press')` (reuse `feedback/motion.ts` if a press spring exists, else inline spring config). Animation lives in a worklet (`useAnimatedStyle`).
- Haptic: `hapticTap()` on press (no-op on web, guarded).
- Colors: primary = `accent.primary` bg / `text.inverse` label; secondary = `surface.card`/sand with `border.subtle` + `text.primary` label; ghost = transparent + `text.secondary`. Disabled = 0.5 opacity, press disabled. Uses `tokens.shadow.raised` on primary.

## Out of scope

- 🚫 In-game chrome buttons (ActionBar, leave button, flow sheets) — styled in Package 3; not re-skinned here to avoid churn in the game tree.
- 🚫 Any animation/engine/store/flight changes (parent plan rule).
- 🚫 Sounds, icon, splash, EAS (Phase 7 part 2 launch prep — separate).

## Test plan

- `typography.test.ts` (extend): `display` size present, larger than `xl`, and uses tight letter-spacing; monotonic chain includes `display`.
- `Button.tsx` is an RN component (Reanimated/Pressable) — not unit-tested in the bun (pure) suite, matching the repo's convention of testing pure helpers only. Manual device check at Checkpoint 2.
- `bun run check` green after the package.

## Decisions / trade-offs

- **`display` size token (40) instead of overloading `xl`** — the wordmark needs more presence than the 28px `xl` body-display size without bloating every `xl` use.
- **Button uses `Pressable`, not `PlayingCard`'s gesture system** — chrome buttons don't fight a Skia tree, so the standard `Pressable` + Reanimated press scale is simplest and accessible.
- **Home card fan uses real `PlayingCard` backs** (face-down dummy cards) — reuses the zellige renderer (no new art) and proves the back art on the first screen the user sees.
- **`RoomCodeBadge` as hero, not a separate screen** — the room screen already centers it; promoting its styling is cheaper than a layout rework.

## Definition of Done

- All chrome screens use `Button`; home has the wordmark + card fan; room code reads as the hero.
- `bun run check` green; `typography.test.ts` extended.
- `docs/PLAN.md` updated (Done + Decisions, incl. the `display` size); parent plan Package 4 considered complete.
