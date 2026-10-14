-- =========================================
-- Migration 0131: WiraRide Mobil reaches car drivers, Motor stays with motors
-- =========================================
-- A driver's vehicle is stored in users.vehicle_type (set at sign-up and in
-- Pengaturan). get_nearest_drivers read drivers.vehicle_type instead, which
-- is empty for everyone and so counted as 'motor'. Result:
--   - a WiraRide Mobil order found no driver (no ping, "0 drivers nearby");
--   - a WiraRide Motor order would also ping a car driver;
--   - the open-order list and claim (can_see_open_order) never compared the
--     ride's vehicle with the driver's, so a motor driver could take a car
--     ride and the reverse;
--   - get_nearby_pending_orders errored on every call (see below).
-- Now the driver's vehicle is COALESCE(users.vehicle_type,
-- drivers.vehicle_type, 'motor') everywhere, and a ride with rate_code
-- 'motor'/'mobil' is only shown to, dispatched to and claimable by a driver
-- with that vehicle. Ride orders without a rate_code (old rows) stay open
-- to everyone, as before.
-- =========================================

CREATE OR REPLACE FUNCTION public.driver_vehicle(p_driver UUID)
RETURNS TEXT AS $$
    SELECT COALESCE(
        (SELECT NULLIF(u.vehicle_type, '') FROM public.users u WHERE u.id = p_driver),
        (SELECT NULLIF(d.vehicle_type, '') FROM public.drivers d WHERE d.id = p_driver),
        'motor');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.driver_vehicle(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_vehicle(UUID) TO authenticated, service_role;

-- True when a ride with this rate_code may go to this driver. Only the two
-- vehicle codes are checked; anything else (NULL on old rows) is open.
CREATE OR REPLACE FUNCTION public.ride_vehicle_ok(p_rate_code TEXT, p_driver UUID)
RETURNS BOOLEAN AS $$
    SELECT p_rate_code IS NULL OR p_rate_code NOT IN ('motor', 'mobil')
        OR p_rate_code = public.driver_vehicle(p_driver);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.ride_vehicle_ok(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ride_vehicle_ok(TEXT, UUID) TO authenticated, service_role;

-- 0014 body; the vehicle now comes from users first.
CREATE OR REPLACE FUNCTION public.get_nearest_drivers(
    user_lat DOUBLE PRECISION, user_lng DOUBLE PRECISION,
    target_vehicle_type TEXT DEFAULT NULL, only_online BOOLEAN DEFAULT true,
    max_results INTEGER DEFAULT 10)
RETURNS TABLE(id UUID, name TEXT, phone TEXT, avatar_url TEXT, vehicle_type TEXT, vehicle_plate TEXT,
              rating NUMERIC, status TEXT, is_online BOOLEAN, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
              distance_meters DOUBLE PRECISION)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    u_point GEOGRAPHY;
BEGIN
    IF user_lat IS NULL OR user_lng IS NULL THEN
        RETURN;
    END IF;
    IF user_lat < -90.0 OR user_lat > 90.0 OR user_lng < -180.0 OR user_lng > 180.0 THEN
        RETURN;
    END IF;
    u_point := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography;

    RETURN QUERY
    SELECT
        d.id,
        COALESCE(u.name, 'Mitra Driver')::TEXT AS name,
        COALESCE(u.phone, '-')::TEXT AS phone,
        u.avatar_url::TEXT,
        COALESCE(NULLIF(u.vehicle_type, ''), NULLIF(d.vehicle_type, ''), 'motor')::TEXT AS vehicle_type,
        COALESCE(d.vehicle_plate, '-')::TEXT AS vehicle_plate,
        COALESCE(d.rating, 5.0)::NUMERIC AS rating,
        COALESCE(d.status, 'active')::TEXT AS status,
        d.is_online,
        COALESCE(d.lat, ST_Y(d.location::geometry))::DOUBLE PRECISION AS lat,
        COALESCE(d.lng, ST_X(d.location::geometry))::DOUBLE PRECISION AS lng,
        ROUND(ST_Distance(d.location, u_point)::NUMERIC, 2)::DOUBLE PRECISION AS distance_meters
    FROM public.drivers d
    LEFT JOIN public.users u ON u.id = d.id
    WHERE (NOT only_online OR d.is_online = true)
      AND (d.status = 'active' OR d.status IS NULL)
      AND d.location IS NOT NULL
      AND (target_vehicle_type IS NULL OR target_vehicle_type = ''
           OR COALESCE(NULLIF(u.vehicle_type, ''), NULLIF(d.vehicle_type, ''), 'motor') = target_vehicle_type)
    ORDER BY d.location <-> u_point ASC
    LIMIT LEAST(GREATEST(COALESCE(max_results, 10), 1), 100);
END;
$function$;

-- 0128 body; rides also match the driver's vehicle (list and claim, via RLS).
CREATE OR REPLACE FUNCTION public.can_see_open_order(p_service_type text, p_rate_code text, p_status text,
    p_merchant_id uuid, p_preferred uuid, p_since timestamp with time zone)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
               AND (p_service_type <> 'ride' OR public.ride_vehicle_ok(p_rate_code, v_uid))
               AND (p_preferred IS NULL OR p_preferred = v_uid
                    OR p_since < NOW() - public.preferred_driver_window());
        END IF;
        RETURN FALSE;
    ELSIF p_status = 'ready' AND p_merchant_id IS NOT NULL THEN
        RETURN public.is_active_partner(v_uid, 'driver');
    END IF;
    RETURN FALSE;
END;
$function$;

-- 0033 body; the nearby list hides rides for the other vehicle. The
-- caller's own stored vehicle is used, not the one the client passes.
-- Also fixes the live function, which failed on every call with
-- 'column reference "distance_meters" is ambiguous' (the ORDER BY alias
-- collides with the RETURNS TABLE column), so the partner app's nearby
-- order list never loaded; #variable_conflict use_column resolves it.
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

-- 0130 body; a preferred ("Pesan lagi") driver must also have the vehicle.
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
                             AND public.ride_vehicle_ok(o.rate_code, o.preferred_partner_id)
                        THEN ARRAY[o.preferred_partner_id] ELSE '{}'::UUID[] END;
    ELSIF o.service_type IN ('ride', 'send') THEN
        SELECT COALESCE(array_agg(n.id ORDER BY n.distance_meters), '{}') INTO v_cands
        FROM public.get_nearest_drivers(o.pickup_lat, o.pickup_lng,
             CASE WHEN o.service_type = 'ride' THEN o.rate_code END, true, 10) n
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
