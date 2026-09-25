-- Migration 0080: stop exposing other people's full users/drivers rows.
-- After 0079 (anon), the remaining leak is between logged-in parties:
--  - users_select (0026) let a customer read the FULL row of every driver
--    they ever had, and a driver/merchant owner the full row of every
--    customer: email, fcm_token, wallet_balance, payable_balance,
--    mitra_access - while the apps only ever show name/phone/vehicle.
--  - drivers "Public can view online active drivers" (0014) is USING (true):
--    anyone, anon included, reads every driver's live lat/lng and plate;
--    driver_locations (0014) exposes name + location to anon as well.
-- Now: users/drivers rows are readable by their owner and admins only;
-- a customer can still read (and get realtime updates of) the drivers row
-- of their own active order; counterparty name/phone/vehicle come from
-- get_counterparty_profiles() below, with the same "who may see whom" rule
-- users_select had. Companion frontend change: the six places that read
-- another user's row (user ActiveOrderPage; mitra ActiveOrderPage,
-- DriverHomePage, TechOrdersPage, MerchantOrdersPage, DriverProfilePage)
-- call the RPC, falling back to the old direct read while it is missing.
-- ORDER: deploy that frontend first, THEN apply this (applied before, the
-- old frontend's direct reads simply return no name/phone until deploy).

CREATE OR REPLACE FUNCTION public.get_counterparty_profiles(p_ids UUID[])
RETURNS TABLE (id UUID, name TEXT, phone TEXT, vehicle_type TEXT) AS $$
    SELECT u.id, u.name::TEXT, u.phone::TEXT, u.vehicle_type::TEXT
    FROM public.users u
    WHERE u.id = ANY (p_ids) AND auth.uid() IS NOT NULL AND (
        u.id = auth.uid()
        OR is_admin()
        -- a customer of an order I drive, or of my merchant
        OR EXISTS (SELECT 1 FROM public.orders o WHERE o.user_id = u.id AND (
               o.driver_id = auth.uid()
               OR o.merchant_id IN (SELECT m.id FROM public.merchants m WHERE m.owner_id = auth.uid())))
        -- the driver of one of my orders
        OR EXISTS (SELECT 1 FROM public.orders o WHERE o.driver_id = u.id AND o.user_id = auth.uid())
        -- a customer who reviewed me
        OR EXISTS (SELECT 1 FROM public.reviews r WHERE r.user_id = u.id AND r.driver_id = auth.uid())
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_counterparty_profiles(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_counterparty_profiles(UUID[]) TO authenticated;

DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select" ON public.users
FOR SELECT USING (auth.uid() = id OR is_admin());

DROP POLICY IF EXISTS "Public can view online active drivers" ON public.drivers;
DROP POLICY IF EXISTS "drivers_select_self_customer_admin" ON public.drivers;
CREATE POLICY "drivers_select_self_customer_admin" ON public.drivers
FOR SELECT USING (
    auth.uid() = id
    OR is_admin()
    OR id IN (SELECT o.driver_id FROM public.orders o
              WHERE o.user_id = auth.uid() AND o.driver_id IS NOT NULL
                AND o.status NOT IN ('completed', 'cancelled'))
);

-- Nearby-driver lookups stay available to logged-in customers (RidePage).
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.drivers FROM anon;
REVOKE SELECT ON public.driver_locations FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_nearest_drivers(DOUBLE PRECISION, DOUBLE PRECISION, TEXT, BOOLEAN, INT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.find_nearest_drivers(DOUBLE PRECISION, DOUBLE PRECISION, TEXT, BOOLEAN, INT) FROM PUBLIC, anon;
