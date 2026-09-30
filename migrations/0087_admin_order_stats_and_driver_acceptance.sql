-- Migration 0087: server-side aggregates that replace two "fetch every row
-- and add it up in the browser" patterns, plus a real driver acceptance rate.
--
-- 1. admin_order_stats(p_tz)
--    The admin Dashboard and Finance pages downloaded every order
--    (SELECT total_price, status, created_at, service_type FROM orders, no
--    limit) and summed them client-side, and the Dashboard also downloaded
--    every user row just to count drivers. That grows without bound and gets
--    silently truncated at PostgREST's max-rows. This returns the same
--    figures from one scan: GMV and count of completed orders, orders placed
--    today, completed GMV per local day for the last 7 days, orders per
--    service_type, and the number of driver accounts. "Today"/days are
--    calendar days in p_tz (default WITA), not UTC.
--    Readable by every admin-panel role, including 'Admin Keuangan' and 'CS'
--    (is_admin() from 0026 only knows admin/Superadmin/superadmin/Admin Ops).
--
-- 2. get_my_acceptance_rate(p_days)
--    Wira Mitra showed "Tingkat Penerimaan" as a hard-coded 100% / 0%. The
--    server dispatcher (0072) logs every offer in order_dispatch_pings, which
--    has RLS on with no policies, so the app cannot read it. This returns,
--    for the calling driver only, how many distinct orders were offered to
--    them in the last p_days and how many of those they ended up taking.
--
-- Both are SECURITY DEFINER with a pinned search_path, STABLE, and callable
-- by authenticated users only. Re-runnable.

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
        'completed_count', COUNT(*) FILTER (WHERE o.status = 'completed'),
        'orders_today', COUNT(*) FILTER (WHERE (o.created_at AT TIME ZONE p_tz)::date = v_today),
        'by_service', COALESCE((
            SELECT jsonb_object_agg(COALESCE(s.service_type, 'lainnya'), s.n)
            FROM (SELECT service_type, COUNT(*) AS n FROM public.orders GROUP BY service_type) s
        ), '{}'::jsonb),
        'daily', (
            SELECT jsonb_agg(jsonb_build_object('day', d.day, 'gmv', COALESCE(d.gmv, 0)) ORDER BY d.day)
            FROM (
                SELECT gs.day::date AS day,
                       (SELECT SUM(x.total_price) FROM public.orders x
                        WHERE x.status = 'completed'
                          AND (x.created_at AT TIME ZONE p_tz)::date = gs.day::date) AS gmv
                FROM generate_series(v_today - 6, v_today, INTERVAL '1 day') AS gs(day)
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


CREATE OR REPLACE FUNCTION public.get_my_acceptance_rate(p_days INT DEFAULT 30)
RETURNS TABLE (offered INT, accepted INT) AS $$
    SELECT
        COUNT(DISTINCT p.order_id)::INT AS offered,
        COUNT(DISTINCT p.order_id) FILTER (WHERE o.driver_id = auth.uid())::INT AS accepted
    FROM public.order_dispatch_pings p
    JOIN public.orders o ON o.id = p.order_id
    WHERE p.driver_id = auth.uid()
      AND p.pinged_at > NOW() - make_interval(days => GREATEST(p_days, 1));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_my_acceptance_rate(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_acceptance_rate(INT) TO authenticated;
