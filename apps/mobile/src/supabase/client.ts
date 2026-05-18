/**
 * Process-wide PabloClient singleton.
 *
 * Routes import `client` from here; they MUST NOT import `mockClient` or
 * `realClient` directly. That keeps the swap to the real backend a one-line
 * change in this file (Phase 6).
 *
 * Phase 4: mock client (in-memory, bots).
 * Phase 6: change the implementation to `createRealClient()`.
 *
 * Note: the singleton is typed as `MockClient` (a superset of `PabloClient`)
 * so the home/new-game flow can call the mock-only `addBotsToRoom` helper.
 * Phase 6 retypes this to `PabloClient` and the home flow rebuilds against
 * `joinRoom` / human-only flows.
 */

import { createMockClient, type MockClient } from './mockClient';

export const client: MockClient = createMockClient();
