-- =============================================================================
-- Migration 0054: close the residual "claim any pending order as your own
-- driver, then complete it" gap left open by 0051 (CRITICAL)
-- =============================================================================
--
-- Found during manual review of 0051 (not by any of the original audit
-- agents) before handing these migrations to the user to apply.
--
-- 0051's trigger correctly requires `auth.uid() = OLD.driver_id` (or the
-- owning merchant, or an admin) to transition an order to 'completed' — but
-- it never restricted who may set driver_id in the first place. The live
-- "orders_update_mitra_or_admin" RLS policy's first branch:
--
--     (status = 'pending' AND driver_id IS NULL)
--
-- has no ownership or role check at all in its USING clause, and 0051 added
-- no WITH-CHECK-equivalent restriction on driver_id either. So ANY
-- authenticated user — not just a real registered driver/technician — can:
--
--   1. UPDATE orders SET driver_id = <self> WHERE id = <any pending,
--      unclaimed order> — passes RLS (matches the unclaimed-pending branch)
--      and passes 0051's trigger (which doesn't touch driver_id at all).
--   2. UPDATE orders SET status = 'completed' WHERE id = <that same order>
--      — now passes 0051's completion check too, since the attacker
--      genuinely IS `OLD.driver_id` after step 1.
--
-- Two concrete exploit shapes remain open:
--   a) Self-dealing, no victim needed: create your own order as a customer
--      (total_price still client-supplied and unverified — a separate,
--      already-documented gap), claim it as your own driver_id, complete
--      it — payable_balance minted from a job you invented and "did" for
--      yourself. Requires two extra steps versus 0051's original one-step
--      exploit, but is otherwise just as capable of minting arbitrary
--      payable_balance.
--   b) Hijacking a real customer's real pending order: claim someone else's
--      genuine ride/send/service/pool request as your own driver_id (a real
--      person is now waiting on a "driver" who was never actually matched
--      to them and has no intention of doing the job), then complete it for
--      an undeserved payout at that real order's real total_price.
--
-- THE FIX
-- --------
-- Extend the SAME trigger function from 0051 (CREATE OR REPLACE — this is
-- the function's third and current revision) with two additional checks,
-- both scoped only to the specific transition that matters (driver_id going
-- from NULL to a real value):
--
--   1. Self-claim only: NEW.driver_id must equal auth.uid() — nobody may
--      assign an order to a driver id that isn't their own session (closes
--      a secondary integrity issue: without this, anyone could also grief a
--      real driver by "assigning" orders to them without consent).
--   2. Must be a genuine registered mitra, not a plain customer account:
--      NEW.driver_id must exist in public.drivers (the real driver registry
--      backing get_nearest_drivers(), migrations/0014) OR have
--      'technician' in users.mitra_access (the exact check list_technicians()
--      already uses, migrations/0026). Either is accepted regardless of the
--      order's own service_type — this mirrors what the real app's own
--      matching functions already treat as "a real mitra account," and
--      keeping it permissive-by-either avoids introducing a NEW way to
--      accidentally block a legitimate claim (e.g. a driver account also
--      used for Send deliveries) that a stricter per-service_type mapping
--      might get wrong. The security property this needs is just "not a
--      bare customer account" — exact service-type-to-job matching is
--      already handled by the app's own UI/RPC layer, not a job for this
--      guardrail.
--
-- This also, as a direct consequence, closes exploit (a) above even for a
-- genuinely-registered driver/technician account: NEW.driver_id = auth.uid()
-- together with the order's own user_id being that same auth.uid() (their
-- own order) is still geometrically possible if one person is BOTH a
-- customer and a registered driver — so a third, explicit check blocks
-- self-dealing outright regardless of mitra status: a driver may never
-- claim an order where they are also the customer.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_orders_state_machine()
RETURNS TRIGGER AS $$
BEGIN
    IF current_user = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF current_user IN ('authenticated', 'anon') THEN
            IF NEW.status IS DISTINCT FROM 'pending' THEN
                RAISE EXCEPTION 'New orders must be created with status = pending (got %)', NEW.status;
            END IF;
            IF NEW.payment_status IS DISTINCT FROM 'unpaid' AND NEW.payment_status IS DISTINCT FROM 'paid' THEN
                RAISE EXCEPTION 'New orders must be created with payment_status = unpaid or paid (got %)', NEW.payment_status;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- TG_OP = 'UPDATE' from here on.

    IF NEW.total_price IS DISTINCT FROM OLD.total_price AND NOT is_admin() THEN
        RAISE EXCEPTION 'total_price cannot be changed after an order is created (except by an admin)';
    END IF;

    -- NEW (0054): claiming an unassigned order (driver_id: NULL -> not NULL)
    -- is only valid as a genuine self-claim by a real registered driver or
    -- technician account, and never onto an order the claimer themselves
    -- placed as the customer.
    IF OLD.driver_id IS NULL AND NEW.driver_id IS NOT NULL THEN
        IF NEW.driver_id != auth.uid() THEN
            RAISE EXCEPTION 'You can only assign an order to yourself';
        END IF;
        IF NEW.driver_id = OLD.user_id THEN
            RAISE EXCEPTION 'You cannot claim your own order as its driver';
        END IF;
        IF NOT (
            EXISTS (SELECT 1 FROM public.drivers WHERE id = NEW.driver_id)
            OR EXISTS (
                SELECT 1 FROM public.users
                WHERE id = NEW.driver_id
                  AND mitra_access IS NOT NULL
                  AND mitra_access::text ILIKE '%technician%'
            )
        ) THEN
            RAISE EXCEPTION 'Only a registered driver or technician account can claim an order';
        END IF;
    END IF;

    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
        IF NOT (
            is_admin()
            OR auth.uid() = OLD.driver_id
            OR OLD.merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
        ) THEN
            RAISE EXCEPTION 'Only the assigned driver/technician, the owning merchant, or an admin can mark an order completed';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger itself is unchanged from 0051 (same name/timing/table) — CREATE OR
-- REPLACE FUNCTION above is enough since it just points at the function
-- name, but re-assert it defensively per this codebase's established
-- pattern (e.g. 0045) in case it was ever dropped.
DROP TRIGGER IF EXISTS trg_enforce_orders_state_machine ON public.orders;
CREATE TRIGGER trg_enforce_orders_state_machine
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_orders_state_machine();

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- 1. As a plain customer account (no drivers row, no 'technician' in
--    mitra_access) with no relation to a given pending order, attempt
--    `UPDATE orders SET driver_id = auth.uid() WHERE id = <that order> AND
--    status='pending'` — should fail with "Only a registered driver or
--    technician account can claim an order".
-- 2. As a real registered driver, attempt to set driver_id to a DIFFERENT
--    real driver's id on some pending order — should fail with "You can
--    only assign an order to yourself".
-- 3. As a real registered driver, create your own ride order as a customer,
--    then attempt to claim that same order as its own driver_id — should
--    fail with "You cannot claim your own order as its driver".
-- 4. As a real registered driver, claim a genuine OTHER customer's pending
--    ride/send order (driver_id NULL -> self) — should still succeed, same
--    as today.
-- 5. As a real technician (mitra_access contains 'technician'), claim a
--    pending service/pool order — should still succeed.
-- 6. Food delivery claim path (status='ready', merchant_id set, driver_id
--    NULL -> self) — this branch is OLD.driver_id IS NULL and NEW.driver_id
--    IS NOT NULL exactly the same as the pending-claim branch, so the same
--    checks apply and should behave identically: a real driver claiming a
--    ready food order for delivery should still succeed.
-- =============================================================================
