import { err, ok } from '../_shared/respond.ts';
import { assertRoomMember, getCallerId } from '../_shared/auth.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { redactEventsFor } from '../_shared/redact.ts';
import type { GameEvent } from '@pablo/engine';

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
  let body: { gameId?: unknown; sinceVersion?: unknown };
  try {
    body = await req.json();
  } catch {
    return err('internal_error', 400);
  }
  if (typeof body.gameId !== 'string') return err('internal_error', 400);
  if (typeof body.sinceVersion !== 'number') return err('internal_error', 400);
  const { gameId, sinceVersion } = body;

  const admin = createAdminClient();

  // 3. Fetch game (to get room_id for the membership check).
  //    Both "game not found" and "caller is not a member" return
  //    `not_authorized` — never `not_found` — so we don't leak game existence
  //    to non-members (plan §10 Q4 locked decision).
  const { data: game, error: gameErr } = await admin
    .from('games')
    .select('room_id')
    .eq('id', gameId)
    .maybeSingle();

  if (gameErr || !game) return err('not_authorized');

  // 4. Verify caller is a room member
  try {
    await assertRoomMember(admin, uid, game.room_id);
  } catch {
    return err('not_authorized');
  }

  // 5. Fetch events since sinceVersion, then re-read the game version. Reading
  //    events first and computing currentVersion = max(game.version, lastEventVersion)
  //    guarantees we never report a currentVersion that's behind the events we just
  //    returned — even if a concurrent applyMove commits between the two reads.
  //    Without this, a client could re-fetch the same events on the next call.
  const { data: rows, error: eventsErr } = await admin
    .from('game_events')
    .select('event, version')
    .eq('game_id', gameId)
    .gt('version', sinceVersion)
    .order('version')
    .order('seq');

  if (eventsErr) return err('internal_error');

  const { data: versionRow } = await admin
    .from('games')
    .select('version')
    .eq('id', gameId)
    .maybeSingle();

  const rawEvents = (rows ?? []).map((r: { event: unknown }) => r.event as GameEvent);

  // Redact private peek payloads (peeked.cardId, peek_one_chosen.cardId/handIndex)
  // for events not belonging to this viewer
  const events = redactEventsFor(uid, rawEvents);

  const lastEventVersion =
    rows && rows.length > 0
      ? Math.max(...rows.map((r: { version: number | bigint }) => Number(r.version)))
      : sinceVersion;
  const gameVersion = Number(versionRow?.version ?? sinceVersion);
  const currentVersion = Math.max(gameVersion, lastEventVersion);

  return ok({ events, currentVersion });
});
