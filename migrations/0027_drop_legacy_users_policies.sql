-- Second bug in the users-RLS re-enable, caught by live re-verification
-- after applying 0026: `ALTER TABLE public.users DISABLE ROW LEVEL
-- SECURITY` (0006) does NOT delete existing policy objects — it only makes
-- them inert while RLS is off. The original policies from
-- `0001_initial_core_schema.sql` were never dropped:
--   "Allow public insert on users" WITH CHECK (true)
--   "Allow users to read users"    FOR SELECT USING (true)   <- fully open
--   "Allow users to update own profile" USING (auth.uid() = id)
-- The moment 0025 re-enabled RLS, these three reactivated alongside the
-- new users_select/users_insert/users_update policies — and since RLS
-- policies are OR'd together, the wide-open "Allow users to read users"
-- alone granted anon full read access again, completely undoing 0025's
-- fix. Confirmed live: anon could still read all 4 rows in the (small,
-- pre-launch) live users table via a raw REST call with only the anon key.
--
-- 0025/0026's own policies (users_select/users_insert/users_update)
-- already fully cover insert/select/update correctly — these old ones
-- just need to be gone, not replaced.

DROP POLICY IF EXISTS "Allow public insert on users" ON public.users;
DROP POLICY IF EXISTS "Allow users to read users" ON public.users;
DROP POLICY IF EXISTS "Allow users to update own profile" ON public.users;

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- 1. SELECT policyname, cmd FROM pg_policies WHERE tablename = 'users';
--    should show exactly: users_select, users_insert, users_update.
-- 2. supabase.from('users').select('*') with the anon key should now
--    return an empty array.
