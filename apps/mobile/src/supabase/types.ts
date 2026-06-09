/**
 * PabloClient — the single interface the rest of the app uses to talk to
 * the backend. Both `realClient.ts` (Supabase) and `mockClient.ts` (in-memory)
 * implement this. Swapping = changing one import.
 *
 * This is what lets the mobile app's Phase 4 work (single-player vs bot)
 * proceed in parallel with the Phase 5 Supabase work. Phase 4 uses the mock;
 * Phase 6 swaps to the real client.
 */

import type { GameEvent, GameRules, Move, MoveError, PlayerId, PlayerView } from '@pablo/engine';

export type RoomId = string;
export type GameId = string;

export type Room = {
  readonly id: RoomId;
  readonly code: string;
  readonly hostId: PlayerId;
  readonly status: 'waiting' | 'playing' | 'finished';
  readonly members: ReadonlyArray<PlayerId>;
  readonly maxPlayers: number;
  readonly rules: GameRules;
};

/**
 * Client-layer errors. Either a transport/auth issue surfaced by the client
 * or an engine `MoveError` passed through verbatim from a failed `applyMove`.
 *
 * The mobile UI translates each code to a user-visible string via
 * `error.<code>` in the i18n bundle (`apps/mobile/src/i18n/locales/en.json`).
 * Adding a new code without adding the matching i18n key is a regression —
 * the UI will fall back to showing the raw key.
 */
export type ClientTransportError =
  | 'not_found'
  | 'version_mismatch'
  | 'network_error'
  | 'unauthenticated'
  | 'not_authorized'
  | 'room_full'
  | 'room_not_joinable'
  | 'internal_error';

export type ClientErrorCode = ClientTransportError | MoveError;

export type ClientResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ClientErrorCode };

export type Unsubscribe = () => void;

export interface PabloClient {
  /** Anonymous or social sign-in. Resolves with the local player's id. */
  signIn(): Promise<ClientResult<PlayerId>>;

  /** Create a new room and join it as host. */
  createRoom(opts: {
    rules?: Partial<GameRules>;
    maxPlayers?: number;
  }): Promise<ClientResult<Room>>;

  /** Join an existing room by its short code. */
  joinRoom(opts: { code: string }): Promise<ClientResult<Room>>;

  leaveRoom(opts: { roomId: RoomId }): Promise<ClientResult<void>>;

  /** Host starts the game; deals first round. */
  startGame(opts: { roomId: RoomId }): Promise<ClientResult<GameId>>;

  /** Submit a move. Server validates via engine; rejects illegal moves. */
  applyMove(opts: {
    gameId: GameId;
    move: Move;
    idempotencyKey: string;
    expectedVersion: number;
  }): Promise<ClientResult<{ version: number }>>;

  /** Subscribe to room metadata changes (members joining, status, etc.). */
  subscribeRoom(roomId: RoomId, onChange: (room: Room) => void): Unsubscribe;

  /**
   * Subscribe to the per-player view of an in-progress game.
   *
   * The callback receives the projected view AND the game's current version
   * (the value of `version` corresponding to this view). Callers store the
   * version and pass it as `expectedVersion` in subsequent `applyMove` calls
   * to detect optimistic-lock conflicts.
   */
  subscribePlayerView(
    gameId: GameId,
    onChange: (view: PlayerView, version: number) => void,
  ): Unsubscribe;

  /**
   * Subscribe to game events as they are applied. Events arrive in the same
   * order as the moves that produced them. The animation layer drains this
   * channel; the view subscription is the source of truth for state.
   *
   * **Callback ordering (required for card-flight animations):** for each
   * `applyMove`, implementations MUST invoke `subscribePlayerView` callbacks
   * before `subscribeGameEvents` callbacks so the promoted view is available
   * when the flight planner runs.
   *
   * Phase 6 (realClient) delivers these via a Supabase Realtime broadcast
   * channel; the mock delivers them in-process.
   */
  subscribeGameEvents(
    gameId: GameId,
    onChange: (events: ReadonlyArray<GameEvent>) => void,
  ): Unsubscribe;
}
