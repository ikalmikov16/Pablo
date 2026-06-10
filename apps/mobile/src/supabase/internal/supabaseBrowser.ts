import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

let browserClient: SupabaseClient | null = null;

/**
 * Process-wide Supabase client for the mobile app.
 * Persisted anon sessions are required for reconnection (Phase 6).
 */
export function getSupabaseBrowser(): SupabaseClient {
  if (!browserClient) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY — copy apps/mobile/.env.example',
      );
    }
    browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return browserClient;
}

/** Test-only: reset the singleton between tests. */
export function resetSupabaseBrowserForTests(): void {
  browserClient = null;
}
