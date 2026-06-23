-- Lobby display-name edits live-propagate to other waiting players.
--
-- subscribeDisplayNames listens to postgres_changes on profiles (filtered to
-- the room's member ids) and refetches when a name changes. postgres_changes
-- only delivers events for tables in the supabase_realtime publication, so
-- profiles must be published. RLS still applies per subscriber: profiles are
-- SELECT-able by any authenticated user (select_profiles_all), so members can
-- observe each other's name updates while in a lobby.
--
-- profiles.id is the primary key and the only filter column used by the
-- client, so UPDATE events carry it without REPLICA IDENTITY FULL.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Rollback:
-- ALTER PUBLICATION supabase_realtime DROP TABLE profiles;
