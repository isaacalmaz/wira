-- =============================================================================
-- Migration 0055: repair gaps found live-verifying 0052/0053 (CRITICAL)
-- =============================================================================
--
-- After the user applied 0050-0054, live testing (real magic-link sessions,
-- real RPC/table calls, checked by comparing DB state before/after rather
-- than trusting a thrown error alone) found TWO of the intended restrictions
-- did not actually take effect:
--
--   1. credit_wallet_balance_atomic (0052) — a plain authenticated test
--      account successfully called it directly and credited its own
--      wallet_balance by the requested amount (confirmed via a real
--      before/after balance read, not just absence of a thrown error).
--      This RPC should be service_role-only. Reverted the unauthorized
--      credit immediately after confirming it.
--   2. feature_flags (0053) — a plain authenticated test account
--      successfully updated a real `region = 'features_config'` row (got
--      back the updated row itself, not zero rows) despite 0053 intending
--      `is_admin()` to be required for that region.
--
-- Root cause unconfirmed (no direct SQL/catalog access to inspect
-- pg_policies/information_schema.routine_privileges from this environment)
-- — most likely one or both files hit a partial-application situation in
-- the Supabase SQL Editor (e.g. an early statement error silently stopping
-- the rest of that file's batch, or the DROP POLICY / REVOKE statements
-- specifically not landing while the CREATE FUNCTION / earlier statements
-- did). Rather than guess further, this migration re-asserts both fixes
-- idempotently (safe to run even if 0052/0053 actually did apply correctly
-- — every statement below is DROP-IF-EXISTS/REVOKE-then-GRANT, so re-running
-- it is a safe no-op in that case, not a double-fix risk).
-- =============================================================================

-- --- Re-assert: credit_wallet_balance_atomic is service_role-only ------------
REVOKE ALL ON FUNCTION credit_wallet_balance_atomic(UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION credit_wallet_balance_atomic(UUID, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION credit_wallet_balance_atomic(UUID, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION credit_wallet_balance_atomic(UUID, NUMERIC) TO service_role;

-- --- Re-assert: feature_flags region-scoped policies -------------------------
-- Explicitly drop every policy name this table has ever had across 0003,
-- 0012, and 0053 (not just 0053's own names), in case an earlier wide-open
-- policy from 0003/0012 is the one still live rather than 0053's replacement
-- having failed to create.
DROP POLICY IF EXISTS "Allow public full access on feature_flags" ON public.feature_flags;
DROP POLICY IF EXISTS "Allow updates on feature_flags" ON public.feature_flags;
DROP POLICY IF EXISTS "feature_flags_select_public" ON public.feature_flags;
DROP POLICY IF EXISTS "feature_flags_insert" ON public.feature_flags;
DROP POLICY IF EXISTS "feature_flags_update" ON public.feature_flags;
DROP POLICY IF EXISTS "feature_flags_delete_admin" ON public.feature_flags;

CREATE POLICY "feature_flags_select_public" ON public.feature_flags
FOR SELECT USING (true);

CREATE POLICY "feature_flags_insert" ON public.feature_flags
FOR INSERT WITH CHECK (region = 'mitra_registrations' OR is_admin());

CREATE POLICY "feature_flags_update" ON public.feature_flags
FOR UPDATE USING (region = 'mitra_registrations' OR is_admin())
WITH CHECK (region = 'mitra_registrations' OR is_admin());

CREATE POLICY "feature_flags_delete_admin" ON public.feature_flags
FOR DELETE USING (is_admin());

-- Defensive: confirm RLS is actually enabled on this table (if it were
-- somehow disabled, every policy above would be silently inert and every
-- row fully open regardless of policy content).
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- 1. As a plain authenticated (non-admin) test user:
--      supabase.rpc('credit_wallet_balance_atomic', { p_user_id: '<any id>', p_amount: 1 })
--    should now fail with a permission-denied error, AND the target's
--    wallet_balance must be confirmed unchanged by a direct before/after
--    read (not just "an error was thrown").
-- 2. Same user: supabase.from('feature_flags').update({features:{}})
--    .eq('region','features_config').select() should return an EMPTY array
--    (zero rows), not the updated row.
-- 3. Regression: a real mitra self-registration (UnauthorizedPage.jsx /
--    RegisterPage.jsx flow) touching region='mitra_registrations' should
--    still succeed. An admin session updating features_config via
--    frontend-admin/src/pages/FeatureFlagsPage.jsx should still succeed.
-- 4. Regression: both webhooks (backend/routes/midtrans.js,
--    backend/routes/mutasiku.js) calling credit_wallet_balance_atomic via
--    the service-role client should still succeed exactly as before.
-- =============================================================================
