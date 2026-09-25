-- Migration 0077: pay an order directly with the static QRIS (part 1 of 2).
-- Pool/Villa "QRIS": the order is created with status 'awaiting_payment'
-- (every mitra list, realtime handler and dispatch only looks at
-- 'pending', so nobody sees it yet) together with a pending top-up request
-- for its price, linked by topup_requests.order_id. When the Mutasiku
-- webhook (or an admin) approves that top-up, 0078 pays the order from the
-- just-credited wallet and moves it to 'pending'. Under the hood it is a
-- WiraPay order (payment_method 'wallet'): refunds/payouts unchanged.

ALTER TABLE public.topup_requests ADD COLUMN IF NOT EXISTS order_id UUID
    REFERENCES public.orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS topup_requests_order_id_idx
    ON public.topup_requests (order_id) WHERE order_id IS NOT NULL;

-- Named trg_zz_ so it fires after 0070's state machine (triggers run in name
-- order), which only accepts status 'pending' on insert. The flag, like
-- wira.wallet_checkout, can only be set inside create_order_awaiting_qris.
CREATE OR REPLACE FUNCTION public.park_order_awaiting_qris()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('wira.qris_checkout', true) = 'on'
       AND NEW.payment_method = 'wallet' AND NEW.payment_status = 'unpaid' THEN
        NEW.status := 'awaiting_payment';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_zz_orders_await_qris ON public.orders;
CREATE TRIGGER trg_zz_orders_await_qris BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.park_order_awaiting_qris();

-- SECURITY INVOKER like create_order_and_pay: the 0059 trigger recomputes
-- total_price for the calling customer. Returns the order plus the exact
-- QRIS amount to pay.
CREATE OR REPLACE FUNCTION public.create_order_awaiting_qris(
    p_service_type TEXT, p_merchant_id UUID DEFAULT NULL, p_title TEXT DEFAULT NULL,
    p_details TEXT DEFAULT NULL, p_total_price NUMERIC DEFAULT NULL,
    p_pickup_lat DOUBLE PRECISION DEFAULT NULL, p_pickup_lng DOUBLE PRECISION DEFAULT NULL,
    p_dropoff_lat DOUBLE PRECISION DEFAULT NULL, p_dropoff_lng DOUBLE PRECISION DEFAULT NULL,
    p_delivery_fee NUMERIC DEFAULT 0, p_package_size TEXT DEFAULT NULL, p_metadata JSONB DEFAULT NULL,
    p_rate_code TEXT DEFAULT NULL, p_distance_meters NUMERIC DEFAULT NULL,
    p_nights INTEGER DEFAULT NULL, p_promo_code TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_order public.orders%ROWTYPE;
    v_req public.topup_requests%ROWTYPE;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Anda harus login untuk membayar dengan QRIS';
    END IF;
    -- Same rule as create_order_and_pay: only server-priceable orders.
    IF NOT COALESCE((p_service_type IN ('send', 'service', 'pool') AND p_rate_code IS NOT NULL)
        OR (p_service_type = 'villa' AND COALESCE(p_nights >= 1, false) AND p_merchant_id IS NOT NULL), false) THEN
        RAISE EXCEPTION 'Pembayaran QRIS langsung belum tersedia untuk pesanan %', p_service_type;
    END IF;

    PERFORM set_config('wira.wallet_checkout', 'on', true);
    PERFORM set_config('wira.qris_checkout', 'on', true);
    INSERT INTO public.orders (
        user_id, merchant_id, service_type, status, total_price, title, details,
        payment_method, payment_status, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
        delivery_fee, package_size, metadata, rate_code, distance_meters, nights, promo_code
    ) VALUES (
        v_caller, p_merchant_id, p_service_type, 'pending', p_total_price, p_title, p_details,
        'wallet', 'unpaid', p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng,
        COALESCE(p_delivery_fee, 0), p_package_size, p_metadata, p_rate_code, p_distance_meters, p_nights, p_promo_code
    ) RETURNING * INTO v_order;
    PERFORM set_config('wira.wallet_checkout', 'off', true);
    PERFORM set_config('wira.qris_checkout', 'off', true);
    IF COALESCE(v_order.total_price, 0) <= 0 THEN
        RAISE EXCEPTION 'Nominal pesanan tidak valid';
    END IF;

    -- A whole-thousand amount makes 0045's trigger always add its 101-999
    -- unique code on top, so the QRIS nominal is strictly above the price;
    -- the few hundred rupiah extra stay in the customer's wallet.
    INSERT INTO public.topup_requests (user_id, amount, status, method, order_id)
    VALUES (v_caller, CEIL(v_order.total_price / 1000) * 1000, 'pending', 'manual', v_order.id)
    RETURNING * INTO v_req;

    RETURN jsonb_build_object('order', to_jsonb(v_order), 'qris_amount', v_req.amount);
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

REVOKE ALL ON FUNCTION public.create_order_awaiting_qris(TEXT, UUID, TEXT, TEXT, NUMERIC, DOUBLE PRECISION,
    DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC, TEXT, JSONB, TEXT, NUMERIC, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_awaiting_qris(TEXT, UUID, TEXT, TEXT, NUMERIC, DOUBLE PRECISION,
    DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC, TEXT, JSONB, TEXT, NUMERIC, INTEGER, TEXT) TO authenticated;
