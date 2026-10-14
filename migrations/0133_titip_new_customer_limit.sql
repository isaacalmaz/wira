-- =========================================
-- Migration 0133: titip beli - lower spending limit for new customers
-- =========================================
-- The owner's decision (2026-10-14) on protecting drivers who pay for a titip
-- beli out of their own pocket: "b boleh diaplikasikan selagi admin bisa
-- mengubah angkanya nanti".
--
-- A customer with fewer than titip_trusted_orders (3) completed orders may
-- set a spending limit of at most titip_budget_new_max (Rp 100.000); after
-- that the normal titip_budget_max (Rp 300.000) applies. Both are admin
-- settings (Admin > Harga > Aturan pesanan bebas). The new-customer limit
-- never exceeds titip_budget_max.
--
-- titip_budget_max_for(user) is the limit for one customer, enforced in
-- price_custom_service_job; my_titip_budget() tells the app the caller's
-- limit and progress. admin_set_app_setting knows the two new keys.
--
-- The chat template for a driver to ask for the shopping money by transfer
-- is frontend only (order chat is not masked). No Wira guarantee is shown;
-- unresolved disputes stay an admin decision.
--
-- Verify:
--   SELECT key, value FROM app_settings WHERE key LIKE 'titip_%';
--   SELECT public.my_titip_budget();  -- as a signed-in customer
-- =========================================

INSERT INTO public.app_settings (key, value) VALUES
    ('titip_budget_new_max', '100000'::jsonb),
    ('titip_trusted_orders', '3'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.titip_completed_orders(p_user UUID)
RETURNS INT AS $$
    SELECT COUNT(*)::INT FROM public.orders o
    WHERE o.user_id = p_user AND o.status = 'completed';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.titip_completed_orders(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.titip_budget_max_for(p_user UUID)
RETURNS INT AS $$
    -- Only the caller's own history counts (the booking trigger runs as the
    -- customer); anyone else gets the new-customer limit.
    SELECT CASE
        WHEN (p_user = auth.uid() OR auth.uid() IS NULL)
             AND public.titip_completed_orders(p_user) >= public.app_setting_int('titip_trusted_orders', 3)
            THEN public.app_setting_int('titip_budget_max', 300000)
        ELSE LEAST(public.app_setting_int('titip_budget_new_max', 100000),
                   public.app_setting_int('titip_budget_max', 300000))
    END;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.titip_budget_max_for(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.titip_budget_max_for(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_titip_budget()
RETURNS JSONB AS $$
    SELECT jsonb_build_object(
        'max', public.titip_budget_max_for(auth.uid()),
        'full_max', public.app_setting_int('titip_budget_max', 300000),
        'trusted_orders', public.app_setting_int('titip_trusted_orders', 3),
        'completed', public.titip_completed_orders(auth.uid()))
    WHERE auth.uid() IS NOT NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.my_titip_budget() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_titip_budget() TO authenticated;

-- Latest body from 0132; only the titip limit changes (titip_budget_max_for).
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
    v_hours INT;
    v_rate NUMERIC;
    v_reqs JSONB;
BEGIN
    -- 0132: WiraRide. Hourly rent is priced here from vehicles.hourly_rate;
    -- a normal ride needs its route (the price trigger prices it by distance).
    IF NEW.service_type = 'ride' AND current_user IN ('authenticated', 'anon') THEN
        IF NEW.metadata ? 'hourly' THEN
            IF NEW.payment_method IS DISTINCT FROM 'cash' THEN
                RAISE EXCEPTION 'Sewa per jam dibayar tunai ke sopir';
            END IF;
            IF NEW.promo_code IS NOT NULL THEN
                RAISE EXCEPTION 'Kode promo tidak berlaku untuk sewa per jam';
            END IF;
            IF NEW.pickup_lat IS NULL OR NEW.pickup_lng IS NULL THEN
                RAISE EXCEPTION 'Tandai lokasi jemput di peta';
            END IF;
            BEGIN
                v_hours := (NEW.metadata -> 'hourly' ->> 'hours')::INT;
            EXCEPTION WHEN others THEN
                v_hours := NULL;
            END;
            IF v_hours IS NULL OR v_hours < public.app_setting_int('ride_hourly_min_hours', 2)
               OR v_hours > public.app_setting_int('ride_hourly_max_hours', 12) THEN
                RAISE EXCEPTION 'Lama sewa % sampai % jam', public.app_setting_int('ride_hourly_min_hours', 2),
                    public.app_setting_int('ride_hourly_max_hours', 12);
            END IF;
            v_rate := public.ride_hourly_rate(NEW.rate_code);
            IF v_rate IS NULL OR v_rate <= 0 THEN
                RAISE EXCEPTION 'Sewa per jam belum tersedia untuk kendaraan ini';
            END IF;
            NEW.distance_meters := NULL;
            NEW.dropoff_lat := NULL;
            NEW.dropoff_lng := NULL;
            NEW.total_price := v_hours * v_rate;
            NEW.promo_discount := 0;
            NEW.metadata := NEW.metadata || jsonb_build_object('hourly', jsonb_build_object(
                'hours', v_hours, 'rate', v_rate, 'extra_minutes', 0,
                'plan', NULLIF(public.mask_contact_details(left(btrim(COALESCE(NEW.metadata -> 'hourly' ->> 'plan', '')), 300)), '')));
        ELSE
            NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) - 'hourly';
            IF NEW.rate_code IS NULL OR NEW.distance_meters IS NULL THEN
                RAISE EXCEPTION 'Rute perjalanan belum dihitung. Pilih titik jemput dan tujuan lagi.';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- 0132: villa special requests (known codes, notes masked).
    IF NEW.service_type IN ('villa', 'WiraVilla') AND current_user IN ('authenticated', 'anon') THEN
        IF jsonb_typeof(NEW.metadata -> 'villa_requests') IS DISTINCT FROM 'array' THEN
            NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) - 'villa_requests';
            RETURN NEW;
        END IF;
        SELECT jsonb_agg(jsonb_build_object(
                   'code', r ->> 'code',
                   'note', NULLIF(public.mask_contact_details(left(btrim(COALESCE(r ->> 'note', '')), 120)), '')))
        INTO v_reqs
        FROM (SELECT DISTINCT ON (r ->> 'code') r
              FROM jsonb_array_elements(NEW.metadata -> 'villa_requests') r
              WHERE public.villa_request_label(r ->> 'code') IS NOT NULL) x;
        NEW.metadata := (NEW.metadata - 'villa_requests')
            || CASE WHEN v_reqs IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('villa_requests', v_reqs) END;
        RETURN NEW;
    END IF;

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
           OR v_budget > public.titip_budget_max_for(NEW.user_id) THEN
            RAISE EXCEPTION 'Batas belanja harus Rp 10.000 sampai %', public.format_rupiah(public.titip_budget_max_for(NEW.user_id));
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

-- Latest body from 0132 plus the two keys.
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
    ELSIF p_key IN ('ride_hourly_min_hours', 'ride_hourly_max_hours') AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 1 AND 24) THEN
        RAISE EXCEPTION 'Lama sewa harus 1 sampai 24 jam';
    ELSIF p_key = 'ride_hourly_grace_minutes' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 0 AND 60) THEN
        RAISE EXCEPTION 'Toleransi lewat waktu harus 0 sampai 60 menit';
    ELSIF p_key = 'ride_schedule_min_minutes' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 15 AND 1440) THEN
        RAISE EXCEPTION 'Jadwal paling cepat harus 15 sampai 1440 menit';
    ELSIF p_key = 'ride_schedule_max_days' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 1 AND 30) THEN
        RAISE EXCEPTION 'Jadwal paling jauh harus 1 sampai 30 hari';
    ELSIF p_key = 'ride_schedule_free_cancel_hours' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 0 AND 48) THEN
        RAISE EXCEPTION 'Batas batal gratis harus 0 sampai 48 jam';
    ELSIF p_key = 'ride_schedule_queue_minutes' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 5 AND 180) THEN
        RAISE EXCEPTION 'Waktu antrean admin harus 5 sampai 180 menit';
    ELSIF p_key = 'service_warranty_days' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 0 AND 90) THEN
        RAISE EXCEPTION 'Garansi Service harus 0 sampai 90 hari';
    ELSIF p_key = 'pool_warranty_hours' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 12 AND 168) THEN
        RAISE EXCEPTION 'Waktu kunjungan ulang Pool harus 12 sampai 168 jam';
    ELSIF p_key = 'warranty_response_hours' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 1 AND 72) THEN
        RAISE EXCEPTION 'Batas jawab teknisi harus 1 sampai 72 jam';
    ELSIF p_key = 'villa_request_max' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 0 AND 20000000) THEN
        RAISE EXCEPTION 'Maksimal harga permintaan villa harus Rp 0 sampai Rp 20.000.000';
    ELSIF p_key = 'titip_budget_new_max' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 10000 AND 5000000) THEN
        RAISE EXCEPTION 'Batas belanja pelanggan baru harus Rp 10.000 sampai Rp 5.000.000';
    ELSIF p_key = 'titip_trusted_orders' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 0 AND 50) THEN
        RAISE EXCEPTION 'Jumlah pesanan selesai harus 0 sampai 50';
    ELSIF p_key NOT IN ('topup_auto_confirm', 'qris_order_window_minutes', 'commission_debt_limit',
                        'commission_debt_grace_days', 'commission_payment_info', 'titip_budget_max',
                        'titip_auto_approve_minutes', 'big_item_quote_min', 'big_item_quote_max',
                        'visit_quote_max', 'ride_hourly_min_hours', 'ride_hourly_max_hours',
                        'ride_hourly_grace_minutes', 'ride_schedule_min_minutes', 'ride_schedule_max_days',
                        'ride_schedule_free_cancel_hours', 'ride_schedule_queue_minutes',
                        'service_warranty_days', 'pool_warranty_hours', 'warranty_response_hours',
                        'villa_request_max', 'titip_budget_new_max', 'titip_trusted_orders') THEN
        RAISE EXCEPTION 'Pengaturan % tidak dikenal', p_key;
    END IF;
    IF p_key = 'big_item_quote_min' AND v_num >= public.app_setting_int('big_item_quote_max', 1000000) THEN
        RAISE EXCEPTION 'Harga minimum harus di bawah harga maksimum';
    ELSIF p_key = 'big_item_quote_max' AND v_num <= public.app_setting_int('big_item_quote_min', 30000) THEN
        RAISE EXCEPTION 'Harga maksimum harus di atas harga minimum';
    ELSIF p_key = 'ride_hourly_min_hours' AND v_num > public.app_setting_int('ride_hourly_max_hours', 12) THEN
        RAISE EXCEPTION 'Lama sewa minimum tidak boleh di atas maksimum';
    ELSIF p_key = 'ride_hourly_max_hours' AND v_num < public.app_setting_int('ride_hourly_min_hours', 2) THEN
        RAISE EXCEPTION 'Lama sewa maksimum tidak boleh di bawah minimum';
    END IF;

    INSERT INTO public.app_settings (key, value) VALUES (p_key, p_value) ON CONFLICT (key) DO NOTHING;
    SELECT value INTO v_old FROM public.app_settings WHERE key = p_key FOR UPDATE;
    UPDATE public.app_settings SET value = p_value, updated_at = NOW(), updated_by = auth.uid() WHERE key = p_key;
    PERFORM public.log_admin_action('app_setting_changed', 'app_setting', p_key, NULL, NULL,
                                    jsonb_build_object('from', v_old, 'to', p_value));
    RETURN jsonb_build_object('key', p_key, 'value', p_value);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
