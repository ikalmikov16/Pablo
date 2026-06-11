# Phase 7 (part 1) — UX polish: every move is obvious + bug sweep

> Status: written 2026-06-10 on branch `phase-7-ux-polish`. This is the
> "professional app" pass over Phases 3–6: communication of opponent moves
> (text + animation), visual polish, and a sweep of bugs the previous phases
> missed. Sounds / app icon / EAS (the launch-prep half of Phase 7 in
> PLAN.md) are explicitly out of scope here and stay in a future branch.

## One-sentence goal

A player who never reads the rules should always know **whose turn it is,
what just happened, and why** — every engine event has a visible text +
motion treatment — and the bugs found in the Phase 7 audit are fixed.

---

## Why this work exists (audit findings)

A full audit of the codebase (engine, client layer, edge functions, UI)
surfaced these problems, ordered by severity:

### Bugs

| #   | Bug                                                                                                                                                                                                                                                                                                                                                                 | Where                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| B1  | **Privacy leak (online):** `peek_one_chosen` events carry `cardId` + `handIndex`, but `redact.ts` only redacts `peeked`. Any room member can read another player's initial peeks via `getEventsSince`. Contradicts GAME_LOGIC.md ("chosen indices are private").                                                                                                    | `supabase/functions/_shared/redact.ts`                 |
| B2  | **Peek "waiting" count never decrements.** `PeekOverlay.botsRemaining` reads `players[i].knownCards` — the _viewer's_ knowledge of that opponent's hand — not whether the opponent has finished peeking. The viewer learns nothing about opponents in peek phase, so the count stays at N until status flips. Needs a public `hasPeeked` flag on `PlayerViewEntry`. | `packages/engine/src/playerView.ts`, `PeekOverlay.tsx` |
| B3  | Mock room codes are 4 chars; real codes (and the join UI copy) are 6.                                                                                                                                                                                                                                                                                               | `apps/mobile/src/supabase/internal/room.ts`            |
| B4  | `leaveRoom` (mock) cancels pending bot timers for **every** game, not just the room being left.                                                                                                                                                                                                                                                                     | `apps/mobile/src/supabase/mockClient.ts`               |
| B5  | Top bar shows "Peek phase" while `view === null` (loading) — wrong copy.                                                                                                                                                                                                                                                                                            | `app/(game)/[gameId]/index.tsx`                        |
| B6  | Bot names are raw literals in `room.ts`; the `botName.*` i18n keys exist but are dead. Violates the i18n hard rule.                                                                                                                                                                                                                                                 | `room.ts`, `displayName.ts`                            |
| B7  | Doc drift: GAME_LOGIC.md documents 12 moves / 15 events; the engine has 13 / 16 (`peek_one`, `peek_one_chosen` missing from the doc).                                                                                                                                                                                                                               | `docs/GAME_LOGIC.md`                                   |
| B8  | Hardcoded colors: `#000` shadow in `FlyingCardLayer`, `rgba(45,106,79,0)` literals in `OwnHandGrid` / `OpponentSeat`; `CARD_W = 80` magic number in `PeekOverlay`.                                                                                                                                                                                                  | components                                             |
| B9  | Dead code: store actions `setSelection` / `clearSelection` / `setDragInFlight` / `addPeekPick` and `ui.selection` / `ui.dragInFlight` are never driven by any UI; `TableLayout.drawnPreview` prop unused; `tokens.game.duration.eventDrain` legacy.                                                                                                                 | store / components                                     |

### UX gaps (the user-visible heart of this phase)

| #   | Gap                                                                                                                                                                                                                           | Today                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| U1  | `match_failed` is silent: a shake + an unexplained penalty card. The `game.match.fail.*` strings exist but are wired only to the local player's _rejected-move_ toast, never to a completed failed match (own or opponent's). | shake only            |
| U2  | Opponent power use is invisible. `power_activated` (the "{name} discarded a 7") and opponent `peeked` ("{name} peeked at one of YOUR cards") produce no toast, no cue.                                                        | nothing               |
| U3  | `swapped_blind` flies two face-down cards but never says who swapped with whom.                                                                                                                                               | flights only          |
| U4  | `deck_reshuffled` has no UI at all (`game.deck.reshuffled` key is dead).                                                                                                                                                      | nothing               |
| U5  | Turn handoff is a static text label. "Your turn" deserves a moment (banner pulse + haptic); the active seat needs a stronger live indicator than a 6%-alpha tint.                                                             | static label          |
| U6  | Toasts are the only announcement channel and vanish after 1.8 s. A memory game wants a persistent "last action" line.                                                                                                         | transient toasts      |
| U7  | Match success has spotlights + flights but the toast says only "matched and discarded X" — fine — while _failures_ (the more confusing case) say nothing (see U1).                                                            | asymmetric            |
| U8  | Peek phase gives no per-seat progress for opponents (blocked by B2).                                                                                                                                                          | global count (broken) |

---

## Scope split (one branch, three packages, ordered)

### Package 1 — Bug sweep

| Item                                                                                                                                                                                                                                                                                                                    | Files                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Redact `peek_one_chosen` for non-self viewers: strip `cardId` → `null` and `handIndex` → `null` (indices are private per GAME_LOGIC). Extend `MaybeRedactedEvent` union + tests.                                                                                                                                        | `supabase/functions/_shared/redact.ts`, `tests/redact.test.ts`                               |
| Add `hasPeeked: boolean` to `PlayerViewEntry` (public scalar: "has this player finished their initial peek quota"). Pure projection change — derived from `state.knownCards[id][id]` count vs `rules.initialPeekCount`, hard-true when status ≠ `peek_phase`. Engine tests. **Requires `bun run build:engine-bundle`.** | `packages/engine/src/types.ts`, `playerView.ts`, `playerView.test.ts`                        |
| `PeekOverlay` waiting count + new per-seat "peeking…" status read `hasPeeked`.                                                                                                                                                                                                                                          | `PeekOverlay.tsx`, `OpponentSeat.tsx`                                                        |
| Mock room codes 4 → 6 chars.                                                                                                                                                                                                                                                                                            | `room.ts`, `room.test.ts`                                                                    |
| `leaveRoom` cancels bot timers only for the departing room's current game.                                                                                                                                                                                                                                              | `mockClient.ts`                                                                              |
| Loading label: show nothing-specific (new `game.status.loading` key) while `view === null`.                                                                                                                                                                                                                             | game screen, `en.json`                                                                       |
| Bot names through `t('botName.N')` via `displayName.ts`; `room.ts` keeps stable ids only.                                                                                                                                                                                                                               | `displayName.ts`, `room.ts`, game screen                                                     |
| Tokenise stray colors (`shadowColor`, transparent-accent literals) + `PeekOverlay` card width.                                                                                                                                                                                                                          | `tokens.ts`, `FlyingCardLayer.tsx`, `OwnHandGrid.tsx`, `OpponentSeat.tsx`, `PeekOverlay.tsx` |
| Delete dead store actions/state (`selection`, `dragInFlight`, `peekPicks` setters kept only where used), `TableLayout.drawnPreview`, `eventDrain` token.                                                                                                                                                                | `gameStore.ts`, `selectors.ts`, `TableLayout.tsx`, `tokens.ts`                               |
| Doc sync: GAME_LOGIC.md gains `peek_one` + `peek_one_chosen` (+ redaction note), SCHEMA.md redaction table updated.                                                                                                                                                                                                     | docs                                                                                         |

### Package 2 — "Every move is obvious" (announcements layer)

The centrepiece. Two complementary surfaces, both driven from the existing
event pipeline (no engine changes beyond Package 1's `hasPeeked`):

1. **`AnnouncementBanner`** (new) — a persistent one-line strip between the
   top bar and the table showing the _most recent_ action in plain text
   ("Cambia swapped and discarded 7♣ — 12 cards left in deck" style, no
   deck count, keep it short). It updates from the same planner toasts but
   never auto-hides; it's the memory aid U6 asks for. Toasts stay for
   transient emphasis.
2. **Planner toast coverage** for the silent events:

| Event                      | New treatment                                                                                                                                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `match_failed`             | Toast + announcement: `game.flight.matchFailToast.wrong_rank` ("{name} tried to match — wrong rank, penalty card!") / `.min_hand_size` ("{name} can't go below {min} cards — penalty card!"). Existing shake + penalty flight unchanged; toast delay aligns with the shake.         |
| `power_activated`          | Toast + announcement: "{name} discarded a {rank} — {power}!" (`game.flight.powerToast`); actor-focus cue on the actor's seat so eyes move there.                                                                                                                                    |
| `peeked` (opponent acting) | If target is self: high-emphasis toast "{name} peeked at one of YOUR cards!" + spotlight cue on the targeted own slot. If target is a third player: "{name} peeked at one of {target}'s cards" + spotlight on that opponent slot. Self acting: no toast (PowerFlow reveal owns it). |
| `swapped_blind`            | Toast + announcement: "{name} blind-swapped a card with {target}" (emphasised when target is self). Flights unchanged.                                                                                                                                                              |
| `deck_reshuffled`          | Toast + announcement: `game.deck.reshuffled`.                                                                                                                                                                                                                                       |
| `turn_ended` → my turn     | "Your turn" treatment: springy emphasis pulse on the top-bar turn label + success-style haptic when `currentPlayerId` becomes self (effect in game screen, not the planner — it's view-driven).                                                                                     |

Implementation notes:

- The planner already returns `toasts: ToastCue[]`; announcements ride the
  same `FlightPlan` as a new `announcements: ReadonlyArray<AnnouncementCue>`
  (id, delayMs, message) and land in `ui.announcement` via a scheduled
  setter, exactly like `scheduleToasts`. `pablo_called` keeps its immediate
  toast and also sets the announcement.
- All copy through `t()`; new keys under `game.flight.*` / `game.announce.*`.
- `match_failed` toasts contain the _reason_, satisfying the Phase 4 plan's
  original "teachable rule" requirement that was never wired.

### Package 3 — Visual polish

| Item                                                                                                                                                                                                                                       | Files                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| **Active-seat pulse**: the current opponent's seat gets an animated breathing ring (Reanimated loop, worklet-only) instead of the static 6% tint; own action bar gets a subtle top-border accent when it's your turn.                      | `OpponentSeat.tsx`, `ActionBar.tsx`, `tokens.ts` |
| **"Your turn" pulse** on the top-bar label (scale + color spring) + notification haptic (success) — fires on transition only.                                                                                                              | game screen, `haptics.ts`                        |
| **End-of-round choreography**: sheet keeps its spring; add staggered per-row fade/slide-in (FadeInDown with per-index delay) and a gold "winner" pop (spring scale) on winner rows. Crown/trophy glyph via text token-colored, no new dep. | `EndOfRound.tsx`                                 |
| **Home screen refresh**: card-fan motif rendered with 3 mini `PlayingCard`s (existing Skia component), tighter type hierarchy, pressed-state styling on buttons (consistent `Pressable` with pressed token).                               | `app/(home)/index.tsx`                           |
| **Lobby polish**: shared screen header style, member rows with seat-numbered avatars (initial in a token-colored circle), friendlier copy.                                                                                                 | `(lobby)/*.tsx`, `MemberRow.tsx`                 |
| **Peek overlay**: per-opponent readiness line driven by `hasPeeked` ("Cambia is peeking…" → checkmarks).                                                                                                                                   | `PeekOverlay.tsx`                                |

## Out of scope

- 🚫 Sounds (`expo-av`), app icon, splash, EAS/TestFlight — later branch.
- 🚫 Zellige card-back theme (kept as the dedicated design pass).
- 🚫 Engine rule changes; the only engine diff is the additive `hasPeeked` projection field.
- 🚫 Online display names / profiles editing (needs product decision on name entry UX; proposed in PLAN.md instead).
- 🚫 Optimistic local move application (`ui.mdc` mentions it; current submit-lock model works — revisit with latency data).

## Test plan

- `tests/redact.test.ts`: `peek_one_chosen` redacted for non-self, intact for self; `peeked` unchanged behaviour locked.
- `packages/engine/src/playerView.test.ts`: `hasPeeked` false pre-peek, true after `choose_peek`/`peek_one` quota, true for all in `playing`/`ended`.
- `room.test.ts`: 6-char codes from the mock generator.
- `mockClient.test.ts`: leaving room A does not cancel room B's pending bot timers (injected scheduler).
- `flightPlanner.test.ts`: new cases — `match_failed` produces reason toast + announcement; `power_activated` toast; `peeked` (self target / other target / actor self) toast matrix; `swapped_blind` toast; `deck_reshuffled` toast.
- `gameStore.test.ts`: announcement set by scheduled cue; survives toast dismissal.
- Existing suites stay green; `bun run check` is the gate.

## Definition of Done

- All B1–B9 fixed with regression tests where applicable.
- Every `GameEvent` variant has a defined visible treatment (flight, cue, toast, announcement, overlay, or a documented "intentionally silent" rationale in this file).
- `bun run build:engine-bundle` re-run (engine projection changed).
- `bun run check` green; PLAN.md / GAME_LOGIC.md / SCHEMA.md updated.
- Branch pushed; **no merge** until the user says so.

## Shipped deviations from this plan

Recorded after implementation (same branch):

1. **Announcements don't ride a new `announcements` array.** The planner's
   existing `toasts: ToastCue[]` channel now feeds `store.announce()`, which
   pins the persistent `AnnouncementBanner` line. Transient bottom toasts are
   reserved for rejected-move errors (`showToast`). One channel, two surfaces
   was redundant — the banner re-animates per message, which is emphasis
   enough.
2. **`turn_ended` haptic is `impactAsync(Light)`** (`hapticForTurnStart`),
   not a notification-success haptic — success haptics are a three-pulse
   pattern that felt too loud for something that happens every round-trip.
3. **Home-screen card-fan refresh deferred.** The home screen got no visual
   changes this branch; pressing on with the in-game surfaces (where players
   spend 95% of their time) was the better spend. Lobby rows got avatar
   initials; the home motif moves to the zellige design pass (Phase 7
   part 2).
4. **Peek overlay readiness** replaced the aggregate "Waiting on N
   opponents…" copy entirely (`game.peek.opponentPeeking` /
   `game.peek.opponentReady` per row) rather than supplementing it.
5. **Match-fail copy** lives at `game.flight.matchFailWrongRank` /
   `matchFailMinHand` (flat keys, consistent with the other flight toasts)
   instead of the nested `matchFailToast.*` shape sketched above.

## Event coverage matrix (target state)

| Event                             | Motion                                | Text                                                       |
| --------------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| `card_drawn`                      | deck→drawn / deck→seat flight         | turn label                                                 |
| `card_swapped`                    | staged swap choreography              | swap toast + announcement                                  |
| `card_discarded`                  | discard flight + pulse                | discard toast + announcement                               |
| `match_succeeded`                 | spotlights + flights + pulse          | match toast + announcement                                 |
| `match_failed`                    | slot shake (existing)                 | **NEW reason toast + announcement**                        |
| `penalty_card_dealt`              | deck→slot flight (existing)           | covered by match_failed text                               |
| `power_activated`                 | **NEW actor focus cue**               | **NEW power toast + announcement**                         |
| `peeked`                          | **NEW target-slot spotlight**         | **NEW peek toast + announcement** (self-target emphasised) |
| `swapped_blind`                   | cross-table flights (existing)        | **NEW blind-swap toast + announcement**                    |
| `pablo_called`                    | banner spring (existing)              | toast (existing) + announcement                            |
| `turn_ended`                      | **NEW turn-label pulse + seat ring**  | turn label                                                 |
| `deck_reshuffled`                 | deck pulse via discardPulse cue reuse | **NEW reshuffle toast + announcement**                     |
| `peek_chosen` / `peek_one_chosen` | PeekOverlay flips (existing)          | **NEW per-seat readiness** (via `hasPeeked`)               |
| `peek_phase_ended`                | overlay dismiss (existing)            | turn label takes over                                      |
| `round_ended`                     | **NEW staggered reveal + winner pop** | EndOfRound sheet (existing)                                |
