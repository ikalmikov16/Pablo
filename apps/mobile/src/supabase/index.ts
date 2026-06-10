/**
 * Single entry point for backend access.
 *
 * The app runs two clients side by side: the mock (in-memory + bots) for the
 * offline "vs bots" flow and the real Supabase client for online multiplayer.
 * Routes select one via `?mode=online|offline` (`resolveClientForMode`) and
 * read it through `usePabloClient()`; they should not call `createMockClient`
 * / `createRealClient` directly.
 */

export type {
  ActiveSession,
  ClientErrorCode,
  ClientResult,
  ClientTransportError,
  GameId,
  PabloClient,
  Room,
  RoomId,
  Unsubscribe,
} from './types';
export { ClientProvider, usePabloClient } from './ClientProvider';
export { createMockClient, type MockClient } from './mockClient';
export { createRealClient, type RealClientOptions } from './realClient';
export { client, getMockClient, getRealClient, resolveClientForMode } from './client';
export type { GameMode } from './gameMode';
