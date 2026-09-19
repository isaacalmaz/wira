-- =============================================================================
-- Migration 0049: Real promo codes for WiraSend / WiraService / WiraPool
-- =============================================================================
-- Context: public.promos (0011, extended in 0036/0046) already has real,
-- DB-backed promo codes scoped to service_type 'ride', 'food', and 'villa'
-- (RIDE50, FOODFREE/WIRALOMBOK/DISKON10, VILLAKUTA), each validated and
-- redeemed through the exact same handleCheckPromo/increment_promo_usage
-- flow RidePage.jsx/RestaurantPage.jsx already use. WiraSend, WiraVilla,
-- WiraService, and WiraPool are being brought up to that same parity
-- tonight (SendPage.jsx/VillaPage.jsx/ServicePage.jsx/PoolPage.jsx) - Villa
-- already has VILLAKUTA, but Send/Service/Pool had no promo row at all to
-- test against. This adds one real, usable code per service, filtered by
-- `promos.service_type` the same way the existing ones are (no CHECK
-- constraint on that column - it's plain text matched by the frontend's
-- `data.service_type !== '<service>'` guard).
-- =============================================================================

INSERT INTO public.promos (title, description, code, service_type, type, discount, status, "validUntil")
VALUES (
  'Diskon WiraSend', 'Potongan Rp 5.000 untuk pengiriman paket WiraSend',
  'SENDHEMAT', 'send', 'Fixed', 5000, 'Active', '2027-12-31'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.promos (title, description, code, service_type, type, discount, status, "validUntil")
VALUES (
  'Diskon WiraService', 'Diskon 15% untuk panggilan teknisi WiraService',
  'SERVICEDISKON', 'service', 'Percentage', 15, 'Active', '2027-12-31'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.promos (title, description, code, service_type, type, discount, status, "validUntil")
VALUES (
  'Diskon WiraPool', 'Potongan Rp 25.000 untuk perawatan kolam WiraPool',
  'POOLBERSIH', 'pool', 'Fixed', 25000, 'Active', '2027-12-31'
)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- SELECT code, service_type, type, discount, status FROM public.promos
-- WHERE code IN ('SENDHEMAT', 'SERVICEDISKON', 'POOLBERSIH');
-- -- 3 rows, all status = 'Active'.
-- =============================================================================
