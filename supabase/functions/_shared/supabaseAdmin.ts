import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Returns a service-role Supabase client for use inside edge functions.
 * Creates a fresh client per call (safe for Deno isolate per-request model).
 */
export function createAdminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
