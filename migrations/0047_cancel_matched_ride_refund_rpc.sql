-- Adds the missing "cancel an already-matched ride" path (2026-09-19).
--
-- CONTEXT: wallet_refund (migrations/0040) only ever allows refunding an
-- order in status = 'pending' (still searching, no driver matched yet).
-- Grepped both frontend-user and frontend-mitra for any cancel UI/RPC once
-- a driver has accepted (status IN ('accepted','picking_up','in_trip')) —
-- there is none, on either the customer or driver side. This migration adds
-- that capability as a new RPC, wallet_refund_matched_ride, reusing
-- wallet_refund's established safety mechanics (SECURITY DEFINER, FOR
-- UPDATE row-lock on the order, "flip status atomically while still
-- holding the lock" as the idempotency guard) and adding new
-- eligibility/amount logic on top.
--
-- BUSINESS POLICY DECISION (made here, not a pre-existing rule — grepped
-- for "cancellation_fee" / "biaya pembatalan" / similar across the whole
-- repo first; no precedent exists anywhere in this codebase):
--
-- 1. WHO can cancel a matched ride: the order's customer (auth.uid() =
--    orders.user_id) OR its assigned driver (auth.uid() = orders.driver_id).
--    No one else.
--
-- 2. WHEN cancellation is allowed: only while status IN ('accepted',
--    'picking_up') — i.e. strictly before the driver has actually picked
--    the passenger up (the PICKING_UP -> IN_TRIP transition, driven by the
--    driver's "Mulai Perjalanan" action in DriverHomePage.jsx, is exactly
--    the moment the passenger gets in the vehicle and the trip starts for
--    real). Once status = 'in_trip', this RPC refuses outright — cancelling
--    a trip that is already physically underway isn't a "this didn't
--    happen" event, it's an emergency/dispute, which needs a human
--    (support), not a silent RPC. Once 'completed'/'cancelled' already,
--    obviously refused too (same "exception on invalid state" idiom as
--    wallet_refund).
--
-- 3. HOW MUCH is refunded, and does it differ by who cancelled: chose FULL
--    refund, no cancellation fee, for BOTH customer- and driver-initiated
--    cancellation, as long as it's pre-pickup (accepted/picking_up).
--    Reasoning: a partial-refund/fee model was considered (and is
--    explicitly left as a documented option for a human to revisit), but
--    rejected for tonight because (a) there is genuinely no fee precedent
--    anywhere in this codebase to build on, (b) this app has no mechanism
--    to actually PAY a cancellation fee out to anyone (no driver
--    compensation ledger for it) — a fee that is simply "not refunded" and
--    vanishes into no one's balance is an accounting dead-end, which is a
--    bigger and separate product decision than what should be silently
--    invented inside a bug-fix-shaped migration, and (c) "full refund until
--    the passenger is physically in the vehicle, no refund after" is a
--    clean, unambiguous boundary that matches how most rideshare apps
--    behave at the trip-start moment, without needing a new fee/ledger
--    concept. A driver who cancels after accepting is arguably more at
--    fault than a customer who does (the rider did nothing wrong), which
--    would argue AGAINST ever penalizing the customer's refund for a
--    driver-initiated cancellation — reinforcing "full refund, no fee" as
--    the simpler and safer default for both directions rather than trying
--    to build two different partial-refund formulas tonight.
--
-- 4. WHOSE wallet gets credited: always orders.user_id (the customer/rider),
--    NEVER auth.uid() directly. This matters because unlike wallet_refund
--    (always self-service — a customer refunding their own order), the
--    caller here can be the DRIVER (cancelling on the customer's behalf) —
--    crediting auth.uid() in that case would incorrectly pay the refund
--    into the driver's own wallet instead of the rider's.
--
-- 5. Non-wallet (cash/COD) matched orders: no money moves (nothing was ever
--    charged), the order simply flips to 'cancelled'. Note this is also why
--    this RPC — not a plain client-side `.update({status:'cancelled'})` —
--    is required even for the cash case: `orders_update_mitra_or_admin`
--    (migrations/0028) only grants direct customer UPDATE rights while
--    status='pending'; a customer has no direct RLS UPDATE grant on their
--    own matched order at all, matched or not, paid or not. Only the
--    SECURITY DEFINER RPC can do it for a customer-initiated cancellation.
--    (The driver DOES have a direct RLS grant via `driver_id = auth.uid()`,
--    but routes through this same RPC too, for one consistent code path
--    and so the customer refund still happens atomically with the status
--    flip when the driver is the one cancelling.)
--
-- KNOWN GAP, left deliberately (not silently dropped): when the DRIVER
-- cancels, the order is simply cancelled — it is not automatically
-- re-queued/re-opened for other nearby drivers to pick up. The customer has
-- to place a new order. Auto-requeue (reset to 'pending', clear driver_id,
-- re-surface to other drivers) would be a reasonable follow-up but is a
-- larger behavior change (interacts with the driver-matching/notification
-- flow) than this refund-focused migration should take on.

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

    -- Flip status while still holding the row lock — this IS the
    -- idempotency guard, exactly like wallet_refund: a second call against
    -- the same order will see status = 'cancelled' and hit the check above
    -- instead of crediting a second time.
    UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;

    IF v_order.payment_method = 'wallet' AND v_order.payment_status = 'paid' AND COALESCE(v_order.total_price, 0) > 0 THEN
        -- Credit the CUSTOMER (order owner), never the caller — see point 4
        -- above. Covers both the customer-cancels-self case and the
        -- driver-cancels-on-customer's-behalf case identically.
        UPDATE public.users
        SET wallet_balance = COALESCE(wallet_balance, 0) + v_order.total_price
        WHERE id = v_order.user_id;

        INSERT INTO public.transactions (user_id, amount, type, status, description)
        VALUES (v_order.user_id, v_order.total_price, 'refund', 'success',
                COALESCE(p_description, 'Refund Pembatalan Perjalanan') || ' (Order ' || p_order_id || ')');
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
--       total_price, and the order's status should become 'cancelled'.
-- 2. Immediately call it again with the SAME order id (as the same user):
--    -> should raise "Pesanan ini sudah tidak bisa dibatalkan (status saat
--       ini: cancelled)" and NOT change wallet_balance again.
-- 3. As the order's assigned driver (auth.uid() = orders.driver_id) on a
--    fresh 'accepted' WiraPay order: calling this RPC should credit the
--    CUSTOMER's wallet_balance (not the driver's), and cancel the order.
-- 4. As a real driver/customer on an order in 'in_trip': should raise
--    "Perjalanan sudah dimulai..." and change nothing.
-- 5. As neither the order's customer nor its driver: should raise "Anda
--    tidak berhak membatalkan pesanan ini" and change nothing.
