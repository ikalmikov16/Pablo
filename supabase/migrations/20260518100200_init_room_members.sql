-- room_members: tracks which users are in which room, and their seat order
CREATE TABLE IF NOT EXISTS room_members (
  room_id   uuid        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seat      int         NOT NULL CHECK (seat >= 0),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE UNIQUE INDEX room_members_room_seat_unique ON room_members (room_id, seat);
CREATE INDEX room_members_user_id_idx ON room_members (user_id);

-- SECURITY DEFINER helper so the RLS policy below does not recurse into itself.
-- A policy that does `EXISTS (SELECT 1 FROM room_members WHERE ...)` will
-- trigger Postgres' "infinite recursion detected in policy" error because the
-- inner SELECT re-applies the same policy. Wrapping the check in a SECURITY
-- DEFINER function makes the inner query bypass RLS.
CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id AND user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_room_member(uuid, uuid) TO authenticated;

ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;

-- Members of a room can see who else is in it (via the SECURITY DEFINER helper
-- above so we don't recurse into the policy when evaluating the EXISTS check).
CREATE POLICY select_room_members_for_members_only
  ON room_members FOR SELECT
  TO authenticated
  USING (public.is_room_member(room_id, auth.uid()));

-- No INSERT/DELETE policies: only joinRoom/leaveRoom edge functions (service role) mutate this table.

-- Rollback:
-- DROP POLICY IF EXISTS select_room_members_for_members_only ON room_members;
-- DROP FUNCTION IF EXISTS public.is_room_member(uuid, uuid);
-- DROP TABLE IF EXISTS room_members;
