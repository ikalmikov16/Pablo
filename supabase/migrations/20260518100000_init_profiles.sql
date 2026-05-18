-- profiles: one row per auth user, auto-created by trigger
CREATE TABLE IF NOT EXISTS profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_profiles_all
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY update_own_profile
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Auto-create profile row on every new auth.users row (anon or otherwise)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Rollback:
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS handle_new_user();
-- DROP TABLE IF EXISTS profiles;
