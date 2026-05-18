-- create_room: SECURITY DEFINER function so authenticated users can create rooms
-- without needing an INSERT policy on rooms. Generates a collision-resistant 6-char code.
CREATE OR REPLACE FUNCTION create_room(p_rules jsonb, p_max_players int DEFAULT 4)
RETURNS rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Base32 alphabet excluding ambiguous chars: O, 0, I, 1, L
  v_chars   CONSTANT text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code    text;
  v_attempt int := 0;
  v_room    rooms;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  LOOP
    -- Generate a 6-character code by sampling from v_chars
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;

    BEGIN
      INSERT INTO rooms (code, host_id, status, rules, max_players)
      VALUES (v_code, auth.uid(), 'waiting', p_rules, p_max_players)
      RETURNING * INTO v_room;

      -- Caller is automatically seat 0
      INSERT INTO room_members (room_id, user_id, seat)
      VALUES (v_room.id, auth.uid(), 0);

      RETURN v_room;
    EXCEPTION
      WHEN unique_violation THEN
        v_attempt := v_attempt + 1;
        IF v_attempt >= 5 THEN
          RAISE EXCEPTION 'failed to generate unique room code after 5 attempts';
        END IF;
        -- Loop and try again
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION create_room(jsonb, int) TO authenticated;

-- Rollback:
-- REVOKE EXECUTE ON FUNCTION create_room(jsonb, int) FROM authenticated;
-- DROP FUNCTION IF EXISTS create_room(jsonb, int);
