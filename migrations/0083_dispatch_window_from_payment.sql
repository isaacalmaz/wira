-- Migration 0083: measure the 30-minute dispatch window from payment.
-- dispatch_due_orders (0072) counted it from orders.created_at, so a QRIS
-- order (0077/0078) paid at minute 14 of its 15-minute payment window got
-- only ~16 minutes of driver/technician pings. New orders.paid_at is set
-- when the linked QRIS top-up pays the order; dispatch counts from
-- COALESCE(paid_at, created_at), so every other order is unchanged.
-- Clients may never set or change paid_at (it would extend dispatch).
-- Depends on 0072 and 0078. Safe to re-run.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Same as 0078 plus paid_at = NOW(). Never raises.
CREATE OR REPLACE FUNCTION public.pay_order_after_qris_topup()
RETURNS TRIGGER AS $$
DECLARE
    v_order RECORD;
BEGIN
    IF NEW.order_id IS NULL OR NEW.status <> 'approved' OR OLD.status = 'approved' THEN
        RETURN NULL;
    END IF;
    SELECT id, user_id, status, total_price, title INTO v_order
    FROM public.orders WHERE id = NEW.order_id FOR UPDATE;
    IF NOT FOUND OR v_order.status <> 'awaiting_payment' OR v_order.user_id IS DISTINCT FROM NEW.user_id THEN
        RETURN NULL;
    END IF;

    UPDATE public.users SET wallet_balance = wallet_balance - v_order.total_price
    WHERE id = v_order.user_id AND wallet_balance >= v_order.total_price;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    INSERT INTO public.transactions (user_id, amount, type, status, description, reference_id)
    VALUES (v_order.user_id, v_order.total_price, 'payment', 'success',
            'Pembayaran QRIS: ' || COALESCE(v_order.title, 'Pesanan'), v_order.id::text);
    UPDATE public.orders SET status = 'pending', payment_status = 'paid', paid_at = NOW()
    WHERE id = v_order.id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Same as 0072, window measured from payment when there was one.
CREATE OR REPLACE FUNCTION public.dispatch_due_orders(p_limit INT DEFAULT 20)
RETURNS SETOF UUID AS $$
    SELECT o.id FROM public.orders o
    WHERE o.status = 'pending' AND o.driver_id IS NULL
      AND o.service_type IN ('ride', 'send', 'pool', 'service')
      AND COALESCE(o.paid_at, o.created_at) > NOW() - INTERVAL '30 minutes'
      AND NOT EXISTS (SELECT 1 FROM public.order_dispatch_pings p
                      WHERE p.order_id = o.id AND p.pinged_at > NOW() - INTERVAL '15 seconds')
    ORDER BY o.created_at
    LIMIT p_limit;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.dispatch_due_orders(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_due_orders(INT) TO service_role;

-- 0070's state machine predates paid_at, so guard it separately: only the
-- payment trigger above (function owner) or service_role may write it.
CREATE OR REPLACE FUNCTION public.guard_orders_paid_at()
RETURNS TRIGGER AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') AND (
        (TG_OP = 'INSERT' AND NEW.paid_at IS NOT NULL)
        OR (TG_OP = 'UPDATE' AND NEW.paid_at IS DISTINCT FROM OLD.paid_at)
    ) THEN
        RAISE EXCEPTION 'paid_at cannot be set by clients';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_guard_orders_paid_at ON public.orders;
CREATE TRIGGER trg_guard_orders_paid_at BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_orders_paid_at();
