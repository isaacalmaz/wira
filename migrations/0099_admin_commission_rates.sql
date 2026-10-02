-- Migration 0099: admins set every commission rate themselves.
--
-- Until now the rates were written into the code (20%, villa 5% from
-- 0098, projects 10% from 0093). The owner wants admins free to set the
-- cut for every service from the admin panel (2026-10-02).
--
--   * commission_rates: one row per service (ride, send, food, villa,
--     service, pool, project) with the rate Wira keeps, 0-50%. Everyone
--     can read it (the /gabung page shows it); only admin_set_commission_rate
--     writes it, and every change lands in commission_rate_changes (who,
--     when, from, to, why).
--   * platform_commission_rate(service_type) and project_commission_rate()
--     now read that table.
--   * A changed rate never rewrites history: an order stores the rate in
--     force when it completed (orders.commission_rate, stamped by
--     trg_zz_stamp_order_commission, which also stops anyone else writing
--     it); a project stores the rate in force when it was awarded
--     (projects.commission_rate). Payouts, the admin statistics and the
--     partner apps use the stored rate.
--   * Orders completed before this have no stored rate: villa 5% (there
--     were no villa orders before 0098), everything else 20%
--     (order_commission_rate). Projects already awarded keep 10%.
--
-- Depends on 0087, 0090, 0093, 0098. Re-runnable.

-- ---------------------------------------------------------------------------
-- 1. Rates and their history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commission_rates (
    service_type TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT,
    rate NUMERIC NOT NULL CHECK (rate >= 0 AND rate <= 0.5),
    sort_order INT NOT NULL DEFAULT 100,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);
INSERT INTO public.commission_rates (service_type, label, description, rate, sort_order) VALUES
    ('ride', 'WiraRide', 'Ojek dan mobil; dari tarif perjalanan', 0.20, 10),
    ('send', 'WiraSend', 'Kirim paket; dari tarif pengiriman', 0.20, 20),
    ('food', 'WiraFood', 'Dari harga makanan (resto) dan dari ongkir (driver)', 0.20, 30),
    ('villa', 'WiraVilla', 'Dari nilai sewa', 0.05, 40),
    ('service', 'WiraService', 'Jasa teknisi; bahan tidak dipotong', 0.20, 50),
    ('pool', 'WiraPool', 'Jasa kolam; bahan tidak dipotong', 0.20, 60),
    ('project', 'Proyek', 'Dari tiap termin proyek yang cair ke teknisi', 0.10, 70)
ON CONFLICT (service_type) DO NOTHING;

ALTER TABLE public.commission_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS commission_rates_read ON public.commission_rates;
CREATE POLICY commission_rates_read ON public.commission_rates FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.commission_rates FROM anon, authenticated;
GRANT SELECT ON public.commission_rates TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.commission_rate_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_type TEXT NOT NULL,
    old_rate NUMERIC,
    new_rate NUMERIC NOT NULL,
    note TEXT,
    changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS commission_rate_changes_at_idx ON public.commission_rate_changes (changed_at DESC);
ALTER TABLE public.commission_rate_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS commission_rate_changes_admin ON public.commission_rate_changes;
CREATE POLICY commission_rate_changes_admin ON public.commission_rate_changes FOR SELECT USING (public.is_admin());
REVOKE ALL ON public.commission_rate_changes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.commission_rate_changes FROM authenticated;
GRANT SELECT ON public.commission_rate_changes TO authenticated;

-- Admin sets a rate in percent (0-50, up to two decimals).
CREATE OR REPLACE FUNCTION public.admin_set_commission_rate(p_service_type TEXT, p_rate_percent NUMERIC, p_note TEXT DEFAULT NULL)
RETURNS NUMERIC AS $$
DECLARE
    v_old NUMERIC;
    v_new NUMERIC;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Khusus admin';
    END IF;
    IF p_rate_percent IS NULL OR p_rate_percent < 0 OR p_rate_percent > 50 THEN
        RAISE EXCEPTION 'Persentase harus antara 0 dan 50';
    END IF;
    v_new := round(p_rate_percent, 2) / 100;
    SELECT rate INTO v_old FROM public.commission_rates WHERE service_type = p_service_type FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Layanan tidak dikenal: %', p_service_type;
    END IF;
    IF v_old = v_new THEN
        RETURN v_new;
    END IF;
    UPDATE public.commission_rates SET rate = v_new, updated_at = NOW(), updated_by = auth.uid()
    WHERE service_type = p_service_type;
    INSERT INTO public.commission_rate_changes (service_type, old_rate, new_rate, note, changed_by)
    VALUES (p_service_type, v_old, v_new, NULLIF(btrim(COALESCE(p_note, '')), ''), auth.uid());
    RETURN v_new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_set_commission_rate(TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_commission_rate(TEXT, NUMERIC, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Rate lookups
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_commission_rate(p_service_type TEXT)
RETURNS NUMERIC AS $$
    SELECT COALESCE((
        SELECT r.rate FROM public.commission_rates r
        WHERE r.service_type = CASE p_service_type
            WHEN 'WiraRide' THEN 'ride' WHEN 'WiraSend' THEN 'send' WHEN 'WiraFood' THEN 'food'
            WHEN 'WiraVilla' THEN 'villa' WHEN 'WiraService' THEN 'service' WHEN 'WiraPool' THEN 'pool'
            ELSE p_service_type END
    ), 0.20)::NUMERIC;
$$ LANGUAGE sql STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.project_commission_rate()
RETURNS NUMERIC AS $$ SELECT public.platform_commission_rate('project'); $$ LANGUAGE sql STABLE SET search_path = public;

-- The rate a completed order was charged: stored since 0099; before that
-- villa 5% (0098) and everything else 20%.
CREATE OR REPLACE FUNCTION public.order_commission_rate(p_stored NUMERIC, p_service_type TEXT)
RETURNS NUMERIC AS $$
    SELECT COALESCE(p_stored,
                    CASE WHEN p_service_type IN ('villa', 'WiraVilla') THEN 0.05 ELSE 0.20 END)::NUMERIC;
$$ LANGUAGE sql IMMUTABLE;

-- ---------------------------------------------------------------------------
-- 3. Orders keep the rate they completed under
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS commission_rate NUMERIC;

CREATE OR REPLACE FUNCTION public.stamp_order_commission()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' THEN
        IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed' THEN
            NEW.commission_rate := public.platform_commission_rate(NEW.service_type);
        ELSE
            NEW.commission_rate := OLD.commission_rate;
        END IF;
    ELSE
        NEW.commission_rate := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
-- "zz": runs after every other BEFORE trigger, so nothing overwrites it.
DROP TRIGGER IF EXISTS trg_zz_stamp_order_commission ON public.orders;
CREATE TRIGGER trg_zz_stamp_order_commission BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.stamp_order_commission();

-- 0098's payout, reading the stamped rate.
CREATE OR REPLACE FUNCTION public.credit_payout_on_order_completed()
RETURNS TRIGGER AS $$
DECLARE
    -- 0099: the rate stamped on the order as it completed.
    v_commission_rate NUMERIC := COALESCE(NEW.commission_rate, public.platform_commission_rate(NEW.service_type));
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

-- ---------------------------------------------------------------------------
-- 4. Projects keep the rate they were awarded under
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS commission_rate NUMERIC;
-- Already awarded before 0099: the 10% they were quoted under. (Runs
-- before the trigger below, which would otherwise keep the old NULL.)
UPDATE public.projects SET commission_rate = 0.10 WHERE awarded_to IS NOT NULL AND commission_rate IS NULL;

CREATE OR REPLACE FUNCTION public.stamp_project_commission()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.commission_rate := NULL;
    ELSIF NEW.awarded_to IS NOT NULL AND OLD.awarded_to IS NULL THEN
        NEW.commission_rate := public.project_commission_rate();
    ELSE
        NEW.commission_rate := OLD.commission_rate;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
DROP TRIGGER IF EXISTS trg_zz_stamp_project_commission ON public.projects;
CREATE TRIGGER trg_zz_stamp_project_commission BEFORE INSERT OR UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.stamp_project_commission();

-- 0093's stage payout, with the project's own rate.
CREATE OR REPLACE FUNCTION public.settle_project_stage(p_milestone_id UUID, p_to_technician BOOLEAN, p_note TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
    m RECORD;
    v_left INT;
    v_rate NUMERIC;
BEGIN
    SELECT ms.*, p.customer_id, p.awarded_to, p.title INTO m
    FROM public.project_milestones ms JOIN public.projects p ON p.id = ms.project_id
    WHERE ms.id = p_milestone_id FOR UPDATE OF ms;
    IF NOT FOUND OR m.status NOT IN ('funded', 'submitted', 'disputed') THEN
        RAISE EXCEPTION 'Termin ini tidak sedang ditahan';
    END IF;
    -- 0099: the rate fixed when the project was awarded.
    SELECT COALESCE(p.commission_rate, public.project_commission_rate()) INTO v_rate
    FROM public.projects p WHERE p.id = m.project_id;

    IF p_to_technician THEN
        UPDATE public.users
        SET payable_balance = COALESCE(payable_balance, 0) + m.amount * (1 - v_rate)
        WHERE id = m.awarded_to;
        UPDATE public.project_milestones
        SET status = 'released', released_at = NOW(), resolution_note = COALESCE(p_note, resolution_note)
        WHERE id = p_milestone_id;
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (m.awarded_to, 'Termin cair: ' || m.label,
                public.format_rupiah(m.amount * (1 - v_rate)) || ' masuk ke saldo pendapatan Anda (' || m.title || ').', false);
    ELSE
        UPDATE public.users SET wallet_balance = wallet_balance + m.amount WHERE id = m.customer_id;
        INSERT INTO public.transactions (user_id, type, amount, status, description, created_at, reference_id)
        VALUES (m.customer_id, 'refund', m.amount, 'success', 'Pengembalian proyek: ' || m.label, NOW(), m.project_id::text);
        UPDATE public.project_milestones
        SET status = 'refunded', resolution_note = COALESCE(p_note, resolution_note)
        WHERE id = p_milestone_id;
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (m.customer_id, 'Dana proyek dikembalikan', public.format_rupiah(m.amount) || ' untuk ' || m.label || ' kembali ke saldo WiraPay Anda.', false);
    END IF;

    -- Every stage settled and at least one released: the project is done.
    SELECT COUNT(*) INTO v_left FROM public.project_milestones
    WHERE project_id = m.project_id AND status NOT IN ('released', 'refunded');
    IF v_left = 0 THEN
        UPDATE public.projects
        SET status = CASE WHEN EXISTS (SELECT 1 FROM public.project_milestones
                                       WHERE project_id = m.project_id AND status = 'released')
                          THEN 'completed' ELSE 'cancelled' END,
            updated_at = NOW()
        WHERE id = m.project_id AND status = 'awarded';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.settle_project_stage(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Admin statistics use the stored rates
-- ---------------------------------------------------------------------------
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
            * public.order_commission_rate(o.commission_rate, o.service_type)) FILTER (WHERE o.status = 'completed'), 0),
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
                               * public.order_commission_rate(y.commission_rate, y.service_type)) AS commission
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
--   SELECT service_type, rate FROM commission_rates ORDER BY sort_order;  -> 7 rows
--   SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_zz_stamp%';       -> 2 rows
