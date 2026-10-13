-- =========================================
-- Migration 0125: stage 2 of "keep deals in the app"
-- =========================================
-- Owner's decisions (2026-10-13, mockup "Tahap 2"):
--   * WiraPool gets "Pekerjaan kolam lain" (pricing_rules pool/LAIN,
--     is_custom): the customer describes the job, the visit costs the check
--     fee, promo codes do not apply, cash only. The technician quotes on
--     site with the same engine as WiraService (submit_visit_quote, 0123)
--     and cannot start before the quote is approved.
--   * Every pool care visit (S1, S2, S3, monthly package visits) ends with a
--     visit report: at least one "after" photo, pH, chlorine, water
--     condition. complete_pool_visit saves it and completes the order; a
--     pool care visit cannot go from working to completed without one.
--   * After a cash order is completed the customer answers "how much did you
--     pay?" (match / different / unpaid). The partner never sees the
--     answer; anything but "match" notifies the admins.
--   * Admins see partner flags (admin_partner_flags): payment reports,
--     custom jobs that keep ending at the check fee, customers who are often
--     not there. Flags inform; nothing is blocked automatically.
-- Depends on 0090, 0100, 0115, 0123.
-- Functions are CREATE OR REPLACE with unchanged signatures, or new. The
-- only DROPs are IF EXISTS on the policy and trigger this file creates.
-- Apply BEFORE deploying the frontend commit that uses it.
-- =========================================

-- ---------------------------------------------------------------------------
-- 1. "Pekerjaan kolam lain"
-- ---------------------------------------------------------------------------
INSERT INTO public.pricing_rules (service_type, code, name, base_price, unit_label, max_qty, sort_order, description, is_custom)
VALUES ('pool', 'LAIN', 'Pekerjaan kolam lain',
        COALESCE((SELECT base_price FROM public.pricing_rules WHERE service_type = 'service' AND code = 'CHECK_FEE'), 50000),
        'kunjungan', 1, 999,
        'Ganti pompa, bocor, keramik lepas, lampu kolam. Teknisi memberi harga di lokasi.', true)
ON CONFLICT (service_type, code) DO NOTHING;

-- 0123's booking trigger, plus a pool branch. The pool branch runs for every
-- caller (create_order_and_pay is SECURITY DEFINER), so a custom pool job
-- cannot slip past the checks through another path.
CREATE OR REPLACE FUNCTION public.price_custom_service_job()
RETURNS TRIGGER AS $$
DECLARE
    v_custom TEXT;
    v_only BOOLEAN;
    v_fee NUMERIC;
    v_desc TEXT;
    v_photos JSONB;
    v_items JSONB;
    v_sub NUMERIC;
    v_discount NUMERIC;
BEGIN
    IF NEW.service_type = 'pool' THEN
        IF NOT EXISTS (SELECT 1 FROM public.pricing_rules
                       WHERE service_type = 'pool' AND code = NEW.rate_code AND is_custom) THEN
            NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) - 'job';
            RETURN NEW;
        END IF;
        IF NEW.payment_method IS DISTINCT FROM 'cash' THEN
            RAISE EXCEPTION 'Pekerjaan kolam lain dibayar tunai ke teknisi';
        END IF;
        IF NEW.promo_code IS NOT NULL THEN
            RAISE EXCEPTION 'Kode promo tidak berlaku untuk Pekerjaan kolam lain';
        END IF;
        v_desc := public.mask_contact_details(btrim(COALESCE(NEW.metadata -> 'job' ->> 'description', '')));
        IF length(v_desc) < 10 OR length(v_desc) > 500 THEN
            RAISE EXCEPTION 'Ceritakan pekerjaannya (10 sampai 500 huruf)';
        END IF;
        v_photos := COALESCE(NEW.metadata -> 'job' -> 'photos', '[]'::jsonb);
        IF jsonb_typeof(v_photos) <> 'array' OR jsonb_array_length(v_photos) > 3 OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_photos) ph
            WHERE jsonb_typeof(ph) <> 'string'
               OR (ph #>> '{}') !~ ('^' || NEW.user_id::text || '/[A-Za-z0-9._-]{1,120}$')
        ) THEN
            RAISE EXCEPTION 'Foto pekerjaan tidak valid (maksimal 3 foto)';
        END IF;
        SELECT base_price INTO v_fee FROM public.pricing_rules
        WHERE service_type = 'pool' AND code = NEW.rate_code;
        NEW.total_price := v_fee;
        NEW.promo_discount := 0;
        NEW.metadata := NEW.metadata || jsonb_build_object('job', jsonb_build_object(
            'description', v_desc, 'photos', v_photos, 'item', NEW.rate_code,
            'only_custom', true, 'base', v_fee));
        RETURN NEW;
    END IF;

    IF current_user NOT IN ('authenticated', 'anon') OR NEW.service_type <> 'service'
       OR NEW.metadata IS NULL OR jsonb_typeof(NEW.metadata -> 'items') <> 'array' THEN
        RETURN NEW;
    END IF;

    SELECT p.code INTO v_custom
    FROM jsonb_array_elements(NEW.metadata -> 'items') i
    JOIN public.pricing_rules p ON p.service_type = 'service' AND p.code = i ->> 'code'
                                AND p.item_of = NEW.rate_code AND p.is_custom
    LIMIT 1;
    IF v_custom IS NULL THEN
        NEW.metadata := NEW.metadata - 'job';
        RETURN NEW;
    END IF;

    v_desc := public.mask_contact_details(btrim(COALESCE(NEW.metadata -> 'job' ->> 'description', '')));
    IF length(v_desc) < 10 OR length(v_desc) > 500 THEN
        RAISE EXCEPTION 'Ceritakan pekerjaannya (10 sampai 500 huruf)';
    END IF;
    v_photos := COALESCE(NEW.metadata -> 'job' -> 'photos', '[]'::jsonb);
    IF jsonb_typeof(v_photos) <> 'array' OR jsonb_array_length(v_photos) > 3 OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_photos) ph
        WHERE jsonb_typeof(ph) <> 'string'
           OR (ph #>> '{}') !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]{1,120}$')
    ) THEN
        RAISE EXCEPTION 'Foto pekerjaan tidak valid (maksimal 3 foto)';
    END IF;

    v_only := NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(NEW.metadata -> 'items') i
        WHERE i ->> 'code' <> v_custom
    );
    IF v_only AND NEW.promo_code IS NOT NULL THEN
        RAISE EXCEPTION 'Kode promo tidak berlaku untuk pesanan yang hanya berisi Pekerjaan lain';
    END IF;

    SELECT base_price INTO v_fee FROM public.pricing_rules
    WHERE service_type = 'service' AND code = 'CHECK_FEE' AND is_active = true;
    v_fee := CASE WHEN v_only THEN COALESCE(v_fee, 50000) ELSE 0 END;

    SELECT jsonb_agg(CASE WHEN i ->> 'code' = v_custom
                          THEN i || jsonb_build_object('qty', 1, 'price', v_fee)
                          ELSE i END)
    INTO v_items FROM jsonb_array_elements(NEW.metadata -> 'items') i;
    SELECT COALESCE(SUM((i ->> 'price')::NUMERIC * (i ->> 'qty')::NUMERIC), 0)
    INTO v_sub FROM jsonb_array_elements(v_items) i;
    v_discount := public.compute_promo_discount('service', NEW.promo_code, v_sub);

    NEW.total_price := GREATEST(0, v_sub - v_discount);
    NEW.promo_discount := GREATEST(COALESCE(v_discount, 0), 0);
    NEW.metadata := jsonb_set(NEW.metadata, '{items}', v_items)
        || jsonb_build_object('job', jsonb_build_object(
               'description', v_desc, 'photos', v_photos, 'item', v_custom,
               'only_custom', v_only, 'base', v_fee));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ---------------------------------------------------------------------------
-- 2. One quote engine for service and pool visits (0123 bodies, pool added)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_visit_quote(p_order_id UUID, p_total NUMERIC, p_description TEXT)
RETURNS UUID AS $$
DECLARE
    v_order RECORD;
    v_base NUMERIC;
    v_desc TEXT := btrim(COALESCE(p_description, ''));
    v_id UUID;
BEGIN
    SELECT id, user_id, driver_id, status, service_type, metadata INTO v_order
    FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND OR v_order.driver_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Anda tidak menangani pesanan ini';
    END IF;
    IF v_order.service_type NOT IN ('service', 'pool') OR NOT (v_order.metadata ? 'job') THEN
        RAISE EXCEPTION 'Penawaran hanya untuk pesanan Pekerjaan lain';
    END IF;
    IF v_order.status <> 'on_the_way' THEN
        RAISE EXCEPTION 'Penawaran dikirim saat Anda sudah di lokasi, sebelum mulai bekerja';
    END IF;
    IF EXISTS (SELECT 1 FROM public.order_adjustments
               WHERE order_id = p_order_id AND kind = 'quote' AND status = 'approved') THEN
        RAISE EXCEPTION 'Penawaran sudah disetujui. Untuk biaya lain gunakan Ajukan Biaya Tambahan.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.order_adjustments WHERE order_id = p_order_id AND status = 'pending') THEN
        RAISE EXCEPTION 'Masih ada pengajuan yang menunggu jawaban pelanggan';
    END IF;

    v_base := COALESCE((v_order.metadata -> 'job' ->> 'base')::NUMERIC, 0);
    IF p_total IS NULL OR p_total <> round(p_total) OR p_total < v_base OR p_total > 5000000 THEN
        RAISE EXCEPTION 'Harga jasa harus antara % dan Rp 5.000.000', public.format_rupiah(v_base);
    END IF;
    IF length(v_desc) < 3 OR length(v_desc) > 300 THEN
        RAISE EXCEPTION 'Tuliskan rincian pekerjaan (3 sampai 300 huruf)';
    END IF;

    INSERT INTO public.order_adjustments (order_id, requested_by, kind, amount, description)
    VALUES (p_order_id, auth.uid(), 'quote', p_total - v_base, v_desc)
    RETURNING id INTO v_id;

    PERFORM public.notify_user(v_order.user_id, 'Teknisi mengajukan harga',
        'Harga jasa ' || public.format_rupiah(p_total)
        || CASE WHEN v_base > 0 THEN ' (termasuk biaya cek ' || public.format_rupiah(v_base) || ')' ELSE '' END
        || ' untuk ' || v_desc || '. Buka pesanan untuk menyetujui atau menolak.',
        '/active-order/' || p_order_id);
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.guard_custom_job_start()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'working' AND OLD.status IS DISTINCT FROM 'working'
       AND NEW.service_type IN ('service', 'pool') AND NEW.metadata ? 'job'
       AND NOT EXISTS (SELECT 1 FROM public.order_adjustments
                       WHERE order_id = NEW.id AND kind = 'quote' AND status = 'approved') THEN
        RAISE EXCEPTION 'Kirim penawaran harga dan tunggu persetujuan pelanggan sebelum mulai bekerja';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ---------------------------------------------------------------------------
-- 3. Pool visit reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.visit_reports (
    order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
    technician_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    photos_before TEXT[] NOT NULL DEFAULT '{}',
    photos_after TEXT[] NOT NULL DEFAULT '{}',
    ph NUMERIC(3,1) CHECK (ph BETWEEN 0 AND 14),
    chlorine NUMERIC(4,1) CHECK (chlorine BETWEEN 0 AND 20),
    water_condition TEXT CHECK (water_condition IN ('jernih', 'keruh', 'hijau')),
    tasks TEXT[] NOT NULL DEFAULT '{}',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.visit_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "visit_reports_read" ON public.visit_reports;
CREATE POLICY "visit_reports_read" ON public.visit_reports FOR SELECT TO authenticated USING (
    is_admin() OR technician_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
);
-- Writes only through complete_pool_visit.
REVOKE INSERT, UPDATE, DELETE ON public.visit_reports FROM anon, authenticated;
GRANT SELECT ON public.visit_reports TO authenticated;

-- Pool care visits (not the custom job) need a report.
CREATE OR REPLACE FUNCTION public.pool_visit_needs_report(p_service_type TEXT, p_rate_code TEXT)
RETURNS BOOLEAN AS $$
    SELECT p_service_type = 'pool' AND NOT EXISTS (
        SELECT 1 FROM public.pricing_rules
        WHERE service_type = 'pool' AND code = p_rate_code AND is_custom);
$$ LANGUAGE sql STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.complete_pool_visit(
    p_order_id UUID,
    p_photos_before TEXT[],
    p_photos_after TEXT[],
    p_ph NUMERIC,
    p_chlorine NUMERIC,
    p_water_condition TEXT,
    p_tasks TEXT[],
    p_note TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_order RECORD;
    v_prefix TEXT := '^' || auth.uid()::text || '/[A-Za-z0-9._-]{1,120}$';
    v_note TEXT := NULLIF(left(btrim(COALESCE(p_note, '')), 500), '');
    v_tasks TEXT[];
BEGIN
    SELECT id, user_id, driver_id, status, service_type, rate_code, title INTO v_order
    FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND OR v_order.driver_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Anda tidak menangani pesanan ini';
    END IF;
    IF NOT public.pool_visit_needs_report(v_order.service_type, v_order.rate_code) THEN
        RAISE EXCEPTION 'Laporan kolam hanya untuk kunjungan perawatan kolam';
    END IF;
    IF v_order.status <> 'working' THEN
        RAISE EXCEPTION 'Laporan dikirim setelah pekerjaan dimulai';
    END IF;
    IF COALESCE(array_length(p_photos_after, 1), 0) < 1 THEN
        RAISE EXCEPTION 'Tambahkan minimal 1 foto kolam sesudah dikerjakan';
    END IF;
    IF COALESCE(array_length(p_photos_after, 1), 0) > 3 OR COALESCE(array_length(p_photos_before, 1), 0) > 3
       OR EXISTS (SELECT 1 FROM unnest(COALESCE(p_photos_before, '{}') || p_photos_after) ph WHERE ph !~ v_prefix) THEN
        RAISE EXCEPTION 'Foto laporan tidak valid (maksimal 3 sebelum dan 3 sesudah)';
    END IF;
    IF p_ph IS NULL OR p_ph < 0 OR p_ph > 14 THEN
        RAISE EXCEPTION 'Isi pH air (0 sampai 14)';
    END IF;
    IF p_chlorine IS NULL OR p_chlorine < 0 OR p_chlorine > 20 THEN
        RAISE EXCEPTION 'Isi kadar klorin (0 sampai 20 ppm)';
    END IF;
    IF p_water_condition IS NULL OR p_water_condition NOT IN ('jernih', 'keruh', 'hijau') THEN
        RAISE EXCEPTION 'Pilih kondisi air';
    END IF;
    SELECT COALESCE(array_agg(left(btrim(t), 80)), '{}') INTO v_tasks
    FROM unnest(COALESCE(p_tasks, '{}')) t WHERE btrim(t) <> '';
    IF array_length(v_tasks, 1) > 12 THEN
        RAISE EXCEPTION 'Terlalu banyak item pekerjaan';
    END IF;

    INSERT INTO public.visit_reports (order_id, technician_id, photos_before, photos_after, ph, chlorine, water_condition, tasks, note)
    VALUES (p_order_id, auth.uid(), COALESCE(p_photos_before, '{}'), p_photos_after,
            round(p_ph, 1), round(p_chlorine, 1), p_water_condition, v_tasks,
            public.mask_contact_details(v_note));

    -- Commission and completion triggers run as for any finished visit.
    UPDATE public.orders SET status = 'completed', updated_at = NOW() WHERE id = p_order_id;

    PERFORM public.notify_user(v_order.user_id, 'Laporan kunjungan kolam',
        'Kunjungan ' || COALESCE(v_order.title, 'kolam') || ' selesai. pH ' || round(p_ph, 1)
        || ', klorin ' || round(p_chlorine, 1) || ' ppm, air ' || p_water_condition
        || '. Lihat foto dan catatannya di pesanan.',
        '/active-order/' || p_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.complete_pool_visit(UUID, TEXT[], TEXT[], NUMERIC, NUMERIC, TEXT, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_pool_visit(UUID, TEXT[], TEXT[], NUMERIC, NUMERIC, TEXT, TEXT[], TEXT) TO authenticated;

-- A pool care visit the technician closes from 'working' needs a report
-- (complete_pool_visit writes it first). Admin tools and server jobs are
-- not held back.
CREATE OR REPLACE FUNCTION public.guard_pool_visit_report()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status = 'working'
       AND current_user IN ('authenticated', 'anon') AND NOT public.is_admin_panel()
       AND public.pool_visit_needs_report(NEW.service_type, NEW.rate_code)
       AND NOT EXISTS (SELECT 1 FROM public.visit_reports WHERE order_id = NEW.id) THEN
        RAISE EXCEPTION 'Kirim laporan kunjungan kolam dulu (foto, pH, klorin, kondisi air)';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public; -- invoker: current_user is the caller's role
DROP TRIGGER IF EXISTS trg_guard_pool_visit_report ON public.orders;
CREATE TRIGGER trg_guard_pool_visit_report BEFORE UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_pool_visit_report();

-- Report photos live in order-photos under the technician's folder; the
-- customer of the order may open them too (0123 body + reports).
CREATE OR REPLACE FUNCTION public.can_view_order_photo(p_name TEXT)
RETURNS BOOLEAN AS $$
    SELECT auth.uid() IS NOT NULL AND (
        split_part(p_name, '/', 1) = auth.uid()::text
        OR is_admin()
        OR EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.metadata -> 'job' -> 'photos' ? p_name
              AND (o.driver_id = auth.uid()
                   OR (o.driver_id IS NULL AND o.status = 'pending'
                       AND public.technician_can_take(auth.uid(), o.service_type, o.rate_code)))
        )
        OR EXISTS (
            SELECT 1 FROM public.visit_reports r JOIN public.orders o ON o.id = r.order_id
            WHERE p_name = ANY (r.photos_before || r.photos_after)
              AND (o.user_id = auth.uid() OR r.technician_id = auth.uid())
        )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 4. "How much did you pay?" after a cash order
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_checks (
    order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    partner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    answer TEXT NOT NULL CHECK (answer IN ('match', 'different', 'unpaid')),
    amount NUMERIC CHECK (amount IS NULL OR amount >= 0),
    expected NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    resolution_note TEXT
);
CREATE INDEX IF NOT EXISTS payment_checks_open_idx ON public.payment_checks (created_at)
    WHERE answer <> 'match' AND resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS payment_checks_partner_idx ON public.payment_checks (partner_id);
ALTER TABLE public.payment_checks ENABLE ROW LEVEL SECURITY;
-- The customer sees their own answers and admins see all. Partners never.
DROP POLICY IF EXISTS "payment_checks_read" ON public.payment_checks;
CREATE POLICY "payment_checks_read" ON public.payment_checks FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.payment_checks FROM anon, authenticated;
GRANT SELECT ON public.payment_checks TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_order_payment(p_order_id UUID, p_answer TEXT, p_amount NUMERIC DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
    v_order RECORD;
    v_answer TEXT := p_answer;
    v_partner_name TEXT;
BEGIN
    SELECT id, user_id, driver_id, status, payment_method, total_price, title, service_type, status_changed_at
    INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND OR v_order.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;
    IF v_order.status <> 'completed' OR v_order.payment_method <> 'cash' OR v_order.driver_id IS NULL THEN
        RAISE EXCEPTION 'Hanya untuk pesanan tunai yang sudah selesai';
    END IF;
    IF v_order.status_changed_at < NOW() - INTERVAL '14 days' THEN
        RAISE EXCEPTION 'Pesanan ini sudah lebih dari 14 hari. Hubungi CS Wira kalau ada masalah pembayaran.';
    END IF;
    IF v_answer NOT IN ('match', 'different', 'unpaid') THEN
        RAISE EXCEPTION 'Jawaban tidak dikenal';
    END IF;
    IF v_answer = 'different' THEN
        IF p_amount IS NULL OR p_amount < 0 OR p_amount > 100000000 OR p_amount <> round(p_amount) THEN
            RAISE EXCEPTION 'Isi jumlah yang Anda bayar';
        END IF;
        IF p_amount = v_order.total_price THEN
            v_answer := 'match';
        END IF;
    END IF;

    INSERT INTO public.payment_checks (order_id, user_id, partner_id, answer, amount, expected)
    VALUES (p_order_id, auth.uid(), v_order.driver_id, v_answer,
            CASE WHEN v_answer = 'different' THEN p_amount END, v_order.total_price)
    ON CONFLICT (order_id) DO NOTHING;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Anda sudah menjawab untuk pesanan ini';
    END IF;

    IF v_answer <> 'match' THEN
        SELECT name INTO v_partner_name FROM public.users WHERE id = v_order.driver_id;
        PERFORM public.notify_admins('Pembayaran tidak sesuai',
            COALESCE(v_order.title, v_order.service_type) || ' · ' || COALESCE(v_partner_name, 'mitra') || ': '
            || CASE WHEN v_answer = 'unpaid' THEN 'pelanggan bilang belum membayar'
                    ELSE 'pelanggan membayar ' || public.format_rupiah(p_amount) END
            || ', total di aplikasi ' || public.format_rupiah(v_order.total_price) || '.',
            '/flags', true);
    END IF;
    RETURN v_answer;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.confirm_order_payment(UUID, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment(UUID, TEXT, NUMERIC) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Partner flags for admins
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.flag_snoozes (
    subject_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('check_only', 'absent')),
    until TIMESTAMPTZ NOT NULL,
    snoozed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    PRIMARY KEY (subject_id, kind)
);
ALTER TABLE public.flag_snoozes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flag_snoozes FROM anon, authenticated;

-- kind: 'payment' (a customer's answer, per order), 'check_only' (custom
-- jobs of a technician that mostly end at the check fee, 30 days),
-- 'absent' (a customer reported not there twice or more, 90 days).
-- p_subject narrows to one account (the admin account page).
CREATE OR REPLACE FUNCTION public.admin_partner_flags(p_subject UUID DEFAULT NULL)
RETURNS TABLE (
    kind TEXT, subject_id UUID, subject_name TEXT, order_id UUID, title TEXT,
    answer TEXT, amount NUMERIC, expected NUMERIC, hits INT, total INT, created_at TIMESTAMPTZ
) AS $$
#variable_conflict use_column
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Hanya admin';
    END IF;
    RETURN QUERY
    SELECT 'payment'::TEXT, c.partner_id, u.name::TEXT, c.order_id, o.title::TEXT,
           c.answer, c.amount, c.expected, NULL::INT, NULL::INT, c.created_at
    FROM public.payment_checks c
    JOIN public.orders o ON o.id = c.order_id
    LEFT JOIN public.users u ON u.id = c.partner_id
    WHERE c.answer <> 'match' AND c.resolved_at IS NULL
      AND (p_subject IS NULL OR c.partner_id = p_subject)
    UNION ALL
    SELECT 'check_only'::TEXT, x.driver_id, u.name::TEXT, NULL::UUID, NULL::TEXT,
           NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, x.hits::INT, x.total::INT, x.last_at
    FROM (
        SELECT o.driver_id,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE o.total_price <= COALESCE((o.metadata -> 'job' ->> 'base')::NUMERIC, 0)) AS hits,
               MAX(o.status_changed_at) AS last_at
        FROM public.orders o
        WHERE o.status = 'completed' AND o.metadata ? 'job'
          AND COALESCE((o.metadata -> 'job' ->> 'only_custom')::BOOLEAN, false)
          AND o.status_changed_at > NOW() - INTERVAL '30 days' AND o.driver_id IS NOT NULL
        GROUP BY o.driver_id
    ) x
    LEFT JOIN public.users u ON u.id = x.driver_id
    WHERE x.total >= 3 AND x.hits * 10 >= x.total * 6
      AND (p_subject IS NULL OR x.driver_id = p_subject)
      AND NOT EXISTS (SELECT 1 FROM public.flag_snoozes s
                      WHERE s.subject_id = x.driver_id AND s.kind = 'check_only' AND s.until > NOW())
    UNION ALL
    SELECT 'absent'::TEXT, y.user_id, u.name::TEXT, NULL::UUID, NULL::TEXT,
           NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, y.hits::INT, NULL::INT, y.last_at
    FROM (
        SELECT o.user_id, COUNT(*) AS hits, MAX(e.created_at) AS last_at
        FROM public.order_events e JOIN public.orders o ON o.id = e.order_id
        WHERE e.kind = 'note' AND e.note LIKE 'Pelanggan tidak di lokasi%'
          AND e.created_at > NOW() - INTERVAL '90 days'
        GROUP BY o.user_id
    ) y
    LEFT JOIN public.users u ON u.id = y.user_id
    WHERE y.hits >= 2
      AND (p_subject IS NULL OR y.user_id = p_subject)
      AND NOT EXISTS (SELECT 1 FROM public.flag_snoozes s
                      WHERE s.subject_id = y.user_id AND s.kind = 'absent' AND s.until > NOW())
    ORDER BY 11 DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_partner_flags(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_partner_flags(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolve_payment_check(p_order_id UUID, p_note TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Hanya admin';
    END IF;
    UPDATE public.payment_checks
    SET resolved_at = NOW(), resolved_by = auth.uid(),
        resolution_note = NULLIF(left(btrim(COALESCE(p_note, '')), 300), '')
    WHERE order_id = p_order_id AND resolved_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Laporan tidak ditemukan atau sudah ditandai selesai';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_resolve_payment_check(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_payment_check(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_snooze_flag(p_subject UUID, p_kind TEXT, p_days INT DEFAULT 30)
RETURNS VOID AS $$
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Hanya admin';
    END IF;
    IF p_kind NOT IN ('check_only', 'absent') OR p_days NOT BETWEEN 1 AND 180 THEN
        RAISE EXCEPTION 'Penanda atau jumlah hari tidak valid';
    END IF;
    INSERT INTO public.flag_snoozes (subject_id, kind, until, snoozed_by)
    VALUES (p_subject, p_kind, NOW() + make_interval(days => p_days), auth.uid())
    ON CONFLICT (subject_id, kind) DO UPDATE SET until = EXCLUDED.until, snoozed_by = EXCLUDED.snoozed_by;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_snooze_flag(UUID, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_snooze_flag(UUID, TEXT, INT) TO authenticated;

-- Verify after applying:
--   SELECT code, base_price, is_custom FROM pricing_rules WHERE service_type = 'pool' AND code = 'LAIN';  -> 1 row, true
--   SELECT to_regclass('public.visit_reports'), to_regclass('public.payment_checks');                     -> both set
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_guard_pool_visit_report';                            -> 1 row
