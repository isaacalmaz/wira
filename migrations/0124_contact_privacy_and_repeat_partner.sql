-- =========================================
-- Migration 0124: phone numbers only while an order runs; "order again"
-- with the same driver
-- =========================================
-- Keeping deals in the app (owner's decision, 2026-10-13):
--   * get_counterparty_profiles (0080) gave a customer the phone number of
--     every driver/technician they ever had, and partners every customer's,
--     forever. The phone is now returned only while an order between the two
--     is running; name and vehicle type stay visible as before.
--   * "Pesan lagi" on a finished ride offers the new ride to the same driver
--     first: only that driver sees and is pinged for it during the first
--     minute, then it goes to everyone as usual. The choice is kept only if
--     the driver is an active partner and online when the ride is booked.
--     (Technician visits already had a chosen partner, 0089.)
--   * Fix: dispatch_next_ping (0089) has failed on every call since it was
--     written - orders.service_type is varchar but the function returns
--     text, so RETURN QUERY raised "structure of query does not match
--     function result type" and rolled back the ping. order_dispatch_pings
--     held 0 rows on 2026-10-13: no driver or technician was ever pinged by
--     the server; they only found jobs on their job lists.
-- Depends on 0080, 0089, 0107.
-- Apply BEFORE deploying the frontend commit that uses it.
-- =========================================

-- ---------------------------------------------------------------------------
-- 1. Phone only while an order between the two is running
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_is_running(p_status TEXT)
RETURNS BOOLEAN AS $$
    SELECT p_status NOT IN ('completed', 'cancelled', 'expired', 'rejected');
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.get_counterparty_profiles(p_ids UUID[])
RETURNS TABLE (id UUID, name TEXT, phone TEXT, vehicle_type TEXT) AS $$
    SELECT u.id, u.name::TEXT,
           CASE WHEN u.id = auth.uid() OR is_admin() OR EXISTS (
                    SELECT 1 FROM public.orders o
                    WHERE public.order_is_running(o.status) AND (
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
REVOKE ALL ON FUNCTION public.get_counterparty_profiles(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_counterparty_profiles(UUID[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Chosen driver for a ride (0107 body + ride branch)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preferred_driver_window()
RETURNS INTERVAL AS $$ SELECT INTERVAL '60 seconds'; $$ LANGUAGE sql IMMUTABLE;

-- set_order_booking_fields runs as the customer, who may not read other
-- drivers' rows (0080).
CREATE OR REPLACE FUNCTION public.driver_is_online(p_driver UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = p_driver AND d.is_online);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.driver_is_online(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_is_online(UUID) TO authenticated;

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
        NEW.scheduled_at := NULL;
        NEW.package_id := NULL;
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

-- 0089 body; drivers: the chosen driver alone for the first minute.
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

-- 0089 body (+ the varchar/text fix); a ride with a chosen driver pings only that driver during
-- the first minute, then drops the choice (the claim guard in the state
-- machine stops honouring it) and dispatches as usual.
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
             CASE WHEN o.service_type = 'ride' THEN o.rate_code END, true, 10) n
        WHERE o.pickup_lat IS NOT NULL AND n.id <> o.user_id
          AND public.is_active_partner(n.id, 'driver');
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
        -- Drivers: everyone in this round was pinged, start over from the
        -- nearest. Technicians are pinged once; the job board does the rest.
        -- The chosen driver is pinged once during their minute.
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

-- Verify after applying (as a customer whose last ride is finished):
--   SELECT phone FROM get_counterparty_profiles(ARRAY['<that driver>']::uuid[]);  -> NULL
