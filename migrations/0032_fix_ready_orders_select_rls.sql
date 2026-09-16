-- Fixes a critical, currently-live bug found while auditing the WiraFood
-- delivery flow: a driver can NEVER see a 'ready' food order to claim it.
--
-- 0028_mitra_payout_system.sql added an UPDATE policy clause letting a
-- driver claim a 'ready', unclaimed food order
-- ("status = 'ready' AND driver_id IS NULL AND merchant_id IS NOT NULL"),
-- but never added the matching SELECT-side grant. The live SELECT policy
-- (orders_select_own_or_relevant, from 0026) only exposes unclaimed orders
-- while status = 'pending' - once a merchant marks an order 'ready', RLS
-- silently hides it from every driver's query (orderService.js's
-- fetchReadyFoodDeliveries) and from the realtime UPDATE-event subscription
-- (subscribeToDriverOrders) alike. A driver can never fetch the order to
-- begin with, so the UPDATE policy that lets them claim it is unreachable
-- in practice. This has meant WiraFood's driver leg has been completely
-- non-functional in production since the payout-system migration shipped.
--
-- Fix: extend the SELECT policy so any authenticated user can also see a
-- 'ready', unclaimed order with a merchant attached (a food delivery that's
-- actively looking for a driver) - mirrors the existing 'pending' clause
-- exactly, just for the 'ready' + food-specific case.

DROP POLICY IF EXISTS "orders_select_own_or_relevant" ON public.orders;
CREATE POLICY "orders_select_own_or_relevant" ON public.orders
FOR SELECT USING (
    auth.uid() = user_id
    OR (auth.uid() IS NULL AND user_id IS NULL)
    OR driver_id = auth.uid()
    OR (status = 'pending' AND driver_id IS NULL)
    OR (status = 'ready' AND driver_id IS NULL AND merchant_id IS NOT NULL)
    OR merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
    OR is_admin()
);

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- As a real driver session (not service role), this should now return rows:
--   SELECT id, status, merchant_id FROM public.orders
--   WHERE status = 'ready' AND driver_id IS NULL AND merchant_id IS NOT NULL;
-- Before this migration, RLS made that query return zero rows for every
-- non-admin, non-owning driver regardless of how many such orders existed.
