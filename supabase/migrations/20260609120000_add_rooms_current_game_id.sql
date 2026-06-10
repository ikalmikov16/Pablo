-- Add RLS-readable link from a room to its live game (Phase 6).
-- Clients cannot read games directly; this column lets lobby + reconnection discover gameId.

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS current_game_id uuid REFERENCES games(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rooms_current_game_id_idx ON rooms (current_game_id)
  WHERE current_game_id IS NOT NULL;

-- Rollback:
-- DROP INDEX IF EXISTS rooms_current_game_id_idx;
-- ALTER TABLE rooms DROP COLUMN IF EXISTS current_game_id;
