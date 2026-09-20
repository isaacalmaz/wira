-- Add accepted_at column to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

-- Trigger function to set accepted_at when status changes to 'accepted'
CREATE OR REPLACE FUNCTION public.set_order_accepted_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
        NEW.accepted_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_order_accepted_at ON public.orders;
CREATE TRIGGER trg_set_order_accepted_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.set_order_accepted_at();

-- Update existing wallet_refund_matched_ride to enforce the 3 minute rule
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
    ELSIF v_order.status NOT IN ('accepted', 'picking_up') THEN
        RAISE EXCEPTION 'Pesanan ini sudah tidak bisa dibatalkan (status saat ini: %)', v_order.status;
    END IF;

    -- ONLY customers are bound by the 3 minute rule. Drivers can cancel whenever before in_trip.
    IF NOT v_is_driver AND v_order.accepted_at IS NOT NULL THEN
        v_time_since_accept := NOW() - v_order.accepted_at;
        IF EXTRACT(EPOCH FROM v_time_since_accept) > 180 THEN
            RAISE EXCEPTION 'Pesanan sudah tidak bisa dibatalkan (lebih dari 3 menit sejak diterima)';
        END IF;
    END IF;

    UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;

    IF v_order.payment_method = 'wallet' AND v_order.payment_status = 'paid' AND COALESCE(v_order.total_price, 0) > 0 THEN
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
