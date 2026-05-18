-- apply_move_atomic: called by the applyMove edge function after engine validation.
-- Atomically updates game state, records the move, and appends events.
CREATE OR REPLACE FUNCTION apply_move_atomic(
  p_game_id         uuid,
  p_new_state       jsonb,
  p_new_version     bigint,
  p_engine_version  int,
  p_move            jsonb,
  p_events          jsonb[],
  p_player_id       uuid,
  p_idempotency_key text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows_updated    int;
  v_cached_version  bigint;
BEGIN
  -- Step 1: Optimistic concurrency — only update if the version matches
  UPDATE games
  SET
    state          = p_new_state,
    version        = p_new_version,
    engine_version = p_engine_version,
    updated_at     = now()
  WHERE id      = p_game_id
    AND version = p_new_version - 1;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'version_mismatch';
  END IF;

  -- Step 2: Record the move; handle idempotency via UNIQUE conflict
  INSERT INTO game_moves (game_id, version, player_id, move, idempotency_key)
  VALUES (p_game_id, p_new_version, p_player_id, p_move, p_idempotency_key)
  ON CONFLICT (game_id, idempotency_key) DO NOTHING;

  IF NOT FOUND THEN
    -- Idempotency conflict: another request already applied this key.
    -- Return the cached version so the caller can reply safely.
    SELECT version INTO v_cached_version
    FROM game_moves
    WHERE game_id         = p_game_id
      AND idempotency_key = p_idempotency_key;
    RETURN v_cached_version;
  END IF;

  -- Step 3: Append events (seq is 0-indexed, preserving engine order)
  INSERT INTO game_events (game_id, version, seq, event)
  SELECT
    p_game_id,
    p_new_version,
    (ordinality - 1)::int,
    e
  FROM unnest(p_events) WITH ORDINALITY AS t(e, ordinality);

  RETURN p_new_version;
END;
$$;

-- Only edge functions (service_role) may call this; authenticated users must not.
GRANT EXECUTE ON FUNCTION apply_move_atomic(uuid, jsonb, bigint, int, jsonb, jsonb[], uuid, text) TO service_role;

-- Rollback:
-- REVOKE EXECUTE ON FUNCTION apply_move_atomic(uuid, jsonb, bigint, int, jsonb, jsonb[], uuid, text) FROM service_role;
-- DROP FUNCTION IF EXISTS apply_move_atomic(uuid, jsonb, bigint, int, jsonb, jsonb[], uuid, text);
