import { err, ok } from '../_shared/respond.ts';
import { getCallerId } from '../_shared/auth.ts';
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
  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return err('internal_error', 400);
  }
  if (typeof body.code !== 'string') return err('internal_error', 400);
  const { code } = body;

  const admin = createAdminClient();

  // 3. Look up room by code
  const { data: room, error: roomErr } = await admin
    .from('rooms')
    .select('id, code, host_id, status, rules, max_players, current_game_id, created_at')
    .eq('code', code.toUpperCase())
    .maybeSingle();

  if (roomErr || !room) return err('not_found');

  if (room.status !== 'waiting') return err('room_not_joinable');

  // 4. Count current members
  const { count, error: countErr } = await admin
    .from('room_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('room_id', room.id);

  if (countErr) return err('internal_error');
  if ((count ?? 0) >= room.max_players) return err('room_full');

  // 5. Check if already a member
  const { data: existingMember } = await admin
    .from('room_members')
    .select('user_id')
    .eq('room_id', room.id)
    .eq('user_id', uid)
    .maybeSingle();

  if (existingMember) {
    // Already joined — return room data idempotently
    const { data: members } = await admin
      .from('room_members')
      .select('user_id')
      .eq('room_id', room.id)
      .order('seat');

    return ok({
      room: {
        id: room.id,
        code: room.code,
        hostId: room.host_id,
        status: room.status,
        members: (members ?? []).map((m: { user_id: string }) => m.user_id),
        maxPlayers: room.max_players,
        rules: room.rules,
        currentGameId: room.current_game_id ?? null,
      },
    });
  }

  // 6. Find the lowest unused seat
  const { data: seats } = await admin
    .from('room_members')
    .select('seat')
    .eq('room_id', room.id)
    .order('seat');

  const usedSeats = new Set((seats ?? []).map((s: { seat: number }) => s.seat));
  let nextSeat = 0;
  while (usedSeats.has(nextSeat)) nextSeat++;

  // 7. Insert new member
  const { error: insertErr } = await admin
    .from('room_members')
    .insert({ room_id: room.id, user_id: uid, seat: nextSeat });

  if (insertErr) return err('internal_error');

  // 8. Fetch updated member list
  const { data: allMembers } = await admin
    .from('room_members')
    .select('user_id')
    .eq('room_id', room.id)
    .order('seat');

  return ok({
    room: {
      id: room.id,
      code: room.code,
      hostId: room.host_id,
      status: room.status,
      members: (allMembers ?? []).map((m: { user_id: string }) => m.user_id),
      maxPlayers: room.max_players,
      rules: room.rules,
      currentGameId: room.current_game_id ?? null,
    },
  });
});
