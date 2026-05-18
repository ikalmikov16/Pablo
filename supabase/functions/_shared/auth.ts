import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createAnonClient } from './supabaseAnon.ts';

/**
 * Extracts and verifies the caller's JWT from the Authorization header.
 * Returns the authenticated user's id (UUID string).
 * Throws an error with message 'unauthenticated' on any failure.
 */
export async function getCallerId(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('unauthenticated');

  const client = createAnonClient(req);
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) throw new Error('unauthenticated');
  return user.id;
}

/**
 * Asserts that uid is a member of roomId.
 * Throws an error with message 'not_authorized' if not found.
 */
export async function assertRoomMember(
  adminClient: SupabaseClient,
  uid: string,
  roomId: string,
): Promise<void> {
  const { data, error } = await adminClient
    .from('room_members')
    .select('user_id')
    .eq('room_id', roomId)
    .eq('user_id', uid)
    .maybeSingle();

  if (error || !data) throw new Error('not_authorized');
}
