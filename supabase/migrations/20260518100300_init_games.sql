-- games: authoritative game state, service-role only
CREATE TABLE IF NOT EXISTS games (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id        uuid        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  state          jsonb       NOT NULL,
  version        bigint      NOT NULL DEFAULT 0,
  engine_version int         NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX games_room_id_idx ON games (room_id);

-- Only one live (non-ended) game per room at a time
CREATE UNIQUE INDEX games_one_live_per_room
  ON games (room_id)
  WHERE (state->>'status') <> 'ended';

ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Deny all access to authenticated users; only service_role (edge functions) touches this table
CREATE POLICY deny_all_games_for_authenticated
  ON games FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Rollback:
-- DROP TABLE IF EXISTS games;
