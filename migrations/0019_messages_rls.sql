-- =============================================================================
-- Migration 0019: enable RLS on messages (currently completely open)
-- Date: 2026-09-15
-- =============================================================================
-- THE BUG: public.messages had RLS enabled then immediately disabled with no
-- policies ever created (migrations/0001_initial_core_schema.sql:116-117,
-- duplicated in 0009). Any authenticated client (possibly anon too, depending
-- on key exposure) can currently read or write into ANY order's private
-- chat thread, not just the two real participants - a live privacy hole,
-- same class of bug as the orders/merchants/topup_requests fix from earlier
-- today (SECURITY_FIXES_2026-09-15.sql).
--
-- THE FIX: only the customer (orders.user_id), the assigned mitra
-- (orders.driver_id - used for both drivers and technicians, see
-- orderService.js's acceptOrder), the owning merchant (via
-- merchants.owner_id), or an admin can read/write a given order's messages.
-- Matches the auth.uid()-based pattern already used everywhere else in this
-- project. No UPDATE/DELETE policy - nothing in the app edits or deletes
-- messages.
-- =============================================================================

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_participants" ON public.messages;
CREATE POLICY "messages_select_participants" ON public.messages
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = messages.order_id
          AND (
            o.user_id = auth.uid()
            OR o.driver_id = auth.uid()
            OR o.merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
          )
    )
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
);

DROP POLICY IF EXISTS "messages_insert_participants" ON public.messages;
CREATE POLICY "messages_insert_participants" ON public.messages
FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = messages.order_id
          AND (
            o.user_id = auth.uid()
            OR o.driver_id = auth.uid()
            OR o.merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
          )
    )
);
