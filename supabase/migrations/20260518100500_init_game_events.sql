-- game_events: append-only event log, drives client animation, service-role only
CREATE TABLE IF NOT EXISTS game_events (
  id         bigserial   PRIMARY KEY,
  game_id    uuid        NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  version    bigint      NOT NULL,
  seq        int         NOT NULL,
  event      jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX game_events_version_seq_unique ON game_events (game_id, version, seq);
CREATE INDEX game_events_game_version_idx ON game_events (game_id, version);

ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY deny_all_game_events_for_authenticated
  ON game_events FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Rollback:
-- DROP TABLE IF EXISTS game_events;
