-- Migration 0098: villa commission 5%.
--
-- Wira kept 20% of every completed order. For villas that is too much
-- next to what hosts pay elsewhere, so the owner set it to 5% (2026-10-02):
-- a host now keeps 95% of the rent. Rides, deliveries, food and service
-- work stay at 20%; projects stay at 10% (0093).
--
--   * platform_commission_rate(service_type): the one place the rate
--     lives; the payout trigger and the admin statistics both read it.
--   * credit_payout_on_order_completed: 0090's body, with the rate taken
--     from that function. Cash bookings work as before (0075): the host
--     already holds the money, so only the 5% is taken from their balance.
--   * admin_order_stats: 0087's figures plus 'commission' (platform income
--     per order at its own rate, materials excluded) overall and per day,
--     so the admin dashboard stops assuming a flat 20%.
--
-- Only orders completed after this runs use the new rate. Re-runnable.
-- Depends on 0087, 0090.

CREATE OR REPLACE FUNCTION public.platform_commission_rate(p_service_type TEXT)
RETURNS NUMERIC AS $$
    SELECT CASE WHEN p_service_type IN ('villa', 'WiraVilla') THEN 0.05 ELSE 0.20 END::NUMERIC;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.credit_payout_on_order_completed()
RETURNS TRIGGER AS $$
DECLARE
    v_commission_rate NUMERIC := public.platform_commission_rate(NEW.service_type);
    v_delivery_fee NUMERIC := COALESCE(NEW.delivery_fee, 0);
    v_material NUMERIC := LEAST(GREATEST(COALESCE(NEW.material_amount, 0), 0), COALESCE(NEW.total_price, 0));
    v_merchant_owner UUID;
    v_merchant_share NUMERIC;
    v_driver_share NUMERIC;
    v_collector UUID;
BEGIN
    IF NEW.status IS DISTINCT FROM 'completed' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
        RETURN NEW;
    END IF;

    IF NEW.merchant_id IS NOT NULL THEN
        SELECT owner_id INTO v_merchant_owner FROM public.merchants WHERE id = NEW.merchant_id;
        IF v_merchant_owner IS NOT NULL THEN
            v_merchant_share := GREATEST(COALESCE(NEW.total_price, 0) - v_delivery_fee, 0) * (1 - v_commission_rate);
            IF v_merchant_share > 0 THEN
                UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) + v_merchant_share WHERE id = v_merchant_owner;
            END IF;
        END IF;
    END IF;

    IF NEW.driver_id IS NOT NULL THEN
        IF NEW.merchant_id IS NOT NULL THEN
            v_driver_share := v_delivery_fee * (1 - v_commission_rate); -- food: driver earns the delivery fee only
        ELSE
            -- ride/send/service/pool: 80% of the work, all of the materials
            v_driver_share := (COALESCE(NEW.total_price, 0) - v_material) * (1 - v_commission_rate) + v_material;
        END IF;
        IF v_driver_share > 0 THEN
            UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) + v_driver_share WHERE id = NEW.driver_id;
        END IF;
    END IF;

    -- 0075: cash was collected in hand, so take the full total_price back
    -- from the collector's balance (leaves exactly the platform's cut owed).
    IF NEW.payment_method = 'cash' AND COALESCE(NEW.total_price, 0) > 0 THEN
        v_collector := COALESCE(NEW.driver_id, v_merchant_owner);
        IF v_collector IS NOT NULL THEN
            UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) - NEW.total_price WHERE id = v_collector;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_order_stats(p_tz TEXT DEFAULT 'Asia/Makassar')
RETURNS JSONB AS $$
DECLARE
    v_today DATE := (NOW() AT TIME ZONE p_tz)::date;
    v_result JSONB;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
          AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops', 'Admin Keuangan', 'CS')
    ) THEN
        RAISE EXCEPTION 'Only admins can read order statistics' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'gmv', COALESCE(SUM(o.total_price) FILTER (WHERE o.status = 'completed'), 0),
        'commission', COALESCE(SUM(
            (COALESCE(o.total_price, 0) - LEAST(GREATEST(COALESCE(o.material_amount, 0), 0), COALESCE(o.total_price, 0)))
            * public.platform_commission_rate(o.service_type)) FILTER (WHERE o.status = 'completed'), 0),
        'completed_count', COUNT(*) FILTER (WHERE o.status = 'completed'),
        'orders_today', COUNT(*) FILTER (WHERE (o.created_at AT TIME ZONE p_tz)::date = v_today),
        'by_service', COALESCE((
            SELECT jsonb_object_agg(COALESCE(s.service_type, 'lainnya'), s.n)
            FROM (SELECT service_type, COUNT(*) AS n FROM public.orders GROUP BY service_type) s
        ), '{}'::jsonb),
        'daily', (
            SELECT jsonb_agg(jsonb_build_object('day', d.day, 'gmv', COALESCE(d.gmv, 0), 'commission', COALESCE(d.commission, 0)) ORDER BY d.day)
            FROM (
                SELECT gs.day::date AS day, x.gmv, x.commission
                FROM generate_series(v_today - 6, v_today, INTERVAL '1 day') AS gs(day)
                LEFT JOIN LATERAL (
                    SELECT SUM(y.total_price) AS gmv,
                           SUM((COALESCE(y.total_price, 0) - LEAST(GREATEST(COALESCE(y.material_amount, 0), 0), COALESCE(y.total_price, 0)))
                               * public.platform_commission_rate(y.service_type)) AS commission
                    FROM public.orders y
                    WHERE y.status = 'completed'
                      AND (y.created_at AT TIME ZONE p_tz)::date = gs.day::date
                ) x ON true
            ) d
        ),
        'drivers', (SELECT COUNT(*) FROM public.users u WHERE u.mitra_access::text ILIKE '%driver%')
    )
    INTO v_result
    FROM public.orders o;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_order_stats(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_order_stats(TEXT) TO authenticated;

-- Verify after applying:
--   SELECT public.platform_commission_rate('villa'), public.platform_commission_rate('ride');  -> 0.05, 0.20
