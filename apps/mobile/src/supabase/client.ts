/**
 * PabloClient accessors — mock for offline vs-bots, real for multiplayer.
 *
 * Routes pick the client via `?mode=online|offline` on the game route and
 * `ClientProvider` in lobby / home flows. Do not import mock/real directly
 * from screens except through `usePabloClient()` or these accessors.
 */

import { createMockClient, type MockClient } from './mockClient';
import { createRealClient } from './realClient';
import type { PabloClient } from './types';

let mockSingleton: MockClient | null = null;
let realSingleton: PabloClient | null = null;

export function getMockClient(): MockClient {
  if (!mockSingleton) {
    mockSingleton = createMockClient();
  }
  return mockSingleton;
}

export function getRealClient(): PabloClient {
  if (!realSingleton) {
    realSingleton = createRealClient();
  }
  return realSingleton;
}

export function resolveClientForMode(mode: 'online' | 'offline'): PabloClient {
  return mode === 'online' ? getRealClient() : getMockClient();
}

/** @deprecated Use getMockClient / getRealClient / usePabloClient instead. */
export const client: MockClient = getMockClient();
