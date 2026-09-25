-- Migration 0079: close data leaks to the public anon key (security fix).
-- Found live with only the anon key that ships in every frontend bundle:
--  a) users: a full row (email, phone, fcm_token, wallet/payable balance)
--     of every driver who served a guest order - 0026's users_select
--     branch `auth.uid() IS NULL AND id IN (drivers of user_id IS NULL
--     orders)`.
--  b) orders: guest orders (0032 `auth.uid() IS NULL AND user_id IS NULL`),
--     AND every unassigned pending/ready order of real customers (pickup/
--     dropoff coordinates, details): the job-feed branches never required
--     a login. orders_update_mitra_or_admin (0028) has the same branches,
--     so anon could also edit e.g. title/details of those orders (moving
--     them out of pending/unassigned is still refused by that policy).
--  c) topup_requests: 0015's "Anyone can check pending amounts" let anyone
--     read user_id/amount (now also order_id) of every pending top-up. The
--     app checks free unique codes via get_pending_topup_codes (SECURITY
--     DEFINER, amounts only) and the DB re-rolls colliding amounts (0045).
-- Guest checkout is gone since 0074, so no app flow uses any of this.
-- Every branch for logged-in users is kept exactly as it was.

-- --- a) users -----------------------------------------------------------
DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select" ON public.users
FOR SELECT USING (
    auth.uid() = id
    OR is_admin()
    OR id IN (
        SELECT o.user_id FROM public.orders o
        WHERE o.user_id IS NOT NULL AND (
            o.driver_id = auth.uid()
            OR o.merchant_id IN (SELECT m.id FROM public.merchants m WHERE m.owner_id = auth.uid())
        )
    )
    OR id IN (
        SELECT o.driver_id FROM public.orders o
        WHERE o.driver_id IS NOT NULL AND o.user_id = auth.uid()
    )
);

-- --- b) orders ----------------------------------------------------------
DROP POLICY IF EXISTS "orders_select_own_or_relevant" ON public.orders;
CREATE POLICY "orders_select_own_or_relevant" ON public.orders
FOR SELECT USING (
    auth.uid() = user_id
    OR driver_id = auth.uid()
    OR (auth.uid() IS NOT NULL AND status = 'pending' AND driver_id IS NULL)
    OR (auth.uid() IS NOT NULL AND status = 'ready' AND driver_id IS NULL AND merchant_id IS NOT NULL)
    OR merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
    OR is_admin()
);

DROP POLICY IF EXISTS "orders_update_mitra_or_admin" ON public.orders;
CREATE POLICY "orders_update_mitra_or_admin" ON public.orders
FOR UPDATE USING (
    (auth.uid() IS NOT NULL AND status = 'pending' AND driver_id IS NULL)
    OR (auth.uid() IS NOT NULL AND status = 'ready' AND driver_id IS NULL AND merchant_id IS NOT NULL)
    OR driver_id = auth.uid()
    OR merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
    OR is_admin()
);

-- --- c) topup_requests --------------------------------------------------
DROP POLICY IF EXISTS "Anyone can check pending amounts" ON public.topup_requests;

-- --- Defense in depth: anon has no business with these tables at all ------
-- (these privileges only come from Supabase's default grants; the apps
-- read them only after login, and backend/SECURITY DEFINER code runs as
-- other roles). Policies above stay correct even if a grant comes back.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.users FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.orders FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.topup_requests FROM anon;

-- Verify with the anon key after applying (all must be permission denied):
--   GET /rest/v1/users?select=id, /rest/v1/orders?select=id,
--   /rest/v1/topup_requests?select=id
