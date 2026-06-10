-- postgres_changes only delivers events for tables in the supabase_realtime
-- publication. subscribeRoom (lobby member list, current_game_id discovery,
-- follow-the-host navigation) listens on rooms + room_members, so both must
-- be published. RLS still applies per subscriber: rooms are readable by any
-- authenticated user, room_members only by fellow members.
--
-- Filters used by the client (rooms.id, room_members.room_id) are part of each
-- table's primary key, so DELETE events carry them without REPLICA IDENTITY FULL.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE room_members;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Rollback:
-- ALTER PUBLICATION supabase_realtime DROP TABLE rooms;
-- ALTER PUBLICATION supabase_realtime DROP TABLE room_members;
