-- Replaces wide-open `USING (true)` RLS policies on orders / merchants /
-- topup_requests with policies scoped to every real call site in the app
-- (mapped by reading every .from('orders')/.from('merchants')/
-- .from('topup_requests') call across frontend-user, frontend-admin,
-- frontend-mitra). These were deliberate "simplify for now" shortcuts from
-- early development (see the literal "-- Simplify for now" comment next to
-- the topup_requests policy in the original setup_wallet.sql).
--
-- IMPORTANT CAVEATS — read before applying:
--
-- 1. Guest checkout writes real `orders` rows with user_id = NULL
--    (ecosystemService.js's createEcosystemOrder, reached whenever
--    OrderContext.addOrder runs with no logged-in session — none of the
--    order pages require login). The policy below allows anonymous
--    SELECT/INSERT only on rows where user_id IS NULL, which is the only
--    way to keep that guest flow (and guests watching their own order's
--    status update live) working. Tradeoff: an anonymous visitor who
--    knows/guesses a guest order's UUID can read that order. Requiring
--    login for all ordering instead is a separate product decision, not
--    something this migration does.
--
-- 2. frontend-mitra's orderService.js has NO ownership filter in its own
--    query code for acceptOrder/updateOrderStatus — it relies entirely on
--    RLS as the enforcement layer, so the mitra-facing policies below are
--    doing real enforcement work, not just defense-in-depth. Verify the
--    driver/merchant/technician flows (accept an order, advance its
--    status, complete it) still work end-to-end after applying this.
--
-- 3. frontend-mitra/src/pages/merchant/MerchantEarningsPage.jsx currently
--    queries ALL service_type='food' orders with no merchant_id filter —
--    a pre-existing app bug, not caused by this migration. After this
--    policy change that page will show empty/wrong data for merchants
--    instead of silently over-sharing other merchants' revenue (surfaces
--    the bug rather than hiding it). The page itself still needs a code
--    fix (add .eq('merchant_id', merchantId)) — not done here.
--
-- 4. The admin-role policies below use `EXISTS (SELECT 1 FROM public.users
--    WHERE id = auth.uid() AND role IN (...))`, same pattern as 0022/0023.
--    A real admin account with a matching public.users role was confirmed
--    live before applying 0022 — same account covers this migration.

-- --- orders ---------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public full access on orders" ON public.orders;

DROP POLICY IF EXISTS "orders_select_own_or_relevant" ON public.orders;
CREATE POLICY "orders_select_own_or_relevant" ON public.orders
FOR SELECT USING (
    auth.uid() = user_id
    OR (auth.uid() IS NULL AND user_id IS NULL)
    OR driver_id = auth.uid()
    OR (status = 'pending' AND driver_id IS NULL)
    OR merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
);

DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
CREATE POLICY "orders_insert_own" ON public.orders
FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR (auth.uid() IS NULL AND user_id IS NULL)  -- guest checkout, see caveat 1
);

DROP POLICY IF EXISTS "orders_update_mitra_or_admin" ON public.orders;
CREATE POLICY "orders_update_mitra_or_admin" ON public.orders
FOR UPDATE USING (
    (status = 'pending' AND driver_id IS NULL)
    OR driver_id = auth.uid()
    OR merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
);
-- No DELETE policy: no legitimate call site found for deleting orders.

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

DROP POLICY IF EXISTS "merchants_delete_admin" ON public.merchants;
CREATE POLICY "merchants_delete_admin" ON public.merchants
FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
);

-- --- topup_requests ---------------------------------------------------------
-- The other 3 policies ("Users can read own topups", "Users can insert own
-- topups", "Users can cancel own pending topups", "Anyone can check pending
-- amounts") already match every real call site correctly — not touched.
DROP POLICY IF EXISTS "Admins can manage all topups" ON public.topup_requests;
CREATE POLICY "Admins can manage all topups" ON public.topup_requests
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
)
WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
);
-- Note: approve_topup_request/reject_topup_request are SECURITY DEFINER and
-- bypass this table's RLS regardless — 0022's in-function check is what
-- actually protects those two paths. This policy only covers FinancePage's
-- direct SELECT (list all) and the raw UPDATE fallback if the reject RPC
-- errors.

-- ============================================================
-- Verification queries — run after applying
-- ============================================================
-- 1. SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE tablename IN ('orders', 'merchants', 'topup_requests')
--    ORDER BY tablename, policyname;
-- 2. As a real admin, confirm OrdersPage in frontend-admin still shows real
--    data (not empty).
-- 3. As a real customer, place a test ride and confirm it still shows up in
--    ActivityPage and updates live when a driver accepts it.
-- 4. As a real driver, confirm you can still see + accept + advance a
--    pending order end-to-end.
