import { err, ok } from '../_shared/respond.ts';
import { assertRoomMember, getCallerId } from '../_shared/auth.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { computePlayerView } from '@pablo/engine';
import type { GameState } from '@pablo/engine';

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
  let body: { gameId?: unknown };
  try {
    body = await req.json();
  } catch {
    return err('internal_error', 400);
  }
  if (typeof body.gameId !== 'string') return err('internal_error', 400);
  const { gameId } = body;

  const admin = createAdminClient();

  // 3. Fetch game. Both "game not found" and "caller is not a member" return
  //    `not_authorized` — never `not_found` — so we don't leak game existence
  //    to non-members (plan §10 Q4 locked decision).
  const { data: game, error: gameErr } = await admin
    .from('games')
    .select('id, room_id, state, version')
    .eq('id', gameId)
    .maybeSingle();

  if (gameErr || !game) return err('not_authorized');

  // 4. Verify caller is a room member
  try {
    await assertRoomMember(admin, uid, game.room_id);
  } catch {
    return err('not_authorized');
  }

  // 5. Compute per-player view via engine
  const view = computePlayerView(game.state as GameState, uid);

  return ok({ view, version: game.version });
});
