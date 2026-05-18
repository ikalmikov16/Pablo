/**
 * PabloClient — the single interface the rest of the app uses to talk to
 * the backend. Both `realClient.ts` (Supabase) and `mockClient.ts` (in-memory)
 * implement this. Swapping = changing one import.
 *
 * This is what lets the mobile app's Phase 4 work (single-player vs bot)
 * proceed in parallel with the Phase 5 Supabase work. Phase 4 uses the mock;
 * Phase 6 swaps to the real client.
 */

import type { GameRules, Move, PlayerId, PlayerView } from '@pablo/engine';

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

export type ClientResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string };

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

  /** Subscribe to the per-player view of an in-progress game. */
  subscribePlayerView(gameId: GameId, onChange: (view: PlayerView) => void): Unsubscribe;
}
