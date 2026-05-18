import { err, ok } from '../_shared/respond.ts';
import { assertRoomMember, getCallerId } from '../_shared/auth.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { broadcastGameTick } from '../_shared/broadcast.ts';
import { applyMove } from '@pablo/engine';
import type { GameState, Move } from '@pablo/engine';

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
  let body: {
    gameId?: unknown;
    move?: unknown;
    idempotencyKey?: unknown;
    expectedVersion?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return err('internal_error', 400);
  }

  const { gameId, move, idempotencyKey, expectedVersion } = body;

  if (typeof gameId !== 'string') return err('internal_error', 400);
  if (typeof idempotencyKey !== 'string') return err('internal_error', 400);
  if (typeof expectedVersion !== 'number') return err('internal_error', 400);
  if (typeof move !== 'object' || move === null) return err('internal_error', 400);

  const moveObj = move as Record<string, unknown>;
  if (typeof moveObj.type !== 'string') return err('internal_error', 400);

  // 3. CRITICAL: verify move is submitted by the authenticated caller
  if (moveObj.playerId !== uid) return err('not_authorized');

  const admin = createAdminClient();

  // 4. Fetch game (service role — games is deny-all for authenticated).
  //    Both "game not found" and "caller is not a member" return
  //    `not_authorized` — never `not_found` — so we don't leak game existence
  //    to non-members (plan §10 Q4 locked decision).
  const { data: game, error: gameErr } = await admin
    .from('games')
    .select('id, room_id, state, version, engine_version')
    .eq('id', gameId)
    .maybeSingle();

  if (gameErr || !game) return err('not_authorized');

  // 5. Verify caller is a member of the game's room
  try {
    await assertRoomMember(admin, uid, game.room_id);
  } catch {
    return err('not_authorized');
  }

  // 6. Idempotency pre-check — must come BEFORE version check so that a
  //    re-sent request with a stale expectedVersion still returns the cached result.
  const { data: existing } = await admin
    .from('game_moves')
    .select('version')
    .eq('game_id', gameId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existing) {
    return ok({ version: existing.version });
  }

  // 7. Optimistic concurrency check
  if (game.version !== expectedVersion) return err('version_mismatch');

  // 8. Apply move via engine
  let result: ReturnType<typeof applyMove>;
  try {
    result = applyMove(game.state as GameState, move as Move);
  } catch (e) {
    console.error('[applyMove] engine threw:', e);
    return err('internal_error');
  }

  if (!result.ok) return err(result.error);

  // 9. Persist atomically
  const newVersion = game.version + 1;
  const { data: rpcResult, error: rpcErr } = await admin.rpc('apply_move_atomic', {
    p_game_id: gameId,
    p_new_state: result.state as unknown as Record<string, unknown>,
    p_new_version: newVersion,
    p_engine_version: game.engine_version ?? 1,
    p_move: move as Record<string, unknown>,
    p_events: result.events as unknown as Record<string, unknown>[],
    p_player_id: uid,
    p_idempotency_key: idempotencyKey,
  });

  if (rpcErr) {
    const msg = rpcErr.message ?? '';
    if (msg.includes('version_mismatch')) return err('version_mismatch');
    console.error('[applyMove] apply_move_atomic error:', rpcErr);
    return err('internal_error');
  }

  const finalVersion = (rpcResult as bigint | number | null) ?? newVersion;

  // 10. Broadcast tick
  await broadcastGameTick(gameId, Number(finalVersion));

  return ok({ version: Number(finalVersion) });
});
