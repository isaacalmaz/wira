-- Fixes a live money-safety hole found auditing the WiraRide cancel flow
-- (2026-09-18): `wallet_refund(p_amount, p_description)` only ever existed
-- as an untracked root-level script (`add_refund_rpc.sql`) that was NEVER
-- applied to the live database (confirmed live: calling it returns
-- PGRST202 "function not found" - RidePage.jsx's "Batalkan Pencarian"
-- button has therefore been completely non-functional for any WiraPay
-- customer since it shipped: refund() throws, the catch block shows an
-- error toast, and the order is left stuck in 'searching' with the
-- customer's money never returned).
--
-- Beyond just "make it exist", the old design was also unsafe by
-- construction even if it had been deployed:
--   1. It took a raw `p_amount` from the client instead of an order id, so
--      it trusted the frontend to send the right number and had no way to
--      verify a refund was actually owed.
--   2. It had zero order-state check and zero "already refunded" guard -
--      a double-click (no `disabled` guard existed on the button either,
--      fixed separately in RidePage.jsx) could fire two concurrent RPC
--      calls and credit the wallet twice for one cancelled ride.
--
-- THE FIX: take `p_order_id` instead of a bare amount. Mirrors the
-- FOR UPDATE-row-lock-then-check-then-mutate pattern already established
-- by `wallet_pay`/`wallet_transfer` (migrations/0023): lock the order row
-- first, verify it belongs to the caller and is still in the one state
-- that is actually refundable ('pending' - i.e. still searching for a
-- driver, nothing accepted/completed/already-cancelled yet), then credit
-- the wallet and flip the order to 'cancelled' in the same transaction.
-- Flipping status to 'cancelled' *is* the idempotency guard: a second call
-- against the same order (e.g. a double-click) blocks on the row lock
-- until the first call commits, then re-reads status = 'cancelled' and
-- raises an exception instead of crediting a second time - exactly the
-- "exception on invalid state, not silent no-op" behavior wallet_pay/
-- wallet_transfer already use.
--
-- Scope note: this only covers cancelling a ride that hasn't been matched
-- with a driver yet (order.status = 'pending'), the one cancel path that
-- currently exists anywhere in the app (grepped both frontend-user and
-- frontend-mitra - there is no cancel UI at all for an already-accepted
-- ride on either the customer or driver side). Building that out is a
-- larger UX addition left as a documented gap, not silently dropped.

CREATE OR REPLACE FUNCTION wallet_refund(p_order_id UUID, p_description TEXT DEFAULT 'Refund Layanan')
RETURNS BOOLEAN AS $$
DECLARE
    v_order RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Anda harus login untuk menerima refund';
    END IF;

    -- Lock the order row first so a concurrent second call (double-click)
    -- blocks here until this transaction commits or rolls back, instead of
    -- racing on the status check below.
    SELECT id, user_id, status, total_price, payment_method, payment_status
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;

    IF v_order.user_id != auth.uid() THEN
        RAISE EXCEPTION 'Anda tidak berhak membatalkan pesanan ini';
    END IF;

    IF v_order.status != 'pending' THEN
        RAISE EXCEPTION 'Pesanan ini sudah tidak bisa dibatalkan/direfund (status saat ini: %)', v_order.status;
    END IF;

    IF v_order.payment_method != 'wallet' OR v_order.payment_status != 'paid' THEN
        RAISE EXCEPTION 'Pesanan ini tidak dibayar via WiraPay, tidak ada saldo untuk direfund';
    END IF;

    IF COALESCE(v_order.total_price, 0) <= 0 THEN
        RAISE EXCEPTION 'Nominal pesanan tidak valid';
    END IF;

    UPDATE public.users
    SET wallet_balance = COALESCE(wallet_balance, 0) + v_order.total_price
    WHERE id = auth.uid();

    INSERT INTO public.transactions (user_id, amount, type, status, description)
    VALUES (auth.uid(), v_order.total_price, 'refund', 'success',
            COALESCE(p_description, 'Refund Layanan') || ' (Order ' || p_order_id || ')');

    -- Marking the order cancelled here, atomically with the credit and
    -- still holding the row lock, is what makes a second call safe: it
    -- will see status = 'cancelled' and hit the check above instead of
    -- crediting again.
    UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Verification queries - run after applying
-- ============================================================
-- 1. As a real logged-in customer with a 'pending' WiraPay-paid order:
--    select wallet_refund('<that order id>', 'test');
--    -> should return true, wallet_balance should increase by the order's
--       total_price, and the order's status should become 'cancelled'.
-- 2. Immediately call it again with the SAME order id:
--    -> should raise "Pesanan ini sudah tidak bisa dibatalkan/direfund
--       (status saat ini: cancelled)" and NOT change wallet_balance again.
-- 3. Two concurrent calls against the same pending order (simulating a
--    double-click) should result in exactly ONE successful credit and one
--    exception - never two credits. See the Node test script referenced
--    in this session's final report for how this was verified.
