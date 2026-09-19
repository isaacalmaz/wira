-- =============================================================================
-- Migration 0057: pricing_rules table — admin-configurable rates for
-- WiraSend, WiraService, WiraPool, and WiraFood's delivery fee
-- =============================================================================
--
-- Context: a full pricing survey found that, of the six order-creation
-- flows, only WiraRide has any DB-backed, admin-editable pricing at all
-- (public.vehicles, migrations/0011/0016, managed today via
-- frontend-admin/src/pages/VehiclesPricingPage.jsx). WiraFood and WiraVilla
-- prices are correctly merchant-owned (public.products.price,
-- public.merchants.price_per_night) and don't need a platform-rate table.
-- But WiraSend's package tiers, WiraService's category rates, WiraPool's
-- service rates, and WiraFood's delivery-fee formula are all pure hardcoded
-- JS constants in their respective frontend-user pages today, with zero DB
-- backing and zero admin control surface — an admin cannot change a Send
-- package price or the food delivery-fee formula without editing and
-- redeploying code.
--
-- This table gives all four a single, admin-manageable home, deliberately
-- reusing public.vehicles' (base_price, per_km_rate) shape rather than
-- inventing a new one — a flat-fee item (e.g. WiraSend's "kecil" tier) is
-- just a row with per_km_rate = 0, and a distance-based one (WiraFood's
-- delivery fee) uses both columns, exactly like WiraRide's vehicles already
-- do. This lets a single admin UI section (extending
-- VehiclesPricingPage.jsx) edit vehicles and pricing_rules with the same
-- editable-table pattern.
--
-- Seed values below are copied EXACTLY from the current hardcoded JS
-- constants (frontend-user/src/pages/SendPage.jsx, ServicePage.jsx,
-- PoolPage.jsx, RestaurantPage.jsx's dynamicDeliveryFee formula), so live
-- prices do not change the moment this migration is applied — they only
-- become admin-editable going forward.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pricing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_type TEXT NOT NULL, -- 'send' | 'service' | 'pool' | 'food_delivery'
    code TEXT NOT NULL,         -- rate_code this row answers for, e.g. 'kecil', 'AC', 'S1', 'default'
    name TEXT NOT NULL,         -- display name, e.g. 'Paket Kecil', 'AC', 'Pembersihan Rutin'
    base_price NUMERIC NOT NULL DEFAULT 0,
    per_km_rate NUMERIC NOT NULL DEFAULT 0, -- 0 for flat-fee tiers; > 0 only for food_delivery today
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (service_type, code)
);

ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pricing_rules_select_public" ON public.pricing_rules;
CREATE POLICY "pricing_rules_select_public" ON public.pricing_rules
FOR SELECT USING (true);

DROP POLICY IF EXISTS "pricing_rules_insert_admin" ON public.pricing_rules;
CREATE POLICY "pricing_rules_insert_admin" ON public.pricing_rules
FOR INSERT WITH CHECK (is_admin());

DROP POLICY IF EXISTS "pricing_rules_update_admin" ON public.pricing_rules;
CREATE POLICY "pricing_rules_update_admin" ON public.pricing_rules
FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "pricing_rules_delete_admin" ON public.pricing_rules;
CREATE POLICY "pricing_rules_delete_admin" ON public.pricing_rules
FOR DELETE USING (is_admin());

-- Keep updated_at honest on every admin edit, same pattern as 0042.
DROP TRIGGER IF EXISTS trg_pricing_rules_updated_at ON public.pricing_rules;
CREATE TRIGGER trg_pricing_rules_updated_at
BEFORE UPDATE ON public.pricing_rules
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- --- Seed: WiraSend package tiers (SendPage.jsx:59-64) ------------------------
INSERT INTO public.pricing_rules (service_type, code, name, base_price, per_km_rate) VALUES
    ('send', 'dokumen', 'Dokumen', 8000, 0),
    ('send', 'kecil', 'Paket Kecil', 12000, 0),
    ('send', 'sedang', 'Paket Sedang', 18000, 0),
    ('send', 'besar', 'Paket Besar', 30000, 0)
ON CONFLICT (service_type, code) DO NOTHING;

-- --- Seed: WiraService category rates (ServicePage.jsx:106-111) --------------
INSERT INTO public.pricing_rules (service_type, code, name, base_price, per_km_rate) VALUES
    ('service', 'AC', 'Servis AC', 75000, 0),
    ('service', 'Listrik', 'Servis Listrik', 50000, 0),
    ('service', 'Plumbing', 'Servis Plumbing', 60000, 0),
    ('service', 'Tukang', 'Jasa Tukang', 100000, 0)
ON CONFLICT (service_type, code) DO NOTHING;

-- --- Seed: WiraPool service rates (PoolPage.jsx:87-98) -----------------------
INSERT INTO public.pricing_rules (service_type, code, name, base_price, per_km_rate) VALUES
    ('pool', 'S1', 'Pembersihan Rutin', 200000, 0),
    ('pool', 'S2', 'Layanan Pool 2', 150000, 0),
    ('pool', 'S3', 'Layanan Pool 3', 300000, 0),
    ('pool', 'MONTHLY', 'Paket Bulanan', 500000, 0)
ON CONFLICT (service_type, code) DO NOTHING;

-- --- Seed: WiraFood delivery fee formula (RestaurantPage.jsx:94-108) ---------
-- 5000 + ceil(distanceKm) * 2000
INSERT INTO public.pricing_rules (service_type, code, name, base_price, per_km_rate) VALUES
    ('food_delivery', 'default', 'Ongkos Kirim WiraFood', 5000, 2000)
ON CONFLICT (service_type, code) DO NOTHING;

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- 1. SELECT service_type, code, name, base_price, per_km_rate, is_active
--    FROM public.pricing_rules ORDER BY service_type, code;
--    Should show 4 send + 4 service + 4 pool + 1 food_delivery = 13 rows,
--    matching the values hardcoded in the four frontend pages today.
-- 2. As a non-admin authenticated session: attempt to update/insert/delete
--    a pricing_rules row - should be blocked (0 rows affected / permission
--    denied), same as public.vehicles' existing behavior.
-- 3. As a real admin session: the same operations should succeed.
-- =============================================================================
