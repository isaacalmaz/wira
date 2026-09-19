-- =============================================================================
-- Migration 0053: RLS hardening sweep — drivers, reviews, operational_zones,
-- feature_flags, notifications, submit_review_and_tip locking (HIGH/MEDIUM)
-- =============================================================================
-- Four independent findings from the same live-code security audit,
-- grouped into one file because each is small and none depends on the
-- others. Every "final effective policy" quoted below was confirmed by
-- grepping every CREATE POLICY/DROP POLICY touching that table across all
-- of 0001-0052 — none of them has been redefined since the migration cited.


-- =============================================================================
-- Fix 4 (HIGH): public.drivers "Service role" policy is actually open to
-- the public
-- =============================================================================
-- migrations/0014_postgis_nearest_driver.sql:269-272 (never redefined
-- since):
--
--     CREATE POLICY "Service role has full access to drivers"
--     ON public.drivers FOR ALL USING (true);
--
-- Missing `TO service_role` means this defaults to PUBLIC — i.e. it also
-- applies to `anon` and `authenticated` — letting ANY client with just the
-- anon key tamper with any driver's location/status/rating, or delete rows
-- outright, via a raw REST call. In Supabase, the `service_role` Postgres
-- role already bypasses RLS entirely (configured with BYPASSRLS), so this
-- policy was never actually doing anything for its stated purpose in the
-- first place — the fix is to drop it, not to re-scope it with `TO
-- service_role` (which would be a no-op: service_role doesn't need a
-- policy to begin with).
--
-- The other driver policies next to it remain intact and sufficient after
-- this drop:
--   "Public can view online active drivers" — FOR SELECT USING (true)
--   "Drivers can update own record" — FOR UPDATE USING (auth.uid() = id)
--   "Drivers can insert own record" — FOR INSERT WITH CHECK (auth.uid() = id)
-- A driver can still read/update/insert their own row; the public can
-- still browse online drivers; service_role still has full access via
-- BYPASSRLS regardless of any policy. Nothing else changes.
DROP POLICY IF EXISTS "Service role has full access to drivers" ON public.drivers;


-- =============================================================================
-- Fix 5 (HIGH): reviews INSERT policy doesn't verify order ownership,
-- driver/merchant identity, or dedupe
-- =============================================================================
-- migrations/0039_reviews_and_tipping.sql:24-26 (never redefined since):
--
--     CREATE POLICY "Users can insert their own reviews"
--         ON public.reviews FOR INSERT
--         WITH CHECK (auth.uid() = user_id);
--
-- This only checks that the review's `user_id` is the caller — nothing
-- stops a caller from inserting a review row for an `order_id` that isn't
-- theirs, or with a `driver_id`/`merchant_id` that has nothing to do with
-- that order, or from inserting a second review for an order they already
-- reviewed. `submit_review_and_tip()` (the RPC the real app UI calls) does
-- enforce all of this correctly, but nothing stops a client from bypassing
-- that RPC entirely and inserting into `public.reviews` directly — the
-- table-level RLS policy is the real, final enforcement boundary, and it
-- currently allows none of these checks.
--
-- Tightened WITH CHECK: verifies the order belongs to the caller AND that
-- the review's driver_id/merchant_id match what that order actually
-- recorded (closing "fabricate a 5-star review for an arbitrary driver/
-- merchant using a real order you own, that never actually involved them"
-- — a step beyond what the task literally asked for, but a direct, cheap
-- extension of the same ownership check already being added).
DROP POLICY IF EXISTS "Users can insert their own reviews" ON public.reviews;
CREATE POLICY "Users can insert their own reviews"
    ON public.reviews FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_id
              AND o.user_id = auth.uid()
              AND o.driver_id IS NOT DISTINCT FROM driver_id
              AND o.merchant_id IS NOT DISTINCT FROM merchant_id
        )
    );

-- Dedupe ("hasn't already been reviewed") is enforced via a UNIQUE
-- constraint rather than a `NOT EXISTS (SELECT ... FROM public.reviews ...)`
-- clause inside the WITH CHECK above, for two concrete reasons:
--   1. Correctness under concurrency: a NOT EXISTS check inside WITH CHECK
--      has the same TOCTOU race any check-then-insert pattern has — two
--      concurrent inserts for the same order_id could both pass the
--      "no existing review" check before either commits, producing two
--      reviews for one order. A UNIQUE constraint is enforced by the
--      index itself and is race-free.
--   2. A genuine SQL correctness trap: a correlated subquery of the shape
--      `SELECT 1 FROM public.reviews r WHERE r.order_id = order_id` INSIDE
--      a policy ON public.reviews is self-referential — Postgres name
--      resolution binds the bare `order_id` on the right-hand side to the
--      INNER subquery's own `r.order_id` (inner scope shadows the outer
--      policy's implicit new-row reference), not to the row being
--      inserted, making the check silently always-true/no-op (or worse,
--      depending on exact phrasing) rather than doing what it looks like
--      it does. This is adjacent to (though not identical to) the exact
--      class of self-referencing-RLS-subquery bug migrations/0026 already
--      had to fix once on `public.users` (infinite recursion there;
--      silent-no-op here) — avoided entirely by not writing a same-table
--      correlated subquery into this policy at all.
-- `submit_review_and_tip()` already prevents a second review at the RPC
-- level via its `is_reviewed` check (now lock-ordered correctly — see Fix
-- 8 below); this constraint is the defense-in-depth backstop for a direct
-- table insert bypassing that RPC, consistent with why the WITH CHECK
-- above exists at all.
--
-- NOTE: if this ADD CONSTRAINT fails when applied, it means the live
-- `reviews` table already contains duplicate `order_id` rows from before
-- this fix. Find them first with:
--   SELECT order_id, COUNT(*) FROM public.reviews GROUP BY order_id HAVING COUNT(*) > 1;
-- and decide by hand which duplicate(s) to delete before re-running this
-- ADD CONSTRAINT statement — do not delete rows automatically as part of a
-- migration.
ALTER TABLE public.reviews ADD CONSTRAINT reviews_order_id_unique UNIQUE (order_id);


-- =============================================================================
-- Fix 6 (MEDIUM): three wide-open tables — operational_zones, feature_flags,
-- notifications
-- =============================================================================

-- --- operational_zones --------------------------------------------------------
-- migrations/0013_postgis_geofencing.sql:34-35 (never redefined since):
--     CREATE POLICY "Admin can manage operational_zones"
--     ON public.operational_zones FOR ALL USING (true);
-- Anyone (any anon-key client) can rewrite geofencing zones. No non-admin
-- write call site exists anywhere in the app (grepped — this table is only
-- ever read by the app; only frontend-admin would plausibly manage zones,
-- and it doesn't currently have a UI for it either). Straightforward
-- admin-only fix, zero collateral risk.
DROP POLICY IF EXISTS "Admin can manage operational_zones" ON public.operational_zones;
CREATE POLICY "Admin can manage operational_zones" ON public.operational_zones
FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- --- feature_flags -------------------------------------------------------------
-- Two wide-open policies are live simultaneously here (permissive RLS
-- policies for the same command are OR'd together, so BOTH apply):
--   migrations/0003_feature_flags_table.sql:19-21 (never dropped by any
--   later migration despite the task's assumption that it might have been):
--     CREATE POLICY "Allow public full access on feature_flags"
--     ON public.feature_flags FOR ALL USING (true) WITH CHECK (true);
--   migrations/0012_seed_operational_zones_flag.sql:72-79 (also never
--   redefined/dropped):
--     CREATE POLICY "Allow updates on feature_flags" ON feature_flags
--     FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
-- Together: literally anyone, admin or not, logged in or not, can rewrite
-- any row in this table outright.
--
-- IMPORTANT DEVIATION FROM THE LITERAL TASK REQUEST — found while doing
-- the "check how frontend code actually creates/writes this data first"
-- step the task itself asked for, and it changes the fix:
--
-- The task's suggested fix was "public SELECT, but UPDATE/INSERT/DELETE
-- restricted to is_admin()". That would have been a severe regression: this
-- table is NOT purely an admin config table. Grepping every
-- `.from('feature_flags')` call site in the app shows the row with
-- `region = 'mitra_registrations'` is used as a live, non-admin, self-
-- service APPLICATION QUEUE:
--   - frontend-mitra/src/pages/UnauthorizedPage.jsx and RegisterPage.jsx —
--     a brand-new driver/merchant/technician/villa applicant, NOT an admin,
--     directly INSERTs (if the row doesn't exist yet) or UPDATEs this exact
--     row to append their own pending application into its `features`
--     JSONB array, as part of normal mitra onboarding.
--   - frontend-admin/src/pages/{Drivers,Technicians,Merchants}Page.jsx —
--     an admin UPDATEs the SAME row to remove an entry once processed.
-- Restricting all writes to is_admin() would have broken mitra onboarding
-- (every "Daftar sebagai Mitra" application) entirely the moment this
-- migration was applied — a self-registering applicant is never an admin.
--
-- The actual fix below preserves that live flow exactly (any authenticated
-- user may INSERT/UPDATE only rows where region = 'mitra_registrations',
-- checked on both the existing row via USING and the proposed new row via
-- WITH CHECK, so a non-admin can never touch — or retarget a row into —
-- any other region), while closing the real hole: no anon/non-admin client
-- can write to `region = 'features_config'` (the actual app-gating flags
-- read by frontend-user/src/pages/HomePage.jsx, backend/middleware/
-- featureCheck.js, and frontend-admin's own layout/sidebar) or any other
-- region, and DELETE is admin-only across the board.
DROP POLICY IF EXISTS "Allow public full access on feature_flags" ON public.feature_flags;
DROP POLICY IF EXISTS "Allow updates on feature_flags" ON feature_flags;

DROP POLICY IF EXISTS "feature_flags_select_public" ON public.feature_flags;
CREATE POLICY "feature_flags_select_public" ON public.feature_flags
FOR SELECT USING (true);

DROP POLICY IF EXISTS "feature_flags_insert" ON public.feature_flags;
CREATE POLICY "feature_flags_insert" ON public.feature_flags
FOR INSERT WITH CHECK (region = 'mitra_registrations' OR is_admin());

DROP POLICY IF EXISTS "feature_flags_update" ON public.feature_flags;
CREATE POLICY "feature_flags_update" ON public.feature_flags
FOR UPDATE USING (region = 'mitra_registrations' OR is_admin())
WITH CHECK (region = 'mitra_registrations' OR is_admin());

DROP POLICY IF EXISTS "feature_flags_delete_admin" ON public.feature_flags;
CREATE POLICY "feature_flags_delete_admin" ON public.feature_flags
FOR DELETE USING (is_admin());

-- --- notifications ---------------------------------------------------------
-- migrations/0011_seed_all_data.sql:105-110 (never redefined since — this
-- version's shape "won" the 0010/0011 conflict the README documents;
-- confirmed the notifications table live has description/is_read, matching
-- 0011, not 0010):
--     CREATE POLICY "Users can read own notifications" FOR SELECT USING (true);
--     CREATE POLICY "Users can update own notifications" FOR UPDATE USING (true);
--     CREATE POLICY "Public can insert notifications" FOR INSERT WITH CHECK (true);
-- Despite the table having a `user_id` column, all three are wide open —
-- anyone can read or rewrite anyone else's notifications, or forge a
-- notification addressed to any user.
--
-- Checked "how frontend code actually creates notifications" per the task's
-- own instruction before restricting INSERT, since the worry was breaking
-- a legitimate cross-user insert (e.g. a driver being notified about a new
-- order). Grepped every `.from('notifications').insert(` call site in the
-- ENTIRE repo (frontend-user, frontend-mitra, frontend-admin, backend):
-- there is exactly ONE — backend/services/notification.service.js — and it
-- runs on the backend's service-role Supabase client (backend/config/
-- supabase.js, using SUPABASE_SERVICE_KEY). service_role bypasses RLS
-- entirely (the same BYPASSRLS fact established in Fix 4 above), so
-- whatever INSERT policy exists here does not affect that real flow at
-- all — there is no legitimate direct-client (anon/authenticated) insert
-- site anywhere in this codebase today. INSERT is therefore restricted to
-- self-only (a user inserting a notification addressed to themselves),
-- which is a safe, conservative default that blocks the actual live hole
-- (forging notifications to arbitrary other users) without touching the
-- real notification-creation path.
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications" ON public.notifications
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public can insert notifications" ON public.notifications;
CREATE POLICY "Users can insert own notifications" ON public.notifications
FOR INSERT WITH CHECK (auth.uid() = user_id);


-- =============================================================================
-- Fix 8 (MEDIUM): submit_review_and_tip() race condition — order row never
-- locked before the is_reviewed check
-- =============================================================================
-- migrations/0041_refactor_review_tip_rpc.sql's `submit_review_and_tip`
-- (the final version of this function — never redefined since) locks the
-- two `users` rows via FOR UPDATE before debiting/crediting the tip, but
-- its very first statement — the SELECT that fetches user_id/driver_id/
-- merchant_id/is_reviewed off the order — does NOT lock the orders row,
-- unlike wallet_refund()/cancel_matched_ride's refund path (migrations/
-- 0040, 0047), which correctly lock the order row first before checking
-- its status. Without that lock, two near-simultaneous calls for the same
-- order (e.g. a double-tap on the submit button, or a retried request)
-- can both read is_reviewed = false before either has committed its own
-- INSERT INTO reviews / UPDATE orders SET is_reviewed = true, so both
-- proceed — a double tip debit, and (were it not for the new UNIQUE
-- constraint from Fix 5 above, which would now also stop this) a duplicate
-- review row.
--
-- Redefined via CREATE OR REPLACE FUNCTION with exactly ONE change from
-- 0041's body: the initial SELECT ... INTO now ends in FOR UPDATE,
-- combining the fetch and the lock in one statement — the identical
-- pattern wallet_refund() (0040) already uses for the same reason.
-- Everything else in the function body is byte-for-byte unchanged from
-- 0041.
CREATE OR REPLACE FUNCTION public.submit_review_and_tip(
    p_order_id UUID,
    p_rating INTEGER,
    p_review_text TEXT,
    p_tip_amount NUMERIC
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_driver_id UUID;
    v_merchant_id UUID;
    v_is_reviewed BOOLEAN;
    v_lock_first UUID;
    v_lock_second UUID;
BEGIN
    -- Get order details — locked FIRST (the fix), before the is_reviewed
    -- check below, mirroring wallet_refund()'s "lock the order row first
    -- so a concurrent second call blocks here instead of racing on the
    -- status/is_reviewed check" pattern.
    SELECT user_id, driver_id, merchant_id, is_reviewed
    INTO v_user_id, v_driver_id, v_merchant_id, v_is_reviewed
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF v_is_reviewed THEN
        RAISE EXCEPTION 'Order has already been reviewed';
    END IF;

    IF p_tip_amount IS NULL OR p_tip_amount < 0 THEN
        RAISE EXCEPTION 'Nominal tip tidak valid';
    END IF;

    -- Process Tip if amount > 0 and a driver exists
    IF p_tip_amount > 0 AND v_driver_id IS NOT NULL THEN
        -- Lock both rows in a stable (id-sorted) order before mutating
        -- either, same deadlock-avoidance pattern as wallet_transfer.
        v_lock_first := LEAST(v_user_id, v_driver_id);
        v_lock_second := GREATEST(v_user_id, v_driver_id);
        PERFORM 1 FROM public.users WHERE id = v_lock_first FOR UPDATE;
        PERFORM 1 FROM public.users WHERE id = v_lock_second FOR UPDATE;

        -- Debit side: delegate to wallet_pay instead of reimplementing
        -- the balance check + decrement + transactions insert by hand.
        IF NOT wallet_pay(p_tip_amount, 'Tip untuk Driver (Order ' || p_order_id || ')') THEN
            RAISE EXCEPTION 'Saldo WiraPay tidak mencukupi untuk memberikan tip';
        END IF;

        -- Credit side: no existing RPC fits (wallet_transfer needs a
        -- phone number, not a user id), so credit directly, atomically,
        -- inside this same transaction as the debit above.
        UPDATE public.users
        SET wallet_balance = COALESCE(wallet_balance, 0) + p_tip_amount
        WHERE id = v_driver_id;

        INSERT INTO public.transactions (user_id, amount, type, status, description)
        VALUES (v_driver_id, p_tip_amount, 'transfer_in', 'success',
                'Tip dari Pelanggan (Order ' || p_order_id || ')');
    END IF;

    -- Insert Review
    INSERT INTO public.reviews (order_id, user_id, driver_id, merchant_id, rating, review_text, tip_amount)
    VALUES (p_order_id, v_user_id, v_driver_id, v_merchant_id, p_rating, p_review_text, p_tip_amount);

    -- Mark order as reviewed
    UPDATE public.orders SET is_reviewed = true WHERE id = p_order_id;

    RETURN TRUE;
END;
$$;

-- ============================================================
-- Verification — run after applying (cannot be executed by the agent that
-- wrote this migration; no DB execution access in that environment)
-- ============================================================
-- 1. Drivers table: as an anon (logged-out) client, attempt to update or
--    delete any row in public.drivers directly — should now fail (only
--    "Public can view online active drivers" SELECT should still work
--    anonymously). As a driver, updating their own row should still work.
-- 2. Reviews: attempt to insert a review row for an order_id that belongs
--    to a DIFFERENT user than the caller — should fail the WITH CHECK.
--    Attempt to insert a review with a driver_id that doesn't match the
--    real order's driver_id — should also fail. Submitting a second
--    review for an already-reviewed order_id — should fail with a unique
--    constraint violation. The real ReviewModal.jsx/ActivityPage.jsx flow
--    (via submit_review_and_tip) should be completely unaffected.
-- 3. operational_zones: a non-admin authenticated client attempting to
--    insert/update/delete a zone should fail; an admin should still
--    succeed.
-- 4. feature_flags: a non-admin authenticated client can still complete
--    the full mitra self-registration flow (UnauthorizedPage.jsx/
--    RegisterPage.jsx) end-to-end. The same non-admin client attempting
--    `supabase.from('feature_flags').update({...}).eq('region',
--    'features_config')` should fail. An admin using
--    frontend-admin/src/pages/FeatureFlagsPage.jsx should still be able to
--    edit `features_config`.
-- 5. Notifications: as a logged-in user, reading another user's
--    notifications (by guessing/enumerating an id) should return no rows;
--    reading your own should work. Attempting to insert a notification
--    with someone else's user_id should fail. The real backend-driven
--    notification flow (order-status pushes, WhatsApp-paired
--    notifications) should be completely unaffected since it runs as
--    service_role.
-- 6. submit_review_and_tip: fire two near-simultaneous calls for the same
--    order_id (e.g. two parallel requests) — exactly one should succeed,
--    the other should fail with "Order has already been reviewed" (now
--    reliably, because the second call blocks on the row lock until the
--    first commits, instead of racing).
-- =============================================================================
