-- =============================================================================
-- Migration 0020: real dropoff_lat/dropoff_lng columns on orders
-- Date: 2026-09-15
-- =============================================================================
-- Context: GPS-assisted trip-stage confirmation (see chat history). 0017
-- added pickup_lat/pickup_lng; this adds the matching dropoff pair so the
-- driver app can measure live distance to whichever leg of the trip is
-- currently active (heading to pickup vs. heading to dropoff), not just
-- the pickup leg. Only RidePage.jsx populates these for now (the only
-- service with a real map-based pickup/dropoff picker) - other service
-- types leave both NULL, same graceful-fallback pattern as pickup_lat/lng.
-- =============================================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS dropoff_lat DOUBLE PRECISION;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS dropoff_lng DOUBLE PRECISION;
