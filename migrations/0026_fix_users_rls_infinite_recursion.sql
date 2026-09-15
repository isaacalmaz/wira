-- URGENT FIX for a bug introduced by 0025, caught immediately by live
-- re-verification after applying it: every policy that checked "is the
-- caller an admin?" via `EXISTS (SELECT 1 FROM public.users WHERE id =
-- auth.uid() AND role IN (...))`, written directly as an RLS POLICY
-- expression (not inside a SECURITY DEFINER function, which bypasses RLS
-- and is unaffected), causes Postgres to detect infinite recursion the
-- moment `public.users` itself has RLS enabled with a policy of that same
-- shape (0025) — because evaluating the subquery re-triggers users' own
-- policy, which contains the same subquery, forever. Confirmed live: after
-- applying 0025, ALL access to public.users started failing with
-- "infinite recursion detected in policy for relation users" — for
-- everyone, not just anon (signup, admin dashboard, wallet balance display
-- were all broken, not just the anonymous-read hole being closed).
--
-- THE FIX: a SECURITY DEFINER helper function. Calling it still checks
-- `public.users.role`, but the SELECT inside a SECURITY DEFINER function
-- runs as the function owner and does not itself trigger RLS — breaking
-- the cycle. This is the standard, documented pattern for role checks that
-- reference the same table they're used to protect.
--
-- Every policy across 0023/0024/0025 that used the inline EXISTS form is
-- re-created here (idempotent DROP+CREATE, same names) to use is_admin()
-- instead. Nothing else about their logic changes.

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- --- public.users (0025) ---------------------------------------------------
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
    OR (auth.uid() IS NULL AND id IN (
        SELECT o.driver_id FROM public.orders o WHERE o.driver_id IS NOT NULL AND o.user_id IS NULL
    ))
);

DROP POLICY IF EXISTS "users_insert" ON public.users;
CREATE POLICY "users_insert" ON public.users
FOR INSERT WITH CHECK (
    auth.uid() = id
    OR is_admin()
);

DROP POLICY IF EXISTS "users_update" ON public.users;
CREATE POLICY "users_update" ON public.users
FOR UPDATE USING (
    auth.uid() = id
    OR is_admin()
);

-- --- public.orders (0024) ---------------------------------------------------
DROP POLICY IF EXISTS "orders_select_own_or_relevant" ON public.orders;
CREATE POLICY "orders_select_own_or_relevant" ON public.orders
FOR SELECT USING (
    auth.uid() = user_id
    OR (auth.uid() IS NULL AND user_id IS NULL)
    OR driver_id = auth.uid()
    OR (status = 'pending' AND driver_id IS NULL)
    OR merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
    OR is_admin()
);

DROP POLICY IF EXISTS "orders_update_mitra_or_admin" ON public.orders;
CREATE POLICY "orders_update_mitra_or_admin" ON public.orders
FOR UPDATE USING (
    (status = 'pending' AND driver_id IS NULL)
    OR driver_id = auth.uid()
    OR merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
    OR is_admin()
);

-- --- public.merchants (0024) -------------------------------------------------
DROP POLICY IF EXISTS "merchants_insert_admin" ON public.merchants;
CREATE POLICY "merchants_insert_admin" ON public.merchants
FOR INSERT WITH CHECK (is_admin());

DROP POLICY IF EXISTS "merchants_update_owner_or_admin" ON public.merchants;
CREATE POLICY "merchants_update_owner_or_admin" ON public.merchants
FOR UPDATE USING (
    owner_id = auth.uid()
    OR is_admin()
);

DROP POLICY IF EXISTS "merchants_delete_admin" ON public.merchants;
CREATE POLICY "merchants_delete_admin" ON public.merchants
FOR DELETE USING (is_admin());

-- --- public.topup_requests (0024) --------------------------------------------
DROP POLICY IF EXISTS "Admins can manage all topups" ON public.topup_requests;
CREATE POLICY "Admins can manage all topups" ON public.topup_requests
FOR ALL USING (is_admin())
WITH CHECK (is_admin());

-- --- public.transactions (0023) ----------------------------------------------
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;
CREATE POLICY "Admins can view all transactions" ON public.transactions
FOR SELECT USING (is_admin());

-- --- Also fix list_technicians() (0025): live columns are varchar, not
-- text, same class of bug as 0018's original type mismatch. ------------------
CREATE OR REPLACE FUNCTION list_technicians()
RETURNS TABLE (id UUID, name TEXT, email TEXT, phone TEXT, avatar_url TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT u.id, u.name::TEXT, u.email::TEXT, u.phone::TEXT, u.avatar_url::TEXT
    FROM public.users u
    WHERE u.mitra_access IS NOT NULL
      AND u.mitra_access::text ILIKE '%technician%';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Verification queries — run after applying
-- ============================================================
-- 1. supabase.from('users').select('*') with the anon key should now
--    return an empty array (NOT an "infinite recursion" error).
-- 2. Sign up a fresh test account end-to-end — should succeed with no
--    error, and a public.users row should exist for it afterward.
-- 3. As the real admin account, load frontend-admin's Users/Drivers/
--    Finance pages — should show real data again.
-- 4. supabase.rpc('list_technicians') with the anon key should return
--    real rows, no error.
