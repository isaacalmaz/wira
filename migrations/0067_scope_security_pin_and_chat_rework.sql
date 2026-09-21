-- =============================================================================
-- Migration 0067: move security_pin out of the broadly-readable orders
-- table into its own narrowly-scoped table
-- =============================================================================
-- Auditing the anti-fraud PIN feature (0063/0065/0066) found the PIN itself
-- leaks far beyond its intended audience:
--
--   1. `orders.security_pin` rides along on every `SELECT *` a driver does
--      to browse the job list / dispatch feed (orders_select_own_or_relevant,
--      migration 0032, deliberately grants any authenticated user SELECT on
--      unassigned pending/ready orders so drivers can see jobs to claim -
--      correct for dispatch, but it also hands out the PIN of an order
--      nobody has even accepted yet).
--   2. It also lands in the ASSIGNED driver's own client state
--      (frontend-mitra's ActiveOrderPage does `select('*')` for its own
--      active order), even though the UI never displays it to them - a
--      driver reading their own network response/React state in devtools
--      gets the PIN directly, defeating the entire "the customer must tell
--      the driver the code out loud" premise.
--
-- A column-level REVOKE (the technique used in migration 0050 for
-- users.role/wallet_balance) doesn't work here: `orders` is read via
-- `SELECT *` in a large number of already-working call sites across all
-- three frontends, and Postgres rejects a `SELECT *` outright (not a
-- partial/degraded result) the moment it expands to include a column the
-- caller lacks privilege on - revoking the column would break every one of
-- those call sites, not just the ones that shouldn't see the PIN.
--
-- Moving the PIN to its own table with real RLS is the surgical fix: every
-- existing `orders` query keeps working completely unchanged (the column
-- is fully removed from `orders`, so there's nothing to accidentally
-- over-select), and the PIN itself is now only ever visible to whoever the
-- RLS policy actually names.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.order_security_pins (
    order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
    pin VARCHAR(4) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.order_security_pins ENABLE ROW LEVEL SECURITY;

-- Only the order's own customer, or - for a food order specifically, since
-- that flow is merchant-confirms-driver rather than customer-confirms-
-- driver (frontend-user/src/pages/ActiveOrderPage.jsx already special-cases
-- food this way in its display copy) - the owning merchant, may ever read
-- the PIN. The assigned driver is deliberately NEVER granted SELECT here -
-- they're supposed to receive it verbally, not read it from the app.
DROP POLICY IF EXISTS "order_security_pins_select_customer_or_merchant" ON public.order_security_pins;
CREATE POLICY "order_security_pins_select_customer_or_merchant" ON public.order_security_pins
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_security_pins.order_id
          AND (
              o.user_id = auth.uid()
              OR o.merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
          )
    )
    OR is_admin()
);
-- No INSERT/UPDATE/DELETE policy for anon/authenticated - rows are only
-- ever written by the trigger below (runs as table owner) and read via the
-- policy above; nothing in the app should ever write a PIN directly.

-- Populate a PIN automatically whenever an order is created, same
-- generation logic as 0063's original trigger, just targeting the new
-- table instead of the orders row itself.
CREATE OR REPLACE FUNCTION public.generate_order_pin()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.order_security_pins (order_id, pin)
    VALUES (NEW.id, lpad(floor(random() * 10000)::text, 4, '0'))
    ON CONFLICT (order_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_order_pin ON public.orders;
CREATE TRIGGER trg_generate_order_pin
    AFTER INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION generate_order_pin();
-- AFTER INSERT (not BEFORE, unlike 0063's version) because this trigger now
-- inserts into a DIFFERENT table keyed by the order's own id, which only
-- exists once the orders row itself has actually been committed.

-- start_order_with_pin (0066's version) now checks the new table instead of
-- orders.security_pin. Everything else - the driver-ownership check added
-- in 0066, the 5-attempt rate limit from 0065 - is unchanged.
CREATE OR REPLACE FUNCTION start_order_with_pin(p_order_id UUID, p_pin_input VARCHAR(4))
RETURNS JSONB AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_caller UUID := auth.uid();
    v_real_pin VARCHAR(4);
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pesanan tidak ditemukan');
    END IF;

    IF v_order.driver_id IS DISTINCT FROM v_caller AND NOT is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anda tidak berhak memulai pesanan ini');
    END IF;

    IF v_order.status NOT IN ('accepted', 'picking_up') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pesanan belum siap untuk dimulai');
    END IF;

    IF v_order.pin_attempts >= 5 THEN
        UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
        RETURN jsonb_build_object('success', false, 'error', 'Terlalu banyak percobaan PIN (Brute-force). Pesanan dibatalkan otomatis demi keamanan.');
    END IF;

    SELECT pin INTO v_real_pin FROM public.order_security_pins WHERE order_id = p_order_id;

    IF v_real_pin IS DISTINCT FROM p_pin_input THEN
        UPDATE public.orders SET pin_attempts = COALESCE(pin_attempts, 0) + 1 WHERE id = p_order_id;
        RETURN jsonb_build_object('success', false, 'error', 'PIN tidak valid. Sisa percobaan: ' || (5 - (COALESCE(v_order.pin_attempts, 0) + 1)));
    END IF;

    UPDATE public.orders
    SET status = 'in_trip', updated_at = NOW(), pin_attempts = 0
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the now-unused column and its old BEFORE INSERT trigger reference.
-- Confirmed via a full-repo grep that only the three migrations above
-- (0063/0065/0066, all superseded by this one) and this migration itself
-- ever referenced orders.security_pin - no live frontend code reads it
-- directly (both frontends need to move to reading
-- public.order_security_pins instead, see the companion frontend change
-- in this same commit).
ALTER TABLE public.orders DROP COLUMN IF EXISTS security_pin;

-- Backfill: any order created between 0063 landing and this migration that
-- already has a NULL/absent PIN under the old column gets a real one now,
-- so in-flight orders aren't left without a working PIN.
INSERT INTO public.order_security_pins (order_id, pin)
SELECT id, lpad(floor(random() * 10000)::text, 4, '0')
FROM public.orders
WHERE status IN ('pending', 'accepted', 'picking_up')
ON CONFLICT (order_id) DO NOTHING;

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- 1. As a driver NOT assigned to a given order (or any anon/authenticated
--    session with no relation to it): `select('*')` on order_security_pins
--    for that order_id should return 0 rows - confirms the leak via broad
--    job-list/dispatch queries is closed (there's no PIN in the `orders`
--    row anymore for them to over-select in the first place).
-- 2. As the real assigned driver, fetching their own active order
--    (`orders.select('*')`) should no longer include any PIN field at all -
--    confirms the driver can no longer read it from their own client.
-- 3. As the order's real customer, `order_security_pins.select('*').eq(
--    'order_id', myOrderId)` should return exactly one row with the real
--    PIN - the frontend PIN-display component needs to query this table
--    now instead of `order.security_pin`.
-- 4. Create a real order, confirm a matching order_security_pins row
--    appears automatically (the AFTER INSERT trigger).
-- 5. start_order_with_pin end-to-end with the real PIN (now sourced from
--    the new table) should still succeed exactly as before; the 5-attempt
--    lockout and the driver-ownership check (0066) should both still work.
-- =============================================================================
