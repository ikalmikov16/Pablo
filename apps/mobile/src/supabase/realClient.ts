import type { PabloClient } from './types';

/**
 * realClient — Supabase-backed PabloClient implementation.
 *
 * STUB — Phase 6 agent implements after Phase 5 (Supabase schema + edge
 * functions) ships. Until then, the app uses `./mockClient`.
 *
 * Reads SUPABASE_URL and SUPABASE_ANON_KEY from env. Service role key never
 * appears here — only in edge function environment variables.
 */
export function createRealClient(): PabloClient {
  const notImpl = (): never => {
    throw new Error('realClient: not implemented — Phase 6 agent implements after Phase 5 ships');
  };
  return {
    signIn: notImpl,
    createRoom: notImpl,
    joinRoom: notImpl,
    leaveRoom: notImpl,
    startGame: notImpl,
    applyMove: notImpl,
    subscribeRoom: notImpl,
    subscribePlayerView: notImpl,
    subscribeGameEvents: notImpl,
  };
}
