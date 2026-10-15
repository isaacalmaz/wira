-- =========================================
-- 0138: dashboard charts by period (Hari ini / Minggu ini / Bulan ini)
--
-- The owner wants the admin dashboard charts to cover a chosen period
-- instead of a fixed "last 7 days" line and an all-time service bar.
--
-- admin_dashboard_period(p_period, p_tz) -> JSONB, read-only, admin panel only:
--   p_period 'today'  -> hourly buckets from 00:00 to the current hour
--            'week'   -> daily buckets from Monday to today
--            'month'  -> daily buckets from the 1st to today
--   (calendar periods in Lombok time, Asia/Makassar by default)
--   {period, start, gmv, commission, completed, orders,
--    by_service: {service_type: orders},
--    series: [{at: 'YYYY-MM-DDTHH24:MI' local, gmv, commission, orders}]}
-- Orders count by created_at, like admin_order_stats (0099); gmv and
-- commission only from completed orders, with the same commission formula
-- (stamped rate via order_commission_rate, materials never cut).
-- =========================================

CREATE OR REPLACE FUNCTION public.admin_dashboard_period(p_period TEXT, p_tz TEXT DEFAULT 'Asia/Makassar')
RETURNS JSONB AS $$
DECLARE
    v_now TIMESTAMP := NOW() AT TIME ZONE p_tz;
    v_unit TEXT;
    v_step INTERVAL;
    v_start TIMESTAMP;
BEGIN
    IF NOT public.is_admin_panel() THEN
        RAISE EXCEPTION 'Khusus admin' USING ERRCODE = '42501';
    END IF;
    IF p_period = 'today' THEN
        v_unit := 'hour'; v_step := INTERVAL '1 hour'; v_start := date_trunc('day', v_now);
    ELSIF p_period = 'week' THEN
        v_unit := 'day'; v_step := INTERVAL '1 day'; v_start := date_trunc('week', v_now);
    ELSIF p_period = 'month' THEN
        v_unit := 'day'; v_step := INTERVAL '1 day'; v_start := date_trunc('month', v_now);
    ELSE
        RAISE EXCEPTION 'Periode tidak dikenal: %', p_period;
    END IF;

    RETURN (
        WITH o AS (
            SELECT date_trunc(v_unit, x.created_at AT TIME ZONE p_tz) AS bucket,
                   x.service_type, x.status,
                   CASE WHEN x.status = 'completed' THEN COALESCE(x.total_price, 0) ELSE 0 END AS gmv,
                   CASE WHEN x.status = 'completed' THEN
                       (COALESCE(x.total_price, 0) - LEAST(GREATEST(COALESCE(x.material_amount, 0), 0), COALESCE(x.total_price, 0)))
                       * public.order_commission_rate(x.commission_rate, x.service_type)
                   ELSE 0 END AS commission
            FROM public.orders x
            WHERE (x.created_at AT TIME ZONE p_tz) >= v_start
        )
        SELECT jsonb_build_object(
            'period', p_period,
            'start', to_char(v_start, 'YYYY-MM-DD"T"HH24:MI'),
            'gmv', COALESCE((SELECT SUM(gmv) FROM o), 0),
            'commission', COALESCE((SELECT ROUND(SUM(commission)) FROM o), 0),
            'completed', (SELECT COUNT(*) FROM o WHERE status = 'completed'),
            'orders', (SELECT COUNT(*) FROM o),
            'by_service', COALESCE((
                SELECT jsonb_object_agg(COALESCE(s.service_type, 'lainnya'), s.n)
                FROM (SELECT service_type, COUNT(*) AS n FROM o GROUP BY service_type) s
            ), '{}'::jsonb),
            'series', (
                SELECT jsonb_agg(jsonb_build_object(
                           'at', to_char(gs.b, 'YYYY-MM-DD"T"HH24:MI'),
                           'gmv', COALESCE(a.gmv, 0),
                           'commission', COALESCE(ROUND(a.commission), 0),
                           'orders', COALESCE(a.orders, 0)) ORDER BY gs.b)
                FROM generate_series(v_start, date_trunc(v_unit, v_now), v_step) AS gs(b)
                LEFT JOIN (
                    SELECT bucket, SUM(gmv) AS gmv, SUM(commission) AS commission, COUNT(*) AS orders
                    FROM o GROUP BY bucket
                ) a ON a.bucket = gs.b
            )
        )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_dashboard_period(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_period(TEXT, TEXT) TO authenticated;

-- Verify (as an admin): SELECT admin_dashboard_period('week');
