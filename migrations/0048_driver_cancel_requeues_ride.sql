-- Makes a DRIVER-initiated cancellation of a matched ride re-open the order
-- for other nearby drivers, instead of destroying it like a customer
-- cancellation does (2026-09-19).
--
-- CONTEXT: migrations/0047_cancel_matched_ride_refund_rpc.sql's
-- wallet_refund_matched_ride(p_order_id, p_description) let either the
-- order's customer OR its assigned driver cancel a matched-but-not-yet-
-- in_trip ride (status IN ('accepted','picking_up')), full-refunding the
-- customer if paid via WiraPay and flipping orders.status to 'cancelled' -
-- identically, regardless of who cancelled. That file's own header called
-- this out as a deliberately left gap: "when the DRIVER cancels, the order
-- is simply cancelled ... Auto-requeue ... would be a reasonable follow-up
-- but is a larger behavior change ... than this refund-focused migration
-- should take on." This migration is that follow-up.
--
-- WHAT CHANGES, AND WHY (read this against 0047's still-valid policy
-- reasoning for the parts NOT changed here):
--
-- 1. CUSTOMER-initiated cancellation (v_is_driver = false): UNCHANGED.
--    Still flips the order to 'cancelled' and still fully refunds a
--    WiraPay-paid order. The customer changed their mind; the ride should
--    stop existing, exactly as before.
--
-- 2. DRIVER-initiated cancellation (v_is_driver = true): CHANGED. Instead
--    of 'cancelled', the order is reset to status = 'pending' AND
--    driver_id = NULL. This is the exact shape `get_nearby_pending_orders`
--    (migrations/0018/0033) and `fetchPendingOrders`/
--    `subscribeToDriverOrders` (frontend-mitra/src/services/orderService.js)
--    already require to treat an order as "findable" - both are driven by
--    `status = 'pending' AND driver_id IS NULL` (or, for realtime, directly
--    checking `order.status === 'pending' && !order.driver_id` client-side
--    in subscribeToDriverOrders/isOrderEligibleForDriver) - confirmed by
--    reading both functions before writing this, not assumed. No new
--    eligibility concept is needed: a requeued order is, to every existing
--    driver-side query and subscription, indistinguishable from a
--    brand-new pending order on the same route/price/vehicle type. Nothing
--    else about the row changes (service_type, package_size, price,
--    pickup/dropoff coords all carry over untouched), so the exact same
--    eligibility rule (is_order_eligible_for_driver / mirrored JS) that
--    surfaced it to drivers the first time surfaces it again.
--
-- 3. PAYMENT POLICY ON THE DRIVER-CANCEL/REQUEUE PATH - the real decision
--    this migration has to make, stated explicitly per the task:
--
--    DECISION: a driver-cancelled, requeued order's payment_status and the
--    customer's wallet_balance are left COMPLETELY UNTOUCHED. No refund
--    happens at requeue time, even for a WiraPay-paid order.
--
--    REASONING (traced against the ACTUAL existing payment flow, not
--    assumed - re-read frontend-user/src/pages/RidePage.jsx's
--    handleStartBooking and frontend-user/src/context/OrderContext.jsx's
--    addOrder before writing this):
--
--      a. Today, payment happens ONCE, UP FRONT, BEFORE any driver match
--         exists at all: handleStartBooking calls `pay()` (wallet_pay RPC,
--         debits the wallet) and only THEN calls `addOrder()`, which
--         creates the order already carrying `payment_status: 'paid'`
--         (OrderContext.jsx addOrder, `orderData.paymentMethod` !== 'Tunai'
--         => 'paid') while `status` is still 'pending' - i.e. WHILE THE
--         ORDER IS STILL UNMATCHED AND SEARCHING FOR ITS FIRST DRIVER.
--         The money is already fully at rest with the platform for the
--         entire pending-and-searching phase, well before any driver ever
--         accepts.
--
--      b. There is no SECOND pay() call anywhere in the accept/match flow
--         (acceptOrder in frontend-mitra/src/services/orderService.js is a
--         plain conditional UPDATE - no wallet RPC involved). A driver
--         accepting a 'pending' order never charges the customer again;
--         the charge already happened at booking time.
--
--      c. A driver-cancel-and-requeue is NOT a "this ride didn't happen"
--         event from the customer's perspective - they still want the
--         ride, and are simply returned to the exact same state
--         (status='pending', driver_id=NULL, payment_status still 'paid')
--         they were already sitting in, for this SAME order, before the
--         very first driver ever accepted it. Refunding now and leaving
--         the order open for a second driver to accept would recreate the
--         order in a state that has never otherwise existed in this
--         codebase: 'accepted' with a WiraPay order that isn't actually
--         paid, and no code path anywhere that would ever re-charge it
--         (see b). That is a real, exploitable "ride now, never pay" hole
--         once a second driver accepts and completes the trip - it is not
--         merely an inconsistency.
--
--      d. Therefore, "leave payment_status/wallet_balance untouched on
--         requeue" is the ONLY choice consistent with the existing
--         pay-before-match model, not a competing option weighed equally
--         against "refund immediately." Refunding here would need a
--         matching re-pay step to exist somewhere in the accept flow for
--         the money to ever come back - it doesn't, and adding one is a
--         separate, larger change than this migration's scope (and would
--         also reintroduce exactly the "customer can't pay = stuck if
--         balance was spent in the interim" fragility the up-front-pay
--         model was already chosen to avoid, per handleStartBooking's own
--         comment).
--
--      e. Cash (Tunai) orders: nothing was ever charged either way -
--         status/driver_id reset is the only change, identical to how 0047
--         already treats the cash case for a full cancel.
--
-- 4. WHO can requeue, WHEN: unchanged from 0047 - only the order's assigned
--    driver (auth.uid() = orders.driver_id), only while
--    status IN ('accepted', 'picking_up'). Once 'in_trip', this RPC still
--    refuses outright for BOTH branches (unchanged) - a driver bailing
--    mid-trip is the same dispute/support-needed situation 0047 already
--    reasoned through, not a normal cancel-and-requeue.
--
-- 5. Return value: still RETURNS BOOLEAN (TRUE on success), unchanged
--    signature. Frontend call sites (frontend-user's refundMatchedRide in
--    WalletContext.jsx, frontend-mitra's DriverHomePage.jsx
--    handleCancelOrder) never branch on which of the two outcomes
--    happened via the return value - they don't need to, because which
--    branch runs is entirely determined by WHO is calling: the customer's
--    "Batalkan Perjalanan" button always hits the customer branch, the
--    driver's "Batalkan Pesanan" button always hits the driver branch. No
--    signature change needed to communicate the branch back to the caller.
--
-- REALTIME/POLLING GAP - EXPLICITLY NOT SOLVED HERE, DOCUMENTED, NOT
-- SILENT: this migration only changes SQL/RPC behavior. Verified by reading
-- frontend-mitra/src/services/orderService.js's subscribeToDriverOrders
-- that its Postgres changes subscription listens for `event: 'INSERT'`
-- (new ride/send orders) and a narrow `event: 'UPDATE'` (food orders
-- transitioning to 'ready') - NEITHER clause matches a ride/send order
-- being UPDATEd back to 'pending'/driver_id=NULL by this RPC (same row id,
-- not a new row, and not a food 'ready' transition). A companion frontend
-- change (see this task's other commits) extends that same UPDATE listener
-- to also match a requeued ride/send order, so drivers pick it up via
-- realtime almost immediately in the common case; the pre-existing 10s
-- polling fallback (`checkPendingOrders` in DriverHomePage.jsx) remains the
-- backstop for the same reasons it already was one before this change
-- (e.g. a channel reconnect gap).
--
-- KNOWN GAP CARRIED OVER FROM 0047, still true: cancellation-fee/dispute
-- handling for a trip already 'in_trip' is still entirely out of scope -
-- this RPC still refuses outright once a trip has physically started, on
-- both branches.

CREATE OR REPLACE FUNCTION wallet_refund_matched_ride(p_order_id UUID, p_description TEXT DEFAULT 'Refund Pembatalan Perjalanan')
RETURNS BOOLEAN AS $$
DECLARE
    v_order RECORD;
    v_caller UUID := auth.uid();
    v_is_driver BOOLEAN;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Anda harus login untuk membatalkan perjalanan';
    END IF;

    -- Lock the order row first, same reasoning as wallet_refund: a
    -- concurrent second call (double-click, or customer and driver both
    -- hitting cancel at once) blocks here until this transaction commits or
    -- rolls back, instead of racing on the checks below.
    SELECT id, user_id, driver_id, status, total_price, payment_method, payment_status
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;

    v_is_driver := (v_order.driver_id IS NOT NULL AND v_order.driver_id = v_caller);

    -- IS DISTINCT FROM (not !=) deliberately: a plain `!=` against a NULL
    -- user_id (migrations/0024 notes historical guest-checkout orders can
    -- have user_id = NULL) evaluates to NULL, which is "not true" in an IF
    -- and would silently let ANY authenticated caller who also isn't the
    -- driver slip past this check - the same NULL-ownership-check bug class
    -- this codebase has hit before elsewhere. IS DISTINCT FROM treats NULL
    -- correctly (NULL IS DISTINCT FROM <anything real> = true), so a
    -- NULL-user_id order is never accidentally treated as "owned" by
    -- whoever happens to call this.
    IF v_order.user_id IS DISTINCT FROM v_caller AND NOT v_is_driver THEN
        RAISE EXCEPTION 'Anda tidak berhak membatalkan pesanan ini';
    END IF;

    IF v_order.status = 'in_trip' THEN
        RAISE EXCEPTION 'Perjalanan sudah dimulai (penumpang sudah dijemput), tidak bisa dibatalkan lagi. Hubungi CS jika ada masalah.';
    ELSIF v_order.status NOT IN ('accepted', 'picking_up') THEN
        RAISE EXCEPTION 'Pesanan ini sudah tidak bisa dibatalkan (status saat ini: %)', v_order.status;
    END IF;

    IF v_is_driver THEN
        -- DRIVER-initiated: re-open the ride for other nearby drivers
        -- instead of destroying it - see point 2/3 above. Flipped while
        -- still holding the row lock, same idempotency guard as the
        -- customer branch: a second call against this same order now sees
        -- status = 'pending' (not 'accepted'/'picking_up'), so it correctly
        -- hits the "sudah tidak bisa dibatalkan" exception above instead of
        -- re-running this branch a second time.
        UPDATE public.orders SET status = 'pending', driver_id = NULL WHERE id = p_order_id;

        -- Deliberately NO wallet/payment_status change here - see point 3
        -- above for the full reasoning. The order keeps whatever
        -- payment_status it already had (still 'paid' for a WiraPay order,
        -- exactly as it was throughout its original pending phase before
        -- any driver ever accepted it); no refund, no re-charge.
    ELSE
        -- CUSTOMER-initiated: unchanged from 0047 - full cancel + refund.
        UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;

        IF v_order.payment_method = 'wallet' AND v_order.payment_status = 'paid' AND COALESCE(v_order.total_price, 0) > 0 THEN
            -- Credit the CUSTOMER (order owner), never the caller - see
            -- 0047 point 4. Only reachable here since v_is_driver is false
            -- in this branch, but a driver-initiated cancellation never
            -- credits anyone any more (see the requeue branch above).
            UPDATE public.users
            SET wallet_balance = COALESCE(wallet_balance, 0) + v_order.total_price
            WHERE id = v_order.user_id;

            INSERT INTO public.transactions (user_id, amount, type, status, description)
            VALUES (v_order.user_id, v_order.total_price, 'refund', 'success',
                    COALESCE(p_description, 'Refund Pembatalan Perjalanan') || ' (Order ' || p_order_id || ')');
        END IF;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Verification queries — run after applying
-- ============================================================
-- 1. As a real logged-in customer with an 'accepted' or 'picking_up',
--    WiraPay-paid order they own:
--    select wallet_refund_matched_ride('<that order id>', 'test');
--    -> should return true, wallet_balance should increase by the order's
--       total_price, and the order's status should become 'cancelled'
--       (unchanged behavior from 0047).
-- 2. As the order's assigned DRIVER (auth.uid() = orders.driver_id) on a
--    fresh 'accepted' WiraPay order: calling this RPC should NOT change
--    the customer's wallet_balance, should NOT change payment_status, and
--    should flip the order to status = 'pending' AND driver_id = NULL.
-- 3. Immediately after test 2, run fetchPendingOrders-equivalent query
--    (or select from get_nearby_pending_orders / a plain
--    `status='pending' AND driver_id IS NULL` select) as/for a driver near
--    that order's pickup point - the order should reappear.
-- 4. Calling this RPC again on the now-'pending' order (as anyone) should
--    raise "Pesanan ini sudah tidak bisa dibatalkan (status saat ini:
--    pending)" and change nothing.
-- 5. As a real driver/customer on an order in 'in_trip': should raise
--    "Perjalanan sudah dimulai..." and change nothing (unchanged from
--    0047).
-- 6. As neither the order's customer nor its driver: should raise "Anda
--    tidak berhak membatalkan pesanan ini" and change nothing (unchanged
--    from 0047).
