-- Re-enables RLS on public.users, disabled entirely since
-- 0006_users_rls_disable.sql (an "MVP admin-portal workaround") and never
-- turned back on. Confirmed live: with RLS off, anyone holding the public
-- anon key — no login required — could read every user's name, phone,
-- email, role, and wallet_balance.
--
-- Every real .from('users') call site across frontend-user, frontend-admin,
-- and frontend-mitra was mapped before writing this (see chat history for
-- the full call-site audit) so this doesn't just close the hole, it also
-- keeps every legitimate cross-user read working:
--   - a driver/merchant/technician reading the name of the customer on an
--     order assigned to them (chat, order cards)
--   - a customer reading the driver assigned to their own order (incl.
--     guest checkout, which has no session to scope to "my order" any
--     tighter than "a guest order" — same tradeoff already accepted for
--     the orders table itself in 0024)
--   - an admin (real public.users.role, not the spoofable Supabase Auth
--     user_metadata frontend-admin also happens to read) reading/writing
--     any row — this is the ONLY real enforcement boundary behind most of
--     frontend-admin's pages, which do not check role beyond that spoofable
--     client claim
--   - a new user's own signup INSERT (confirmed live: this project has
--     mailer_autoconfirm=true, so a session — and auth.uid() — already
--     exists at the moment frontend-user's signup flow inserts the row)
--   - admin's approve-mitra-application flow, which inserts a new row with
--     someone else's auth id
--
-- One real call site (frontend-user/src/pages/ServicePage.jsx's technician
-- directory) did an anonymous, unauthenticated `select('*')` over the
-- entire table — the single widest hole found. RLS can't restrict this to
-- a safe column subset (RLS is row-level, not column-level) without either
-- breaking the feature or re-opening the leak, so it's fixed in code
-- instead: a narrow SECURITY DEFINER RPC (list_technicians, below) returns
-- only the columns that page actually needs, for technician rows only.
-- ServicePage.jsx now calls it instead of reading the table directly.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select" ON public.users
FOR SELECT USING (
    -- own row
    auth.uid() = id
    -- admin: full read of any row
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
    -- driver/technician/merchant reading the customer on an order assigned to them
    OR id IN (
        SELECT o.user_id FROM public.orders o
        WHERE o.user_id IS NOT NULL AND (
            o.driver_id = auth.uid()
            OR o.merchant_id IN (SELECT m.id FROM public.merchants m WHERE m.owner_id = auth.uid())
        )
    )
    -- customer reading the driver assigned to their own order
    OR id IN (
        SELECT o.driver_id FROM public.orders o
        WHERE o.driver_id IS NOT NULL AND o.user_id = auth.uid()
    )
    -- guest (no session) reading the driver assigned to a guest order — see
    -- header comment; matches the tradeoff already accepted in 0024 for the
    -- orders table itself.
    OR (auth.uid() IS NULL AND id IN (
        SELECT o.driver_id FROM public.orders o WHERE o.driver_id IS NOT NULL AND o.user_id IS NULL
    ))
);

DROP POLICY IF EXISTS "users_insert" ON public.users;
CREATE POLICY "users_insert" ON public.users
FOR INSERT WITH CHECK (
    -- self-signup (session exists at insert time — mailer_autoconfirm=true)
    auth.uid() = id
    -- admin approving a mitra application (inserts a row with someone
    -- else's auth id)
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
);

DROP POLICY IF EXISTS "users_update" ON public.users;
CREATE POLICY "users_update" ON public.users
FOR UPDATE USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
);
-- No DELETE policy: no call site found that deletes users rows.

-- --- Narrow technician directory, replacing ServicePage.jsx's anonymous
-- full-table select('*') ---------------------------------------------------
CREATE OR REPLACE FUNCTION list_technicians()
RETURNS TABLE (id UUID, name TEXT, email TEXT, phone TEXT, avatar_url TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT u.id, u.name, u.email, u.phone, u.avatar_url
    FROM public.users u
    WHERE u.mitra_access IS NOT NULL
      AND u.mitra_access::text ILIKE '%technician%';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Verification queries — run after applying
-- ============================================================
-- 1. Anon key should no longer be able to read arbitrary rows:
--    supabase.from('users').select('*') with the anon key, no session,
--    should return an empty array (or only guest-order-driver rows).
-- 2. Sign up a fresh test account end-to-end — the public.users row must
--    still get created (confirms the INSERT policy's timing assumption).
-- 3. As a real driver, confirm the customer's name still shows on an
--    active order's chat/order card.
-- 4. As a real customer, confirm the assigned driver's name/phone still
--    shows once a ride is accepted.
-- 5. /service page (WiraService) should still list real technicians for
--    both logged-in and logged-out visitors.
-- 6. As admin, confirm UsersPage/DriversPage/FinancePage still show real
--    data, and the approve-mitra-application flow still works.
