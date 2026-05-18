import { err, ok } from '../_shared/respond.ts';
import { getCallerId } from '../_shared/auth.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { broadcastGameTick } from '../_shared/broadcast.ts';
import { newGame } from '@pablo/engine';

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

  // 3. Fetch room and verify caller is the host
  const { data: room, error: roomErr } = await admin
    .from('rooms')
    .select('id, host_id, status, rules, max_players')
    .eq('id', roomId)
    .maybeSingle();

  if (roomErr || !room) return err('not_found');
  if (room.host_id !== uid) return err('not_authorized');
  if (room.status !== 'waiting') return err('room_not_joinable');

  // 4. Fetch members ordered by seat (these become the players array)
  const { data: members, error: membersErr } = await admin
    .from('room_members')
    .select('user_id')
    .eq('room_id', roomId)
    .order('seat');

  if (membersErr || !members || members.length < 2) {
    return err('internal_error');
  }

  const players = members.map((m: { user_id: string }) => m.user_id);

  // 5. Mint game id and seed server-side (client must never supply these)
  const gameId = crypto.randomUUID();
  const seed = crypto.randomUUID();

  // 6. Create initial game state via engine
  const initialState = newGame({ id: gameId, players, seed, rules: room.rules });

  // 7. Insert game row
  const { error: gameErr } = await admin.from('games').insert({
    id: gameId,
    room_id: roomId,
    state: initialState as unknown as Record<string, unknown>,
    version: 0,
    engine_version: 1,
  });

  if (gameErr) return err('internal_error');

  // 8. Update room status to 'playing'
  const { error: updateErr } = await admin
    .from('rooms')
    .update({ status: 'playing' })
    .eq('id', roomId);

  if (updateErr) return err('internal_error');

  // 9. Broadcast tick so subscribers know a game started
  await broadcastGameTick(gameId, 0);

  return ok({ gameId });
});
