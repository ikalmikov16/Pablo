import type { PabloClient } from './types';

/**
 * mockClient — in-memory PabloClient implementation.
 *
 * STUB — Phase 4 agent implements. The mock:
 *  - keeps rooms/games in module-local state
 *  - uses @pablo/engine directly for all rule logic (no network)
 *  - simulates "other players" via simple bot heuristics over legalMoves()
 *
 * This lets the entire single-player + bot experience work without Supabase.
 * Phase 6 swaps the import in apps/mobile/src/supabase/index.ts from
 * `./mockClient` to `./realClient`.
 */
export function createMockClient(): PabloClient {
  throw new Error(
    'mockClient: not implemented — Phase 4 agent implements per apps/mobile/src/supabase/types.ts',
  );
}
