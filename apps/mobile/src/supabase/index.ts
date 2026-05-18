/**
 * Single entry point for backend access. Swap between mock and real client here.
 *
 * Phase 4-5: app uses mockClient (in-memory + bots)
 * Phase 6+:  app uses realClient (Supabase)
 *
 * Routes should import the `client` singleton from `./client`, not call
 * `createMockClient` / `createRealClient` themselves.
 */

export type {
  ClientErrorCode,
  ClientResult,
  ClientTransportError,
  GameId,
  PabloClient,
  Room,
  RoomId,
  Unsubscribe,
} from './types';
export { createMockClient } from './mockClient';
export { createRealClient } from './realClient';
export { client } from './client';
