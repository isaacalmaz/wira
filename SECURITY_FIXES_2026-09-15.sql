-- ============================================================================
-- Wira Super-App: Security Fixes Migration
-- Date: 2026-09-15
-- ============================================================================
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- Safe to run more than once (every statement is idempotent: DROP POLICY IF
-- EXISTS / CREATE OR REPLACE FUNCTION).
--
-- ============================================================================
-- ⚠️  READ THIS FIRST — ONE THING TO CHECK BEFORE RUNNING PART A ⚠️
-- ============================================================================
-- frontend-admin/src/context/AuthContext.jsx currently has a fallback: if
-- there's no real Supabase Auth session, it silently logs the visitor in as
-- a fake local "Superadmin" account (no real login happens). I found this
-- but deliberately did NOT remove it myself tonight, because I can't verify
-- whether a real Supabase Auth admin account exists anywhere for this
-- project — frontend-admin has no self-registration flow (unlike
-- frontend-mitra's driver/merchant/technician signup), so if no real admin
-- account exists yet, removing that fallback would lock you out of your own
-- admin dashboard with no way back in.
--
-- Part A below (approve_topup_request / reject_topup_request) adds a real
-- "caller must be an admin" check. If your admin dashboard is currently
-- running on that fake-login fallback (no real auth.uid()), Part A will
-- make the Approve/Reject buttons in FinancePage stop working, because
-- there's no real logged-in user for the check to authorize.
--
-- Before running Part A, log into https://wira-bj5r.vercel.app (or your
-- wira-admin domain) with a REAL email+password. If that fails / you don't
-- have one, first:
--   1. Create a real user in Supabase Dashboard -> Authentication -> Add User
--   2. Insert a matching row in public.users with role = 'admin' (or
--      'Superadmin') for that auth user's id
--   3. Only then run Part A
-- If you skip this, you can still run Part B (RLS tightening) safely on its
-- own — it doesn't depend on admin auth being fixed. Part A is the one that
-- needs it.
-- ============================================================================


-- ============================================================================
-- PART A — Critical: authorize approve_topup_request / reject_topup_request
-- ============================================================================
-- THE BUG: these two functions are SECURITY DEFINER (they run with elevated
-- privileges, bypassing RLS entirely) and have NO caller-authorization check
-- inside them at all. There's also no GRANT/REVOKE statement restricting who
-- can call them, so Supabase's default permissive behavior applies: ANY
-- caller - including a fully anonymous, logged-out visitor - can currently
-- call `supabase.rpc('approve_topup_request', { request_id: '<any pending
-- topup id>' })` directly (e.g. from browser devtools) and instantly credit
-- that request's amount into that user's wallet_balance, completely
-- bypassing the admin payment-proof review step this whole flow exists for.
-- This is a live, actively exploitable "print money" bug.
--
-- THE FIX: require the caller to be an authenticated user whose
-- public.users row has an admin-ish role, exactly like the RLS policy
-- pattern already used elsewhere in this project.

CREATE OR REPLACE FUNCTION approve_topup_request(request_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    req_amount NUMERIC;
    req_user_id UUID;
    req_status TEXT;
BEGIN
    -- Authorization check (this is the fix - everything else below is
    -- unchanged from the original function).
    IF NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops')
    ) THEN
        RETURN FALSE;
    END IF;

    SELECT amount, user_id, status INTO req_amount, req_user_id, req_status
    FROM public.topup_requests
    WHERE id = request_id
    FOR UPDATE;

    IF NOT FOUND OR req_status != 'pending' THEN
        RETURN FALSE;
    END IF;

    UPDATE public.topup_requests
    SET status = 'approved', updated_at = NOW()
    WHERE id = request_id;

    UPDATE public.users
    SET wallet_balance = COALESCE(wallet_balance, 0) + req_amount
    WHERE id = req_user_id;

    INSERT INTO public.transactions (user_id, amount, type, status, description)
    VALUES (req_user_id, req_amount, 'topup', 'success', 'Top Up QRIS Statis DANA');

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reject_topup_request(request_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    req_status TEXT;
BEGIN
    -- Authorization check (this is the fix).
    IF NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops')
    ) THEN
        RETURN FALSE;
    END IF;

    SELECT status INTO req_status
    FROM public.topup_requests
    WHERE id = request_id
    FOR UPDATE;

    IF NOT FOUND OR req_status != 'pending' THEN
        RETURN FALSE;
    END IF;

    UPDATE public.topup_requests
    SET status = 'rejected', updated_at = NOW()
    WHERE id = request_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- cancel_topup_request already checks `auth.uid() = req_user_id` (only when
-- auth.uid() is non-null) - it's fine as-is, not modified here. Included for
-- completeness/reference only, no functional change:
-- see setup_wallet.sql for its current definition.


-- ============================================================================
-- PART B — Tighten wide-open RLS policies on orders / merchants / topup_requests
-- ============================================================================
-- Current state (confirmed by reading the live policy SQL, not assumed):
--   orders:          "Allow public full access on orders" FOR ALL USING (true)
--   merchants:       "Allow public full access on merchants" FOR ALL USING (true)
--                     (coexists with a separate, fine, "public read" policy)
--   topup_requests:  "Admins can manage all topups" FOR ALL USING (true)
--                     (the other 3 topup_requests policies are already
--                      correctly scoped and are NOT touched here)
--
-- These were deliberate "simplify for now" shortcuts from earlier
-- development (see the literal comment "-- Simplify for now" next to the
-- topup_requests policy in setup_wallet.sql). This part replaces the three
-- wide-open policies with ones that match every real call site actually
-- used across frontend-user, frontend-admin, and frontend-mitra (mapped by
-- reading every .from('orders')/.from('merchants')/.from('topup_requests')
-- call in the codebase - see chat history for the full call-site audit).
--
-- IMPORTANT CAVEATS BAKED INTO THE DESIGN BELOW - READ BEFORE RUNNING:
--
-- 1. Guest checkout writes real rows to `orders` with user_id = NULL
--    (frontend-user/src/services/ecosystemService.js's createEcosystemOrder,
--    reached whenever OrderContext.addOrder runs with no logged-in session -
--    none of the order pages require login). The policy below allows
--    anonymous SELECT/INSERT only on rows where user_id IS NULL, which is
--    the only way to keep that guest flow (and guests being able to watch
--    their own order's status update in realtime) working. The tradeoff:
--    any anonymous visitor who knows/guesses a guest order's UUID can read
--    that order. If you'd rather require login for all ordering instead of
--    accepting that tradeoff, that's a product decision (add a
--    ProtectedRoute in frontend-user/src/App.jsx around the order pages) -
--    not something this SQL migration does.
--
-- 2. frontend-mitra's orderService.js has NO ownership filter at all in its
--    own query code for acceptOrder/updateOrderStatus (it relies entirely on
--    RLS as the enforcement layer) - so the mitra-facing policies below are
--    doing real enforcement work, not just defense-in-depth. Double-check
--    the driver/merchant/technician app flows still work end-to-end after
--    running this (accept an order, advance its status, complete it) before
--    considering this fully done.
--
-- 3. frontend-mitra/src/pages/merchant/MerchantEarningsPage.jsx currently
--    queries ALL service_type='food' orders with no merchant_id filter at
--    all (looks like a pre-existing app bug, not caused by this migration).
--    After this policy change, that page will start showing empty/wrong
--    data for merchants instead of silently over-sharing other merchants'
--    revenue - which surfaces the bug rather than hiding it, but the page
--    itself still needs a code fix (add .eq('merchant_id', merchantId)) to
--    actually work correctly. Not included in this SQL-only migration.
--
-- 4. Same admin-auth dependency as Part A: the admin-role policies below use
--    `EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN
--    (...))`. If frontend-admin is running on its demo-login fallback (see
--    the warning at the top of this file), auth.uid() will be NULL and
--    admin dashboard pages reading orders/merchants/topup_requests will
--    start returning empty results instead of real data.

-- --- orders ---------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public full access on orders" ON public.orders;

DROP POLICY IF EXISTS "orders_select_own_or_relevant" ON public.orders;
CREATE POLICY "orders_select_own_or_relevant" ON public.orders
FOR SELECT USING (
    -- customer: own orders (authenticated), or own guest orders (anon)
    auth.uid() = user_id
    OR (auth.uid() IS NULL AND user_id IS NULL)
    -- driver/technician: their claimed orders, plus the open unclaimed pool
    OR driver_id = auth.uid()
    OR (status = 'pending' AND driver_id IS NULL)
    -- merchant: orders belonging to a merchant they own
    OR merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
    -- admin: everything
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
);

DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
CREATE POLICY "orders_insert_own" ON public.orders
FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR (auth.uid() IS NULL AND user_id IS NULL)  -- guest checkout, see caveat 1 above
);

DROP POLICY IF EXISTS "orders_update_mitra_or_admin" ON public.orders;
CREATE POLICY "orders_update_mitra_or_admin" ON public.orders
FOR UPDATE USING (
    -- driver/technician claiming or progressing an order
    (status = 'pending' AND driver_id IS NULL)
    OR driver_id = auth.uid()
    -- merchant progressing their own order
    OR merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
    -- admin
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
);
-- No DELETE policy: no legitimate call site found anywhere for deleting
-- orders. If you need one later, add it explicitly.

-- --- merchants --------------------------------------------------------------
-- Public read policy already exists and is fine (browsing needs anon read);
-- only replacing the wide-open ALL policy.
DROP POLICY IF EXISTS "Allow public full access on merchants" ON public.merchants;

DROP POLICY IF EXISTS "merchants_insert_admin" ON public.merchants;
CREATE POLICY "merchants_insert_admin" ON public.merchants
FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
);

DROP POLICY IF EXISTS "merchants_update_owner_or_admin" ON public.merchants;
CREATE POLICY "merchants_update_owner_or_admin" ON public.merchants
FOR UPDATE USING (
    owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
);
-- Granted proactively even though no UPDATE call site exists in the app yet
-- (MerchantProfilePage.jsx visually implies "manage your listing" but the
-- form only updates public.users today, not public.merchants) - this way
-- that feature can ship without needing another RLS migration.

DROP POLICY IF EXISTS "merchants_delete_admin" ON public.merchants;
CREATE POLICY "merchants_delete_admin" ON public.merchants
FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
);

-- --- topup_requests ---------------------------------------------------------
-- The other 3 policies ("Users can read own topups", "Users can insert own
-- topups", "Users can cancel own pending topups", "Anyone can check pending
-- amounts") already match every real call site correctly - not touched.
-- Only replacing the wide-open admin policy.
DROP POLICY IF EXISTS "Admins can manage all topups" ON public.topup_requests;
CREATE POLICY "Admins can manage all topups" ON public.topup_requests
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
)
WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
);
-- Note: approve_topup_request/reject_topup_request RPCs are SECURITY
-- DEFINER and bypass this table's RLS entirely regardless - Part A's
-- in-function check is what actually protects those two paths, this policy
-- only covers FinancePage.jsx's direct SELECT (list all) and the raw
-- UPDATE fallback if the reject RPC errors.


-- ============================================================================
-- Verification queries - run these after the migration to sanity-check
-- ============================================================================
-- 1. Confirm the new policies exist:
--    SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE tablename IN ('orders', 'merchants', 'topup_requests')
--    ORDER BY tablename, policyname;
--
-- 2. As a real admin, confirm you can still see all orders:
--    (log into wira-admin, open OrdersPage - should show real data, not empty)
--
-- 3. As a real customer, place a test ride and confirm it still shows up in
--    ActivityPage and updates live when a driver accepts it.
--
-- 4. Confirm approve_topup_request now correctly refuses a non-admin caller:
--    it should return FALSE (not throw an error) when called by a customer.
