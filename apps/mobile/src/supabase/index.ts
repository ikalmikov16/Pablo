/**
 * Single entry point for backend access. Swap between mock and real client here.
 *
 * Phase 4-5: app uses mockClient (in-memory + bots)
 * Phase 6+:  app uses realClient (Supabase)
 */

export type { PabloClient, Room, RoomId, GameId, ClientResult, Unsubscribe } from './types';
export { createMockClient } from './mockClient';
export { createRealClient } from './realClient';
