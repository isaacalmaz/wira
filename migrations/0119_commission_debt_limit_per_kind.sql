-- =========================================
-- 0119: commission debt limit per kind of partner
--
--   * commission_debt_limits: one row per partner kind (driver, merchant =
--     restoran, villa, technician, nanny) with its own debt limit and grace
--     days, seeded from the global app_settings values (Rp 200.000 / 7 days).
--     Edited in Admin > Keuangan > Rekening & batas via
--     admin_set_commission_debt_limit (core or finance admins, audited).
--   * commission_debt_policy(user): the limit that applies to one account.
--     An account with several kinds gets the most lenient one (highest
--     limit, longest grace), so one role never locks out the others. No
--     kind (or no row) falls back to the global app_settings values.
--   * commission_debt_block (0109) and the admin 'commission_debtors' queue
--     (0116 admin_attention) use it.
--   * my_commission_status(): balance, debt start, the applying limit and
--     whether new orders are blocked, for the partner's Pendapatan page.
-- =========================================

CREATE TABLE IF NOT EXISTS public.commission_debt_limits (
    kind TEXT PRIMARY KEY CHECK (kind IN ('driver', 'merchant', 'villa', 'technician', 'nanny')),
    label TEXT NOT NULL,
    debt_limit INT NOT NULL CHECK (debt_limit BETWEEN 10000 AND 10000000),
    grace_days INT NOT NULL CHECK (grace_days BETWEEN 0 AND 60),
    sort_order INT NOT NULL DEFAULT 100,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);
INSERT INTO public.commission_debt_limits (kind, label, debt_limit, grace_days, sort_order)
SELECT k.kind, k.label,
       LEAST(GREATEST(public.app_setting_int('commission_debt_limit', 200000), 10000), 10000000),
       LEAST(GREATEST(public.app_setting_int('commission_debt_grace_days', 7), 0), 60),
       k.sort_order
FROM (VALUES ('driver', 'Driver', 10), ('merchant', 'Restoran', 20), ('villa', 'Villa', 30),
             ('technician', 'Teknisi', 40), ('nanny', 'Pengasuh', 50)) AS k(kind, label, sort_order)
ON CONFLICT (kind) DO NOTHING;

ALTER TABLE public.commission_debt_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS commission_debt_limits_read ON public.commission_debt_limits;
CREATE POLICY commission_debt_limits_read ON public.commission_debt_limits FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.commission_debt_policy(p_user UUID)
RETURNS TABLE (debt_limit INT, grace_days INT) AS $$
    SELECT COALESCE(MAX(l.debt_limit), public.app_setting_int('commission_debt_limit', 200000)),
           COALESCE(MAX(l.grace_days), public.app_setting_int('commission_debt_grace_days', 7))
    FROM public.users u
    LEFT JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(u.mitra_access) = 'array' THEN u.mitra_access ELSE '[]'::jsonb END) AS k(kind) ON true
    LEFT JOIN public.commission_debt_limits l ON l.kind = k.kind
    WHERE u.id = p_user;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 0109 body, limit from the account's policy.
CREATE OR REPLACE FUNCTION public.commission_debt_block(p_user UUID)
RETURNS TEXT AS $$
DECLARE
    v_balance NUMERIC;
    v_since TIMESTAMPTZ;
    v_limit INT;
    v_grace INT;
BEGIN
    SELECT payable_balance, commission_debt_since INTO v_balance, v_since FROM public.users WHERE id = p_user;
    SELECT p.debt_limit, p.grace_days INTO v_limit, v_grace FROM public.commission_debt_policy(p_user) p;
    IF COALESCE(v_balance, 0) <= -v_limit AND v_since IS NOT NULL
       AND v_since < NOW() - make_interval(days => v_grace) THEN
        RETURN 'Komisi Rp ' || replace(to_char(-v_balance, 'FM999,999,999,999'), ',', '.')
            || ' belum disetor lebih dari ' || v_grace || ' hari. Setor dulu lewat menu Pendapatan -> Setor Komisi untuk menerima pesanan baru.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.my_commission_status()
RETURNS TABLE (balance NUMERIC, debt_since TIMESTAMPTZ, debt_limit INT, grace_days INT, blocked BOOLEAN, block_message TEXT) AS $$
    SELECT COALESCE(u.payable_balance, 0), u.commission_debt_since, p.debt_limit, p.grace_days,
           public.commission_debt_block(u.id) IS NOT NULL, public.commission_debt_block(u.id)
    FROM public.users u, public.commission_debt_policy(u.id) p
    WHERE u.id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_set_commission_debt_limit(p_kind TEXT, p_debt_limit INT, p_grace_days INT)
RETURNS JSONB AS $$
DECLARE
    v_old public.commission_debt_limits%ROWTYPE;
BEGIN
    IF NOT (public.admin_can('core') OR public.admin_can('finance')) THEN
        RAISE EXCEPTION 'Khusus admin inti atau keuangan' USING ERRCODE = '42501';
    END IF;
    IF p_debt_limit IS NULL OR p_debt_limit NOT BETWEEN 10000 AND 10000000 THEN
        RAISE EXCEPTION 'Batas utang komisi harus Rp 10.000 sampai Rp 10.000.000';
    END IF;
    IF p_grace_days IS NULL OR p_grace_days NOT BETWEEN 0 AND 60 THEN
        RAISE EXCEPTION 'Masa tenggang harus 0 sampai 60 hari';
    END IF;
    SELECT * INTO v_old FROM public.commission_debt_limits WHERE kind = p_kind FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Jenis mitra tidak dikenal: %', p_kind;
    END IF;
    IF v_old.debt_limit = p_debt_limit AND v_old.grace_days = p_grace_days THEN
        RETURN to_jsonb(v_old);
    END IF;
    UPDATE public.commission_debt_limits
    SET debt_limit = p_debt_limit, grace_days = p_grace_days, updated_at = NOW(), updated_by = auth.uid()
    WHERE kind = p_kind;
    PERFORM public.log_admin_action('commission_debt_limit_changed', 'setting', p_kind, NULL,
        v_old.label || ': Rp ' || replace(to_char(p_debt_limit, 'FM999,999,999'), ',', '.') || ' / ' || p_grace_days || ' hari',
        jsonb_build_object('from', jsonb_build_object('debt_limit', v_old.debt_limit, 'grace_days', v_old.grace_days),
                           'to', jsonb_build_object('debt_limit', p_debt_limit, 'grace_days', p_grace_days)));
    RETURN (SELECT to_jsonb(l) FROM public.commission_debt_limits l WHERE kind = p_kind);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
                               WHERE payable_balance < 0 AND public.commission_debt_block(id) IS NOT NULL),
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

REVOKE ALL ON FUNCTION public.commission_debt_policy(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_commission_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_commission_debt_limit(TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_debt_policy(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_commission_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_commission_debt_limit(TEXT, INT, INT) TO authenticated;

-- Verify after applying:
--   SELECT kind, debt_limit, grace_days FROM commission_debt_limits ORDER BY sort_order;
--   SELECT * FROM commission_debt_policy('<partner user id>');
