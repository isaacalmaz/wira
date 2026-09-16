-- =============================================================================
-- Migration 0033: Unify Driver/Kurir back into one portal with self-service
-- job-type preferences (undoes part of tonight's 0031 courier split, on
-- purpose - see this migration's accompanying frontend changes).
-- Date: 2026-09-16
-- =============================================================================
-- Context: 0031 (earlier tonight) split the single undifferentiated 'driver'
-- mitra_access role into two separate values/portals, 'driver' (Ride) and
-- 'courier' (Send), with a parallel /courier/* login+route tree reusing the
-- same Driver* components. After using it, the product decision (confirmed
-- with the product owner - "Option B" of a full options evaluation) is that
-- this was the wrong shape: TWO logins for what is really the same physical
-- job (one motorbike, one driver) added friction without adding value. This
-- migration collapses it back to ONE unified Driver portal, replacing the
-- role-tag-per-portal model with a self-service preference model: each
-- driver picks which job types they want (Ride/Kurir/Makanan) via toggles in
-- Settings, constrained by their vehicle type, instead of the app assigning
-- access via which login they used.
--
-- ---------------------------------------------------------------------------
-- CANONICAL vehicle_type COLUMN DECISION
-- ---------------------------------------------------------------------------
-- THREE different vehicle_type columns already exist in this schema, all
-- effectively dead or narrowly-scoped before this migration:
--   1. public.users.vehicle_type       (0001/0008) - never read/written by
--      any frontend code. Dead.
--   2. public.driver_profiles.vehicle_type (0007) - the whole driver_profiles
--      table is unreferenced by any frontend code. Dead.
--   3. public.drivers.vehicle_type     (0013b/0014) - LIVE: get_nearest_drivers
--      / find_nearest_drivers already COALESCE(d.vehicle_type, 'motor') and
--      filter by it, and RidePage.jsx already passes target_vehicle_type to
--      that RPC - but nothing ever WRITES drivers.vehicle_type, so it always
--      falls back to 'motor' regardless of reality.
--
-- DECISION: public.users.vehicle_type (#1 above) becomes the canonical column
-- for "what job types can this driver opt into" purposes (registration,
-- Settings, the new job-type eligibility rule). Reasoning:
--   - Every place that needs to read/write it in the new feature
--     (RegisterPage, SettingsPage, the driver's own AuthContext profile
--     object, the admin DriversPage grant flow, and the new SQL eligibility
--     function) already lives on/around the `users` row - joining out to the
--     separate `drivers` table for every single eligibility check (which
--     runs on every pending-order fetch/realtime event) would be pure
--     overhead for no benefit.
--   - `public.drivers` only has a row for a driver who has gone online at
--     least once (see orderService.js's updateDriverLocation upserting into
--     it) - a brand-new driver who registers but hasn't gone online yet
--     would have no `drivers` row at all, so `drivers.vehicle_type` cannot
--     be "required before they can go online" (requirement) without a
--     chicken-and-egg problem; `users.vehicle_type` has no such gap since
--     the `users` row always exists once the account is granted access.
--   - `public.drivers.vehicle_type` is LEFT AS ITS OWN SEPARATELY-POPULATED
--     THING, untouched by this migration, purely for get_nearest_drivers'
--     ride-matching concern ("what vehicle class is nearby for a ride
--     request right now"), which is orthogonal to "what job types is this
--     driver opted into" - conflating the two would risk breaking existing
--     ride-matching behavior for a benefit this feature doesn't need. A
--     future migration could sync users.vehicle_type -> drivers.vehicle_type
--     on go-online if that RPC's fallback-to-'motor' behavior ever becomes
--     a real problem; out of scope here.
--
-- The existing users.vehicle_type column (TEXT, no constraint) is reused
-- (not re-added) and gets a CHECK constraint + default added by this
-- migration, per the header note above.
-- ---------------------------------------------------------------------------
--
-- job_type_preferences is stored as a JSONB array on users, mirroring the
-- exact shape mitra_access itself already uses (same `?`/`||` JSONB
-- operators 0031 established) - a deliberate consistency choice.
--
-- package_size becomes a real, queryable column on orders (previously only a
-- customer-facing UI concept in frontend-user/src/pages/SendPage.jsx's
-- 4-tier `packages` array, baked into a free-text `details` string with no
-- structured column at all) - required to make "mobil can only receive
-- large-package Send jobs" actually enforceable in SQL/JS.
--
-- ---------------------------------------------------------------------------
-- BACKFILL / ZERO-DISRUPTION GUARANTEE
-- ---------------------------------------------------------------------------
-- Every currently-active driver-type account (mitra_access holds 'driver'
-- and/or 'courier', thanks to 0031's own backfill) is currently receiving
-- BOTH ride and send jobs with zero friction. This migration must not
-- shrink that for any real, currently-active account:
--   - vehicle_type defaults to 'motor' for every such account (best-guess -
--     there is no reliable way to infer real vehicle type from the existing
--     free-text `vehicle` column, e.g. "Honda Vario 160"; an admin or the
--     driver themselves can correct it later via Settings - expected and
--     fine, motor is the least-restrictive default so nobody gets
--     newly-blocked from a job type they could already receive).
--   - job_type_preferences defaults to '["ride","send","food"]' for every
--     such account - exactly what they already effectively receive today
--     (ride+send always; food because FOOD_DELIVERY_SERVICE_TYPES orders
--     were unconditionally merged into every driver's queue before this
--     migration, with no preference gate at all).
--   - Only applied WHERE NOT already set, so this is idempotent/safe to
--     re-run.
--   - mitra_access itself gets collapsed: every 'courier' tag becomes
--     'driver' (added if missing, 'courier' removed) - covers BOTH accounts
--     that already hold ['driver','courier'] (0031's backfill) AND any
--     brand-new courier-ONLY registrations from earlier tonight
--     (['courier'] alone, no 'driver'). job_type_preferences becomes the
--     sole source of truth for what a driver-type mitra can actually
--     receive going forward; mitra_access just needs to say "this is a
--     driver-type mitra" the same way it already does for
--     merchant/villa/technician.
-- ---------------------------------------------------------------------------
--
-- Same as every other migration tonight: this is a manual Supabase SQL
-- Editor migration - nothing runs it automatically. Run this file's
-- statements against the live DB by hand.
-- =============================================================================

-- --- 1. users.vehicle_type: reuse the existing dead 0001/0008 column -------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS vehicle_type TEXT;
ALTER TABLE public.users ALTER COLUMN vehicle_type SET DEFAULT 'motor';
DO $$
BEGIN
    ALTER TABLE public.users ADD CONSTRAINT users_vehicle_type_check CHECK (vehicle_type IN ('motor', 'mobil'));
EXCEPTION
    WHEN OTHERS THEN NULL; -- constraint already exists (safe re-run)
END $$;

-- --- 2. users.job_type_preferences: JSONB array, same shape as mitra_access -
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS job_type_preferences JSONB DEFAULT '[]'::jsonb;

-- --- 3. orders.package_size: real column backing WiraSend's 4-tier UI ------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS package_size TEXT;
DO $$
BEGIN
    ALTER TABLE public.orders ADD CONSTRAINT orders_package_size_check CHECK (package_size IS NULL OR package_size IN ('dokumen', 'kecil', 'sedang', 'besar'));
EXCEPTION
    WHEN OTHERS THEN NULL; -- constraint already exists (safe re-run)
END $$;

-- --- 4. Backfill: preserve exactly what every existing driver-type account -
--        already effectively receives today (zero disruption).
UPDATE public.users
SET job_type_preferences = '["ride","send","food"]'::jsonb
WHERE (mitra_access ? 'driver' OR mitra_access ? 'courier')
  AND (job_type_preferences IS NULL OR job_type_preferences = '[]'::jsonb);

UPDATE public.users
SET vehicle_type = 'motor'
WHERE (mitra_access ? 'driver' OR mitra_access ? 'courier')
  AND vehicle_type IS NULL;

-- --- 5. Collapse mitra_access: 'courier' -> 'driver', no duplicates --------
-- Covers both ['driver','courier'] (0031's backfill) and courier-only
-- ['courier'] (any brand-new registration from earlier tonight).
UPDATE public.users
SET mitra_access = (
    SELECT jsonb_agg(DISTINCT elem)
    FROM (
        SELECT CASE WHEN value = '"courier"'::jsonb THEN '"driver"'::jsonb ELSE value END AS elem
        FROM jsonb_array_elements(mitra_access) AS value
    ) sub
)
WHERE mitra_access ? 'courier';

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- 1. SELECT id, mitra_access, vehicle_type, job_type_preferences
--    FROM public.users WHERE mitra_access ? 'driver';
--    — every row should have vehicle_type = 'motor' (unless already
--    customized before this ran) and job_type_preferences containing
--    "ride","send","food".
-- 2. SELECT id, mitra_access FROM public.users WHERE mitra_access ? 'courier';
--    — should return ZERO rows (every 'courier' tag was replaced).
-- 3. SELECT id, mitra_access FROM public.users
--    WHERE mitra_access ? 'driver'
--    GROUP BY id, mitra_access
--    HAVING (SELECT COUNT(*) FROM jsonb_array_elements_text(mitra_access) e WHERE e = 'driver') > 1;
--    — should return ZERO rows (no duplicate 'driver' entries introduced by
--    the collapse).
-- 4. A user who had ONLY 'merchant' (no 'driver'/'courier') before this
--    should be completely unaffected - their vehicle_type/job_type_preferences
--    stay whatever they were (NULL/'[]' by default).
-- 5. Re-running this whole file a second time should be a no-op (every step
--    guards with WHERE NOT already set / IF NOT EXISTS / EXCEPTION-swallowed
--    constraint adds).
-- =============================================================================


-- =============================================================================
-- 6. SQL side of the shared eligibility rule (Option B: exactly once in SQL,
--    mirroring orderService.js's eligibleServiceTypesForDriver/
--    isOrderEligibleForDriver exactly so the two never drift apart).
-- =============================================================================
-- Rule: motor -> whatever's in job_type_preferences, unrestricted.
--       mobil -> whatever's in job_type_preferences, EXCEPT:
--         - 'food' is filtered out unconditionally (defense in depth - even
--           if a 'food' value somehow ended up in a mobil driver's stored
--           preferences, e.g. a bug or manual DB edit, they must never
--           actually receive food orders).
--         - 'send' orders are additionally restricted to package_size IN
--           ('sedang','besar') - mobil can carry large packages only.
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
            AND (
                COALESCE(p_vehicle_type, 'motor') <> 'mobil'
                OR p_package_size IN ('sedang', 'besar')
            )
        WHEN p_service_type IN ('food', 'WiraFood') THEN
            COALESCE(p_job_type_preferences, '[]'::jsonb) ? 'food'
            AND COALESCE(p_vehicle_type, 'motor') <> 'mobil'
        ELSE FALSE
    END;
$$;

GRANT EXECUTE ON FUNCTION public.is_order_eligible_for_driver(TEXT, TEXT, TEXT, JSONB) TO anon, authenticated, service_role;

-- --- 7. Thread the rule into get_nearby_pending_orders (0018) --------------
-- Adds package_size to the returned columns (needed for the send/mobil
-- restriction) and two new optional params, driver_vehicle_type /
-- driver_job_type_preferences - when BOTH are supplied (the driver-matching
-- call site), eligibility is decided entirely by is_order_eligible_for_driver
-- above instead of the old plain target_service_types = ANY() membership
-- test. When either is omitted (e.g. the technician-matching call site,
-- which has no vehicle_type/job_type_preferences concept), falls back to the
-- pre-existing target_service_types behavior unchanged.
-- Return type is changing (new package_size column), so the function must be
-- dropped and recreated rather than CREATE OR REPLACE'd.
DROP FUNCTION IF EXISTS get_nearby_pending_orders(DOUBLE PRECISION, DOUBLE PRECISION, TEXT[], DOUBLE PRECISION, INT);

CREATE OR REPLACE FUNCTION get_nearby_pending_orders(
    driver_lat DOUBLE PRECISION,
    driver_lng DOUBLE PRECISION,
    target_service_types TEXT[] DEFAULT NULL,
    radius_meters DOUBLE PRECISION DEFAULT 15000,
    max_results INT DEFAULT 20,
    driver_vehicle_type TEXT DEFAULT NULL,
    driver_job_type_preferences JSONB DEFAULT NULL
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
    package_size TEXT,
    distance_meters DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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

GRANT EXECUTE ON FUNCTION get_nearby_pending_orders(DOUBLE PRECISION, DOUBLE PRECISION, TEXT[], DOUBLE PRECISION, INT, TEXT, JSONB) TO anon, authenticated, service_role;

-- ============================================================
-- Verification — run after applying (SQL eligibility side)
-- ============================================================
-- 1. SELECT public.is_order_eligible_for_driver('food', NULL, 'mobil', '["ride","send","food"]'::jsonb);
--    -- FALSE, even though 'food' is in the preferences array (defense in depth).
-- 2. SELECT public.is_order_eligible_for_driver('send', 'kecil', 'mobil', '["ride","send"]'::jsonb);
--    -- FALSE (mobil + send requires sedang/besar).
-- 3. SELECT public.is_order_eligible_for_driver('send', 'besar', 'mobil', '["ride","send"]'::jsonb);
--    -- TRUE.
-- 4. SELECT public.is_order_eligible_for_driver('send', 'dokumen', 'motor', '["send"]'::jsonb);
--    -- TRUE (motor has no package_size restriction).
-- 5. As a real driver account, call:
--    SELECT * FROM get_nearby_pending_orders(-8.58, 116.11, NULL, 15000, 20, 'motor', '["ride","send","food"]'::jsonb);
--    -- should behave identically to the pre-migration unrestricted query for
--    -- a motor driver with all three preferences on.
-- =============================================================================
