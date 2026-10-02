-- Migration 0095: the monthly pool package renews itself (opt-in).
--
-- 0090 sold "Paket Bulanan" as four weekly visits paid at once; the
-- customer had to book again every month. Now, when booking, the customer
-- can tick "perpanjang otomatis". Three days before the next four-week
-- period starts, renew_pool_subscriptions() (pg_cron, hourly) creates the
-- next four visits on the same weekday and time, charges WiraPay once for
-- them, and offers them first to the technician who did the last package.
-- If the balance is short, the subscription pauses and the customer is
-- told to top up and switch it back on. The customer can stop or restart
-- it any time (set_pool_subscription_active).
--
-- Depends on 0090 (create_pool_package, MONTHLY_VISIT), 0089, 0088. Needs
-- pg_cron. Re-runnable.

CREATE TABLE IF NOT EXISTS public.pool_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    details TEXT,
    pickup_lat DOUBLE PRECISION,
    pickup_lng DOUBLE PRECISION,
    next_start TIMESTAMPTZ NOT NULL,
    last_package_id UUID,
    active BOOLEAN NOT NULL DEFAULT true,
    paused_reason TEXT,
    renewals INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pool_subscriptions_due_idx ON public.pool_subscriptions (next_start) WHERE active;
ALTER TABLE public.pool_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pool_subscriptions_select ON public.pool_subscriptions;
CREATE POLICY pool_subscriptions_select ON public.pool_subscriptions FOR SELECT
    USING (customer_id = auth.uid() OR is_admin());
REVOKE ALL ON public.pool_subscriptions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.pool_subscriptions FROM authenticated;
GRANT SELECT ON public.pool_subscriptions TO authenticated;

-- 0090's package plus the opt-in. The old five-argument version is
-- replaced (two overloads would make named calls ambiguous).
DROP FUNCTION IF EXISTS public.create_pool_package(TIMESTAMPTZ, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION);
CREATE OR REPLACE FUNCTION public.create_pool_package(
    p_first_visit TIMESTAMPTZ, p_title TEXT, p_details TEXT,
    p_pickup_lat DOUBLE PRECISION DEFAULT NULL, p_pickup_lng DOUBLE PRECISION DEFAULT NULL,
    p_auto_renew BOOLEAN DEFAULT false
)
RETURNS UUID AS $$
DECLARE
    v_package UUID := gen_random_uuid();
    i INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Anda harus login';
    END IF;
    FOR i IN 0..3 LOOP
        PERFORM public.create_order_and_pay(
            p_service_type => 'pool',
            p_title => COALESCE(p_title, 'Paket Kolam Bulanan') || ' (' || (i + 1) || '/4)',
            p_details => p_details,
            p_pickup_lat => p_pickup_lat,
            p_pickup_lng => p_pickup_lng,
            p_metadata => jsonb_build_object(
                'scheduled_at', p_first_visit + make_interval(days => 7 * i),
                'package_id', v_package, 'package_visit', i + 1, 'package_size', 4),
            p_rate_code => 'MONTHLY_VISIT',
            p_payment_description => 'WiraPool - Paket Bulanan (' || (i + 1) || '/4)'
        );
    END LOOP;
    IF COALESCE(p_auto_renew, false) THEN
        PERFORM public.start_pool_subscription(v_package, p_first_visit + INTERVAL '28 days',
                                               COALESCE(p_title, 'Paket Kolam Bulanan'), p_details, p_pickup_lat, p_pickup_lng);
    END IF;
    RETURN v_package;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;
REVOKE ALL ON FUNCTION public.create_pool_package(TIMESTAMPTZ, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pool_package(TIMESTAMPTZ, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN) TO authenticated;

-- Records the subscription for the caller's own package (definer: the
-- table has no insert grant).
CREATE OR REPLACE FUNCTION public.start_pool_subscription(
    p_package_id UUID, p_next_start TIMESTAMPTZ, p_title TEXT, p_details TEXT,
    p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE package_id = p_package_id AND user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Paket tidak ditemukan';
    END IF;
    INSERT INTO public.pool_subscriptions (customer_id, title, details, pickup_lat, pickup_lng, next_start, last_package_id)
    VALUES (auth.uid(), p_title, p_details, p_lat, p_lng, p_next_start, p_package_id)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.start_pool_subscription(UUID, TIMESTAMPTZ, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_pool_subscription(UUID, TIMESTAMPTZ, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- Customer stops or restarts. Restarting moves the next period to the
-- first matching weekday/time at least a day away.
CREATE OR REPLACE FUNCTION public.set_pool_subscription_active(p_id UUID, p_active BOOLEAN)
RETURNS TIMESTAMPTZ AS $$
DECLARE
    s RECORD;
    v_next TIMESTAMPTZ;
BEGIN
    SELECT * INTO s FROM public.pool_subscriptions WHERE id = p_id AND customer_id = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Langganan tidak ditemukan';
    END IF;
    v_next := s.next_start;
    IF p_active THEN
        WHILE v_next < NOW() + INTERVAL '1 day' LOOP
            v_next := v_next + INTERVAL '7 days';
        END LOOP;
    END IF;
    UPDATE public.pool_subscriptions
    SET active = p_active, next_start = v_next, paused_reason = CASE WHEN p_active THEN NULL ELSE 'Dihentikan pelanggan' END,
        updated_at = NOW()
    WHERE id = p_id;
    RETURN v_next;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.set_pool_subscription_active(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pool_subscription_active(UUID, BOOLEAN) TO authenticated;

-- Creates the next four visits for subscriptions starting within 3 days.
CREATE OR REPLACE FUNCTION public.renew_pool_subscriptions()
RETURNS INT AS $$
DECLARE
    s RECORD;
    v_visit NUMERIC;
    v_total NUMERIC;
    v_package UUID;
    v_tech UUID;
    i INT;
    n INT := 0;
BEGIN
    SELECT CEIL(base_price / 4) INTO v_visit FROM public.pricing_rules
    WHERE service_type = 'pool' AND code = 'MONTHLY' AND is_active = true;
    IF v_visit IS NULL THEN
        RETURN 0;
    END IF;
    v_total := v_visit * 4;

    FOR s IN SELECT * FROM public.pool_subscriptions
             WHERE active AND next_start <= NOW() + INTERVAL '3 days'
             FOR UPDATE SKIP LOCKED LOOP
        -- Visits must still be ahead; skip whole weeks that already passed.
        WHILE s.next_start < NOW() + INTERVAL '2 hours' LOOP
            s.next_start := s.next_start + INTERVAL '7 days';
        END LOOP;

        UPDATE public.users SET wallet_balance = wallet_balance - v_total
        WHERE id = s.customer_id AND wallet_balance >= v_total;
        IF NOT FOUND THEN
            UPDATE public.pool_subscriptions
            SET active = false, paused_reason = 'Saldo WiraPay kurang', next_start = s.next_start, updated_at = NOW()
            WHERE id = s.id;
            INSERT INTO public.notifications (user_id, title, description, is_read)
            VALUES (s.customer_id, 'Perpanjangan paket kolam ditunda',
                    'Saldo WiraPay belum cukup untuk ' || public.format_rupiah(v_total)
                    || '. Isi saldo lalu aktifkan lagi langganan di halaman WiraPool.', false);
            CONTINUE;
        END IF;
        INSERT INTO public.transactions (user_id, amount, type, status, description, reference_id)
        VALUES (s.customer_id, v_total, 'payment', 'success', 'WiraPool - Perpanjangan Paket Bulanan', s.id::text);

        -- Offer the new visits first to the technician of the last package.
        SELECT o.driver_id INTO v_tech FROM public.orders o
        WHERE o.package_id = s.last_package_id AND o.driver_id IS NOT NULL
        ORDER BY o.scheduled_at DESC LIMIT 1;

        v_package := gen_random_uuid();
        FOR i IN 0..3 LOOP
            INSERT INTO public.orders (user_id, service_type, status, total_price, title, details,
                                       payment_method, payment_status, paid_at, pickup_lat, pickup_lng,
                                       rate_code, metadata)
            VALUES (s.customer_id, 'pool', 'pending', v_visit, s.title || ' (' || (i + 1) || '/4)', s.details,
                    'wallet', 'paid', NOW(), s.pickup_lat, s.pickup_lng, 'MONTHLY_VISIT',
                    jsonb_build_object('scheduled_at', s.next_start + make_interval(days => 7 * i),
                                       'package_id', v_package, 'package_visit', i + 1, 'package_size', 4,
                                       'renewal_of', s.id)
                    || CASE WHEN v_tech IS NOT NULL THEN jsonb_build_object('preferred_partner_id', v_tech) ELSE '{}'::jsonb END);
        END LOOP;

        UPDATE public.pool_subscriptions
        SET next_start = s.next_start + INTERVAL '28 days', last_package_id = v_package,
            renewals = renewals + 1, updated_at = NOW()
        WHERE id = s.id;
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (s.customer_id, 'Paket kolam diperpanjang',
                '4 kunjungan berikutnya mulai ' || to_char(s.next_start AT TIME ZONE 'Asia/Makassar', 'DD-MM-YYYY HH24:MI')
                || ' WITA. ' || public.format_rupiah(v_total) || ' dibayar dari WiraPay.', false);
        n := n + 1;
    END LOOP;
    RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.renew_pool_subscriptions() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule('wira-pool-renewals', '17 * * * *', 'SELECT public.renew_pool_subscriptions()');
    END IF;
END $$;

-- Verify after applying:
--   SELECT jobname FROM cron.job WHERE jobname = 'wira-pool-renewals';  -> 1 row
