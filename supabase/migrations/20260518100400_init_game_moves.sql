-- game_moves: append-only log of applied moves, carries idempotency key
CREATE TABLE IF NOT EXISTS game_moves (
  game_id         uuid        NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  version         bigint      NOT NULL,
  player_id       uuid        NOT NULL REFERENCES profiles(id),
  move            jsonb       NOT NULL,
  idempotency_key text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, version)
);

CREATE UNIQUE INDEX game_moves_idempotency_unique ON game_moves (game_id, idempotency_key);

ALTER TABLE game_moves ENABLE ROW LEVEL SECURITY;

CREATE POLICY deny_all_game_moves_for_authenticated
  ON game_moves FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Rollback:
-- DROP TABLE IF EXISTS game_moves;
