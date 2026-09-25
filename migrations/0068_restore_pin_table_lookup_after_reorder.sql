-- =============================================================================
-- Migration 0068: restore start_order_with_pin after an out-of-order re-run
-- =============================================================================
-- 0066 and 0067 were applied to the live database in the WRONG relative
-- order (0067 first, then 0066), even though their file numbers say
-- otherwise. Both files define `start_order_with_pin` via CREATE OR REPLACE
-- FUNCTION, and Postgres just keeps whichever definition ran last - so once
-- 0066 was (re-)applied after 0067, it silently overwrote 0067's version
-- (which reads the PIN from the new `order_security_pins` table) with its
-- own older version (which reads `v_order.security_pin`, a column 0067
-- already dropped from `orders`).
--
-- Confirmed live: every call to start_order_with_pin failed immediately
-- with `record "v_order" has no field "security_pin"` - the anti-fraud PIN
-- flow was completely broken again, in the opposite direction from the bug
-- 0067 originally fixed.
--
-- This migration does not change any logic - it is byte-for-byte the same
-- function body as 0067's version - it only re-establishes it as the
-- current definition so it can no longer matter which of 0066/0067 a given
-- database happened to run last.
-- =============================================================================

CREATE OR REPLACE FUNCTION start_order_with_pin(p_order_id UUID, p_pin_input VARCHAR(4))
RETURNS JSONB AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_caller UUID := auth.uid();
    v_real_pin VARCHAR(4);
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pesanan tidak ditemukan');
    END IF;

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

    SELECT pin INTO v_real_pin FROM public.order_security_pins WHERE order_id = p_order_id;

    IF v_real_pin IS DISTINCT FROM p_pin_input THEN
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
-- As the real assigned driver, with the real PIN read from
-- order_security_pins (never orders.security_pin, which no longer exists),
-- start_order_with_pin should succeed and move the order to 'in_trip'.
-- =============================================================================
