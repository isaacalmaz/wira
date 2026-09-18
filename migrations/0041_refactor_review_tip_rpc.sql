-- Refactors `submit_review_and_tip()` (created in migrations/0039, itself
-- confirmed NEVER applied live yet - calling it returns PGRST202 "function
-- not found", same as wallet_refund before 0040) before it ships, rather
-- than shipping it with a known issue and fixing it later.
--
-- 0039's original body reimplemented the debit side of the tip by hand:
-- manual `FOR UPDATE` balance check, manual `wallet_balance` decrement,
-- manual `transactions` insert with a hand-written 'payment' type. That
-- duplicates exactly what `wallet_pay()` (migrations/0023) already does
-- correctly and is the one place in this codebase that logic is supposed
-- to live - two independent implementations of "debit a wallet safely"
-- is exactly how 0023's original bugs (no balance re-check under
-- concurrency, inconsistent transaction `type` values) happen again later.
--
-- THE FIX: call `wallet_pay(p_tip_amount, ...)` for the debit side instead
-- of reimplementing it. `wallet_pay` already runs inside the same
-- transaction as the rest of this function (Postgres doesn't give a
-- SECURITY DEFINER call its own transaction), already does the FOR UPDATE
-- lock + balance check + correctly-typed `transactions` insert, and
-- already resolves `auth.uid()` correctly since that's session-level, not
-- affected by crossing a SECURITY DEFINER boundary. wallet_pay() returns
-- FALSE (not an exception) on insufficient funds, so that's translated
-- into the same user-facing exception message 0039 used.
--
-- For the credit side (paying the driver), `wallet_transfer()` was
-- checked first as the task asked - it doesn't fit: it resolves its
-- recipient by phone number (`p_recipient_phone`), and this function
-- already has the driver's user id directly from the order row, so
-- resolving id -> phone -> id again would be pure overhead and a new way
-- for the lookup to fail (e.g. a driver with no phone on file). Kept as a
-- direct credit, but now with the same rigor as wallet_transfer's own
-- credit side: both rows locked in a stable (id-sorted) order before any
-- mutation, so a hypothetical concurrent transfer/tip between the same two
-- users can't deadlock, and the `transactions` insert uses 'transfer_in'
-- - the exact type wallet_transfer already uses for "money arrived from
-- another user" - instead of a one-off string.

CREATE OR REPLACE FUNCTION public.submit_review_and_tip(
    p_order_id UUID,
    p_rating INTEGER,
    p_review_text TEXT,
    p_tip_amount NUMERIC
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_driver_id UUID;
    v_merchant_id UUID;
    v_is_reviewed BOOLEAN;
    v_lock_first UUID;
    v_lock_second UUID;
BEGIN
    -- Get order details
    SELECT user_id, driver_id, merchant_id, is_reviewed
    INTO v_user_id, v_driver_id, v_merchant_id, v_is_reviewed
    FROM public.orders
    WHERE id = p_order_id;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF v_is_reviewed THEN
        RAISE EXCEPTION 'Order has already been reviewed';
    END IF;

    IF p_tip_amount IS NULL OR p_tip_amount < 0 THEN
        RAISE EXCEPTION 'Nominal tip tidak valid';
    END IF;

    -- Process Tip if amount > 0 and a driver exists
    IF p_tip_amount > 0 AND v_driver_id IS NOT NULL THEN
        -- Lock both rows in a stable (id-sorted) order before mutating
        -- either, same deadlock-avoidance pattern as wallet_transfer.
        v_lock_first := LEAST(v_user_id, v_driver_id);
        v_lock_second := GREATEST(v_user_id, v_driver_id);
        PERFORM 1 FROM public.users WHERE id = v_lock_first FOR UPDATE;
        PERFORM 1 FROM public.users WHERE id = v_lock_second FOR UPDATE;

        -- Debit side: delegate to wallet_pay instead of reimplementing
        -- the balance check + decrement + transactions insert by hand.
        IF NOT wallet_pay(p_tip_amount, 'Tip untuk Driver (Order ' || p_order_id || ')') THEN
            RAISE EXCEPTION 'Saldo WiraPay tidak mencukupi untuk memberikan tip';
        END IF;

        -- Credit side: no existing RPC fits (wallet_transfer needs a
        -- phone number, not a user id), so credit directly, atomically,
        -- inside this same transaction as the debit above.
        UPDATE public.users
        SET wallet_balance = COALESCE(wallet_balance, 0) + p_tip_amount
        WHERE id = v_driver_id;

        INSERT INTO public.transactions (user_id, amount, type, status, description)
        VALUES (v_driver_id, p_tip_amount, 'transfer_in', 'success',
                'Tip dari Pelanggan (Order ' || p_order_id || ')');
    END IF;

    -- Insert Review
    INSERT INTO public.reviews (order_id, user_id, driver_id, merchant_id, rating, review_text, tip_amount)
    VALUES (p_order_id, v_user_id, v_driver_id, v_merchant_id, p_rating, p_review_text, p_tip_amount);

    -- Mark order as reviewed
    UPDATE public.orders SET is_reviewed = true WHERE id = p_order_id;

    RETURN TRUE;
END;
$$;

-- ============================================================
-- Note on consolidating the two review systems (0034 vs 0039)
-- ============================================================
-- migrations/0034 created a separate `public.driver_reviews` table, written
-- only by RidePage.jsx's old inline post-trip rating UI, which never set
-- `orders.is_reviewed` - so a ride could be reviewed twice through two
-- disconnected systems, and frontend-mitra's DriverProfilePage read ONLY
-- `driver_reviews`, so anything submitted through the newer
-- ActivityPage/ReviewModal flow never affected a driver's shown rating.
--
-- `driver_reviews` is confirmed live to contain 0 rows (checked via the
-- service-role key before writing this migration) - there is no historical
-- rating data to preserve, so no backfill migration is included. RidePage's
-- inline flow now calls this same `submit_review_and_tip` RPC (frontend
-- change, same commit) instead of inserting into `driver_reviews` directly,
-- and frontend-mitra's DriverProfilePage now reads `public.reviews`. The
-- `driver_reviews` table itself is left in place (unused, empty, harmless)
-- rather than dropped, in case any other code still references it -
-- grepped and confirmed nothing else does as of this migration.
