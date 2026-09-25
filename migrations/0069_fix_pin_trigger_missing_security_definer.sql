-- =============================================================================
-- Migration 0069: order creation is completely broken for every real customer
-- =============================================================================
-- Discovered live-testing the RidePage.jsx booking flow (unrelated UX fix
-- session) - a real, authenticated customer creating a real order via the
-- normal app flow gets:
--   "new row violates row-level security policy for table
--    order_security_pins" (Postgres 42501)
-- and the entire order INSERT is rolled back. Confirmed via an isolated
-- diagnostic script (authenticated customer session, not service role):
-- 100% reproducible for every order, regardless of service type - this is a
-- full outage of the "create any order" path platform-wide, introduced by
-- migration 0067.
--
-- Root cause: 0067's `generate_order_pin()` trigger function inserts into
-- `order_security_pins` on every new order, and its own comment says this
-- is safe because the trigger "runs as table owner" - but the function was
-- never actually declared `SECURITY DEFINER`. A plain `LANGUAGE plpgsql`
-- trigger function runs with the INVOKER's privileges (the customer
-- creating the order), not the table owner's. `order_security_pins` has no
-- INSERT policy for authenticated users (intentionally - the migration's
-- own comment says rows should only ever be written by this trigger), so
-- without SECURITY DEFINER, RLS correctly rejects the trigger's own insert,
-- which aborts the whole enclosing `orders` INSERT.
--
-- Fix: add SECURITY DEFINER to the function so it actually runs as its
-- owner (bypassing RLS, same technique used everywhere else in this
-- project - is_admin(), start_order_with_pin(), etc.), matching what the
-- migration always claimed was already true.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_order_pin()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.order_security_pins (order_id, pin)
    VALUES (NEW.id, lpad(floor(random() * 10000)::text, 4, '0'))
    ON CONFLICT (order_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- As a real authenticated customer (not service role), insert a real row
-- into `orders` - it must succeed, and a matching `order_security_pins` row
-- must appear automatically. This exact scenario failed with 42501 before
-- this migration.
-- =============================================================================
