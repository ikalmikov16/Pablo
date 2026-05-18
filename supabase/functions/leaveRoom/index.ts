import { err, ok } from '../_shared/respond.ts';
import { assertRoomMember, getCallerId } from '../_shared/auth.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  // 1. Auth
  let uid: string;
  try {
    uid = await getCallerId(req);
  } catch {
    return err('unauthenticated', 401);
  }

  // 2. Parse body
  let body: { roomId?: unknown };
  try {
    body = await req.json();
  } catch {
    return err('internal_error', 400);
  }
  if (typeof body.roomId !== 'string') return err('internal_error', 400);
  const { roomId } = body;

  const admin = createAdminClient();

  // 3. Assert caller is a member
  try {
    await assertRoomMember(admin, uid, roomId);
  } catch {
    return err('not_authorized');
  }

  // 4. Delete member row
  await admin.from('room_members').delete().eq('room_id', roomId).eq('user_id', uid);

  // 5. Count remaining members
  const { count } = await admin
    .from('room_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('room_id', roomId);

  // 6. If the room is now empty, delete it (CASCADE handles games/moves/events)
  if ((count ?? 0) === 0) {
    await admin.from('rooms').delete().eq('id', roomId);
    return ok({});
  }

  // 7. If the leaving user was the host, promote the lowest-seat remaining member
  const { data: room } = await admin.from('rooms').select('host_id').eq('id', roomId).maybeSingle();

  if (room?.host_id === uid) {
    const { data: nextHost } = await admin
      .from('room_members')
      .select('user_id')
      .eq('room_id', roomId)
      .order('seat')
      .limit(1)
      .maybeSingle();

    if (nextHost) {
      await admin.from('rooms').update({ host_id: nextHost.user_id }).eq('id', roomId);
    }
  }

  return ok({});
});
