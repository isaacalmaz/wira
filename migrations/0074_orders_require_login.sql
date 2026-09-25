-- =============================================================================
-- Migration 0074: require a logged-in user to create orders
-- (security fix - closes anonymous order spam)
-- =============================================================================
--
-- THE HOLE
-- --------
-- 0024's orders_insert_own allowed `auth.uid() IS NULL AND user_id IS NULL`
-- for a "guest checkout" flow. Anyone holding the public anon key (shipped in
-- every frontend bundle) could therefore INSERT orders with no account.
-- Those rows are 'pending' + unassigned, so they show in every driver's job
-- feed (orders SELECT policy) and are picked up by server-side dispatch
-- (0072/0073), which sends real push notifications to real drivers. That is
-- a free spam/harassment channel. No money is at stake (0070 forces such
-- rows to 'unpaid' and wallet orders need create_order_and_pay, which anon
-- cannot execute).
--
-- WHY IT IS SAFE TO CLOSE
-- -----------------------
-- Guest checkout is not reachable in the app: every order page (ride, send,
-- service, pool, villa, restaurant) is nested under Layout.jsx, which
-- redirects to /login when there is no session. The guest branch in
-- OrderContext.addOrder only ran when a session expired mid-page, and it is
-- removed in the same commit. The logged-in path (user_id = auth.uid()) is
-- unchanged, so this can be applied before or after the frontend deploy.
--
-- REVOKE INSERT FROM anon (defense in depth)
-- ------------------------------------------
-- anon's INSERT privilege on orders was never granted by a migration; it
-- comes from Supabase's default table grants. Nothing needs it: the only
-- client insert paths are OrderContext's direct insert (authenticated) and
-- create_order_and_pay (SECURITY INVOKER, EXECUTE granted to authenticated
-- only, 0070). Triggers that mention 'anon' (0051/0054/0059/0065/0070) only
-- use it to decide when to apply their checks. Backend/service_role and
-- SECURITY DEFINER code run as other roles and are unaffected. anon keeps
-- SELECT/UPDATE exactly as before (not touched here).
--
-- Existing user_id IS NULL rows are left alone (0024's SELECT branch for
-- them also stays; old ones age out of dispatch after 30 minutes).

DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
CREATE POLICY "orders_insert_own" ON public.orders
FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND auth.uid() = user_id
);

REVOKE INSERT ON public.orders FROM anon;

-- =============================================================================
-- VERIFICATION (run in the SQL Editor after applying)
-- =============================================================================
-- 1. Policy text:
--      SELECT policyname, cmd, with_check FROM pg_policies
--      WHERE tablename = 'orders' AND cmd IN ('INSERT', 'ALL');
--    Expect ONLY orders_insert_own for INSERT (no ALL policy), with_check
--    = ((auth.uid() IS NOT NULL) AND (auth.uid() = user_id)).
-- 2. Grant:
--      SELECT has_table_privilege('anon', 'public.orders', 'INSERT');
--    Expect false.
-- 3. Anonymous insert is rejected (rolled back either way):
--      BEGIN; SET LOCAL ROLE anon;
--      INSERT INTO public.orders (service_type, title, status, total_price,
--        payment_method, payment_status)
--      VALUES ('ride', 'x', 'pending', 0, 'cash', 'unpaid');
--      ROLLBACK;
--    Expect "permission denied for table orders".
-- 4. In the app, a logged-in customer can still place a Tunai ride order
--    and a WiraPay order.
