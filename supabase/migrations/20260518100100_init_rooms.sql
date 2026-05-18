-- rooms: lobby metadata, readable by all authenticated users
CREATE TABLE IF NOT EXISTS rooms (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text        NOT NULL UNIQUE,
  host_id     uuid        NOT NULL REFERENCES profiles(id),
  status      text        NOT NULL CHECK (status IN ('waiting', 'playing')),
  rules       jsonb       NOT NULL,
  max_players int         NOT NULL CHECK (max_players BETWEEN 2 AND 6) DEFAULT 4,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_rooms_authenticated
  ON rooms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY update_own_room
  ON rooms FOR UPDATE
  TO authenticated
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());

-- No INSERT policy: only create_room() SECURITY DEFINER can insert.
-- No DELETE policy: only leaveRoom edge function (service role) can delete.

-- Rollback:
-- DROP TABLE IF EXISTS rooms;
