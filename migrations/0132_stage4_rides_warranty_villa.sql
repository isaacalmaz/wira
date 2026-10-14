-- =========================================
-- Migration 0132: stage 4 - scheduled and hourly rides, warranty, villa
-- special requests (all limits admin-editable)
-- =========================================
-- Approved by the owner from the stage 4 mockup (2026-10-14): "gunakan angka
-- itu, tapi pastikan saya bisa mengubahnya di menu admin" and "selalu
-- pusatkan keputusan kepada admin".
--
-- WiraRide "Nanti" (metadata.scheduled_at -> orders.scheduled_at):
--   - bookable ride_schedule_min_minutes (60) to ride_schedule_max_days (7)
--     ahead; drivers with the matching vehicle claim it early from their
--     Jadwal tab (no overlapping scheduled rides), and may head out from 90
--     minutes before;
--   - ride_schedule_tick (cron, 5 min) reminds both sides 60 minutes before
--     and, ride_schedule_queue_minutes (30) before, tells the customer and
--     the admins when nobody took it; dispatch pings online drivers from then
--     on (dispatch_due_orders); unclaimed rides expire 15 minutes after the
--     pickup time (expire_unmatched_orders);
--   - the driver's phone shows from 60 minutes before the pickup;
--   - cancelling stays free; inside ride_schedule_free_cancel_hours (2) it
--     is noted in order_events, and a driver's late cancel shows in
--     Penanda Mitra.
-- WiraRide "Per jam" (metadata.hourly): cash only, no promo,
--   ride_hourly_min_hours..max_hours (2..12) x vehicles.hourly_rate (motor
--   35.000, mobil 90.000, edited in Manajemen Harga). The customer asks for
--   more time (request_ride_extension), the driver approves it
--   (respond_ride_extension); finish_hourly_ride adds overtime past
--   ride_hourly_grace_minutes (10) in 30-minute blocks at half the hourly
--   rate, then completes. Hourly rides cannot be completed any other way.
-- Jaminan dijemput: a driver who releases a ride/send order already sends it
--   back to searching (0048); now the customer is told and the release is
--   noted, and drivers with many releases show in Penanda Mitra.
-- Garansi (warranty_claims): Service service_warranty_days (7) after
--   completion, Pool during the monthly package (a package visit completed in
--   the last 7 days). The technician has warranty_response_hours (24) to
--   accept (a free visit order, no commission) or object; objections,
--   overdue claims and pool visits not done within pool_warranty_hours (48)
--   go to the admins, who assign a technician or reject the claim.
-- Villa special requests (metadata.villa_requests): the host prices each
--   request (submit_villa_request_quote, each at most villa_request_max);
--   the guest approves or rejects it in the app (respond_order_adjustment,
--   kind 'villa'). Bookings are paid by QRIS, so approved requests are paid
--   in cash to the host on arrival and villa_extras_commission charges the
--   host's villa commission on them when the stay completes (on a cash
--   booking they join the total instead). Rejecting keeps the booking.
-- =========================================

-- ---------- settings and columns ----------
INSERT INTO public.app_settings (key, value) VALUES
    ('ride_hourly_min_hours', '2'::jsonb),
    ('ride_hourly_max_hours', '12'::jsonb),
    ('ride_hourly_grace_minutes', '10'::jsonb),
    ('ride_schedule_min_minutes', '60'::jsonb),
    ('ride_schedule_max_days', '7'::jsonb),
    ('ride_schedule_free_cancel_hours', '2'::jsonb),
    ('ride_schedule_queue_minutes', '30'::jsonb),
    ('service_warranty_days', '7'::jsonb),
    ('pool_warranty_hours', '48'::jsonb),
    ('warranty_response_hours', '24'::jsonb),
    ('villa_request_max', '2000000'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC;
UPDATE public.vehicles SET hourly_rate = 35000 WHERE service_type = 'ride' AND type = 'motor' AND hourly_rate IS NULL;
UPDATE public.vehicles SET hourly_rate = 90000 WHERE service_type = 'ride' AND type = 'mobil' AND hourly_rate IS NULL;
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_hourly_rate_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_hourly_rate_check
    CHECK (hourly_rate IS NULL OR (hourly_rate >= 10000 AND hourly_rate <= 500000 AND hourly_rate = round(hourly_rate)));

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS schedule_reminded_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS schedule_alerted_at TIMESTAMPTZ;

ALTER TABLE public.order_adjustments DROP CONSTRAINT IF EXISTS order_adjustments_kind_check;
ALTER TABLE public.order_adjustments ADD CONSTRAINT order_adjustments_kind_check
    CHECK (kind = ANY (ARRAY['material', 'jasa', 'quote', 'belanja', 'sewa', 'villa']));
ALTER TABLE public.order_adjustments DROP CONSTRAINT IF EXISTS order_adjustments_amount_check;
ALTER TABLE public.order_adjustments ADD CONSTRAINT order_adjustments_amount_check
    CHECK (amount > 0 OR (kind = ANY (ARRAY['quote', 'belanja', 'villa']) AND amount = 0));

ALTER TABLE public.flag_snoozes DROP CONSTRAINT IF EXISTS flag_snoozes_kind_check;
ALTER TABLE public.flag_snoozes ADD CONSTRAINT flag_snoozes_kind_check
    CHECK (kind = ANY (ARRAY['check_only', 'absent', 'driver_cancel', 'warranty']));

-- The driver's vehicle hourly rate, NULL when hourly rent is off for it.
CREATE OR REPLACE FUNCTION public.ride_hourly_rate(p_vehicle TEXT)
RETURNS NUMERIC AS $$
    SELECT v.hourly_rate FROM public.vehicles v
    WHERE v.service_type = 'ride' AND v.type = p_vehicle AND v.is_active
    LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.ride_hourly_rate(TEXT) TO authenticated;

-- When the trip of an hourly ride started (PIN), and how long it is booked.
CREATE OR REPLACE FUNCTION public.ride_trip_started_at(p_order_id UUID)
RETURNS TIMESTAMPTZ AS $$
    SELECT COALESCE(
        (SELECT MAX(e.created_at) FROM public.order_events e
         WHERE e.order_id = p_order_id AND e.kind = 'status' AND e.to_status = 'in_trip'),
        (SELECT o.status_changed_at FROM public.orders o WHERE o.id = p_order_id AND o.status = 'in_trip'));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.ride_trip_started_at(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.ride_booked_minutes(p_metadata JSONB)
RETURNS INT AS $$
    SELECT COALESCE((p_metadata -> 'hourly' ->> 'hours')::INT, 0) * 60
         + COALESCE((p_metadata -> 'hourly' ->> 'extra_minutes')::INT, 0);
$$ LANGUAGE sql IMMUTABLE;

-- ---------- warranty claims (table first: can_view_order_photo reads it) ----------
CREATE TABLE IF NOT EXISTS public.warranty_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    technician_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    service_type TEXT NOT NULL CHECK (service_type IN ('service', 'pool')),
    description TEXT NOT NULL,
    photos TEXT[] NOT NULL DEFAULT '{}',
    preferred TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'disputed', 'assigned', 'rejected')),
    technician_reason TEXT,
    technician_photos TEXT[] NOT NULL DEFAULT '{}',
    admin_note TEXT,
    decided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    visit_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    response_due TIMESTAMPTZ NOT NULL,
    alerted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS warranty_claims_technician_idx ON public.warranty_claims (technician_id, status);
CREATE INDEX IF NOT EXISTS warranty_claims_status_idx ON public.warranty_claims (status, response_due);
ALTER TABLE public.warranty_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS warranty_claims_select ON public.warranty_claims;
CREATE POLICY warranty_claims_select ON public.warranty_claims FOR SELECT
    USING (user_id = auth.uid() OR technician_id = auth.uid() OR is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.warranty_claims FROM anon, authenticated;
GRANT SELECT ON public.warranty_claims TO authenticated;


CREATE OR REPLACE FUNCTION public.villa_request_label(p_code TEXT)
RETURNS TEXT AS $$
    SELECT CASE p_code
        WHEN 'early_checkin' THEN 'Check-in lebih awal'
        WHEN 'late_checkout' THEN 'Check-out lebih lambat'
        WHEN 'extra_bed' THEN 'Extra bed'
        WHEN 'airport_pickup' THEN 'Jemput dari bandara'
        WHEN 'other' THEN 'Permintaan lain'
    END;
$$ LANGUAGE sql IMMUTABLE;



-- 0128 body; adds the ride (hourly / route required) and villa request branches.
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


-- 0124 body; rides may now carry a pickup time ("Nanti").
CREATE OR REPLACE FUNCTION public.set_order_booking_fields()
RETURNS TRIGGER AS $$
DECLARE
    v_at TIMESTAMPTZ;
    v_pref UUID;
    m TEXT[];
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF current_user IN ('authenticated', 'anon') AND NOT is_admin() AND (
            NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
            OR NEW.preferred_partner_id IS DISTINCT FROM OLD.preferred_partner_id
            OR NEW.package_id IS DISTINCT FROM OLD.package_id
        ) THEN
            RAISE EXCEPTION 'Jadwal dan teknisi pilihan tidak bisa diubah setelah pesanan dibuat';
        END IF;
        RETURN NEW;
    END IF;

    -- Server-owned on insert: materials start at zero (0090).
    IF current_user IN ('authenticated', 'anon') THEN
        NEW.material_amount := 0;
    END IF;

    -- 0107: set by create_babysit_booking.
    IF NEW.service_type = 'babysit' THEN
        NEW.preferred_partner_id := NULL;
        NEW.package_id := NULL;
        RETURN NEW;
    END IF;

    -- 0124: a ride may name the driver of an earlier ride, kept only if
    -- that driver is an active partner and online right now.
    IF NEW.service_type = 'ride' THEN
        NEW.package_id := NULL;
        -- 0132: "Nanti" - a pickup time within the admin-set window.
        BEGIN
            v_at := (NEW.metadata ->> 'scheduled_at')::TIMESTAMPTZ;
        EXCEPTION WHEN others THEN
            v_at := NULL;
        END;
        IF v_at IS NOT NULL AND current_user IN ('authenticated', 'anon') AND (
            v_at < NOW() + make_interval(mins => public.app_setting_int('ride_schedule_min_minutes', 60)) - INTERVAL '5 minutes'
            OR v_at > NOW() + make_interval(days => public.app_setting_int('ride_schedule_max_days', 7))
        ) THEN
            RAISE EXCEPTION 'Jadwal jemput paling cepat % menit dan paling lambat % hari dari sekarang',
                public.app_setting_int('ride_schedule_min_minutes', 60), public.app_setting_int('ride_schedule_max_days', 7);
        END IF;
        NEW.scheduled_at := v_at;
        IF v_at IS NOT NULL THEN
            NEW.preferred_partner_id := NULL;
            RETURN NEW;
        END IF;
        BEGIN
            v_pref := (NEW.metadata ->> 'preferred_partner_id')::UUID;
        EXCEPTION WHEN others THEN
            v_pref := NULL;
        END;
        IF v_pref IS NOT NULL AND (
            v_pref = NEW.user_id
            OR NOT public.is_active_partner(v_pref, 'driver')
            OR NOT public.driver_is_online(v_pref)
        ) THEN
            v_pref := NULL;
        END IF;
        NEW.preferred_partner_id := v_pref;
        RETURN NEW;
    END IF;

    IF NEW.service_type NOT IN ('service', 'pool') THEN
        NEW.scheduled_at := NULL;
        NEW.preferred_partner_id := NULL;
        NEW.package_id := NULL;
        RETURN NEW;
    END IF;

    -- Visits of one monthly pool package share a package_id (0090).
    BEGIN
        NEW.package_id := CASE WHEN NEW.service_type = 'pool' AND NEW.rate_code = 'MONTHLY_VISIT'
                               THEN (NEW.metadata ->> 'package_id')::UUID END;
    EXCEPTION WHEN others THEN
        NEW.package_id := NULL;
    END;

    BEGIN
        v_at := (NEW.metadata ->> 'scheduled_at')::TIMESTAMPTZ;
    EXCEPTION WHEN others THEN
        v_at := NULL;
    END;
    IF v_at IS NULL THEN
        m := regexp_match(COALESCE(NEW.details, ''), 'Jadwal: (\d{4}-\d{2}-\d{2}) pukul (\d{1,2})[:.](\d{2})');
        IF m IS NOT NULL THEN
            v_at := (m[1] || ' ' || m[2] || ':' || m[3])::TIMESTAMP AT TIME ZONE 'Asia/Makassar';
        ELSE
            m := regexp_match(COALESCE(NEW.details, ''), 'Kunjungan: (\d{4}-\d{2}-\d{2})');
            IF m IS NOT NULL THEN
                v_at := (m[1] || ' 08:00')::TIMESTAMP AT TIME ZONE 'Asia/Makassar';
            END IF;
        END IF;
    END IF;
    IF v_at IS NOT NULL AND (v_at < NOW() - INTERVAL '1 hour' OR v_at > NOW() + INTERVAL '90 days') THEN
        RAISE EXCEPTION 'Jadwal kunjungan harus antara sekarang dan 90 hari ke depan';
    END IF;
    NEW.scheduled_at := v_at;

    BEGIN
        v_pref := (NEW.metadata ->> 'preferred_partner_id')::UUID;
    EXCEPTION WHEN others THEN
        v_pref := NULL;
    END;
    IF v_pref IS NOT NULL AND (
        v_pref = NEW.user_id OR NOT public.technician_can_take(v_pref, NEW.service_type, NEW.rate_code)
    ) THEN
        v_pref := NULL;
    END IF;
    NEW.preferred_partner_id := v_pref;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;


-- 0115 body; scheduled rides, late-cancel notes, and the customer notice when a driver releases.
CREATE OR REPLACE FUNCTION wallet_refund_matched_ride(p_order_id UUID, p_description TEXT DEFAULT 'Refund Pembatalan Perjalanan')
RETURNS BOOLEAN AS $$
DECLARE
    v_order RECORD;
    v_caller UUID := auth.uid();
    v_is_driver BOOLEAN;
    v_is_visit BOOLEAN;
    v_since INTERVAL;
    v_owner UUID;
    v_ratio NUMERIC;
    v_refund NUMERIC := 0;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Anda harus login untuk membatalkan perjalanan';
    END IF;

    SELECT id, user_id, driver_id, merchant_id, status, accepted_at, service_type, scheduled_at, check_in, title
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;

    IF v_order.merchant_id IS NOT NULL THEN
        SELECT owner_id INTO v_owner FROM public.merchants WHERE id = v_order.merchant_id;
    END IF;
    v_is_driver := (v_order.driver_id IS NOT NULL AND v_order.driver_id = v_caller);
    v_is_visit := v_order.service_type IN ('service', 'pool');

    IF v_order.user_id IS DISTINCT FROM v_caller AND NOT v_is_driver THEN
        RAISE EXCEPTION 'Anda tidak berhak membatalkan pesanan ini';
    END IF;

    -- 0115: villa (customer only; hosts use merchant_reject_order).
    IF v_order.service_type IN ('villa', 'WiraVilla') THEN
        IF v_order.status NOT IN ('pending', 'accepted') THEN
            RAISE EXCEPTION 'Pesanan ini sudah tidak bisa dibatalkan (status saat ini: %)', v_order.status;
        END IF;
        v_ratio := CASE WHEN v_order.status = 'pending' THEN 1 ELSE public.villa_cancel_refund_ratio(v_order.check_in) END;
        IF v_ratio <= 0 THEN
            RAISE EXCEPTION 'Sudah masuk hari check-in, pesanan tidak bisa dibatalkan lagi. Hubungi CS jika ada masalah.';
        END IF;
        IF v_ratio >= 1 THEN
            v_refund := public.refund_order_to_wallet(p_order_id, p_description);
        ELSE
            v_refund := public.refund_villa_partially(p_order_id, v_ratio, p_description || ' (50%, kurang dari 3 hari sebelum check-in)');
        END IF;
        UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
        PERFORM public.notify_user(v_owner, 'Reservasi dibatalkan tamu',
            COALESCE(v_order.title, 'Reservasi') || CASE WHEN v_ratio < 1 THEN ' dibatalkan kurang dari 3 hari sebelum check-in. 50% tetap untuk Anda (dikurangi komisi).' ELSE ' dibatalkan tamu.' END,
            '/merchant/orders');
        RETURN TRUE;
    END IF;

    IF v_is_visit THEN
        IF v_order.status = 'working' THEN
            RAISE EXCEPTION 'Pekerjaan sudah dimulai, tidak bisa dibatalkan lagi. Hubungi CS jika ada masalah.';
        ELSIF v_order.status NOT IN ('pending', 'accepted', 'on_the_way') THEN
            RAISE EXCEPTION 'Pesanan ini sudah tidak bisa dibatalkan (status saat ini: %)', v_order.status;
        END IF;
        IF NOT v_is_driver AND v_order.status IN ('accepted', 'on_the_way') THEN
            IF NOT (
                (v_order.accepted_at IS NOT NULL AND NOW() - v_order.accepted_at <= INTERVAL '3 minutes')
                OR v_order.scheduled_at IS NULL
                OR NOW() < v_order.scheduled_at - INTERVAL '2 hours'
                OR NOW() > v_order.scheduled_at + INTERVAL '1 hour'
            ) THEN
                RAISE EXCEPTION 'Teknisi sudah dijadwalkan datang kurang dari 2 jam lagi. Pembatalan gratis tersedia lagi jika teknisi terlambat lebih dari 1 jam, atau hubungi CS.';
            END IF;
        END IF;
    ELSIF v_order.service_type = 'food' AND NOT v_is_driver THEN
        -- 0115: once the restaurant is cooking, only CS can cancel.
        IF NOT (v_order.status = 'pending'
                OR (v_order.status = 'accepted' AND v_order.accepted_at IS NOT NULL AND NOW() - v_order.accepted_at <= INTERVAL '3 minutes')) THEN
            RAISE EXCEPTION 'Restoran sudah menyiapkan pesanan Anda, jadi pesanan tidak bisa dibatalkan dari aplikasi. Hubungi CS lewat Pusat Bantuan.';
        END IF;
    ELSE
        IF v_order.status = 'in_trip' THEN
            RAISE EXCEPTION 'Perjalanan sudah dimulai (penumpang sudah dijemput), tidak bisa dibatalkan lagi. Hubungi CS jika ada masalah.';
        ELSIF v_order.status NOT IN ('pending', 'accepted', 'picking_up', 'ready') THEN
            RAISE EXCEPTION 'Pesanan ini sudah tidak bisa dibatalkan (status saat ini: %)', v_order.status;
        END IF;
        IF NOT v_is_driver AND v_order.status IN ('accepted', 'picking_up') AND v_order.accepted_at IS NOT NULL
           AND v_order.scheduled_at IS NULL THEN
            v_since := NOW() - v_order.accepted_at;
            IF v_since > INTERVAL '3 minutes' AND v_since < INTERVAL '20 minutes' THEN
                RAISE EXCEPTION 'Mitra sedang menuju lokasi Anda. Pembatalan gratis tersedia lagi jika Anda belum dijemput 20 menit setelah pesanan diterima.';
            END IF;
        END IF;
    END IF;

    -- 0132: a scheduled ride cancelled close to its pickup time is noted
    -- (no fee; the admin sees late driver cancels in Penanda Mitra).
    IF v_order.service_type = 'ride' AND v_order.scheduled_at IS NOT NULL AND v_order.status IN ('accepted', 'picking_up')
       AND NOW() > v_order.scheduled_at - make_interval(hours => public.app_setting_int('ride_schedule_free_cancel_hours', 2)) THEN
        INSERT INTO public.order_events (order_id, kind, from_status, to_status, actor_id, note)
        VALUES (p_order_id, 'note', v_order.status, v_order.status, v_caller,
                CASE WHEN v_is_driver THEN 'Sopir batal kurang dari ' ELSE 'Pelanggan batal kurang dari ' END
                || public.app_setting_int('ride_schedule_free_cancel_hours', 2) || ' jam sebelum jadwal');
    END IF;

    IF v_is_driver THEN
        -- A food courier hands the order back to the ready queue; anything
        -- else goes back to searching. A chosen technician loses their head start.
        UPDATE public.orders
        SET status = CASE WHEN v_order.service_type = 'food' THEN 'ready' ELSE 'pending' END,
            driver_id = NULL,
            accepted_at = CASE WHEN v_order.service_type = 'food' THEN accepted_at ELSE NULL END,
            preferred_partner_id = CASE WHEN preferred_partner_id = v_caller THEN NULL
                                        ELSE preferred_partner_id END,
            schedule_reminded_at = NULL
        WHERE id = p_order_id;
        -- 0132: jaminan dijemput - the customer hears it, the release is noted.
        IF v_order.service_type IN ('ride', 'send') THEN
            INSERT INTO public.order_events (order_id, kind, from_status, to_status, actor_id, note)
            VALUES (p_order_id, 'note', v_order.status, 'pending', v_caller, 'Mitra melepas pesanan');
            PERFORM public.notify_user(v_order.user_id, 'Mencarikan mitra pengganti',
                'Mitra sebelumnya membatalkan ' || COALESCE(v_order.title, 'pesanan Anda')
                || '. Kami langsung mencarikan pengganti tanpa biaya.', '/active-order/' || p_order_id);
        END IF;
        RETURN TRUE;
    END IF;

    PERFORM public.refund_order_to_wallet(p_order_id, p_description);
    UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
    -- 0115: the partner hears it (driver/technician and/or restaurant).
    PERFORM public.notify_user(v_order.driver_id, 'Pesanan dibatalkan pelanggan',
        COALESCE(v_order.title, 'Pesanan') || ' dibatalkan oleh pelanggan.', NULL);
    IF v_order.status <> 'ready' THEN
        PERFORM public.notify_user(v_owner, 'Pesanan dibatalkan pelanggan',
            COALESCE(v_order.title, 'Pesanan') || ' dibatalkan oleh pelanggan. Hentikan persiapannya.', '/merchant/orders');
    END IF;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 0128 body; villa requests (open while the booking is pending or accepted, answered to the host).
CREATE OR REPLACE FUNCTION public.respond_order_adjustment(p_adjustment_id UUID, p_approve BOOLEAN)
RETURNS TEXT AS $$
DECLARE
    v_adj RECORD;
    v_order RECORD;
    v_paid_online BOOLEAN;
    v_open TEXT[];
    v_partner UUID;
BEGIN
    SELECT * INTO v_adj FROM public.order_adjustments WHERE id = p_adjustment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pengajuan tidak ditemukan';
    END IF;
    SELECT id, user_id, driver_id, merchant_id, status, payment_method, payment_status, title, service_type, rate_code INTO v_order
    FROM public.orders WHERE id = v_adj.order_id FOR UPDATE;
    -- 0132: a villa request is answered to the host.
    v_partner := COALESCE(v_order.driver_id, (SELECT owner_id FROM public.merchants WHERE id = v_order.merchant_id));
    IF v_adj.kind = 'sewa' THEN
        RAISE EXCEPTION 'Permintaan tambah waktu dijawab oleh sopir';
    END IF;
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
        WHEN v_order.service_type IN ('villa', 'WiraVilla') THEN ARRAY['pending', 'accepted']
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
            PERFORM public.notify_user(v_partner, 'Penawaran ditolak',
                'Pelanggan menolak ' || public.format_rupiah(v_adj.amount) || ' untuk ' || COALESCE(v_order.title, 'barang besar')
                || '. Pesanan dibatalkan tanpa biaya.', '/driver');
            RETURN 'rejected';
        END IF;
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (v_partner, CASE WHEN v_adj.kind = 'villa' THEN 'Permintaan khusus ditolak' ELSE 'Biaya tambahan ditolak' END,
                'Pelanggan menolak ' || public.format_rupiah(v_adj.amount) || ' untuk ' || v_adj.description || '.', false);
        RETURN 'rejected';
    END IF;

    v_paid_online := v_order.payment_method IN ('wallet', 'qris') AND v_order.payment_status = 'paid';
    -- 0132: villa requests on a booking paid by QRIS are paid in cash to the
    -- host on arrival; the total stays as paid and villa_extras_commission
    -- charges the host's commission on them when the stay completes.
    IF v_adj.kind = 'villa' AND v_order.payment_method <> 'cash' THEN
        UPDATE public.order_adjustments SET status = 'approved', decided_at = NOW() WHERE id = p_adjustment_id;
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (v_partner, 'Permintaan khusus disetujui',
                public.format_rupiah(v_adj.amount) || ' untuk permintaan khusus disetujui tamu. Terima pembayarannya tunai saat tamu tiba.', false);
        RETURN 'approved';
    END IF;
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
    VALUES (v_partner,
            CASE v_adj.kind WHEN 'belanja' THEN 'Total belanja disetujui' WHEN 'quote' THEN 'Penawaran disetujui' WHEN 'villa' THEN 'Permintaan khusus disetujui' ELSE 'Biaya tambahan disetujui' END,
            CASE v_adj.kind
                WHEN 'belanja' THEN 'Pelanggan menyetujui belanja ' || public.format_rupiah(v_adj.amount) || '. Silakan antar sekarang.'
                ELSE public.format_rupiah(v_adj.amount) || ' untuk ' || v_adj.description
                     || CASE WHEN v_paid_online THEN ' sudah dibayar lewat WiraPay.' ELSE '. Terima pembayarannya tunai dari pelanggan.' END
            END,
            false);
    RETURN 'approved';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 0089 body; scheduled rides are pinged only close to their pickup time.
CREATE OR REPLACE FUNCTION public.dispatch_due_orders(p_limit INT DEFAULT 20)
RETURNS SETOF UUID AS $$
    SELECT o.id FROM public.orders o
    WHERE o.status = 'pending' AND o.driver_id IS NULL
      AND (
          (o.service_type IN ('ride', 'send') AND o.scheduled_at IS NULL AND o.status_changed_at > NOW() - INTERVAL '30 minutes')
          -- 0132: a scheduled ride is pinged only from the admin-set minutes before pickup.
          OR (o.service_type = 'ride' AND o.scheduled_at IS NOT NULL
              AND NOW() >= o.scheduled_at - make_interval(mins => public.app_setting_int('ride_schedule_queue_minutes', 30))
              AND NOW() <= o.scheduled_at + INTERVAL '15 minutes')
          OR (o.service_type IN ('pool', 'service') AND o.status_changed_at > NOW() - INTERVAL '2 hours')
      )
      AND NOT EXISTS (SELECT 1 FROM public.order_dispatch_pings p
                      WHERE p.order_id = o.id AND p.pinged_at > NOW() - INTERVAL '15 seconds')
    ORDER BY o.created_at
    LIMIT p_limit;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;


-- 0089 body; a scheduled ride waits until 15 minutes after its pickup time.
CREATE OR REPLACE FUNCTION public.expire_unmatched_orders()
RETURNS INT AS $$
DECLARE
    r RECORD;
    v_refund NUMERIC;
    n INT := 0;
BEGIN
    FOR r IN
        SELECT id, user_id, title, service_type
        FROM public.orders
        WHERE status = 'pending'
          AND driver_id IS NULL
          AND service_type IN ('ride', 'send', 'food', 'service', 'pool')
          AND CASE
                WHEN service_type = 'ride' AND scheduled_at IS NOT NULL THEN
                    NOW() > GREATEST(status_changed_at + INTERVAL '30 minutes', scheduled_at + INTERVAL '15 minutes')
                WHEN service_type IN ('service', 'pool') AND scheduled_at IS NOT NULL THEN
                    NOW() > GREATEST(status_changed_at + INTERVAL '30 minutes', scheduled_at - INTERVAL '1 hour')
                ELSE status_changed_at < NOW() - INTERVAL '30 minutes'
              END
        FOR UPDATE SKIP LOCKED
    LOOP
        v_refund := public.refund_order_to_wallet(r.id, 'Refund Pembatalan Otomatis (Tidak Ada Mitra)');
        UPDATE public.orders SET status = 'cancelled' WHERE id = r.id AND status = 'pending';
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (
            r.user_id,
            'Pesanan dibatalkan otomatis',
            CASE WHEN r.service_type IN ('service', 'pool')
                 THEN 'Belum ada teknisi yang bisa mengambil '
                 ELSE 'Belum ada mitra yang tersedia untuk ' END
            || COALESCE(r.title, 'pesanan Anda') || '. '
            || CASE WHEN v_refund > 0
                    THEN 'Saldo WiraPay ' || public.format_rupiah(v_refund) || ' sudah dikembalikan.'
                    ELSE 'Silakan coba pesan lagi.' END,
            false
        );
        n := n + 1;
    END LOOP;
    RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 0096 body; hourly rides and accepted scheduled rides get their own time limits.
CREATE OR REPLACE FUNCTION public.alert_stale_orders()
RETURNS INT AS $$
DECLARE
    r RECORD;
    n INT := 0;
BEGIN
    FOR r IN
        SELECT o.id, o.title, o.service_type, o.status
        FROM public.orders o
        WHERE o.stale_alerted_at IS NULL
          AND o.status NOT IN ('pending', 'awaiting_payment', 'completed', 'cancelled', 'expired')
          AND COALESCE(o.service_type, '') <> 'villa'
          AND CASE
                WHEN o.service_type IN ('service', 'pool') AND o.scheduled_at IS NOT NULL
                    THEN NOW() > o.scheduled_at + INTERVAL '12 hours'
                WHEN o.service_type = 'ride' AND o.status = 'in_trip' AND o.metadata ? 'hourly'
                    THEN NOW() > o.status_changed_at + make_interval(mins => public.ride_booked_minutes(o.metadata) + 60)
                WHEN o.service_type = 'ride' AND o.status = 'accepted' AND o.scheduled_at IS NOT NULL
                    THEN NOW() > o.scheduled_at + INTERVAL '60 minutes'
                WHEN o.service_type IN ('service', 'pool')
                    THEN o.status_changed_at < NOW() - INTERVAL '48 hours'
                ELSE o.status_changed_at < NOW() - INTERVAL '60 minutes'
              END
        FOR UPDATE SKIP LOCKED
    LOOP
        UPDATE public.orders SET stale_alerted_at = NOW() WHERE id = r.id;
        n := n + 1;
    END LOOP;
    IF n > 0 THEN
        PERFORM public.notify_admins(
            CASE WHEN n = 1 THEN 'Ada pesanan macet' ELSE n || ' pesanan macet' END,
            'Statusnya tidak bergerak terlalu lama. Selesaikan atau batalkan di halaman Orders.',
            '/orders');
    END IF;
    RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 0131 body; a scheduled ride is not an incoming offer until its queue time (drivers take it from Jadwal).
CREATE OR REPLACE FUNCTION public.get_nearby_pending_orders(driver_lat double precision, driver_lng double precision,
    target_service_types text[] DEFAULT NULL::text[], radius_meters double precision DEFAULT 15000,
    max_results integer DEFAULT 20, driver_vehicle_type text DEFAULT NULL::text,
    driver_job_type_preferences jsonb DEFAULT NULL::jsonb)
RETURNS TABLE(id uuid, user_id uuid, merchant_id uuid, service_type text, title text, details text, status text,
              total_price numeric, payment_method text, payment_status text, driver_id uuid,
              created_at timestamp with time zone, pickup_lat double precision, pickup_lng double precision,
              package_size text, distance_meters double precision)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
#variable_conflict use_column
DECLARE
    d_point GEOGRAPHY;
    have_driver_point BOOLEAN;
    use_driver_eligibility BOOLEAN;
BEGIN
    have_driver_point := driver_lat IS NOT NULL AND driver_lng IS NOT NULL
        AND driver_lat >= -90.0 AND driver_lat <= 90.0
        AND driver_lng >= -180.0 AND driver_lng <= 180.0;

    use_driver_eligibility := driver_vehicle_type IS NOT NULL AND driver_job_type_preferences IS NOT NULL;

    IF have_driver_point THEN
        d_point := ST_SetSRID(ST_MakePoint(driver_lng, driver_lat), 4326)::geography;
    END IF;

    RETURN QUERY
    SELECT
        o.id, o.user_id, o.merchant_id,
        o.service_type::TEXT, o.title::TEXT, o.details::TEXT,
        o.status::TEXT, o.total_price, o.payment_method::TEXT, o.payment_status::TEXT,
        o.driver_id, o.created_at, o.pickup_lat, o.pickup_lng, o.package_size::TEXT,
        CASE
            WHEN have_driver_point AND o.pickup_lat IS NOT NULL AND o.pickup_lng IS NOT NULL THEN
                ROUND(ST_Distance(
                    ST_SetSRID(ST_MakePoint(o.pickup_lng, o.pickup_lat), 4326)::geography,
                    d_point
                )::NUMERIC, 2)::DOUBLE PRECISION
            ELSE NULL
        END AS distance_meters
    FROM public.orders o
    WHERE o.status = 'pending'
      AND o.driver_id IS NULL
      AND (
        CASE
            WHEN use_driver_eligibility THEN
                public.is_order_eligible_for_driver(o.service_type, o.package_size, driver_vehicle_type, driver_job_type_preferences)
            ELSE
                (target_service_types IS NULL OR o.service_type = ANY(target_service_types))
        END
      )
      AND (o.service_type <> 'ride' OR auth.uid() IS NULL OR public.ride_vehicle_ok(o.rate_code, auth.uid()))
      AND (o.service_type <> 'ride' OR o.scheduled_at IS NULL
           OR NOW() >= o.scheduled_at - make_interval(mins => public.app_setting_int('ride_schedule_queue_minutes', 30)))
      AND (
        o.pickup_lat IS NULL OR o.pickup_lng IS NULL
        OR NOT have_driver_point
        OR ST_DWithin(
             ST_SetSRID(ST_MakePoint(o.pickup_lng, o.pickup_lat), 4326)::geography,
             d_point,
             radius_meters
           )
      )
    ORDER BY
        CASE WHEN distance_meters IS NULL THEN 1 ELSE 0 END ASC,
        distance_meters ASC,
        o.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(max_results, 20), 1), 100);
END;
$function$;


-- 0124 body; for a scheduled ride the phone shows from 60 minutes before pickup.
CREATE OR REPLACE FUNCTION public.get_counterparty_profiles(p_ids UUID[])
RETURNS TABLE (id UUID, name TEXT, phone TEXT, vehicle_type TEXT) AS $$
    SELECT u.id, u.name::TEXT,
           CASE WHEN u.id = auth.uid() OR is_admin() OR EXISTS (
                    SELECT 1 FROM public.orders o
                    WHERE public.order_is_running(o.status)
                      AND NOT (o.service_type = 'ride' AND o.status = 'accepted' AND o.scheduled_at > NOW() + INTERVAL '60 minutes')
                      AND (
                        (o.user_id = u.id AND (o.driver_id = auth.uid()
                            OR o.merchant_id IN (SELECT m.id FROM public.merchants m WHERE m.owner_id = auth.uid())))
                        OR (o.user_id = auth.uid() AND o.driver_id = u.id)
                    ))
                THEN u.phone::TEXT END,
           u.vehicle_type::TEXT
    FROM public.users u
    WHERE u.id = ANY (p_ids) AND auth.uid() IS NOT NULL AND (
        u.id = auth.uid()
        OR is_admin()
        OR EXISTS (SELECT 1 FROM public.orders o WHERE o.user_id = u.id AND (
               o.driver_id = auth.uid()
               OR o.merchant_id IN (SELECT m.id FROM public.merchants m WHERE m.owner_id = auth.uid())))
        OR EXISTS (SELECT 1 FROM public.orders o WHERE o.driver_id = u.id AND o.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.reviews r WHERE r.user_id = u.id AND r.driver_id = auth.uid())
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;


-- 0128 body; warranty claim photos for the customer, the technicians involved and admins.
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
        OR EXISTS (
            SELECT 1 FROM public.warranty_claims w
            WHERE p_name = ANY (w.photos || w.technician_photos)
              AND (w.user_id = auth.uid() OR w.technician_id = auth.uid()
                   OR EXISTS (SELECT 1 FROM public.orders v WHERE v.id = w.visit_order_id AND v.driver_id = auth.uid()))
        )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;


-- 0128 body; the stage 4 settings.
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
    ELSIF p_key NOT IN ('topup_auto_confirm', 'qris_order_window_minutes', 'commission_debt_limit',
                        'commission_debt_grace_days', 'commission_payment_info', 'titip_budget_max',
                        'titip_auto_approve_minutes', 'big_item_quote_min', 'big_item_quote_max',
                        'visit_quote_max', 'ride_hourly_min_hours', 'ride_hourly_max_hours',
                        'ride_hourly_grace_minutes', 'ride_schedule_min_minutes', 'ride_schedule_max_days',
                        'ride_schedule_free_cancel_hours', 'ride_schedule_queue_minutes',
                        'service_warranty_days', 'pool_warranty_hours', 'warranty_response_hours',
                        'villa_request_max') THEN
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


-- 0125 body; adds driver releases / late cancels and upheld warranty claims.
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
    UNION ALL
    -- 0132: drivers who often release orders, or cancel a scheduled ride late.
    SELECT 'driver_cancel'::TEXT, z.actor_id, u.name::TEXT, NULL::UUID, NULL::TEXT,
           NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, z.hits::INT, z.late::INT, z.last_at
    FROM (
        SELECT e.actor_id,
               COUNT(*) FILTER (WHERE e.note = 'Mitra melepas pesanan') AS hits,
               COUNT(*) FILTER (WHERE e.note LIKE 'Sopir batal kurang dari%') AS late,
               MAX(e.created_at) AS last_at
        FROM public.order_events e
        WHERE e.kind = 'note' AND e.actor_id IS NOT NULL
          AND (e.note = 'Mitra melepas pesanan' OR e.note LIKE 'Sopir batal kurang dari%')
          AND e.created_at > NOW() - INTERVAL '30 days'
        GROUP BY e.actor_id
    ) z
    LEFT JOIN public.users u ON u.id = z.actor_id
    WHERE (z.hits >= 3 OR z.late >= 1)
      AND (p_subject IS NULL OR z.actor_id = p_subject)
      AND NOT EXISTS (SELECT 1 FROM public.flag_snoozes s
                      WHERE s.subject_id = z.actor_id AND s.kind = 'driver_cancel' AND s.until > NOW())
    UNION ALL
    -- 0132: technicians with several upheld warranty claims.
    SELECT 'warranty'::TEXT, w.technician_id, u.name::TEXT, NULL::UUID, NULL::TEXT,
           NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, w.hits::INT, NULL::INT, w.last_at
    FROM (
        SELECT c.technician_id, COUNT(*) AS hits, MAX(c.created_at) AS last_at
        FROM public.warranty_claims c
        WHERE c.status IN ('accepted', 'assigned') AND c.technician_id IS NOT NULL
          AND c.created_at > NOW() - INTERVAL '60 days'
        GROUP BY c.technician_id
    ) w
    LEFT JOIN public.users u ON u.id = w.technician_id
    WHERE w.hits >= 2
      AND (p_subject IS NULL OR w.technician_id = p_subject)
      AND NOT EXISTS (SELECT 1 FROM public.flag_snoozes s
                      WHERE s.subject_id = w.technician_id AND s.kind = 'warranty' AND s.until > NOW())
    ORDER BY 11 DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;


-- 0125 body; the new flag kinds can be snoozed too.
CREATE OR REPLACE FUNCTION public.admin_snooze_flag(p_subject UUID, p_kind TEXT, p_days INT DEFAULT 30)
RETURNS VOID AS $$
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Hanya admin';
    END IF;
    IF p_kind NOT IN ('check_only', 'absent', 'driver_cancel', 'warranty') OR p_days NOT BETWEEN 1 AND 180 THEN
        RAISE EXCEPTION 'Penanda atau jumlah hari tidak valid';
    END IF;
    INSERT INTO public.flag_snoozes (subject_id, kind, until, snoozed_by)
    VALUES (p_subject, p_kind, NOW() + make_interval(days => p_days), auth.uid())
    ON CONFLICT (subject_id, kind) DO UPDATE SET until = EXCLUDED.until, snoozed_by = EXCLUDED.snoozed_by;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------- rides: scheduled and hourly steps ----------
-- Clients only (the admin panel and server functions are trusted).
CREATE OR REPLACE FUNCTION public.guard_ride_booking()
RETURNS TRIGGER AS $$
DECLARE
    v_new_end TIMESTAMPTZ;
BEGIN
    IF NEW.service_type <> 'ride' OR current_user NOT IN ('authenticated', 'anon') OR public.is_admin_panel() THEN
        RETURN NEW;
    END IF;
    -- Taking a scheduled ride: never two scheduled rides that overlap
    -- (booked time plus 30 minutes on either side).
    IF OLD.driver_id IS NULL AND NEW.driver_id IS NOT NULL AND NEW.scheduled_at IS NOT NULL THEN
        v_new_end := NEW.scheduled_at + make_interval(mins => GREATEST(public.ride_booked_minutes(NEW.metadata), 60));
        IF EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.driver_id = NEW.driver_id AND o.id <> NEW.id AND o.service_type = 'ride'
              AND o.scheduled_at IS NOT NULL AND o.status IN ('accepted', 'picking_up', 'in_trip')
              AND o.scheduled_at - INTERVAL '30 minutes' < v_new_end
              AND o.scheduled_at + make_interval(mins => GREATEST(public.ride_booked_minutes(o.metadata), 60)) + INTERVAL '30 minutes' > NEW.scheduled_at
        ) THEN
            RAISE EXCEPTION 'Jadwal ini bentrok dengan jadwal Anda yang lain';
        END IF;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'picking_up' AND NEW.scheduled_at IS NOT NULL
           AND NOW() < NEW.scheduled_at - INTERVAL '90 minutes' THEN
            RAISE EXCEPTION 'Berangkat paling cepat 90 menit sebelum jadwal (mulai %)',
                to_char((NEW.scheduled_at - INTERVAL '90 minutes') AT TIME ZONE 'Asia/Makassar', 'DD/MM HH24.MI') || ' WITA';
        END IF;
        IF NEW.status = 'completed' AND NEW.metadata ? 'hourly' THEN
            RAISE EXCEPTION 'Selesaikan sewa dengan tombol Selesaikan Sewa';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_guard_ride_booking ON public.orders;
CREATE TRIGGER trg_guard_ride_booking
    BEFORE UPDATE OF status, driver_id ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_ride_booking();

-- The customer asks for more time on an hourly ride; the driver answers.
CREATE OR REPLACE FUNCTION public.request_ride_extension(p_order_id UUID, p_minutes INT)
RETURNS UUID AS $$
DECLARE
    v_order RECORD;
    v_rate NUMERIC;
    v_amount NUMERIC;
    v_id UUID;
BEGIN
    SELECT id, user_id, driver_id, status, metadata, title INTO v_order
    FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND OR v_order.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;
    IF NOT (v_order.metadata ? 'hourly') THEN
        RAISE EXCEPTION 'Tambah waktu hanya untuk sewa per jam';
    END IF;
    IF v_order.driver_id IS NULL OR v_order.status NOT IN ('accepted', 'picking_up', 'in_trip') THEN
        RAISE EXCEPTION 'Tambah waktu bisa diminta setelah sopir menerima sewa';
    END IF;
    IF p_minutes IS NULL OR p_minutes < 30 OR p_minutes > 240 OR p_minutes % 30 <> 0 THEN
        RAISE EXCEPTION 'Pilih tambahan 30 menit sampai 4 jam';
    END IF;
    IF public.ride_booked_minutes(v_order.metadata) + p_minutes > public.app_setting_int('ride_hourly_max_hours', 12) * 60 THEN
        RAISE EXCEPTION 'Sewa paling lama % jam', public.app_setting_int('ride_hourly_max_hours', 12);
    END IF;
    IF EXISTS (SELECT 1 FROM public.order_adjustments WHERE order_id = p_order_id AND kind = 'sewa' AND status = 'pending') THEN
        RAISE EXCEPTION 'Masih ada permintaan tambah waktu yang menunggu jawaban sopir';
    END IF;
    v_rate := COALESCE((v_order.metadata -> 'hourly' ->> 'rate')::NUMERIC, 0);
    v_amount := CEIL(v_rate * p_minutes / 60.0 / 500) * 500;
    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'Tarif sewa tidak ditemukan';
    END IF;
    INSERT INTO public.order_adjustments (order_id, requested_by, kind, amount, description, details)
    VALUES (p_order_id, auth.uid(), 'sewa', v_amount,
            'Tambah ' || CASE WHEN p_minutes % 60 = 0 THEN (p_minutes / 60) || ' jam' ELSE p_minutes || ' menit' END,
            jsonb_build_object('minutes', p_minutes))
    RETURNING id INTO v_id;
    PERFORM public.notify_user(v_order.driver_id, 'Pelanggan minta tambah waktu',
        'Tambah ' || p_minutes || ' menit (' || public.format_rupiah(v_amount) || ') untuk '
        || COALESCE(v_order.title, 'sewa') || '. Setujui atau tolak di pesanan.',
        '/driver/active-order/' || p_order_id);
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.request_ride_extension(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_ride_extension(UUID, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_ride_extension(p_adjustment_id UUID, p_approve BOOLEAN)
RETURNS TEXT AS $$
DECLARE
    v_adj RECORD;
    v_order RECORD;
    v_minutes INT;
BEGIN
    SELECT * INTO v_adj FROM public.order_adjustments WHERE id = p_adjustment_id AND kind = 'sewa' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Permintaan tidak ditemukan';
    END IF;
    SELECT id, user_id, driver_id, status, metadata, title INTO v_order
    FROM public.orders WHERE id = v_adj.order_id FOR UPDATE;
    IF v_order.driver_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Anda tidak menangani sewa ini';
    END IF;
    IF v_adj.status <> 'pending' THEN
        RAISE EXCEPTION 'Permintaan ini sudah dijawab';
    END IF;
    IF v_order.status NOT IN ('accepted', 'picking_up', 'in_trip') THEN
        UPDATE public.order_adjustments SET status = 'cancelled', decided_at = NOW() WHERE id = p_adjustment_id;
        RETURN 'cancelled';
    END IF;
    IF NOT p_approve THEN
        UPDATE public.order_adjustments SET status = 'rejected', decided_at = NOW() WHERE id = p_adjustment_id;
        PERFORM public.notify_user(v_order.user_id, 'Tambah waktu tidak bisa',
            'Sopir tidak bisa menambah waktu (' || v_adj.description || '). Sewa tetap sesuai jadwal semula.',
            '/active-order/' || v_order.id);
        RETURN 'rejected';
    END IF;
    v_minutes := COALESCE((v_adj.details ->> 'minutes')::INT, 0);
    PERFORM set_config('wira.price_adjustment', 'on', true);
    UPDATE public.orders
    SET total_price = total_price + v_adj.amount,
        metadata = jsonb_set(metadata, '{hourly,extra_minutes}',
                             to_jsonb(COALESCE((metadata -> 'hourly' ->> 'extra_minutes')::INT, 0) + v_minutes))
    WHERE id = v_order.id;
    PERFORM set_config('wira.price_adjustment', 'off', true);
    UPDATE public.order_adjustments SET status = 'approved', decided_at = NOW() WHERE id = p_adjustment_id;
    PERFORM public.notify_user(v_order.user_id, 'Tambah waktu disetujui',
        v_adj.description || ' disetujui sopir. Total sewa bertambah ' || public.format_rupiah(v_adj.amount) || '.',
        '/active-order/' || v_order.id);
    RETURN 'approved';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.respond_ride_extension(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_ride_extension(UUID, BOOLEAN) TO authenticated;

-- The driver ends an hourly ride. Time past the booking plus the grace
-- minutes is charged in 30-minute blocks at half the hourly rate.
CREATE OR REPLACE FUNCTION public.finish_hourly_ride(p_order_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_started TIMESTAMPTZ;
    v_over NUMERIC;
    v_blocks INT := 0;
    v_rate NUMERIC;
    v_amount NUMERIC := 0;
BEGIN
    SELECT id, user_id, driver_id, status, metadata, title INTO v_order
    FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND OR v_order.driver_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Anda tidak menangani sewa ini';
    END IF;
    IF NOT (v_order.metadata ? 'hourly') THEN
        RAISE EXCEPTION 'Ini bukan sewa per jam';
    END IF;
    IF v_order.status <> 'in_trip' THEN
        RAISE EXCEPTION 'Mulai sewa dengan PIN pelanggan dulu';
    END IF;
    UPDATE public.order_adjustments SET status = 'cancelled', decided_at = NOW()
    WHERE order_id = p_order_id AND kind = 'sewa' AND status = 'pending';

    v_started := public.ride_trip_started_at(p_order_id);
    v_over := EXTRACT(EPOCH FROM (NOW() - v_started)) / 60.0
              - public.ride_booked_minutes(v_order.metadata)
              - public.app_setting_int('ride_hourly_grace_minutes', 10);
    v_rate := COALESCE((v_order.metadata -> 'hourly' ->> 'rate')::NUMERIC, 0);
    IF v_over > 0 AND v_rate > 0 THEN
        v_blocks := CEIL((v_over + public.app_setting_int('ride_hourly_grace_minutes', 10)) / 30.0);
        v_amount := CEIL(v_blocks * v_rate / 2.0 / 500) * 500;
        INSERT INTO public.order_adjustments (order_id, requested_by, kind, amount, description, status, decided_at, details)
        VALUES (p_order_id, auth.uid(), 'sewa', v_amount, 'Lewat waktu ' || (v_blocks * 30) || ' menit', 'approved', NOW(),
                jsonb_build_object('overtime_minutes', v_blocks * 30));
        PERFORM set_config('wira.price_adjustment', 'on', true);
        UPDATE public.orders
        SET total_price = total_price + v_amount,
            metadata = jsonb_set(metadata, '{hourly,overtime_minutes}', to_jsonb(v_blocks * 30))
        WHERE id = p_order_id;
        PERFORM set_config('wira.price_adjustment', 'off', true);
    END IF;

    UPDATE public.orders SET status = 'completed', updated_at = NOW() WHERE id = p_order_id;
    PERFORM public.notify_user(v_order.user_id, 'Sewa selesai',
        COALESCE(v_order.title, 'Sewa') || ' selesai.'
        || CASE WHEN v_amount > 0 THEN ' Lewat waktu ' || (v_blocks * 30) || ' menit: ' || public.format_rupiah(v_amount) || '.' ELSE '' END
        || ' Total tunai ' || public.format_rupiah((SELECT total_price FROM public.orders WHERE id = p_order_id)) || '.',
        '/active-order/' || p_order_id);
    RETURN jsonb_build_object('overtime_minutes', v_blocks * 30, 'overtime_amount', v_amount,
                              'total', (SELECT total_price FROM public.orders WHERE id = p_order_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.finish_hourly_ride(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_hourly_ride(UUID) TO authenticated;

-- ---------- warranty ----------
-- When an order was completed (the status event, else the last status change).
CREATE OR REPLACE FUNCTION public.order_completed_at(p_order_id UUID)
RETURNS TIMESTAMPTZ AS $$
    SELECT COALESCE(
        (SELECT MAX(e.created_at) FROM public.order_events e
         WHERE e.order_id = p_order_id AND e.kind = 'status' AND e.to_status = 'completed'),
        (SELECT o.status_changed_at FROM public.orders o WHERE o.id = p_order_id AND o.status = 'completed'));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.order_completed_at(UUID) TO authenticated;

-- Until when a finished order can be claimed; NULL when it has no warranty.
CREATE OR REPLACE FUNCTION public.warranty_until(p_order_id UUID)
RETURNS TIMESTAMPTZ AS $$
    SELECT CASE
        WHEN o.status <> 'completed' OR o.driver_id IS NULL OR o.metadata ? 'warranty_claim_id' THEN NULL
        WHEN o.service_type = 'service' AND public.app_setting_int('service_warranty_days', 7) > 0
            THEN public.order_completed_at(o.id) + make_interval(days => public.app_setting_int('service_warranty_days', 7))
        WHEN o.service_type = 'pool' AND o.package_id IS NOT NULL
            THEN public.order_completed_at(o.id) + INTERVAL '7 days'
        END
    FROM public.orders o WHERE o.id = p_order_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.warranty_until(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_warranty_claim(p_order_id UUID, p_description TEXT, p_photos TEXT[], p_preferred TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
    v_order RECORD;
    v_until TIMESTAMPTZ;
    v_desc TEXT := public.mask_contact_details(btrim(COALESCE(p_description, '')));
    v_id UUID;
BEGIN
    SELECT id, user_id, driver_id, status, service_type, title INTO v_order
    FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND OR v_order.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;
    v_until := public.warranty_until(p_order_id);
    IF v_until IS NULL THEN
        RAISE EXCEPTION 'Pesanan ini tidak bergaransi';
    END IF;
    IF NOW() > v_until THEN
        RAISE EXCEPTION 'Masa garansi sudah berakhir pada %', to_char(v_until AT TIME ZONE 'Asia/Makassar', 'DD/MM/YYYY HH24.MI') || ' WITA';
    END IF;
    IF EXISTS (SELECT 1 FROM public.warranty_claims WHERE order_id = p_order_id) THEN
        RAISE EXCEPTION 'Garansi untuk pesanan ini sudah pernah diklaim';
    END IF;
    IF length(v_desc) < 10 OR length(v_desc) > 500 THEN
        RAISE EXCEPTION 'Ceritakan masalahnya (10 sampai 500 huruf)';
    END IF;
    IF COALESCE(array_length(p_photos, 1), 0) NOT BETWEEN 1 AND 3
       OR EXISTS (SELECT 1 FROM unnest(p_photos) ph WHERE ph !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]{1,120}$')) THEN
        RAISE EXCEPTION 'Tambahkan 1 sampai 3 foto masalahnya';
    END IF;
    INSERT INTO public.warranty_claims (order_id, user_id, technician_id, service_type, description, photos, preferred, response_due)
    VALUES (p_order_id, auth.uid(), v_order.driver_id, v_order.service_type, v_desc, p_photos,
            NULLIF(left(btrim(COALESCE(p_preferred, '')), 60), ''),
            NOW() + make_interval(hours => public.app_setting_int('warranty_response_hours', 24)))
    RETURNING id INTO v_id;
    PERFORM public.notify_user(v_order.driver_id, 'Klaim garansi',
        'Pelanggan mengklaim garansi untuk ' || COALESCE(v_order.title, 'pekerjaan Anda') || ': ' || left(v_desc, 120)
        || '. Jawab dalam ' || public.app_setting_int('warranty_response_hours', 24) || ' jam.', '/technician');
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.submit_warranty_claim(UUID, TEXT, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_warranty_claim(UUID, TEXT, TEXT[], TEXT) TO authenticated;

-- A free visit for a claim (no price, no commission). Internal.
CREATE OR REPLACE FUNCTION public.create_warranty_visit(p_claim_id UUID, p_technician UUID)
RETURNS UUID AS $$
DECLARE
    c RECORD;
    o RECORD;
    v_id UUID;
BEGIN
    SELECT * INTO c FROM public.warranty_claims WHERE id = p_claim_id;
    SELECT * INTO o FROM public.orders WHERE id = c.order_id;
    INSERT INTO public.orders (user_id, service_type, status, driver_id, total_price, title, details,
                               payment_method, payment_status, pickup_lat, pickup_lng, rate_code, metadata)
    VALUES (c.user_id, o.service_type, 'accepted', p_technician, 0,
            'Garansi: ' || COALESCE(o.title, 'kunjungan'),
            'Kunjungan garansi (jasa gratis). Masalah: ' || c.description
            || CASE WHEN c.preferred IS NOT NULL THEN ' · Waktu yang diminta: ' || c.preferred ELSE '' END
            || CASE WHEN o.details IS NOT NULL THEN E'\n' || o.details ELSE '' END,
            'cash', 'unpaid', o.pickup_lat, o.pickup_lng, o.rate_code,
            jsonb_build_object('warranty_claim_id', c.id, 'warranty_of', o.id))
    RETURNING id INTO v_id;
    UPDATE public.warranty_claims SET visit_order_id = v_id, updated_at = NOW() WHERE id = p_claim_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.create_warranty_visit(UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.respond_warranty_claim(p_claim_id UUID, p_accept BOOLEAN, p_reason TEXT DEFAULT NULL, p_photos TEXT[] DEFAULT '{}')
RETURNS TEXT AS $$
DECLARE
    c RECORD;
    v_reason TEXT := public.mask_contact_details(btrim(COALESCE(p_reason, '')));
    v_visit UUID;
BEGIN
    SELECT * INTO c FROM public.warranty_claims WHERE id = p_claim_id FOR UPDATE;
    IF NOT FOUND OR c.technician_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Klaim tidak ditemukan';
    END IF;
    IF c.status <> 'pending' THEN
        RAISE EXCEPTION 'Klaim ini sudah dijawab';
    END IF;
    IF p_accept THEN
        v_visit := public.create_warranty_visit(p_claim_id, auth.uid());
        UPDATE public.warranty_claims SET status = 'accepted', updated_at = NOW() WHERE id = p_claim_id;
        PERFORM public.notify_user(c.user_id, 'Klaim garansi diterima',
            'Teknisi akan datang lagi tanpa biaya jasa. Lihat kunjungannya di pesanan.', '/active-order/' || v_visit);
        RETURN 'accepted';
    END IF;
    IF length(v_reason) < 5 OR length(v_reason) > 500 THEN
        RAISE EXCEPTION 'Tuliskan alasannya (5 sampai 500 huruf)';
    END IF;
    IF COALESCE(array_length(p_photos, 1), 0) > 3
       OR EXISTS (SELECT 1 FROM unnest(COALESCE(p_photos, '{}')) ph WHERE ph !~ ('^' || auth.uid()::text || '/[A-Za-z0-9._-]{1,120}$')) THEN
        RAISE EXCEPTION 'Foto tidak valid (maksimal 3)';
    END IF;
    UPDATE public.warranty_claims
    SET status = 'disputed', technician_reason = v_reason, technician_photos = COALESCE(p_photos, '{}'), updated_at = NOW()
    WHERE id = p_claim_id;
    PERFORM public.notify_user(c.user_id, 'Klaim garansi ditinjau admin',
        'Teknisi menyampaikan keberatan. Tim Wira akan memeriksa dan memutuskan klaim Anda.', '/active-order/' || c.order_id);
    PERFORM public.notify_admins('Keberatan klaim garansi', 'Teknisi menolak klaim garansi. Putuskan di menu Garansi.', '/warranty');
    RETURN 'disputed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.respond_warranty_claim(UUID, BOOLEAN, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_warranty_claim(UUID, BOOLEAN, TEXT, TEXT[]) TO authenticated;

-- The admin decides any open claim: assign a technician (the original one or
-- another) for a free visit, or reject it with a reason.
CREATE OR REPLACE FUNCTION public.admin_resolve_warranty_claim(p_claim_id UUID, p_decision TEXT, p_technician UUID DEFAULT NULL, p_note TEXT DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
    c RECORD;
    v_note TEXT := NULLIF(left(btrim(COALESCE(p_note, '')), 500), '');
    v_visit UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO c FROM public.warranty_claims WHERE id = p_claim_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Klaim tidak ditemukan';
    END IF;
    IF c.status NOT IN ('pending', 'disputed') THEN
        RAISE EXCEPTION 'Klaim ini sudah diputuskan';
    END IF;
    IF p_decision = 'assign' THEN
        IF p_technician IS NULL OR NOT public.is_active_partner(p_technician, 'technician') THEN
            RAISE EXCEPTION 'Pilih teknisi aktif';
        END IF;
        IF p_technician = c.user_id THEN
            RAISE EXCEPTION 'Teknisi tidak boleh pelanggan itu sendiri';
        END IF;
        v_visit := public.create_warranty_visit(p_claim_id, p_technician);
        UPDATE public.warranty_claims
        SET status = 'assigned', decided_by = auth.uid(), admin_note = v_note, updated_at = NOW()
        WHERE id = p_claim_id;
        PERFORM public.notify_user(c.user_id, 'Klaim garansi disetujui',
            'Tim Wira menugaskan teknisi untuk kunjungan garansi tanpa biaya jasa.', '/active-order/' || v_visit);
        PERFORM public.notify_user(p_technician, 'Kunjungan garansi',
            'Admin menugaskan Anda untuk kunjungan garansi (jasa gratis).'
            || CASE WHEN v_note IS NOT NULL THEN ' Catatan: ' || v_note ELSE '' END,
            '/technician/active-order/' || v_visit);
        IF c.technician_id IS NOT NULL AND c.technician_id <> p_technician THEN
            PERFORM public.notify_user(c.technician_id, 'Klaim garansi diputuskan',
                'Admin menugaskan teknisi lain untuk klaim garansi pelanggan Anda.', '/technician');
        END IF;
    ELSIF p_decision = 'reject' THEN
        IF v_note IS NULL OR length(v_note) < 5 THEN
            RAISE EXCEPTION 'Tuliskan alasan penolakan untuk pelanggan';
        END IF;
        UPDATE public.warranty_claims
        SET status = 'rejected', decided_by = auth.uid(), admin_note = v_note, updated_at = NOW()
        WHERE id = p_claim_id;
        PERFORM public.notify_user(c.user_id, 'Klaim garansi ditolak', v_note, '/active-order/' || c.order_id);
        PERFORM public.notify_user(c.technician_id, 'Klaim garansi ditolak admin',
            'Admin menolak klaim garansi pelanggan Anda.', '/technician');
    ELSE
        RAISE EXCEPTION 'Keputusan tidak dikenal';
    END IF;
    PERFORM public.log_admin_action('warranty_resolved', 'warranty_claim', p_claim_id::text, c.user_id, v_note,
                                    jsonb_build_object('decision', p_decision, 'technician', p_technician));
    RETURN p_decision;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_resolve_warranty_claim(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_warranty_claim(UUID, TEXT, UUID, TEXT) TO authenticated;

-- ---------- villa special requests ----------
-- The host prices the guest's requests; p_items = [{code, amount, available}].
CREATE OR REPLACE FUNCTION public.submit_villa_request_quote(p_order_id UUID, p_items JSONB)
RETURNS UUID AS $$
DECLARE
    v_order RECORD;
    v_owner UUID;
    v_req JSONB;
    v_item JSONB;
    v_amount NUMERIC;
    v_avail BOOLEAN;
    v_details JSONB := '[]'::jsonb;
    v_total NUMERIC := 0;
    v_max NUMERIC := public.app_setting_int('villa_request_max', 2000000);
    v_id UUID;
BEGIN
    SELECT id, user_id, merchant_id, status, service_type, payment_method, check_out, metadata, title INTO v_order
    FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND OR v_order.service_type NOT IN ('villa', 'WiraVilla') THEN
        RAISE EXCEPTION 'Reservasi tidak ditemukan';
    END IF;
    SELECT owner_id INTO v_owner FROM public.merchants WHERE id = v_order.merchant_id;
    IF v_owner IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Anda bukan pemilik villa ini';
    END IF;
    IF v_order.status NOT IN ('pending', 'accepted')
       OR (v_order.check_out IS NOT NULL AND v_order.check_out <= (NOW() AT TIME ZONE 'Asia/Makassar')::date) THEN
        RAISE EXCEPTION 'Reservasi ini sudah tidak bisa diubah';
    END IF;
    IF jsonb_typeof(v_order.metadata -> 'villa_requests') <> 'array'
       OR jsonb_array_length(v_order.metadata -> 'villa_requests') = 0 THEN
        RAISE EXCEPTION 'Tamu tidak mengajukan permintaan khusus';
    END IF;
    IF EXISTS (SELECT 1 FROM public.order_adjustments
               WHERE order_id = p_order_id AND kind = 'villa' AND status IN ('pending', 'approved')) THEN
        RAISE EXCEPTION 'Harga permintaan khusus sudah dikirim';
    END IF;
    IF jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION 'Isi harga untuk tiap permintaan';
    END IF;

    FOR v_req IN SELECT * FROM jsonb_array_elements(v_order.metadata -> 'villa_requests') LOOP
        SELECT i INTO v_item FROM jsonb_array_elements(p_items) i WHERE i ->> 'code' = v_req ->> 'code' LIMIT 1;
        IF v_item IS NULL THEN
            RAISE EXCEPTION 'Isi harga untuk %', public.villa_request_label(v_req ->> 'code');
        END IF;
        v_avail := COALESCE((v_item ->> 'available')::BOOLEAN, true);
        BEGIN
            v_amount := CASE WHEN v_avail THEN COALESCE((v_item ->> 'amount')::NUMERIC, 0) ELSE 0 END;
        EXCEPTION WHEN others THEN
            v_amount := NULL;
        END;
        IF v_amount IS NULL OR v_amount < 0 OR v_amount <> round(v_amount) OR v_amount > v_max THEN
            RAISE EXCEPTION 'Harga % harus Rp 0 sampai %', public.villa_request_label(v_req ->> 'code'), public.format_rupiah(v_max);
        END IF;
        v_details := v_details || jsonb_build_array(jsonb_build_object(
            'code', v_req ->> 'code', 'label', public.villa_request_label(v_req ->> 'code'),
            'note', v_req ->> 'note', 'amount', v_amount, 'available', v_avail));
        v_total := v_total + v_amount;
        v_item := NULL;
    END LOOP;

    INSERT INTO public.order_adjustments (order_id, requested_by, kind, amount, description, details, status, decided_at)
    VALUES (p_order_id, auth.uid(), 'villa', v_total, 'Permintaan khusus', v_details,
            CASE WHEN v_total = 0 THEN 'approved' ELSE 'pending' END,
            CASE WHEN v_total = 0 THEN NOW() END)
    RETURNING id INTO v_id;
    PERFORM public.notify_user(v_order.user_id, 'Tanggapan permintaan khusus',
        CASE WHEN v_total = 0
             THEN 'Tuan rumah menanggapi permintaan khusus Anda tanpa biaya tambahan. Lihat rinciannya di reservasi.'
             ELSE 'Tuan rumah memberi harga ' || public.format_rupiah(v_total) || ' untuk permintaan khusus Anda. Setujui atau tolak di reservasi.' END,
        '/active-order/' || p_order_id);
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.submit_villa_request_quote(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_villa_request_quote(UUID, JSONB) TO authenticated;

-- Commission on villa requests paid in cash on a QRIS-paid booking: the
-- total did not include them, so the host owes the commission on them.
CREATE OR REPLACE FUNCTION public.villa_extras_commission()
RETURNS TRIGGER AS $$
DECLARE
    v_extra NUMERIC;
    v_owner UUID;
BEGIN
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
       AND NEW.service_type IN ('villa', 'WiraVilla') AND NEW.payment_method <> 'cash' THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_extra FROM public.order_adjustments
        WHERE order_id = NEW.id AND kind = 'villa' AND status = 'approved';
        IF v_extra > 0 THEN
            SELECT owner_id INTO v_owner FROM public.merchants WHERE id = NEW.merchant_id;
            UPDATE public.users
            SET payable_balance = COALESCE(payable_balance, 0)
                - ROUND(v_extra * COALESCE(NEW.commission_rate, public.platform_commission_rate(NEW.service_type)))
            WHERE id = v_owner;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_villa_extras_commission ON public.orders;
CREATE TRIGGER trg_villa_extras_commission
    AFTER UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.villa_extras_commission();

-- ---------- reminders and admin alerts ----------
CREATE OR REPLACE FUNCTION public.ride_schedule_tick()
RETURNS INT AS $$
DECLARE
    r RECORD;
    n_unclaimed INT := 0;
    n_claims INT := 0;
    v_when TEXT;
BEGIN
    FOR r IN
        SELECT o.id, o.user_id, o.driver_id, o.title, o.scheduled_at FROM public.orders o
        WHERE o.service_type = 'ride' AND o.scheduled_at IS NOT NULL AND o.status = 'accepted'
          AND o.schedule_reminded_at IS NULL AND o.scheduled_at <= NOW() + INTERVAL '60 minutes'
        FOR UPDATE SKIP LOCKED
    LOOP
        UPDATE public.orders SET schedule_reminded_at = NOW() WHERE id = r.id;
        v_when := to_char(r.scheduled_at AT TIME ZONE 'Asia/Makassar', 'HH24.MI') || ' WITA';
        PERFORM public.notify_user(r.user_id, 'Sopir menjemput sebentar lagi',
            COALESCE(r.title, 'Perjalanan Anda') || ' dijemput pukul ' || v_when || '. Nomor sopir dan chat sudah terbuka.',
            '/active-order/' || r.id);
        PERFORM public.notify_user(r.driver_id, 'Jadwal jemput 60 menit lagi',
            COALESCE(r.title, 'Jadwal Anda') || ' pukul ' || v_when || '. Berangkat tepat waktu.',
            '/driver/active-order/' || r.id);
    END LOOP;

    FOR r IN
        SELECT o.id, o.user_id, o.title FROM public.orders o
        WHERE o.service_type = 'ride' AND o.scheduled_at IS NOT NULL AND o.status = 'pending' AND o.driver_id IS NULL
          AND o.schedule_alerted_at IS NULL
          AND o.scheduled_at <= NOW() + make_interval(mins => public.app_setting_int('ride_schedule_queue_minutes', 30))
        FOR UPDATE SKIP LOCKED
    LOOP
        UPDATE public.orders SET schedule_alerted_at = NOW() WHERE id = r.id;
        PERFORM public.notify_user(r.user_id, 'Masih mencari sopir',
            'Belum ada sopir yang mengambil ' || COALESCE(r.title, 'jadwal Anda') || '. Kami kirim ke semua sopir terdekat dan tim Wira ikut membantu.',
            '/active-order/' || r.id);
        n_unclaimed := n_unclaimed + 1;
    END LOOP;
    IF n_unclaimed > 0 THEN
        PERFORM public.notify_admins(
            CASE WHEN n_unclaimed = 1 THEN 'Jadwal ride belum ada sopir' ELSE n_unclaimed || ' jadwal ride belum ada sopir' END,
            'Jadwal jemput sudah dekat dan belum ada sopir. Bantu carikan di halaman Orders.', '/orders');
    END IF;

    FOR r IN
        SELECT w.id FROM public.warranty_claims w
        LEFT JOIN public.orders v ON v.id = w.visit_order_id
        WHERE w.alerted_at IS NULL AND (
            (w.status = 'pending' AND w.response_due < NOW())
            OR (w.status IN ('accepted', 'assigned') AND w.service_type = 'pool'
                AND COALESCE(v.status, '') <> 'completed'
                AND w.created_at < NOW() - make_interval(hours => public.app_setting_int('pool_warranty_hours', 48)))
        )
        FOR UPDATE OF w SKIP LOCKED
    LOOP
        UPDATE public.warranty_claims SET alerted_at = NOW() WHERE id = r.id;
        n_claims := n_claims + 1;
    END LOOP;
    IF n_claims > 0 THEN
        PERFORM public.notify_admins(
            CASE WHEN n_claims = 1 THEN 'Klaim garansi terlambat' ELSE n_claims || ' klaim garansi terlambat' END,
            'Teknisi belum menjawab atau belum datang tepat waktu. Putuskan di menu Garansi.', '/warranty');
    END IF;
    RETURN n_unclaimed + n_claims;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.ride_schedule_tick() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('wira-ride-schedule') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wira-ride-schedule');
        PERFORM cron.schedule('wira-ride-schedule', '*/5 * * * *', 'SELECT public.ride_schedule_tick()');
    END IF;
END $$;
