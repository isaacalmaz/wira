-- =========================================
-- 0116: admin sees every queue; service switches really switch (paket B)
--
--   * admin_attention() (0100) gains the queues added since: pending
--     commission deposits, partners blocked for overdue commission, WiraAsuh
--     requests, villa bookings waiting for the host, QRIS orders awaiting
--     payment, and food ready for 10+ minutes without a courier. The
--     dashboard board and the bell both read it.
--   * Admin -> Fitur Layanan only hid the home tile; /pool etc. still took
--     orders. service_enabled() reads feature_flags 'features_config' and a
--     BEFORE INSERT trigger refuses new orders for a switched-off service
--     (customers and partners; admins exempt). A service with no switch
--     (e.g. WiraAsuh) stays on.
-- Depends on 0100, 0108, 0109.
-- =========================================

CREATE OR REPLACE FUNCTION public.service_enabled(p_service_type TEXT)
RETURNS BOOLEAN AS $$
    SELECT COALESCE((
        SELECT (f ->> 'status')::BOOLEAN
        FROM public.feature_flags ff, jsonb_array_elements(ff.features) f
        WHERE ff.region = 'features_config' AND jsonb_typeof(ff.features) = 'array'
          AND f ->> 'id' = 'wira_' || CASE lower(p_service_type)
                WHEN 'wiraride' THEN 'ride' WHEN 'wirafood' THEN 'food' WHEN 'wirasend' THEN 'send'
                WHEN 'wiravilla' THEN 'villa' WHEN 'babysit' THEN 'asuh' ELSE lower(p_service_type) END
        LIMIT 1
    ), true);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.service_enabled(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_service_enabled()
RETURNS TRIGGER AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') AND NOT public.is_admin_panel()
       AND NOT public.service_enabled(NEW.service_type) THEN
        RAISE EXCEPTION 'Layanan ini sedang tidak tersedia. Silakan coba lagi nanti.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public; -- invoker: current_user is the caller's role
DROP TRIGGER IF EXISTS trg_enforce_service_enabled ON public.orders;
CREATE TRIGGER trg_enforce_service_enabled BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.enforce_service_enabled();

-- 0100 body + the 0116 queues.
CREATE OR REPLACE FUNCTION public.admin_attention()
RETURNS JSONB AS $$
DECLARE
    v JSONB;
BEGIN
    IF NOT public.is_admin_panel() THEN
        RAISE EXCEPTION 'Khusus admin' USING ERRCODE = '42501';
    END IF;
    SELECT jsonb_build_object(
        'applications', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(created_at),
                                 'by_role', COALESCE(jsonb_object_agg(role, n) FILTER (WHERE role IS NOT NULL), '{}'::jsonb))
                         FROM (SELECT role, COUNT(*) AS n, MIN(created_at) AS created_at
                               FROM public.mitra_applications WHERE status = 'Pending' GROUP BY role) a),
        'villa_listings', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(submitted_at))
                           FROM public.merchants WHERE listing_status = 'pending'),
        'stale_orders', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(last_change))
                         FROM public.admin_stale_orders(60)),
        'unmatched_orders', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(COALESCE(paid_at, created_at)))
                             FROM public.orders
                             WHERE status = 'pending' AND driver_id IS NULL
                               AND service_type IN ('ride', 'send', 'food', 'service', 'pool')
                               AND scheduled_at IS NULL
                               AND COALESCE(paid_at, created_at) < NOW() - INTERVAL '10 minutes'),
        'disputes', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(submitted_at))
                     FROM public.project_milestones WHERE status = 'disputed'),
        'payouts', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(created_at), 'amount', COALESCE(SUM(amount), 0))
                    FROM public.payout_requests WHERE status = 'pending'),
        'topups', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(created_at), 'amount', COALESCE(SUM(amount), 0))
                   FROM public.topup_requests WHERE status = 'pending'),
        'tickets', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(created_at))
                    FROM public.support_tickets WHERE status IN ('open', 'in_progress')),
        'low_reviews', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(created_at))
                        FROM public.reviews
                        WHERE rating <= 2 AND NOT COALESCE(is_hidden, false) AND created_at > NOW() - INTERVAL '7 days'),
        -- 0116: queues added after 0100.
        'commission_deposits', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(created_at), 'amount', COALESCE(SUM(amount), 0))
                                FROM public.commission_deposits WHERE status = 'pending'),
        'commission_debtors', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(commission_debt_since), 'amount', COALESCE(-SUM(payable_balance), 0))
                               FROM public.users
                               WHERE payable_balance <= -public.app_setting_int('commission_debt_limit', 200000)
                                 AND commission_debt_since < NOW() - make_interval(days => public.app_setting_int('commission_debt_grace_days', 7))),
        'babysit_requests', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(created_at))
                             FROM public.orders WHERE service_type = 'babysit' AND status = 'pending'),
        'villa_bookings', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(status_changed_at))
                           FROM public.orders WHERE service_type IN ('villa', 'WiraVilla') AND status = 'pending'),
        'awaiting_payment', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(created_at), 'amount', COALESCE(SUM(total_price), 0))
                             FROM public.orders WHERE status = 'awaiting_payment'),
        'food_unclaimed', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(status_changed_at))
                           FROM public.orders WHERE service_type IN ('food', 'WiraFood') AND status = 'ready' AND driver_id IS NULL
                             AND status_changed_at < NOW() - INTERVAL '10 minutes')
    ) INTO v;
    RETURN v;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_attention() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_attention() TO authenticated;

-- Verify: SELECT public.service_enabled('ride'), public.service_enabled('babysit');  -- true, true
