-- =========================================
-- Migration 0128: stage 3 of "keep deals in the app"
-- =========================================
-- Owner's decisions (2026-10-14, mockup "Tahap 3"):
--   * WiraFood "Titip beli": the customer lists what to buy at any store and
--     sets a spending limit (admin setting titip_budget_max, Rp 300.000).
--     The driver shops, photographs the receipt and sends the total
--     (submit_titip_receipt, never above the limit). The customer approves
--     in the app; without an answer it is approved after
--     titip_auto_approve_minutes (30). Only then may the driver head to the
--     customer (start_titip_delivery), and the order completes with the
--     customer's PIN on arrival (finish_titip_with_pin). The goods count as
--     material (no commission); the delivery fee is pricing_rules send/TITIP,
--     seeded from the WiraFood delivery rule and editable in Manajemen Harga.
--     Stored as service_type 'send', rate_code 'TITIP'; cash only, no promo.
--   * WiraSend "Barang besar (mobil)": description and 1-3 photos, no price
--     up front. Only drivers with a car see it. The driver quotes from the
--     photos (submit_visit_quote, big_item_quote_min..max) before heading
--     out; "Menuju lokasi" is locked until the customer approves, and a
--     rejected quote cancels the order at no charge. rate_code 'BESAR',
--     package_size 'mobil'.
--   * Every number above is an app setting the admin can change
--     (admin_set_app_setting), as is the on-site quote cap of WiraService /
--     WiraPool (visit_quote_max, was a fixed Rp 5.000.000).
-- Protection for a driver who pays for the goods (e.g. the customer
-- transfers first) is still being decided by the owner; not in this file.
-- Depends on 0033, 0090, 0108, 0109, 0115, 0123, 0124, 0125.
-- Apply BEFORE deploying the frontend commit that uses it.
-- =========================================

-- ---------------------------------------------------------------------------
-- 1. Settings the admin can change
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value) VALUES
    ('titip_budget_max', '300000'::jsonb),
    ('titip_auto_approve_minutes', '30'::jsonb),
    ('big_item_quote_min', '30000'::jsonb),
    ('big_item_quote_max', '1000000'::jsonb),
    ('visit_quote_max', '5000000'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 0109's setter with the new keys and their ranges.
CREATE OR REPLACE FUNCTION public.admin_set_app_setting(p_key TEXT, p_value JSONB)
RETURNS JSONB AS $$
DECLARE
    v_old JSONB;
    v_num NUMERIC;
BEGIN
    IF NOT (public.admin_can('core') OR public.admin_can('finance')) THEN
        RAISE EXCEPTION 'Khusus admin inti atau keuangan' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_value) = 'number' THEN
        v_num := (p_value #>> '{}')::NUMERIC;
    END IF;
    IF p_key = 'topup_auto_confirm' AND jsonb_typeof(p_value) <> 'boolean' THEN
        RAISE EXCEPTION 'Nilai harus true atau false';
    ELSIF p_key = 'qris_order_window_minutes' AND (v_num IS NULL OR v_num NOT BETWEEN 15 AND 240) THEN
        RAISE EXCEPTION 'Batas waktu pembayaran harus 15 sampai 240 menit';
    ELSIF p_key = 'commission_debt_limit' AND (v_num IS NULL OR v_num NOT BETWEEN 10000 AND 10000000) THEN
        RAISE EXCEPTION 'Batas utang komisi harus Rp 10.000 sampai Rp 10.000.000';
    ELSIF p_key = 'commission_debt_grace_days' AND (v_num IS NULL OR v_num NOT BETWEEN 0 AND 60) THEN
        RAISE EXCEPTION 'Masa tenggang harus 0 sampai 60 hari';
    ELSIF p_key = 'commission_payment_info'
          AND (jsonb_typeof(p_value) <> 'string' OR length(p_value #>> '{}') NOT BETWEEN 5 AND 500) THEN
        RAISE EXCEPTION 'Info pembayaran harus 5 sampai 500 karakter';
    ELSIF p_key = 'titip_budget_max' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 10000 AND 5000000) THEN
        RAISE EXCEPTION 'Batas belanja titip beli harus Rp 10.000 sampai Rp 5.000.000';
    ELSIF p_key = 'titip_auto_approve_minutes' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 5 AND 240) THEN
        RAISE EXCEPTION 'Persetujuan otomatis harus 5 sampai 240 menit';
    ELSIF p_key = 'big_item_quote_min' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 5000 AND 5000000) THEN
        RAISE EXCEPTION 'Harga minimum barang besar harus Rp 5.000 sampai Rp 5.000.000';
    ELSIF p_key = 'big_item_quote_max' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 50000 AND 50000000) THEN
        RAISE EXCEPTION 'Harga maksimum barang besar harus Rp 50.000 sampai Rp 50.000.000';
    ELSIF p_key = 'visit_quote_max' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 100000 AND 100000000) THEN
        RAISE EXCEPTION 'Batas penawaran teknisi harus Rp 100.000 sampai Rp 100.000.000';
    ELSIF p_key NOT IN ('topup_auto_confirm', 'qris_order_window_minutes', 'commission_debt_limit',
                        'commission_debt_grace_days', 'commission_payment_info', 'titip_budget_max',
                        'titip_auto_approve_minutes', 'big_item_quote_min', 'big_item_quote_max',
                        'visit_quote_max') THEN
        RAISE EXCEPTION 'Pengaturan % tidak dikenal', p_key;
    END IF;
    IF p_key = 'big_item_quote_min' AND v_num >= public.app_setting_int('big_item_quote_max', 1000000) THEN
        RAISE EXCEPTION 'Harga minimum harus di bawah harga maksimum';
    ELSIF p_key = 'big_item_quote_max' AND v_num <= public.app_setting_int('big_item_quote_min', 30000) THEN
        RAISE EXCEPTION 'Harga maksimum harus di atas harga minimum';
    END IF;

    INSERT INTO public.app_settings (key, value) VALUES (p_key, p_value) ON CONFLICT (key) DO NOTHING;
    SELECT value INTO v_old FROM public.app_settings WHERE key = p_key FOR UPDATE;
    UPDATE public.app_settings SET value = p_value, updated_at = NOW(), updated_by = auth.uid() WHERE key = p_key;
    PERFORM public.log_admin_action('app_setting_changed', 'app_setting', p_key, NULL, NULL,
                                    jsonb_build_object('from', v_old, 'to', p_value));
    RETURN jsonb_build_object('key', p_key, 'value', p_value);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 2. Price rows. Both are is_custom so the WiraSend package list skips them.
-- ---------------------------------------------------------------------------
INSERT INTO public.pricing_rules (service_type, code, name, base_price, per_km_rate, unit_label, max_qty, sort_order, description, is_custom)
SELECT 'send', 'TITIP', 'Ongkir titip beli',
       COALESCE(f.base_price, 10000), COALESCE(f.per_km_rate, 2500), 'pesanan', 1, 900,
       'Ongkos titip beli dari toko ke pelanggan. Barang belanjaan tidak kena komisi.', true
FROM (SELECT 1) one
LEFT JOIN public.pricing_rules f ON f.service_type = 'food_delivery' AND f.code = 'default'
ON CONFLICT (service_type, code) DO NOTHING;

INSERT INTO public.pricing_rules (service_type, code, name, base_price, per_km_rate, unit_label, max_qty, sort_order, description, is_custom)
VALUES ('send', 'BESAR', 'Barang besar (mobil)', 0, 0, 'pesanan', 1, 910,
        'Harga ditawar driver bermobil dari foto, disetujui pelanggan sebelum diambil.', true)
ON CONFLICT (service_type, code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Adjustments: the receipt of a titip beli ('belanja', may be Rp 0 when
--    nothing was available), with photos and the bought/missing list.
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_adjustments ADD COLUMN IF NOT EXISTS photos TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.order_adjustments ADD COLUMN IF NOT EXISTS details JSONB;
ALTER TABLE public.order_adjustments DROP CONSTRAINT IF EXISTS order_adjustments_kind_check;
ALTER TABLE public.order_adjustments ADD CONSTRAINT order_adjustments_kind_check
    CHECK (kind IN ('material', 'jasa', 'quote', 'belanja'));
ALTER TABLE public.order_adjustments DROP CONSTRAINT IF EXISTS order_adjustments_amount_check;
ALTER TABLE public.order_adjustments ADD CONSTRAINT order_adjustments_amount_check
    CHECK (amount > 0 OR (kind IN ('quote', 'belanja') AND amount = 0));

-- ---------------------------------------------------------------------------
-- 4. Booking: the 0125 trigger plus the two send kinds
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
    v_budget NUMERIC;
    v_store TEXT;
    v_missing TEXT;
BEGIN
    -- 0128: titip beli
    IF NEW.service_type = 'send' AND NEW.rate_code = 'TITIP' THEN
        IF NEW.payment_method IS DISTINCT FROM 'cash' THEN
            RAISE EXCEPTION 'Titip beli dibayar tunai saat barang diterima';
        END IF;
        IF NEW.promo_code IS NOT NULL THEN
            RAISE EXCEPTION 'Kode promo tidak berlaku untuk titip beli';
        END IF;
        v_store := public.mask_contact_details(left(btrim(COALESCE(NEW.metadata -> 'titip' ->> 'store', '')), 120));
        IF length(v_store) < 3 THEN
            RAISE EXCEPTION 'Tulis nama toko tempat belanja';
        END IF;
        IF NEW.pickup_lat IS NULL OR NEW.dropoff_lat IS NULL THEN
            RAISE EXCEPTION 'Tandai lokasi toko dan alamat antar di peta';
        END IF;
        BEGIN
            v_budget := (NEW.metadata -> 'titip' ->> 'budget')::NUMERIC;
        EXCEPTION WHEN others THEN
            v_budget := NULL;
        END;
        IF v_budget IS NULL OR v_budget <> round(v_budget) OR v_budget < 10000
           OR v_budget > public.app_setting_int('titip_budget_max', 300000) THEN
            RAISE EXCEPTION 'Batas belanja harus Rp 10.000 sampai %', public.format_rupiah(public.app_setting_int('titip_budget_max', 300000));
        END IF;
        IF jsonb_typeof(NEW.metadata -> 'titip' -> 'items') <> 'array'
           OR jsonb_array_length(NEW.metadata -> 'titip' -> 'items') NOT BETWEEN 1 AND 30 THEN
            RAISE EXCEPTION 'Tulis 1 sampai 30 barang yang mau dibeli';
        END IF;
        SELECT jsonb_agg(jsonb_build_object(
                   'name', public.mask_contact_details(left(btrim(i ->> 'name'), 80)),
                   'qty', left(btrim(COALESCE(i ->> 'qty', '1')), 20),
                   'note', public.mask_contact_details(left(btrim(COALESCE(i ->> 'note', '')), 120))))
        INTO v_items
        FROM jsonb_array_elements(NEW.metadata -> 'titip' -> 'items') i
        WHERE length(btrim(COALESCE(i ->> 'name', ''))) >= 2;
        IF v_items IS NULL THEN
            RAISE EXCEPTION 'Tulis nama barang yang mau dibeli';
        END IF;
        v_missing := CASE WHEN NEW.metadata -> 'titip' ->> 'if_missing' = 'skip' THEN 'skip' ELSE 'ask' END;
        NEW.promo_discount := 0;
        NEW.package_size := 'kecil';
        NEW.metadata := (NEW.metadata - 'job') || jsonb_build_object('titip', jsonb_build_object(
            'store', v_store, 'items', v_items, 'budget', v_budget, 'if_missing', v_missing));
        RETURN NEW;
    END IF;

    -- 0128: big item by car
    IF NEW.service_type = 'send' AND NEW.rate_code = 'BESAR' THEN
        IF NEW.payment_method IS DISTINCT FROM 'cash' THEN
            RAISE EXCEPTION 'Barang besar dibayar tunai ke driver';
        END IF;
        IF NEW.promo_code IS NOT NULL THEN
            RAISE EXCEPTION 'Kode promo tidak berlaku untuk barang besar';
        END IF;
        v_desc := public.mask_contact_details(btrim(COALESCE(NEW.metadata -> 'job' ->> 'description', '')));
        IF length(v_desc) < 10 OR length(v_desc) > 500 THEN
            RAISE EXCEPTION 'Ceritakan barangnya (10 sampai 500 huruf)';
        END IF;
        v_photos := COALESCE(NEW.metadata -> 'job' -> 'photos', '[]'::jsonb);
        IF jsonb_typeof(v_photos) <> 'array' OR jsonb_array_length(v_photos) NOT BETWEEN 1 AND 3 OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_photos) ph
            WHERE jsonb_typeof(ph) <> 'string'
               OR (ph #>> '{}') !~ ('^' || NEW.user_id::text || '/[A-Za-z0-9._-]{1,120}$')
        ) THEN
            RAISE EXCEPTION 'Tambahkan 1 sampai 3 foto barang';
        END IF;
        NEW.total_price := 0;
        NEW.promo_discount := 0;
        NEW.package_size := 'mobil';
        NEW.metadata := (NEW.metadata - 'titip') || jsonb_build_object('job', jsonb_build_object(
            'description', v_desc, 'photos', v_photos, 'item', 'BESAR', 'only_custom', true, 'base', 0,
            'helper', COALESCE((NEW.metadata -> 'job' ->> 'helper')::BOOLEAN, false)));
        RETURN NEW;
    END IF;

    IF NEW.service_type = 'send' THEN
        NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) - 'job' - 'titip';
        RETURN NEW;
    END IF;

    -- 0125: pool custom job
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

    -- 0123: service custom job
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
-- 5. Who may take them: big items only by car (list, claim, dispatch)
-- ---------------------------------------------------------------------------
-- 0033 rule plus package_size 'mobil' (big items): car drivers only.
CREATE OR REPLACE FUNCTION public.is_order_eligible_for_driver(
    p_service_type TEXT,
    p_package_size TEXT,
    p_vehicle_type TEXT,
    p_job_type_preferences JSONB
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_service_type IN ('ride', 'WiraRide') THEN
            COALESCE(p_job_type_preferences, '[]'::jsonb) ? 'ride'
        WHEN p_service_type IN ('send', 'WiraSend') THEN
            COALESCE(p_job_type_preferences, '[]'::jsonb) ? 'send'
            AND CASE WHEN p_package_size = 'mobil' THEN COALESCE(p_vehicle_type, 'motor') = 'mobil'
                     ELSE COALESCE(p_vehicle_type, 'motor') <> 'mobil' OR p_package_size IN ('sedang', 'besar')
                END
        WHEN p_service_type IN ('food', 'WiraFood') THEN
            COALESCE(p_job_type_preferences, '[]'::jsonb) ? 'food'
            AND COALESCE(p_vehicle_type, 'motor') <> 'mobil'
        ELSE FALSE
    END;
$$;

CREATE OR REPLACE FUNCTION public.driver_has_car(p_driver UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_driver AND u.vehicle_type = 'mobil');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.driver_has_car(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_has_car(UUID) TO authenticated;

-- 0124 body; a big item is visible to car drivers only.
CREATE OR REPLACE FUNCTION public.can_see_open_order(
    p_service_type TEXT, p_rate_code TEXT, p_status TEXT, p_merchant_id UUID,
    p_preferred UUID, p_since TIMESTAMPTZ
)
RETURNS BOOLEAN AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RETURN FALSE;
    END IF;
    IF p_status = 'pending' THEN
        IF p_service_type IN ('service', 'pool') THEN
            RETURN public.technician_can_take(v_uid, p_service_type, p_rate_code)
               AND (p_preferred IS NULL OR p_preferred = v_uid
                    OR p_since < NOW() - public.preferred_partner_window());
        ELSIF p_service_type IN ('ride', 'send', 'food') THEN
            RETURN public.is_active_partner(v_uid, 'driver')
               AND (p_service_type <> 'send' OR p_rate_code IS DISTINCT FROM 'BESAR' OR public.driver_has_car(v_uid))
               AND (p_preferred IS NULL OR p_preferred = v_uid
                    OR p_since < NOW() - public.preferred_driver_window());
        END IF;
        RETURN FALSE;
    ELSIF p_status = 'ready' AND p_merchant_id IS NOT NULL THEN
        RETURN public.is_active_partner(v_uid, 'driver');
    END IF;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 0124 body; dispatch pings car drivers only for a big item.
CREATE OR REPLACE FUNCTION public.dispatch_next_ping(p_order_id UUID)
RETURNS TABLE (driver_id UUID, service_type TEXT, pinged_count INT, total_candidates INT) AS $$
DECLARE
    o RECORD;
    v_cands UUID[];
    v_round INT;
    v_last TIMESTAMPTZ;
    v_next UUID;
BEGIN
    SELECT x.id, x.user_id, x.status, x.driver_id, x.service_type,
           x.pickup_lat, x.pickup_lng, x.rate_code, x.preferred_partner_id, x.status_changed_at
    INTO o FROM public.orders x WHERE x.id = p_order_id FOR UPDATE;
    IF NOT FOUND OR o.status <> 'pending' OR o.driver_id IS NOT NULL
       OR o.service_type NOT IN ('ride', 'send', 'pool', 'service') THEN
        RETURN;
    END IF;

    IF o.service_type = 'ride' AND o.preferred_partner_id IS NOT NULL
       AND o.status_changed_at < NOW() - public.preferred_driver_window() THEN
        UPDATE public.orders SET preferred_partner_id = NULL WHERE id = p_order_id;
        o.preferred_partner_id := NULL;
    END IF;

    IF o.service_type = 'ride' AND o.preferred_partner_id IS NOT NULL THEN
        v_cands := CASE WHEN public.is_active_partner(o.preferred_partner_id, 'driver')
                        THEN ARRAY[o.preferred_partner_id] ELSE '{}'::UUID[] END;
    ELSIF o.service_type IN ('ride', 'send') THEN
        SELECT COALESCE(array_agg(n.id ORDER BY n.distance_meters), '{}') INTO v_cands
        FROM public.get_nearest_drivers(o.pickup_lat, o.pickup_lng,
             CASE WHEN o.service_type = 'ride' THEN o.rate_code
                  WHEN o.rate_code = 'BESAR' THEN 'mobil' END, true, 10) n
        WHERE o.pickup_lat IS NOT NULL AND n.id <> o.user_id
          AND public.is_active_partner(n.id, 'driver')
          AND (o.rate_code IS DISTINCT FROM 'BESAR' OR public.driver_has_car(n.id));
    ELSE
        SELECT COALESCE(array_agg(t.user_id ORDER BY COALESCE(t.user_id = o.preferred_partner_id, false) DESC, t.created_at), '{}')
        INTO v_cands
        FROM public.technician_profiles t
        WHERE t.is_accepting
          AND t.user_id <> o.user_id
          AND public.technician_can_take(t.user_id, o.service_type, o.rate_code)
          AND (o.preferred_partner_id IS NULL OR t.user_id = o.preferred_partner_id
               OR o.status_changed_at < NOW() - public.preferred_partner_window());
    END IF;

    SELECT COALESCE(MAX(p.round), 1), MAX(p.pinged_at) INTO v_round, v_last
    FROM public.order_dispatch_pings p WHERE p.order_id = p_order_id;

    IF v_last IS NULL OR v_last <= NOW() - INTERVAL '15 seconds' THEN
        SELECT c INTO v_next FROM unnest(v_cands) WITH ORDINALITY AS u(c, i)
        WHERE c NOT IN (SELECT p.driver_id FROM public.order_dispatch_pings p
                        WHERE p.order_id = p_order_id AND p.round = v_round)
        ORDER BY i LIMIT 1;
        IF v_next IS NULL AND cardinality(v_cands) > 0 AND o.service_type IN ('ride', 'send')
           AND o.preferred_partner_id IS NULL THEN
            v_round := v_round + 1;
            v_next := v_cands[1];
        END IF;
        IF v_next IS NOT NULL THEN
            INSERT INTO public.order_dispatch_pings (order_id, driver_id, round)
            VALUES (p_order_id, v_next, v_round);
        END IF;
    END IF;

    RETURN QUERY SELECT v_next, o.service_type::TEXT,
        (SELECT COUNT(*)::INT FROM public.order_dispatch_pings p
         WHERE p.order_id = p_order_id AND p.round = v_round),
        cardinality(v_cands);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.dispatch_next_ping(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_next_ping(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Steps that wait for the customer (every role but the admin panel)
-- ---------------------------------------------------------------------------
--   * big item: no claim without a car; no heading out before the quote is
--     approved.
--   * titip beli: no delivery before the receipt is approved; it completes
--     only with the customer's PIN (finish_titip_with_pin).
CREATE OR REPLACE FUNCTION public.guard_send_custom_steps()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.service_type <> 'send' OR NEW.rate_code NOT IN ('TITIP', 'BESAR') OR public.is_admin_panel() THEN
        RETURN NEW;
    END IF;
    IF NEW.rate_code = 'BESAR' AND OLD.driver_id IS NULL AND NEW.driver_id IS NOT NULL
       AND NOT public.driver_has_car(NEW.driver_id) THEN
        RAISE EXCEPTION 'Barang besar hanya untuk driver mobil';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.rate_code = 'BESAR' AND NEW.status IN ('picking_up', 'in_trip')
           AND NOT EXISTS (SELECT 1 FROM public.order_adjustments
                           WHERE order_id = NEW.id AND kind = 'quote' AND status = 'approved') THEN
            RAISE EXCEPTION 'Kirim penawaran harga dan tunggu persetujuan pelanggan sebelum berangkat';
        END IF;
        IF NEW.rate_code = 'TITIP' AND NEW.status = 'in_trip'
           AND NOT EXISTS (SELECT 1 FROM public.order_adjustments
                           WHERE order_id = NEW.id AND kind = 'belanja' AND status = 'approved') THEN
            RAISE EXCEPTION 'Kirim foto struk dan tunggu persetujuan total belanja sebelum mengantar';
        END IF;
        IF NEW.rate_code = 'TITIP' AND NEW.status = 'completed'
           AND current_setting('wira.titip_finish', true) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'Selesaikan titip beli dengan PIN dari pelanggan';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
DROP TRIGGER IF EXISTS trg_guard_send_custom_steps ON public.orders;
CREATE TRIGGER trg_guard_send_custom_steps BEFORE UPDATE OF status, driver_id ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_send_custom_steps();

-- ---------------------------------------------------------------------------
-- 7. Quotes: one engine for service, pool and big items (0125 body + send)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_visit_quote(p_order_id UUID, p_total NUMERIC, p_description TEXT)
RETURNS UUID AS $$
DECLARE
    v_order RECORD;
    v_base NUMERIC;
    v_min NUMERIC;
    v_max NUMERIC;
    v_desc TEXT := btrim(COALESCE(p_description, ''));
    v_id UUID;
    v_is_send BOOLEAN;
BEGIN
    SELECT id, user_id, driver_id, status, service_type, rate_code, metadata INTO v_order
    FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND OR v_order.driver_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Anda tidak menangani pesanan ini';
    END IF;
    v_is_send := v_order.service_type = 'send' AND v_order.rate_code = 'BESAR';
    IF NOT (v_order.service_type IN ('service', 'pool') OR v_is_send) OR NOT (v_order.metadata ? 'job') THEN
        RAISE EXCEPTION 'Penawaran hanya untuk pesanan Pekerjaan lain atau Barang besar';
    END IF;
    IF v_is_send AND v_order.status <> 'accepted' THEN
        RAISE EXCEPTION 'Penawaran barang besar dikirim sebelum berangkat ke lokasi';
    ELSIF NOT v_is_send AND v_order.status <> 'on_the_way' THEN
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
    IF v_is_send THEN
        v_min := public.app_setting_int('big_item_quote_min', 30000);
        v_max := public.app_setting_int('big_item_quote_max', 1000000);
    ELSE
        v_min := v_base;
        v_max := public.app_setting_int('visit_quote_max', 5000000);
    END IF;
    IF p_total IS NULL OR p_total <> round(p_total) OR p_total < v_min OR p_total > v_max THEN
        RAISE EXCEPTION 'Harga harus antara % dan %', public.format_rupiah(v_min), public.format_rupiah(v_max);
    END IF;
    IF length(v_desc) < 3 OR length(v_desc) > 300 THEN
        RAISE EXCEPTION 'Tuliskan rincian (3 sampai 300 huruf)';
    END IF;

    INSERT INTO public.order_adjustments (order_id, requested_by, kind, amount, description)
    VALUES (p_order_id, auth.uid(), 'quote', p_total - v_base, v_desc)
    RETURNING id INTO v_id;

    PERFORM public.notify_user(v_order.user_id,
        CASE WHEN v_is_send THEN 'Driver mengajukan harga' ELSE 'Teknisi mengajukan harga' END,
        CASE WHEN v_is_send THEN 'Harga antar ' ELSE 'Harga jasa ' END || public.format_rupiah(p_total)
        || CASE WHEN v_base > 0 THEN ' (termasuk biaya cek ' || public.format_rupiah(v_base) || ')' ELSE '' END
        || ' untuk ' || v_desc || '. Buka pesanan untuk menyetujui atau menolak.',
        '/active-order/' || p_order_id);
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 0090 body: answers for a big-item quote (status 'accepted'; a rejection
-- cancels the order at no charge) and for a titip beli receipt (approve
-- only; the goods count as material, so no commission on them).
CREATE OR REPLACE FUNCTION public.respond_order_adjustment(p_adjustment_id UUID, p_approve BOOLEAN)
RETURNS TEXT AS $$
DECLARE
    v_adj RECORD;
    v_order RECORD;
    v_paid_online BOOLEAN;
    v_open TEXT[];
BEGIN
    SELECT * INTO v_adj FROM public.order_adjustments WHERE id = p_adjustment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pengajuan tidak ditemukan';
    END IF;
    SELECT id, user_id, driver_id, status, payment_method, payment_status, title, service_type, rate_code INTO v_order
    FROM public.orders WHERE id = v_adj.order_id FOR UPDATE;
    IF v_order.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Anda tidak berhak menjawab pengajuan ini';
    END IF;
    IF v_adj.status <> 'pending' THEN
        RAISE EXCEPTION 'Pengajuan ini sudah dijawab';
    END IF;

    v_open := CASE
        WHEN v_order.service_type = 'send' AND v_adj.kind = 'quote' THEN ARRAY['accepted']
        WHEN v_order.service_type = 'send' AND v_adj.kind = 'belanja' THEN ARRAY['picking_up']
        WHEN v_order.service_type = 'send' THEN ARRAY['picking_up', 'in_trip']
        ELSE ARRAY['on_the_way', 'working'] END;
    IF NOT (v_order.status = ANY (v_open)) THEN
        UPDATE public.order_adjustments SET status = 'cancelled', decided_at = NOW() WHERE id = p_adjustment_id;
        RETURN 'cancelled';
    END IF;

    IF NOT p_approve THEN
        IF v_adj.kind = 'belanja' THEN
            RAISE EXCEPTION 'Barang sudah dibeli. Kalau ada yang salah, chat driver atau CS Wira.';
        END IF;
        UPDATE public.order_adjustments SET status = 'rejected', decided_at = NOW() WHERE id = p_adjustment_id;
        IF v_order.service_type = 'send' AND v_adj.kind = 'quote' THEN
            UPDATE public.orders SET status = 'cancelled', updated_at = NOW() WHERE id = v_order.id;
            INSERT INTO public.order_events (order_id, kind, from_status, to_status, actor_id, note)
            VALUES (v_order.id, 'note', v_order.status, 'cancelled', auth.uid(), 'Pelanggan menolak penawaran barang besar');
            PERFORM public.notify_user(v_order.driver_id, 'Penawaran ditolak',
                'Pelanggan menolak ' || public.format_rupiah(v_adj.amount) || ' untuk ' || COALESCE(v_order.title, 'barang besar')
                || '. Pesanan dibatalkan tanpa biaya.', '/driver');
            RETURN 'rejected';
        END IF;
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (v_order.driver_id, 'Biaya tambahan ditolak',
                'Pelanggan menolak ' || public.format_rupiah(v_adj.amount) || ' untuk ' || v_adj.description || '.', false);
        RETURN 'rejected';
    END IF;

    v_paid_online := v_order.payment_method IN ('wallet', 'qris') AND v_order.payment_status = 'paid';
    IF v_paid_online AND v_adj.amount > 0 THEN
        UPDATE public.users SET wallet_balance = wallet_balance - v_adj.amount
        WHERE id = v_order.user_id AND wallet_balance >= v_adj.amount;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Saldo WiraPay belum cukup untuk %. Isi saldo dulu, lalu setujui lagi.', public.format_rupiah(v_adj.amount);
        END IF;
        INSERT INTO public.transactions (user_id, amount, type, status, description, reference_id)
        VALUES (v_order.user_id, v_adj.amount, 'payment', 'success',
                'Biaya tambahan: ' || v_adj.description, v_order.id::text);
    END IF;

    PERFORM set_config('wira.price_adjustment', 'on', true);
    UPDATE public.orders
    SET total_price = total_price + v_adj.amount,
        material_amount = material_amount + CASE WHEN v_adj.kind IN ('material', 'belanja') THEN v_adj.amount ELSE 0 END
    WHERE id = v_order.id;
    PERFORM set_config('wira.price_adjustment', 'off', true);

    UPDATE public.order_adjustments SET status = 'approved', decided_at = NOW() WHERE id = p_adjustment_id;
    INSERT INTO public.notifications (user_id, title, description, is_read)
    VALUES (v_order.driver_id,
            CASE v_adj.kind WHEN 'belanja' THEN 'Total belanja disetujui' WHEN 'quote' THEN 'Penawaran disetujui' ELSE 'Biaya tambahan disetujui' END,
            CASE v_adj.kind
                WHEN 'belanja' THEN 'Pelanggan menyetujui belanja ' || public.format_rupiah(v_adj.amount) || '. Silakan antar sekarang.'
                ELSE public.format_rupiah(v_adj.amount) || ' untuk ' || v_adj.description
                     || CASE WHEN v_paid_online THEN ' sudah dibayar lewat WiraPay.' ELSE '. Terima pembayarannya tunai dari pelanggan.' END
            END,
            false);
    RETURN 'approved';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.respond_order_adjustment(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_order_adjustment(UUID, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Titip beli: receipt, auto-approval, delivery, PIN on arrival
-- ---------------------------------------------------------------------------
-- p_bought: [{name, qty, bought: true|false}] as the driver ticked them.
CREATE OR REPLACE FUNCTION public.submit_titip_receipt(
    p_order_id UUID, p_total NUMERIC, p_photos TEXT[], p_bought JSONB DEFAULT NULL, p_note TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_order RECORD;
    v_budget NUMERIC;
    v_missing TEXT;
    v_desc TEXT;
    v_id UUID;
BEGIN
    SELECT id, user_id, driver_id, status, service_type, rate_code, metadata INTO v_order
    FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND OR v_order.driver_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Anda tidak menangani pesanan ini';
    END IF;
    IF v_order.service_type <> 'send' OR v_order.rate_code IS DISTINCT FROM 'TITIP' THEN
        RAISE EXCEPTION 'Hanya untuk pesanan titip beli';
    END IF;
    IF v_order.status <> 'picking_up' THEN
        RAISE EXCEPTION 'Kirim struk saat Anda di toko, sebelum mengantar';
    END IF;
    IF EXISTS (SELECT 1 FROM public.order_adjustments
               WHERE order_id = p_order_id AND kind = 'belanja' AND status IN ('pending', 'approved')) THEN
        RAISE EXCEPTION 'Struk sudah dikirim';
    END IF;
    IF EXISTS (SELECT 1 FROM public.order_adjustments WHERE order_id = p_order_id AND status = 'pending') THEN
        RAISE EXCEPTION 'Masih ada pengajuan yang menunggu jawaban pelanggan';
    END IF;
    v_budget := COALESCE((v_order.metadata -> 'titip' ->> 'budget')::NUMERIC, 0);
    IF p_total IS NULL OR p_total <> round(p_total) OR p_total < 0 OR p_total > v_budget THEN
        RAISE EXCEPTION 'Total belanja harus Rp 0 sampai batas belanja %. Kalau lebih, tanyakan pelanggan lewat chat dulu.',
            public.format_rupiah(v_budget);
    END IF;
    IF COALESCE(array_length(p_photos, 1), 0) NOT BETWEEN 1 AND 3
       OR EXISTS (SELECT 1 FROM unnest(p_photos) ph WHERE ph !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]{1,120}$')) THEN
        RAISE EXCEPTION 'Tambahkan 1 sampai 3 foto struk';
    END IF;
    IF p_bought IS NOT NULL AND (jsonb_typeof(p_bought) <> 'array' OR jsonb_array_length(p_bought) > 30) THEN
        RAISE EXCEPTION 'Daftar barang tidak valid';
    END IF;
    SELECT string_agg(i ->> 'name', ', ') INTO v_missing
    FROM jsonb_array_elements(COALESCE(p_bought, '[]'::jsonb)) i
    WHERE COALESCE((i ->> 'bought')::BOOLEAN, true) = false;
    v_desc := 'Belanja di ' || COALESCE(v_order.metadata -> 'titip' ->> 'store', 'toko')
        || CASE WHEN v_missing IS NOT NULL THEN '. Tidak tersedia: ' || left(v_missing, 200) ELSE '' END
        || CASE WHEN btrim(COALESCE(p_note, '')) <> '' THEN '. ' || left(public.mask_contact_details(btrim(p_note)), 200) ELSE '' END;

    INSERT INTO public.order_adjustments (order_id, requested_by, kind, amount, description, photos, details)
    VALUES (p_order_id, auth.uid(), 'belanja', p_total, v_desc, p_photos, p_bought)
    RETURNING id INTO v_id;

    PERFORM public.notify_user(v_order.user_id, 'Driver selesai belanja',
        'Total belanja ' || public.format_rupiah(p_total) || '. Lihat struknya dan setujui supaya driver bisa mengantar. '
        || 'Tanpa jawaban, total disetujui otomatis dalam ' || public.app_setting_int('titip_auto_approve_minutes', 30) || ' menit.',
        '/active-order/' || p_order_id);
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.submit_titip_receipt(UUID, NUMERIC, TEXT[], JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_titip_receipt(UUID, NUMERIC, TEXT[], JSONB, TEXT) TO authenticated;

-- pg_cron: receipts the customer did not answer are approved after
-- titip_auto_approve_minutes, because the driver has already paid.
CREATE OR REPLACE FUNCTION public.auto_approve_titip_receipts()
RETURNS INT AS $$
DECLARE
    r RECORD;
    n INT := 0;
BEGIN
    FOR r IN
        SELECT a.id, a.order_id, a.amount, o.user_id, o.driver_id
        FROM public.order_adjustments a JOIN public.orders o ON o.id = a.order_id
        WHERE a.kind = 'belanja' AND a.status = 'pending' AND o.status = 'picking_up'
          AND a.created_at < NOW() - make_interval(mins => public.app_setting_int('titip_auto_approve_minutes', 30))
        FOR UPDATE OF a, o SKIP LOCKED
    LOOP
        PERFORM set_config('wira.price_adjustment', 'on', true);
        UPDATE public.orders SET total_price = total_price + r.amount, material_amount = material_amount + r.amount
        WHERE id = r.order_id;
        PERFORM set_config('wira.price_adjustment', 'off', true);
        UPDATE public.order_adjustments SET status = 'approved', decided_at = NOW() WHERE id = r.id;
        INSERT INTO public.order_events (order_id, kind, actor_id, note, amount)
        VALUES (r.order_id, 'note', NULL, 'Total belanja disetujui otomatis (pelanggan tidak menjawab)', r.amount);
        PERFORM public.notify_user(r.driver_id, 'Total belanja disetujui otomatis',
            'Pelanggan tidak menjawab, jadi belanja ' || public.format_rupiah(r.amount) || ' disetujui. Silakan antar sekarang.', '/driver');
        PERFORM public.notify_user(r.user_id, 'Total belanja disetujui otomatis',
            'Belanja ' || public.format_rupiah(r.amount) || ' disetujui karena tidak ada jawaban. Driver sedang menuju Anda.',
            '/active-order/' || r.order_id);
        n := n + 1;
    END LOOP;
    RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.auto_approve_titip_receipts() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule('wira-titip-auto-approve', '*/2 * * * *', 'SELECT public.auto_approve_titip_receipts()');
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.start_titip_delivery(p_order_id UUID)
RETURNS VOID AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT id, user_id, driver_id, status, service_type, rate_code INTO v_order
    FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND OR v_order.driver_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Anda tidak menangani pesanan ini';
    END IF;
    IF v_order.service_type <> 'send' OR v_order.rate_code IS DISTINCT FROM 'TITIP' OR v_order.status <> 'picking_up' THEN
        RAISE EXCEPTION 'Pesanan belum siap diantar';
    END IF;
    -- The guard trigger checks that the receipt is approved.
    UPDATE public.orders SET status = 'in_trip', updated_at = NOW() WHERE id = p_order_id;
    PERFORM public.notify_user(v_order.user_id, 'Belanjaan sedang diantar',
        'Driver menuju Anda. Siapkan PIN pesanan dan uang tunai.', '/active-order/' || p_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.start_titip_delivery(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_titip_delivery(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.finish_titip_with_pin(p_order_id UUID, p_pin_input VARCHAR(4))
RETURNS JSONB AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_real_pin VARCHAR(4);
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND OR v_order.driver_id IS DISTINCT FROM auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anda tidak menangani pesanan ini');
    END IF;
    IF v_order.service_type <> 'send' OR v_order.rate_code IS DISTINCT FROM 'TITIP' OR v_order.status <> 'in_trip' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pesanan belum dalam pengantaran');
    END IF;
    IF v_order.pin_attempts >= 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Terlalu banyak percobaan PIN. Hubungi CS Wira.');
    END IF;
    SELECT pin INTO v_real_pin FROM public.order_security_pins WHERE order_id = p_order_id;
    IF v_real_pin IS DISTINCT FROM p_pin_input THEN
        UPDATE public.orders SET pin_attempts = COALESCE(pin_attempts, 0) + 1 WHERE id = p_order_id;
        RETURN jsonb_build_object('success', false, 'error', 'PIN tidak valid. Sisa percobaan: ' || (5 - (COALESCE(v_order.pin_attempts, 0) + 1)));
    END IF;
    PERFORM set_config('wira.titip_finish', 'on', true);
    UPDATE public.orders SET status = 'completed', pin_attempts = 0, updated_at = NOW() WHERE id = p_order_id;
    PERFORM set_config('wira.titip_finish', 'off', true);
    RETURN jsonb_build_object('success', true, 'total', v_order.total_price);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.finish_titip_with_pin(UUID, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_titip_with_pin(UUID, VARCHAR) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Photos: drivers who may take a big item see its photos; the customer
--    sees the receipt photos (0125 body + both)
-- ---------------------------------------------------------------------------
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
                       AND CASE WHEN o.service_type = 'send'
                                THEN public.can_see_open_order(o.service_type, o.rate_code, o.status, o.merchant_id,
                                                               o.preferred_partner_id, o.status_changed_at)
                                ELSE public.technician_can_take(auth.uid(), o.service_type, o.rate_code) END))
        )
        OR EXISTS (
            SELECT 1 FROM public.visit_reports r JOIN public.orders o ON o.id = r.order_id
            WHERE p_name = ANY (r.photos_before || r.photos_after)
              AND (o.user_id = auth.uid() OR r.technician_id = auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM public.order_adjustments a JOIN public.orders o ON o.id = a.order_id
            WHERE p_name = ANY (a.photos) AND (o.user_id = auth.uid() OR o.driver_id = auth.uid())
        )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Verify after applying:
--   SELECT code, base_price, per_km_rate, is_custom FROM pricing_rules WHERE service_type = 'send' AND code IN ('TITIP', 'BESAR');  -> 2 rows
--   SELECT key, value FROM app_settings WHERE key IN ('titip_budget_max', 'titip_auto_approve_minutes', 'big_item_quote_min', 'big_item_quote_max', 'visit_quote_max');  -> 5 rows
--   SELECT jobname FROM cron.job WHERE jobname = 'wira-titip-auto-approve';  -> 1 row
