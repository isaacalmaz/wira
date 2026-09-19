-- =============================================================================
-- Migration 0051: Orders state-machine trigger — close the fabricated-
-- completed-order payout-minting exploit (CRITICAL)
-- =============================================================================
--
-- THE VULNERABILITY
-- ------------------
-- Read the final, currently-live effective state of every orders RLS
-- policy (confirmed by grepping every CREATE POLICY/DROP POLICY touching
-- "orders_insert_own"/"orders_update_mitra_or_admin" across 0001-0049 —
-- 0024 defines orders_insert_own and it is never redefined again; 0028 is
-- the final redefinition of orders_update_mitra_or_admin, superseding
-- 0024's and 0026's earlier versions):
--
--     CREATE POLICY "orders_insert_own" ON public.orders
--     FOR INSERT WITH CHECK (
--         auth.uid() = user_id
--         OR (auth.uid() IS NULL AND user_id IS NULL)  -- guest checkout
--     );
--
--     CREATE POLICY "orders_update_mitra_or_admin" ON public.orders
--     FOR UPDATE USING (
--         (status = 'pending' AND driver_id IS NULL)
--         OR (status = 'ready' AND driver_id IS NULL AND merchant_id IS NOT NULL)
--         OR driver_id = auth.uid()
--         OR merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
--         OR is_admin()
--     );
--
-- Neither has any WITH CHECK restricting `status`, `total_price`,
-- `payment_status`, or `driver_id`. Combined with `credit_payout_on_order_
-- completed()` (migrations/0028_mitra_payout_system.sql:41-85), which
-- credits `payable_balance` purely off `NEW.total_price` the instant an
-- order's status becomes 'completed', with zero verification that the
-- order/payment is real, this is directly exploitable two ways:
--
--   1. INSERT a brand-new fabricated row directly:
--      `{user_id: self, driver_id: self, service_type: 'ride',
--        status: 'completed', total_price: 999999999,
--        payment_method: 'cash', payment_status: 'unpaid'}`
--      — the AFTER INSERT trigger fires immediately and credits ~Rp
--      800,000,000 (80% after the 20% platform commission) to the
--      attacker's own payable_balance, cashable out via request_payout().
--
--   2. Worse, and not even needing a fabricated row: the UPDATE policy's
--      `(status = 'pending' AND driver_id IS NULL)` USING clause has NO
--      ownership check at all (not `user_id = auth.uid()`, not
--      `driver_id = auth.uid()`) — it matches ANY still-unclaimed pending
--      order belonging to ANY customer. With no WITH CHECK, any logged-in
--      user can find someone else's real pending order and directly set
--      `status = 'completed', total_price = 999999999` on it, hijacking a
--      real order into a fake high-value "completed" job.
--
-- THE FIX
-- --------
-- A BEFORE INSERT OR UPDATE trigger enforcing a real state machine,
-- layered on top of (not replacing) the existing RLS policies above.
--
-- Checked against real usage before writing this, not assumed:
--   - INSERT: grepped every `.from('orders').insert(` call site in the
--     entire app (frontend-user, frontend-mitra, frontend-admin, backend).
--     There is exactly ONE real insert path — frontend-user/src/context/
--     OrderContext.jsx's `addOrder()` (the guest fallback,
--     frontend-user/src/services/ecosystemService.js's
--     `createEcosystemOrder()`, mirrors it exactly) — and it hardcodes
--     `status: 'pending'` in every single call, for all six service types
--     (ride/food/send/villa/service/pool alike; they all funnel through
--     this one function). No caller ever passes any other status at
--     creation. This migration therefore only needs to REJECT insert-time
--     status values other than 'pending', not "pick one of several valid
--     initial states" — there is only one in this codebase.
--   - payment_status at INSERT: the SAME insert call site computes
--     `payment_status: paymentMethod includes 'tunai' ? 'unpaid' : 'paid'`.
--     This means `payment_status = 'paid'` at INSERT time is the real,
--     current, legitimate behavior for every non-cash (wallet) order
--     across the whole app today — NOT just an attacker forging it. The
--     task brief that prompted this migration assumed 'unpaid' should be
--     the only allowed insert-time value; that assumption doesn't match
--     the live code and enforcing it here would break every non-cash order
--     in production the moment this migration is applied. So this
--     migration allows both 'unpaid' and 'paid' at INSERT and does NOT
--     attempt to fix (separately, this is a real pre-existing bug worth
--     someone's attention, but out of scope for this migration): the
--     wallet is never actually debited anywhere in this same code path —
--     no `wallet_pay()` call happens alongside this insert — so a
--     wallet-method order is marked "paid" without any money actually
--     moving. That's a correctness bug in the payment flow, not something
--     this RLS/trigger layer can or should paper over.
--   - UPDATE to status = 'completed': grepped every write of
--     `status: 'completed'`/`OrderStatus.COMPLETED` across frontend-mitra.
--     It always goes through `orderService.js`'s `updateOrderStatus()`,
--     called from frontend-mitra/src/pages/driver/DriverHomePage.jsx (the
--     assigned driver/technician — orders.driver_id doubles as the
--     assigned-worker column for ride/send/service/pool, confirmed by
--     TechHomePage.jsx/TechEarningsPage.jsx also keying off
--     `driver_id === user.id`) and frontend-mitra/src/pages/merchant/
--     MerchantOrdersPage.jsx (the owning merchant, for food/villa). Never
--     by the customer. This confirms the task's ask — gate the
--     'completed' transition to admin/driver/merchant, never the customer
--     — matches the real completion flow exactly. One correction from the
--     task's suggested trigger condition: `merchant_id` is a foreign key
--     into `public.merchants.id`, NOT a user id, so "auth.uid() =
--     OLD.merchant_id" (as literally suggested) would never match anything
--     — the correct check, mirroring the existing RLS policies' own
--     pattern, is `OLD.merchant_id IN (SELECT id FROM public.merchants
--     WHERE owner_id = auth.uid())`.
--   - total_price immutability after INSERT: grepped every
--     `total_price:`/`.eq(... total_price` reference across the whole app.
--     It is set exactly once, at INSERT, in the same single call site
--     above, and is NEVER part of any UPDATE payload anywhere (not by
--     customer, driver, merchant, or admin — frontend-admin/src/pages/
--     FinancePage.jsx only ever SELECTs it for reporting). Blocking any
--     UPDATE to it (except by an admin, for support/refund corrections)
--     has zero legitimate collateral.
--
-- EXPLICITLY OUT OF SCOPE (per the task that requested this migration, and
-- still true after this fix — flagging clearly, not silently):
-- total_price at INSERT time is still client-supplied and NOT independently
-- verified server-side against real menu/fare data for any of the six
-- service types. A customer can still create a legitimate-looking *pending*
-- order for an artificially low (or, for that matter, artificially high)
-- price and have it accepted. What this migration closes is specifically
-- the ability to fabricate an already-"completed"/paid-out order — the
-- part that mints real money with no possibility of anyone ever noticing
-- before the payout is cashed out. Full server-side price computation
-- across all six service types is a separate, materially larger
-- architecture task.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_orders_state_machine()
RETURNS TRIGGER AS $$
BEGIN
    -- service_role (the backend's Supabase client, using
    -- SUPABASE_SERVICE_KEY — see backend/config/supabase.js) already
    -- bypasses RLS entirely by Supabase's own design (BYPASSRLS) and is a
    -- trusted context; exempt it from these business-rule checks too, so a
    -- future legitimate backend-driven order flow isn't blocked by them.
    -- Grepped backend/routes/*.js and backend/services/*.js: no backend
    -- code touches `orders` at all today (only the wallet top-up webhooks
    -- touch `users.wallet_balance`, see 0052) — this exemption is
    -- forward-looking, not covering an existing call site.
    IF current_user = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF current_user IN ('authenticated', 'anon') THEN
            IF NEW.status IS DISTINCT FROM 'pending' THEN
                RAISE EXCEPTION 'New orders must be created with status = pending (got %)', NEW.status;
            END IF;
            IF NEW.payment_status IS DISTINCT FROM 'unpaid' AND NEW.payment_status IS DISTINCT FROM 'paid' THEN
                RAISE EXCEPTION 'New orders must be created with payment_status = unpaid or paid (got %)', NEW.payment_status;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- TG_OP = 'UPDATE' from here on.

    -- total_price is fixed at creation time; nobody but an admin may ever
    -- change it afterward (support/refund corrections only).
    IF NEW.total_price IS DISTINCT FROM OLD.total_price AND NOT is_admin() THEN
        RAISE EXCEPTION 'total_price cannot be changed after an order is created (except by an admin)';
    END IF;

    -- The critical gate: transitioning an order INTO 'completed' is what
    -- fires credit_payout_on_order_completed() and mints real
    -- payable_balance. Only the assigned driver/technician (driver_id),
    -- the owning merchant (merchant_id -> merchants.owner_id), or an admin
    -- may do this — never the customer (user_id), which was the exploit.
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
        IF NOT (
            is_admin()
            OR auth.uid() = OLD.driver_id
            OR OLD.merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
        ) THEN
            RAISE EXCEPTION 'Only the assigned driver/technician, the owning merchant, or an admin can mark an order completed';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_orders_state_machine ON public.orders;
CREATE TRIGGER trg_enforce_orders_state_machine
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_orders_state_machine();

-- ============================================================
-- Verification — run after applying (cannot be executed by the agent that
-- wrote this migration; no DB execution access in that environment)
-- ============================================================
-- 1. Attempt the exact fabrication exploit from the header — INSERT an
--    order with status='completed' directly — should fail with "New
--    orders must be created with status = pending".
-- 2. Attempt to hijack any real pending order you don't own by UPDATEing
--    it straight to status='completed' as a non-admin, non-assigned user —
--    should fail with the "Only the assigned driver/technician..." message
--    (this should fail even for a request that passes the existing
--    orders_update_mitra_or_admin RLS USING clause, since that clause alone
--    doesn't check ownership for the 'pending'-unclaimed branch).
--   3. Real end-to-end flows should be completely unaffected:
--    a. Create a real ride/food/send/villa/service/pool order as a
--       customer — should still succeed (status='pending' as always).
--    b. As the assigned driver/technician, advance a ride/send/service/
--       pool order through its real status steps up to 'completed'
--       (DriverHomePage.jsx) — should still succeed.
--    c. As the owning merchant, mark a food/villa order 'completed'
--       (MerchantOrdersPage.jsx) — should still succeed.
--    d. As a driver, claim a 'ready' food order (set driver_id = self) —
--       untouched by this migration, should still succeed.
--    e. driver_cancel_requeues_ride (0048) and wallet_refund/
--       cancel_matched_ride flows (0040/0047), which set status='cancelled'
--       or requeue to 'pending', are SECURITY DEFINER RPCs — unaffected by
--       this trigger's checks (they never set status='completed' or touch
--       total_price).
-- 4. As an admin, correcting a total_price via a direct update (support/
--    refund case) should still succeed.
-- =============================================================================
