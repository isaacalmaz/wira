-- =============================================================================
-- Migration 0018: get_nearby_pending_orders RPC (Stage 2 of driver matching)
-- Date: 2026-09-15
-- =============================================================================
-- Context: Stage 1 (0017) added real pickup_lat/pickup_lng to orders and
-- wired live driver GPS tracking. Stage 2 uses that data to scope the
-- driver-facing pending-orders list to nearby orders instead of the whole
-- island, mirroring the existing get_nearest_drivers() pattern (0014) in
-- the opposite direction.
--
-- IMPORTANT: pickup_lat/pickup_lng are only populated for 'ride' orders so
-- far (RidePage.jsx). 'send'/'service'/'pool' orders still have NULL
-- coordinates. This RPC therefore does NOT exclude orders with no
-- coordinates - it always shows them (old, unscoped behavior), and only
-- applies real distance filtering/sorting to orders that do have
-- coordinates. This avoids technicians/other service types losing
-- visibility into their jobs until those flows are wired with coordinates
-- too (separate, future work).
--
-- RLS is unaffected by this migration: orders_select_own_or_relevant
-- (SECURITY_FIXES_2026-09-15.sql) already grants any authenticated driver
-- SELECT on pending/unclaimed orders. This RPC is SECURITY DEFINER purely
-- to run the distance math server-side, not to grant new access.
-- =============================================================================

CREATE OR REPLACE FUNCTION get_nearby_pending_orders(
    driver_lat DOUBLE PRECISION,
    driver_lng DOUBLE PRECISION,
    target_service_types TEXT[] DEFAULT NULL,
    radius_meters DOUBLE PRECISION DEFAULT 15000,
    max_results INT DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    merchant_id UUID,
    service_type TEXT,
    title TEXT,
    details TEXT,
    status TEXT,
    total_price NUMERIC,
    payment_method TEXT,
    payment_status TEXT,
    driver_id UUID,
    created_at TIMESTAMPTZ,
    pickup_lat DOUBLE PRECISION,
    pickup_lng DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    d_point GEOGRAPHY;
    have_driver_point BOOLEAN;
BEGIN
    have_driver_point := driver_lat IS NOT NULL AND driver_lng IS NOT NULL
        AND driver_lat >= -90.0 AND driver_lat <= 90.0
        AND driver_lng >= -180.0 AND driver_lng <= 180.0;

    IF have_driver_point THEN
        d_point := ST_SetSRID(ST_MakePoint(driver_lng, driver_lat), 4326)::geography;
    END IF;

    RETURN QUERY
    SELECT
        o.id, o.user_id, o.merchant_id,
        o.service_type::TEXT, o.title::TEXT, o.details::TEXT,
        o.status::TEXT, o.total_price, o.payment_method::TEXT, o.payment_status::TEXT,
        o.driver_id, o.created_at, o.pickup_lat, o.pickup_lng,
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
      AND (target_service_types IS NULL OR o.service_type = ANY(target_service_types))
      AND (
        -- Always show orders with no pickup coordinates yet (send/service/pool) -
        -- only apply the radius cutoff to orders that actually have coordinates.
        o.pickup_lat IS NULL OR o.pickup_lng IS NULL
        OR NOT have_driver_point
        OR ST_DWithin(
             ST_SetSRID(ST_MakePoint(o.pickup_lng, o.pickup_lat), 4326)::geography,
             d_point,
             radius_meters
           )
      )
    ORDER BY
        -- Nearest-first among orders with a known distance, then the rest
        -- (no coordinates) after, newest first among those.
        CASE WHEN distance_meters IS NULL THEN 1 ELSE 0 END ASC,
        distance_meters ASC,
        o.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(max_results, 20), 1), 100);
END;
$$;

GRANT EXECUTE ON FUNCTION get_nearby_pending_orders(DOUBLE PRECISION, DOUBLE PRECISION, TEXT[], DOUBLE PRECISION, INT) TO anon, authenticated, service_role;
