-- =============================================================================
-- Migration 0058: structured pricing-input columns on public.orders
-- =============================================================================
-- 0059's server-side price computation trigger needs real, structured inputs
-- to recompute total_price from — today those inputs (which vehicle/package/
-- category was chosen, trip distance, number of nights) only exist buried
-- inside orders.details (free text) or orders.metadata (JSONB, food only),
-- in a shape that differs per service_type and was never meant to be a
-- stable machine-readable contract. Adding them as real columns instead.
--
-- All four are nullable and unused by any existing code path today, so this
-- migration alone changes no behavior - 0059 is what actually starts
-- computing total_price from them, and only for orders where the relevant
-- column(s) are populated (see 0059's header for the transition-window
-- reasoning).
-- =============================================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rate_code TEXT;
-- Identifies which public.vehicles.type (ride) or public.pricing_rules.code
-- (send/service/pool) row prices this order. NULL for food/villa, which are
-- priced from products/merchants rows instead, not a rate table.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS distance_meters NUMERIC;
-- Trip distance for ride (fare calc) and food (delivery-fee calc). NULL for
-- send/service/pool/villa, which are not distance-priced today.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS nights INTEGER;
-- WiraVilla stay length. NULL for every other service_type.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promo_code TEXT;
-- The promo code the customer applied at checkout, if any. 0059's trigger
-- re-validates this against public.promos itself (active, not expired,
-- matching service_type) rather than trusting any client-computed discount
-- amount - a client can name a promo_code but cannot forge its effect.

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- SELECT column_name FROM information_schema.columns WHERE table_schema =
-- 'public' AND table_name = 'orders' AND column_name IN ('rate_code',
-- 'distance_meters', 'nights', 'promo_code'); should return all 4.
-- =============================================================================
