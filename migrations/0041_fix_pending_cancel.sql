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

    IF v_order.payment_method = 'wirapay' AND v_order.payment_status = 'paid' THEN
        UPDATE public.users
        SET wallet_balance = wallet_balance + v_order.total_price
        WHERE id = v_order.user_id;

        INSERT INTO public.transactions (
            user_id, type, amount, status, description, created_at, reference_id
        ) VALUES (
            v_order.user_id, 'topup', v_order.total_price, 'success', p_description, NOW(), p_order_id::text
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
