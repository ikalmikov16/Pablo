import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Creates an anon Supabase client that forwards the caller's JWT.
 * supabase-js will use this to validate the token via auth.getUser().
 */
export function createAnonClient(req: Request): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: {
      headers: { Authorization: req.headers.get('Authorization') ?? '' },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
