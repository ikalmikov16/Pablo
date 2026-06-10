import { err, ok } from '../_shared/respond.ts';
import { assertRoomMember, getCallerId } from '../_shared/auth.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  let uid: string;
  try {
    uid = await getCallerId(req);
  } catch {
    return err('unauthenticated', 401);
  }

  let body: { roomId?: unknown };
  try {
    body = await req.json();
  } catch {
    return err('internal_error', 400);
  }
  if (typeof body.roomId !== 'string') return err('internal_error', 400);
  const { roomId } = body;

  const admin = createAdminClient();

  const { data: room, error: roomErr } = await admin
    .from('rooms')
    .select('id, host_id, status')
    .eq('id', roomId)
    .maybeSingle();

  if (roomErr || !room) return err('not_found');
  if (room.host_id !== uid) return err('not_authorized');

  try {
    await assertRoomMember(admin, uid, roomId);
  } catch {
    return err('not_authorized');
  }

  const { error: updateErr } = await admin
    .from('rooms')
    .update({ status: 'waiting', current_game_id: null })
    .eq('id', roomId);

  if (updateErr) return err('internal_error');

  return ok({});
});
