# GAME_LOGIC — Canonical Pablo Rules

This is the authoritative description of Pablo as implemented by `packages/engine`. If the engine and this doc disagree, **fix the engine**. If the rules need to change, **update this doc first**, then update the engine + tests in the same PR.

## Goal

Have the lowest total point value in your hand when the round ends. Rounds end when a player calls "Pablo" (and everyone else takes one final turn) or when the deck is exhausted.

## Setup

- Standard 52-card deck. No jokers in v1.
- 2–6 players.
- Each player is dealt 4 cards face-down in a 2×2 grid (positions 0, 1, 2, 3).
- Before play, each player privately peeks at their **bottom two** cards (positions 2 and 3). Once only.
- One card is flipped face-up to start the discard pile.
- The remaining deck is the draw pile.

## A turn

On your turn you must do exactly one of:

1. **Draw from the deck**, then either:
   - **Swap** the drawn card with one of your 4 hand positions (the replaced card goes face-up on the discard pile), OR
   - **Discard** the drawn card (it goes face-up on the discard pile; if it has a power, you may use it — see "Special cards").
2. **Draw from the discard pile**, then you MUST **Swap** it into your hand (you cannot draw from discard and immediately discard).
3. **Call Pablo** (instead of drawing). See "Calling Pablo".

After your move, play proceeds to the next player.

## Special cards

When a card is *discarded directly from the deck draw* (option 1 → Discard), its power activates. Players may choose not to use the power; the card is still discarded.

| Cards | Power |
|---|---|
| 7, 8 | **Peek own**: secretly look at one of your own cards. |
| 9, 10 | **Peek opponent**: secretly look at one of any opponent's cards. |
| Jack, Queen | **Blind swap**: swap one of your cards with one of any opponent's cards, without either of you seeing them. |
| King | No power. Worth **0 points** (see "Scoring"). |

> Note: Special powers activate ONLY when discarding directly from the deck. If you swap a 7 into your hand and the displaced card was a 7, that does not activate a power.

## Calling Pablo

- On your turn, instead of drawing, you may declare "Pablo".
- Every other player gets **exactly one** more turn.
- After the final turns, all hands are revealed and scored.

## Scoring

Each card's value:

| Card | Value |
|---|---|
| Ace | 1 |
| 2–10 | Face value |
| Jack | 10 |
| Queen | 10 |
| King | **0** |

A player's round score is the sum of their hand values.

After the reveal:

- The player with the lowest score wins the round.
- **If the player who called Pablo has the lowest score**, they score 0 for the round. Everyone else scores their hand value.
- **If the player who called Pablo does NOT have the lowest score**, they receive a **+10 penalty** added to their hand value. The actual lowest-scoring player still scores their hand value.
- Tie for lowest among non-callers: all tied players score 0 for the round.

Scores accumulate across rounds. The game ends when any player's cumulative score reaches `maxScore` (default 100). The player with the **lowest** cumulative score wins the game.

## Variants (configurable via `GameRules`)

The engine exposes a `GameRules` config so house rules are toggleable. Defaults below.

| Setting | Default | Range |
|---|---|---|
| `kingValue` | `0` | `0` or `13` |
| `jackQueenValue` | `10` | `10` or face value |
| `maxScore` | `100` | `50`–`200` |
| `pabloPenalty` | `10` | `5`–`20` |
| `initialHandSize` | `4` | fixed |
| `initialPeekCount` | `2` | `0`–`4` |
| `allowDrawDiscardAndDiscard` | `false` | `false` (must swap if drawn from discard) |

## Edge cases the engine must handle

- **Deck exhaustion**: shuffle the discard pile (except its top card) back into the deck. If the deck is still empty after shuffle, the round ends automatically (lowest hand wins, no Pablo penalty applied unless someone had called Pablo).
- **Calling Pablo with empty deck remaining**: legal.
- **Player disconnect mid-turn**: turn auto-passes (treated as "discard drawn" if they had drawn, else "draw from deck and discard"). The engine itself does not know about networking — disconnect handling lives in the edge function but uses engine moves.
- **Single player remaining**: round ends, they win that round.
- **Reshuffle determinism**: when reshuffling, use the round's seed combined with a turn counter so replays are deterministic.

## Public API (what the engine must export)

```ts
// types.ts
export type GameState = { ... };
export type Move = { ... };
export type GameEvent = { ... };
export type PlayerView = { ... };
export type GameRules = { ... };

// functions
export function newGame(opts: { players: PlayerId[]; seed: string; rules?: Partial<GameRules> }): GameState;
export function applyMove(state: GameState, move: Move): MoveResult;       // pure
export function computePlayerView(state: GameState, playerId: PlayerId): PlayerView;
export function scoreRound(state: GameState): RoundScore;
export function legalMoves(state: GameState, playerId: PlayerId): Move[];  // for UI hints + bot
```

All functions are pure and synchronous. No `Date.now()`, no `Math.random()` — randomness comes from the seed.
