-- =============================================================================
-- Migration 0066: repair three real bugs found auditing 0061/0063-0065
-- (written by a separate AI agent session working this same repo)
-- =============================================================================
-- Found while reviewing the anti-fraud PIN system and the 3-minute-cancel-
-- window feature before considering them done - none of these were caught
-- by the session that wrote them, and live-testing confirms all three are
-- real, currently-live problems, not theoretical.
--
-- BUG 1 (CRITICAL, functional outage): 0061_add_accepted_at_to_orders.sql's
-- `ALTER TABLE public.orders ADD COLUMN accepted_at` was apparently never
-- actually applied to the live database, even though 0063/0065's columns
-- (security_pin, pin_attempts) clearly WERE (confirmed live). Both
-- wallet_refund_matched_ride's 0061 and 0064 bodies reference
-- v_order.accepted_at. Live-tested against a real synthetic matched,
-- wallet-paid, accepted order: every call to wallet_refund_matched_ride
-- fails outright with `column "accepted_at" does not exist` (Postgres
-- 42703) - meaning cancelling ANY already-matched ride is completely
-- broken in production right now, not just missing its refund. Re-applies
-- the column add (idempotent, safe either way).
--
-- BUG 2 (CRITICAL, money-integrity): wallet_refund_matched_ride (0064's
-- redefinition) checks `v_order.payment_method = 'wirapay'` before
-- refunding - but the real, live value written at order creation
-- (frontend-user/src/context/OrderContext.jsx:125,
-- frontend-user/src/services/ecosystemService.js:69) and checked by every
-- earlier version of this same function (0040, 0047) is `'wallet'`, never
-- `'wirapay'`. Had bug 1 not already made every call fail outright, this
-- typo alone would have meant every wallet-paid ride cancellation
-- silently fell through to the no-refund ELSE branch while still
-- returning `success: true` - the customer's money would never come back
-- and the UI would report success. Fixed to check the real value.
--
-- BUG 3 (CRITICAL, missing authorization - same class of bug as the
-- pre-0022 approve_topup_request hole from earlier in this project's
-- history): start_order_with_pin (0063, rate-limited in 0065) never
-- checks that the caller is actually the order's assigned driver. Anyone
-- who can reach this RPC with any order_id can attempt to start ANY
-- order - the only real driver/customer check anywhere in this project.
-- Confirmed the sole real call site is frontend-mitra/src/pages/shared/
-- ActiveOrderPage.jsx (the assigned driver enters the customer-told PIN),
-- so the correct fix is requiring auth.uid() = the order's driver_id (or
-- an admin, for CS override). Beyond the small chance of a lucky guess
-- succeeding, this also closes a griefing vector 0065's own rate-limiting
-- introduced: without an ownership check, anyone who learns/guesses an
-- order_id could deliberately fail the PIN 5 times to trigger the
-- auto-cancel-on-suspected-brute-force branch and kill a stranger's real,
-- in-progress trip.
-- =============================================================================

-- --- Bug 1: finish applying 0061's column, idempotently ----------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

DROP TRIGGER IF EXISTS trg_set_order_accepted_at ON public.orders;
CREATE OR REPLACE FUNCTION public.set_order_accepted_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
        NEW.accepted_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_order_accepted_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.set_order_accepted_at();

-- --- Bug 2: fix the payment_method typo ---------------------------------------
CREATE OR REPLACE FUNCTION wallet_refund_matched_ride(p_order_id UUID, p_description TEXT DEFAULT 'Refund Pembatalan Perjalanan')
RETURNS BOOLEAN AS $$
DECLARE
    v_order RECORD;
    v_caller UUID := auth.uid();
    v_is_driver BOOLEAN;
    v_time_since_accept INTERVAL;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Anda harus login untuk membatalkan perjalanan';
    END IF;

    SELECT id, user_id, driver_id, status, total_price, payment_method, payment_status, accepted_at
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;

    v_is_driver := (v_order.driver_id IS NOT NULL AND v_order.driver_id = v_caller);

    IF v_order.user_id IS DISTINCT FROM v_caller AND NOT v_is_driver THEN
        RAISE EXCEPTION 'Anda tidak berhak membatalkan pesanan ini';
    END IF;

    IF v_order.status = 'in_trip' THEN
        RAISE EXCEPTION 'Perjalanan sudah dimulai (penumpang sudah dijemput), tidak bisa dibatalkan lagi. Hubungi CS jika ada masalah.';
    ELSIF v_order.status NOT IN ('pending', 'accepted', 'picking_up') THEN
        RAISE EXCEPTION 'Pesanan ini sudah tidak bisa dibatalkan (status saat ini: %)', v_order.status;
    END IF;

    IF NOT v_is_driver THEN
        IF v_order.status = 'accepted' AND v_order.accepted_at IS NOT NULL THEN
            v_time_since_accept := NOW() - v_order.accepted_at;
            IF v_time_since_accept > INTERVAL '3 minutes' THEN
                RAISE EXCEPTION 'Melewati batas waktu pembatalan gratis (3 menit sejak driver menerima pesanan). Hubungi CS untuk membatalkan.';
            END IF;
        END IF;
    END IF;

    IF v_is_driver THEN
        UPDATE public.orders
        SET status = 'pending',
            driver_id = NULL,
            accepted_at = NULL
        WHERE id = p_order_id;
        RETURN TRUE;
    END IF;

    -- Fixed: the real value is 'wallet' (frontend-user/src/context/
    -- OrderContext.jsx), never 'wirapay' - was silently skipping every
    -- real refund before this fix.
    IF v_order.payment_method = 'wallet' AND v_order.payment_status = 'paid' THEN
        UPDATE public.users
        SET wallet_balance = wallet_balance + v_order.total_price
        WHERE id = v_order.user_id;

        INSERT INTO public.transactions (
            user_id, type, amount, status, description, created_at, reference_id
        ) VALUES (
            v_order.user_id, 'refund', v_order.total_price, 'success', p_description, NOW(), p_order_id::text
        );

        UPDATE public.orders
        SET status = 'cancelled', payment_status = 'refunded'
        WHERE id = p_order_id;
    ELSE
        UPDATE public.orders
        SET status = 'cancelled'
        WHERE id = p_order_id;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also fixed in passing: the refund's own transaction `type` was logged as
-- 'topup' (0064) - misleading in the ledger for the exact same reason
-- 0062's header explains for admin corrections. Every earlier version of
-- this function (0040, 0047) correctly used 'refund'; restored that.

-- --- Bug 3: require the caller to actually be the assigned driver ------------
CREATE OR REPLACE FUNCTION start_order_with_pin(p_order_id UUID, p_pin_input VARCHAR(4))
RETURNS JSONB AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_caller UUID := auth.uid();
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pesanan tidak ditemukan');
    END IF;

    -- The missing check: only the order's assigned driver (or an admin,
    -- for CS override) may attempt to start it. Without this, any
    -- authenticated caller who knows/guesses an order_id could attempt
    -- the PIN on an order that was never assigned to them.
    IF v_order.driver_id IS DISTINCT FROM v_caller AND NOT is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anda tidak berhak memulai pesanan ini');
    END IF;

    IF v_order.status NOT IN ('accepted', 'picking_up') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pesanan belum siap untuk dimulai');
    END IF;

    IF v_order.pin_attempts >= 5 THEN
        UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
        RETURN jsonb_build_object('success', false, 'error', 'Terlalu banyak percobaan PIN (Brute-force). Pesanan dibatalkan otomatis demi keamanan.');
    END IF;

    IF v_order.security_pin != p_pin_input THEN
        UPDATE public.orders SET pin_attempts = COALESCE(pin_attempts, 0) + 1 WHERE id = p_order_id;
        RETURN jsonb_build_object('success', false, 'error', 'PIN tidak valid. Sisa percobaan: ' || (5 - (COALESCE(v_order.pin_attempts, 0) + 1)));
    END IF;

    UPDATE public.orders
    SET status = 'in_trip', updated_at = NOW(), pin_attempts = 0
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- 1. SELECT column_name FROM information_schema.columns WHERE table_schema
--    ='public' AND table_name='orders' AND column_name='accepted_at';
--    should return one row.
-- 2. Real end-to-end test: create a wallet-paid, accepted, matched test
--    order; call wallet_refund_matched_ride as the customer - should
--    succeed, wallet_balance should increase by exactly total_price, order
--    should end up status='cancelled'/payment_status='refunded', and a
--    'refund'-typed transactions row should appear. Clean up after.
-- 3. As a driver NOT assigned to a given order, call start_order_with_pin
--    on it (even with the correct PIN, if somehow known) - should fail
--    with "Anda tidak berhak memulai pesanan ini", and pin_attempts must
--    be confirmed UNCHANGED (the ownership check returns before the
--    attempt counter logic runs).
-- 4. As the real assigned driver, start_order_with_pin with the correct
--    PIN should still succeed exactly as before.
-- =============================================================================
