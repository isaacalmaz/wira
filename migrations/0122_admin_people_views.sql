-- =========================================
-- 0122: read functions for the reorganised admin people menus
-- (Pelanggan, Pendaftaran, mitra per jenis, Profil Akun, pencarian).
-- Read-only; admin panel roles only.
--
--   * order_partner_income(order, kind): what one completed order earned
--     the partner after the stamped commission (driver/technician/nanny:
--     delivery fee share for food couriers, else the work share plus
--     materials; restaurant/villa: the menu or rent share). Mirrors
--     driverIncome/merchantIncome in frontend-mitra/services/orderService.js.
--   * admin_partner_list(kind): active partners of one kind with rating,
--     30-day orders and income, commission owed, the limit that applies,
--     online (drivers) and the debt state.
--   * admin_customer_list(): accounts without partner access or staff role,
--     with order counts, last order and the rating partners gave them.
--   * admin_search_accounts(q): up to 8 accounts by name, email or phone.
--   * admin_partner_overview (0101) also returns the customer side, the
--     commission policy and recent orders in every role.
-- =========================================

CREATE OR REPLACE FUNCTION public.order_partner_income(o public.orders, p_kind TEXT)
RETURNS NUMERIC AS $$
    SELECT ROUND(CASE
        WHEN p_kind IN ('merchant', 'villa') THEN
            GREATEST(COALESCE(o.total_price, 0) + COALESCE(o.promo_discount, 0) - COALESCE(o.delivery_fee, 0), 0)
            * (1 - public.order_commission_rate(o.commission_rate, o.service_type))
        WHEN o.merchant_id IS NOT NULL THEN
            COALESCE(o.delivery_fee, 0) * (1 - public.order_commission_rate(o.commission_rate, o.service_type))
        ELSE
            (COALESCE(o.total_price, 0) + COALESCE(o.promo_discount, 0)
             - LEAST(GREATEST(COALESCE(o.material_amount, 0), 0), COALESCE(o.total_price, 0)))
            * (1 - public.order_commission_rate(o.commission_rate, o.service_type))
            + LEAST(GREATEST(COALESCE(o.material_amount, 0), 0), COALESCE(o.total_price, 0))
    END);
$$ LANGUAGE sql STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_partner_list(p_kind TEXT)
RETURNS JSONB AS $$
BEGIN
    IF NOT public.is_admin_panel() THEN
        RAISE EXCEPTION 'Khusus admin' USING ERRCODE = '42501';
    END IF;
    IF p_kind NOT IN ('driver', 'merchant', 'villa', 'technician', 'nanny') THEN
        RAISE EXCEPTION 'Jenis mitra tidak dikenal: %', p_kind;
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(x ORDER BY x.status_rank, x.orders_30d DESC, x.name)
        FROM (
            SELECT u.id, u.name, u.phone, u.email, u.avatar_url, COALESCE(u.status, 'Aktif') AS status,
                   u.vehicle_type, u.mitra_access, u.created_at,
                   CASE WHEN COALESCE(u.status, 'Aktif') = 'Aktif' THEN 0 ELSE 1 END AS status_rank,
                   COALESCE(d.is_online, false) AS online,
                   d.vehicle_plate,
                   r.rating_avg, COALESCE(r.rating_count, 0) AS rating_count,
                   COALESCE(s.orders_30d, 0) AS orders_30d,
                   COALESCE(s.income_30d, 0) AS income_30d,
                   GREATEST(-COALESCE(u.payable_balance, 0), 0) AS commission_owed,
                   u.commission_debt_since,
                   p.debt_limit, p.grace_days,
                   public.commission_debt_block(u.id) IS NOT NULL AS order_locked,
                   (SELECT COUNT(*) FROM public.merchants m WHERE m.owner_id = u.id
                      AND (CASE WHEN p_kind = 'villa' THEN m.service_type IN ('villa', 'WiraVilla')
                                WHEN p_kind = 'merchant' THEN COALESCE(m.service_type, '') NOT IN ('villa', 'WiraVilla')
                                ELSE false END)) AS places,
                   (SELECT t.verified_at IS NOT NULL FROM public.technician_profiles t WHERE t.user_id = u.id) AS verified
            FROM public.users u
            LEFT JOIN public.drivers d ON d.id = u.id
            LEFT JOIN LATERAL public.partner_rating(u.id) r ON true
            LEFT JOIN LATERAL public.commission_debt_policy(u.id) p ON true
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS orders_30d, SUM(public.order_partner_income(o, p_kind)) AS income_30d
                FROM public.orders o
                WHERE o.status = 'completed'
                  AND COALESCE(o.status_changed_at, o.created_at) > NOW() - INTERVAL '30 days'
                  AND CASE p_kind
                      WHEN 'driver' THEN o.driver_id = u.id AND o.service_type NOT IN ('service', 'pool', 'babysit')
                      WHEN 'technician' THEN o.driver_id = u.id AND o.service_type IN ('service', 'pool')
                      WHEN 'nanny' THEN o.driver_id = u.id AND o.service_type = 'babysit'
                      ELSE o.merchant_id IN (SELECT m.id FROM public.merchants m WHERE m.owner_id = u.id
                             AND (CASE WHEN p_kind = 'villa' THEN m.service_type IN ('villa', 'WiraVilla')
                                       ELSE COALESCE(m.service_type, '') NOT IN ('villa', 'WiraVilla') END))
                  END
            ) s ON true
            WHERE COALESCE(u.mitra_access, '[]'::jsonb) ? p_kind
              AND COALESCE(u.status, 'Aktif') <> 'Dihapus'
        ) x
    ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_customer_list()
RETURNS JSONB AS $$
BEGIN
    IF NOT public.is_admin_panel() THEN
        RAISE EXCEPTION 'Khusus admin' USING ERRCODE = '42501';
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(x ORDER BY x.last_order_at DESC NULLS LAST, x.created_at DESC)
        FROM (
            SELECT u.id, u.name, u.phone, u.email, u.avatar_url, COALESCE(u.status, 'Aktif') AS status, u.created_at,
                   (SELECT COUNT(*) FROM public.orders o WHERE o.user_id = u.id) AS orders,
                   (SELECT COUNT(*) FROM public.orders o WHERE o.user_id = u.id AND o.status = 'completed') AS completed,
                   (SELECT COUNT(*) FROM public.orders o WHERE o.user_id = u.id AND o.status = 'cancelled') AS cancelled,
                   (SELECT MAX(o.created_at) FROM public.orders o WHERE o.user_id = u.id) AS last_order_at,
                   (SELECT ROUND(AVG(c.rating)::NUMERIC, 1) FROM public.customer_ratings c WHERE c.customer_id = u.id) AS rating_avg,
                   (SELECT COUNT(*) FROM public.customer_ratings c WHERE c.customer_id = u.id) AS rating_count
            FROM public.users u
            WHERE COALESCE(u.role, 'user') = 'user'
              AND jsonb_array_length(CASE WHEN jsonb_typeof(u.mitra_access) = 'array' THEN u.mitra_access ELSE '[]'::jsonb END) = 0
        ) x
    ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_search_accounts(p_q TEXT)
RETURNS JSONB AS $$
DECLARE
    v_q TEXT := btrim(COALESCE(p_q, ''));
    v_digits TEXT := regexp_replace(COALESCE(p_q, ''), '\D', '', 'g');
BEGIN
    IF NOT public.is_admin_panel() THEN
        RAISE EXCEPTION 'Khusus admin' USING ERRCODE = '42501';
    END IF;
    IF length(v_q) < 2 THEN
        RETURN '[]'::jsonb;
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(x)
        FROM (
            SELECT u.id, u.name, u.email, u.phone, u.role, COALESCE(u.status, 'Aktif') AS status, u.mitra_access
            FROM public.users u
            WHERE u.name ILIKE '%' || v_q || '%'
               OR u.email ILIKE '%' || v_q || '%'
               OR (length(v_digits) >= 4 AND regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g') LIKE '%' || v_digits || '%')
            ORDER BY (u.name ILIKE v_q || '%') DESC, u.name
            LIMIT 8
        ) x
    ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 0101 body + customer side, commission policy, orders in every role.
CREATE OR REPLACE FUNCTION public.admin_partner_overview(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v JSONB;
BEGIN
    IF NOT public.is_admin_panel() THEN
        RAISE EXCEPTION 'Khusus admin' USING ERRCODE = '42501';
    END IF;
    SELECT jsonb_build_object(
        'user', (SELECT jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'phone', u.phone,
                                           'role', u.role, 'status', COALESCE(u.status, 'Aktif'), 'mitra_access', u.mitra_access,
                                           'vehicle_type', u.vehicle_type, 'job_type_preferences', u.job_type_preferences,
                                           'avatar_url', u.avatar_url, 'wallet_balance', u.wallet_balance,
                                           'payable_balance', u.payable_balance, 'created_at', u.created_at,
                                           'commission_debt_since', u.commission_debt_since)
                 FROM public.users u WHERE u.id = p_user_id),
        'applications', COALESCE((SELECT jsonb_agg(to_jsonb(a) - 'auth_id' ORDER BY a.created_at DESC)
                                  FROM public.mitra_applications a WHERE a.auth_id = p_user_id), '[]'::jsonb),
        'merchants', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'service_type', m.service_type,
                                                                 'listing_status', m.listing_status, 'is_open', m.is_open,
                                                                 'address', m.address, 'image', m.image, 'rating', m.rating,
                                                                 'review_note', m.review_note, 'hidden_by_admin', m.hidden_by_admin) ORDER BY m.created_at)
                               FROM public.merchants m WHERE m.owner_id = p_user_id), '[]'::jsonb),
        'technician', (SELECT jsonb_build_object('skills', t.skills, 'is_accepting', t.is_accepting,
                                                 'verified_at', t.verified_at, 'service_areas', t.service_areas)
                       FROM public.technician_profiles t WHERE t.user_id = p_user_id),
        'driver', (SELECT jsonb_build_object('is_online', d.is_online, 'vehicle_plate', d.vehicle_plate)
                   FROM public.drivers d WHERE d.id = p_user_id),
        'rating', (SELECT jsonb_build_object('avg', r.rating_avg, 'count', r.rating_count) FROM public.partner_rating(p_user_id) r),
        'debt', (SELECT jsonb_build_object('limit', p.debt_limit, 'grace_days', p.grace_days,
                                           'locked', public.commission_debt_block(p_user_id) IS NOT NULL)
                 FROM public.commission_debt_policy(p_user_id) p),
        'stats', (SELECT jsonb_build_object(
                      'completed', COUNT(*) FILTER (WHERE o.status = 'completed'),
                      'cancelled', COUNT(*) FILTER (WHERE o.status = 'cancelled'),
                      'active', COUNT(*) FILTER (WHERE o.status NOT IN ('completed', 'cancelled', 'expired', 'pending', 'awaiting_payment')),
                      'gmv_30d', COALESCE(SUM(o.total_price) FILTER (WHERE o.status = 'completed' AND o.created_at > NOW() - INTERVAL '30 days'), 0),
                      'completed_30d', COUNT(*) FILTER (WHERE o.status = 'completed' AND o.created_at > NOW() - INTERVAL '30 days'),
                      'income_30d', COALESCE(SUM(public.order_partner_income(o,
                            CASE WHEN o.driver_id = p_user_id THEN 'driver' ELSE 'merchant' END))
                            FILTER (WHERE o.status = 'completed' AND COALESCE(o.status_changed_at, o.created_at) > NOW() - INTERVAL '30 days'), 0))
                  FROM public.orders o
                  WHERE o.driver_id = p_user_id
                     OR o.merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = p_user_id)),
        'customer', (SELECT jsonb_build_object(
                         'orders', COUNT(*),
                         'completed', COUNT(*) FILTER (WHERE o.status = 'completed'),
                         'cancelled', COUNT(*) FILTER (WHERE o.status = 'cancelled'),
                         'active', COUNT(*) FILTER (WHERE o.status NOT IN ('completed', 'cancelled', 'expired')),
                         'last_order_at', MAX(o.created_at),
                         'rating_avg', (SELECT ROUND(AVG(c.rating)::NUMERIC, 1) FROM public.customer_ratings c WHERE c.customer_id = p_user_id),
                         'rating_count', (SELECT COUNT(*) FROM public.customer_ratings c WHERE c.customer_id = p_user_id))
                     FROM public.orders o WHERE o.user_id = p_user_id),
        'recent_orders', COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
                              SELECT o.id, o.service_type, o.status, o.total_price, o.title, o.created_at, o.payment_method,
                                     CASE WHEN o.user_id = p_user_id THEN 'customer'
                                          WHEN o.driver_id = p_user_id THEN 'partner' ELSE 'place' END AS as_role
                              FROM public.orders o
                              WHERE o.user_id = p_user_id OR o.driver_id = p_user_id
                                 OR o.merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = p_user_id)
                              ORDER BY o.created_at DESC LIMIT 15) x), '[]'::jsonb),
        'reviews', COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
                        SELECT r.id, r.rating, r.review_text, r.tags, r.is_hidden, r.created_at
                        FROM public.reviews r
                        WHERE r.driver_id = p_user_id
                           OR r.merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = p_user_id)
                        ORDER BY r.created_at DESC LIMIT 10) x), '[]'::jsonb),
        'payouts', COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
                        SELECT p.id, p.amount, p.status, p.payout_method, p.created_at
                        FROM public.payout_requests p WHERE p.user_id = p_user_id
                        ORDER BY p.created_at DESC LIMIT 10) x), '[]'::jsonb),
        'audit', COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
                      SELECT l.id, l.action, l.note, l.data, l.created_at, au.name AS actor_name
                      FROM public.admin_audit_log l LEFT JOIN public.users au ON au.id = l.actor_id
                      WHERE l.subject_user_id = p_user_id
                      ORDER BY l.created_at DESC LIMIT 30) x), '[]'::jsonb)
    ) INTO v;
    RETURN v;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.order_partner_income(public.orders, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_partner_list(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_customer_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_search_accounts(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_partner_income(public.orders, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_partner_list(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_customer_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_accounts(TEXT) TO authenticated;

-- Verify (as an admin): SELECT jsonb_array_length(admin_partner_list('driver'));
