-- =========================================
-- Migration 0123: WiraService "Pekerjaan lain" (custom jobs)
-- =========================================
-- Customers can book work that is not on the fixed menu. The flow (owner's
-- decisions, 2026-10-13):
--   * Every service category gets one "Pekerjaan lain" item
--     (pricing_rules.is_custom). The customer describes the job (required)
--     and may attach up to 3 photos (private bucket order-photos).
--   * Price: an order that only holds "Pekerjaan lain" costs the check fee
--     (CHECK_FEE, Rp 50.000) and promo codes do not apply to it. Combined
--     with menu items, the custom part costs nothing up front.
--   * On site the technician sends a quote (submit_visit_quote): the total
--     price of the work, Rp 50.000 - Rp 5.000.000, check fee included. The
--     customer approves it in the app (respond_order_adjustment, 0090). Work
--     cannot start (status 'working') before a quote is approved.
--   * Customer declines: finish_visit_as_check (0090), the check fee only.
--   * Customer not there: report_customer_absent cancels the visit with no
--     charge and no commission, and tells the customer and the admins.
--   * Contact details in the job description are masked (like 0093's chat).
--   * Four project skills that have verified technicians become bookable
--     categories (CCTV, Las, Waterproofing, SumurBor), custom item only.
-- Depends on 0089, 0090, 0096, 0100, 0115.
-- Apply BEFORE deploying the frontend commit that uses it.
-- =========================================

-- ---------------------------------------------------------------------------
-- 1. Menu: custom items and the four new categories
-- ---------------------------------------------------------------------------
ALTER TABLE public.pricing_rules ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT false;

INSERT INTO public.pricing_rules (service_type, code, name, base_price, item_of, unit_label, max_qty, sort_order, description)
SELECT 'service', s.code, s.name, 50000, NULL, NULL, 1, s.sort_order, NULL
FROM public.service_skills s
WHERE s.code IN ('CCTV', 'Las', 'Waterproofing', 'SumurBor')
ON CONFLICT (service_type, code) DO NOTHING;

INSERT INTO public.pricing_rules (service_type, code, name, base_price, item_of, unit_label, max_qty, sort_order, description, is_custom)
SELECT 'service', c.code || '_LAIN', 'Pekerjaan lain',
       COALESCE((SELECT base_price FROM public.pricing_rules WHERE service_type = 'service' AND code = 'CHECK_FEE'), 50000),
       c.code, 'kunjungan', 1, 999,
       'Tidak ada di daftar? Tulis kebutuhan Anda, teknisi memberi harga di lokasi.', true
FROM public.pricing_rules c
WHERE c.service_type = 'service' AND c.item_of IS NULL AND c.code <> 'CHECK_FEE'
ON CONFLICT (service_type, code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Order photos: private bucket, readable by the customer, admins and
--    technicians who may take or hold the order
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('order-photos', 'order-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

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
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.can_view_order_photo(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_order_photo(TEXT) TO authenticated;

DROP POLICY IF EXISTS "order_photos_read" ON storage.objects;
CREATE POLICY "order_photos_read" ON storage.objects
FOR SELECT TO authenticated USING (bucket_id = 'order-photos' AND public.can_view_order_photo(name));
DROP POLICY IF EXISTS "order_photos_owner_insert" ON storage.objects;
CREATE POLICY "order_photos_owner_insert" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'order-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "order_photos_owner_delete" ON storage.objects;
CREATE POLICY "order_photos_owner_delete" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'order-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Phone numbers, e-mail addresses and chat links in text a partner reads
-- before the deal is done in the app (same patterns as 0093).
CREATE OR REPLACE FUNCTION public.mask_contact_details(p_text TEXT)
RETURNS TEXT AS $$
    SELECT regexp_replace(
             regexp_replace(
               regexp_replace(COALESCE(p_text, ''), '(\+?\d[\d\s.\-]{7,}\d)', '[nomor disembunyikan]', 'g'),
               '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}', '[email disembunyikan]', 'g'),
             '(https?://)?(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|t\.me)/\S*', '[tautan disembunyikan]', 'gi');
$$ LANGUAGE sql IMMUTABLE;

-- ---------------------------------------------------------------------------
-- 3. Booking: price, promo and job details of a custom item. Runs after the
--    price trigger (0115) and before promo usage (0076) by trigger name.
-- ---------------------------------------------------------------------------
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

    -- Re-price the items the price trigger already validated.
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
DROP TRIGGER IF EXISTS trg_orders_custom_job ON public.orders;
CREATE TRIGGER trg_orders_custom_job BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.price_custom_service_job();

-- ---------------------------------------------------------------------------
-- 4. Quote on site, and no work before it is approved
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_adjustments DROP CONSTRAINT IF EXISTS order_adjustments_kind_check;
ALTER TABLE public.order_adjustments ADD CONSTRAINT order_adjustments_kind_check
    CHECK (kind IN ('material', 'jasa', 'quote'));
ALTER TABLE public.order_adjustments DROP CONSTRAINT IF EXISTS order_adjustments_amount_check;
ALTER TABLE public.order_adjustments ADD CONSTRAINT order_adjustments_amount_check
    CHECK (amount > 0 OR (kind = 'quote' AND amount = 0));

-- p_total: the whole price of the custom work, check fee included. The
-- adjustment holds what comes on top of what the order already charges.
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
    IF v_order.service_type <> 'service' OR NOT (v_order.metadata ? 'job') THEN
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
REVOKE ALL ON FUNCTION public.submit_visit_quote(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_visit_quote(UUID, NUMERIC, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_custom_job_start()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'working' AND OLD.status IS DISTINCT FROM 'working'
       AND NEW.service_type = 'service' AND NEW.metadata ? 'job'
       AND NOT EXISTS (SELECT 1 FROM public.order_adjustments
                       WHERE order_id = NEW.id AND kind = 'quote' AND status = 'approved') THEN
        RAISE EXCEPTION 'Kirim penawaran harga dan tunggu persetujuan pelanggan sebelum mulai bekerja';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
DROP TRIGGER IF EXISTS trg_guard_custom_job_start ON public.orders;
CREATE TRIGGER trg_guard_custom_job_start BEFORE UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_custom_job_start();

-- ---------------------------------------------------------------------------
-- 5. Customer not there: cancel without charge or commission
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_customer_absent(p_order_id UUID, p_note TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
    v_order RECORD;
    v_from TIMESTAMPTZ;
    v_note TEXT := left(btrim(COALESCE(p_note, '')), 300);
    v_count INT;
BEGIN
    SELECT id, user_id, driver_id, status, service_type, scheduled_at, accepted_at, title INTO v_order
    FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND OR v_order.driver_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Anda tidak menangani pesanan ini';
    END IF;
    IF v_order.service_type NOT IN ('service', 'pool') OR v_order.status NOT IN ('accepted', 'on_the_way') THEN
        RAISE EXCEPTION 'Hanya untuk kunjungan yang belum dimulai';
    END IF;
    v_from := COALESCE(v_order.scheduled_at, v_order.accepted_at) + INTERVAL '15 minutes';
    IF v_from IS NOT NULL AND NOW() < v_from THEN
        RAISE EXCEPTION 'Tunggu sampai % WITA (15 menit dari jadwal) sebelum melapor pelanggan tidak ada',
            to_char(v_from AT TIME ZONE 'Asia/Makassar', 'DD/MM HH24.MI');
    END IF;

    PERFORM public.refund_order_to_wallet(p_order_id, 'Refund (pelanggan tidak di lokasi)');
    UPDATE public.order_adjustments SET status = 'cancelled', decided_at = NOW()
    WHERE order_id = p_order_id AND status = 'pending';
    UPDATE public.orders SET status = 'cancelled', updated_at = NOW() WHERE id = p_order_id;

    INSERT INTO public.order_events (order_id, kind, from_status, to_status, actor_id, note)
    VALUES (p_order_id, 'note', v_order.status, 'cancelled', auth.uid(),
            'Pelanggan tidak di lokasi' || CASE WHEN v_note <> '' THEN ': ' || v_note ELSE '' END);

    SELECT COUNT(*) INTO v_count
    FROM public.order_events e JOIN public.orders o ON o.id = e.order_id
    WHERE o.user_id = v_order.user_id AND e.kind = 'note'
      AND e.note LIKE 'Pelanggan tidak di lokasi%' AND e.created_at > NOW() - INTERVAL '90 days';

    PERFORM public.notify_user(v_order.user_id, 'Kunjungan dibatalkan: Anda tidak di lokasi',
        'Teknisi sudah datang untuk ' || COALESCE(v_order.title, 'pesanan Anda')
        || ' tetapi tidak bertemu Anda. Pesanan dibatalkan tanpa biaya. Pesan lagi kapan saja.',
        '/activity');
    PERFORM public.notify_admins('Pelanggan tidak di lokasi',
        COALESCE(v_order.title, 'Kunjungan') || ': teknisi melapor pelanggan tidak ada'
        || CASE WHEN v_note <> '' THEN ' (' || v_note || ')' ELSE '' END
        || '. Kejadian ke-' || v_count || ' untuk pelanggan ini dalam 90 hari.',
        '/orders', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.report_customer_absent(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_customer_absent(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Job board returns the job details (0090 + job)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_open_technician_jobs();
CREATE FUNCTION public.get_open_technician_jobs()
RETURNS TABLE (
    id UUID, service_type TEXT, rate_code TEXT, title TEXT, details TEXT,
    scheduled_at TIMESTAMPTZ, total_price NUMERIC, payment_method TEXT,
    created_at TIMESTAMPTZ, is_preferred BOOLEAN, items JSONB, package_id UUID, job JSONB
) AS $$
    SELECT o.id, o.service_type::text, o.rate_code::text, o.title::text, o.details::text,
           o.scheduled_at, o.total_price::numeric, o.payment_method::text,
           o.created_at, COALESCE(o.preferred_partner_id = auth.uid(), false),
           o.metadata -> 'items', o.package_id, o.metadata -> 'job'
    FROM public.orders o
    WHERE o.status = 'pending' AND o.driver_id IS NULL
      AND o.service_type IN ('service', 'pool')
      AND o.user_id <> auth.uid()
      AND public.can_see_open_order(o.service_type, o.rate_code, o.status, o.merchant_id,
                                    o.preferred_partner_id, o.status_changed_at)
    ORDER BY COALESCE(o.preferred_partner_id = auth.uid(), false) DESC, o.scheduled_at NULLS LAST, o.created_at;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_open_technician_jobs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_open_technician_jobs() TO authenticated;

-- Verify after applying:
--   SELECT code, item_of, base_price FROM pricing_rules WHERE is_custom ORDER BY 1;  -> 8 rows
--   SELECT id, public FROM storage.buckets WHERE id = 'order-photos';                -> 1 row, false
