-- =========================================
-- Migration 0136: on "Pekerjaan lain" the price quote comes before extras
-- =========================================
-- Found on 2026-10-14: on a custom job (metadata.job, 0123) the technician
-- used "Ajukan Biaya Tambahan" for Rp 1.000.000 of material instead of
-- "Kirim Penawaran Harga". The customer approved it, but work can only start
-- after an approved quote, so the job was stuck; and since materials carry
-- no commission, putting the whole price under "material" also skipped
-- Wira's cut.
--
-- request_order_adjustment (0090) now refuses material/jasa extras on a
-- custom job until its quote is approved. Fixed-menu visits are unchanged.
-- The partner app hides the button until then (VisitTools.jsx).
--
-- Verify:
--   SELECT prosrc LIKE '%0136%' FROM pg_proc WHERE proname = 'request_order_adjustment';
-- =========================================

CREATE OR REPLACE FUNCTION public.request_order_adjustment(p_order_id uuid, p_kind text, p_amount numeric, p_description text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order RECORD;
    v_id UUID;
    v_desc TEXT := btrim(COALESCE(p_description, ''));
BEGIN
    SELECT id, user_id, driver_id, status, service_type, title, metadata INTO v_order
    FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND OR v_order.driver_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Anda tidak menangani pesanan ini';
    END IF;
    IF v_order.service_type NOT IN ('service', 'pool') OR v_order.status NOT IN ('on_the_way', 'working') THEN
        RAISE EXCEPTION 'Biaya tambahan hanya bisa diajukan saat Anda di lokasi pekerjaan';
    END IF;
    -- 0136: a custom job is priced by its quote first.
    IF COALESCE(v_order.metadata, '{}'::jsonb) ? 'job' AND NOT EXISTS (
        SELECT 1 FROM public.order_adjustments
        WHERE order_id = p_order_id AND kind = 'quote' AND status = 'approved'
    ) THEN
        RAISE EXCEPTION 'Kirim penawaran harga dulu. Bahan atau biaya lain bisa diajukan setelah pelanggan menyetujui harga.';
    END IF;
    IF p_kind NOT IN ('material', 'jasa') THEN
        RAISE EXCEPTION 'Jenis biaya tidak valid';
    END IF;
    IF p_amount IS NULL OR p_amount < 1000 OR p_amount > 20000000 OR p_amount <> round(p_amount) THEN
        RAISE EXCEPTION 'Nominal harus antara Rp 1.000 dan Rp 20.000.000';
    END IF;
    IF length(v_desc) < 3 OR length(v_desc) > 300 THEN
        RAISE EXCEPTION 'Tuliskan rincian biaya (3 sampai 300 huruf)';
    END IF;
    IF EXISTS (SELECT 1 FROM public.order_adjustments WHERE order_id = p_order_id AND status = 'pending') THEN
        RAISE EXCEPTION 'Masih ada pengajuan yang menunggu jawaban pelanggan';
    END IF;

    INSERT INTO public.order_adjustments (order_id, requested_by, kind, amount, description)
    VALUES (p_order_id, auth.uid(), p_kind, p_amount, v_desc)
    RETURNING id INTO v_id;

    INSERT INTO public.notifications (user_id, title, description, is_read)
    VALUES (v_order.user_id, 'Teknisi mengajukan biaya tambahan',
            public.format_rupiah(p_amount) || ' untuk ' || v_desc || '. Buka pesanan Anda untuk menyetujui atau menolak.',
            false);
    RETURN v_id;
END;
$function$;
