-- Migration 0078: pay an order directly with the static QRIS (part 2 of 2).
-- Pays an 'awaiting_payment' order (0077) when its linked top-up is
-- approved, lets the customer cancel it, expires it after 15 minutes, and
-- stops clients from moving an unpaid order anywhere else. Depends on 0077.

-- DEFERRED: runs at commit, after the approval function has credited the
-- wallet (0071 and 0022 both flip the request status BEFORE crediting).
-- Never raises: if the order was cancelled/expired meanwhile, the money
-- simply stays in the customer's WiraPay balance.
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
    UPDATE public.orders SET status = 'pending', payment_status = 'paid' WHERE id = v_order.id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_pay_order_after_qris_topup ON public.topup_requests;
CREATE CONSTRAINT TRIGGER trg_pay_order_after_qris_topup
    AFTER UPDATE OF status ON public.topup_requests DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.pay_order_after_qris_topup();

-- Clients (customer, mitra) may only cancel an unpaid order; only the
-- payment above (runs as the function owner) moves it on to 'pending'.
CREATE OR REPLACE FUNCTION public.guard_awaiting_payment_orders()
RETURNS TRIGGER AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') AND (
        (OLD.status = 'awaiting_payment' AND NEW.status NOT IN ('awaiting_payment', 'cancelled'))
        OR (OLD.status = 'awaiting_payment' AND NEW.driver_id IS NOT NULL)
        OR (OLD.status <> 'awaiting_payment' AND NEW.status = 'awaiting_payment')
    ) THEN
        RAISE EXCEPTION 'Pesanan ini belum dibayar';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_guard_awaiting_payment_orders ON public.orders;
CREATE TRIGGER trg_guard_awaiting_payment_orders BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_awaiting_payment_orders();

CREATE OR REPLACE FUNCTION public.cancel_awaiting_qris_order(p_order_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.orders SET status = 'cancelled'
    WHERE id = p_order_id AND user_id = auth.uid() AND status = 'awaiting_payment';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan ini tidak sedang menunggu pembayaran QRIS';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.cancel_awaiting_qris_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_awaiting_qris_order(UUID) TO authenticated;

-- Unpaid after 15 minutes -> cancelled. The top-up request stays matchable
-- for the webhook's 2-hour window (routes/mutasiku.js), so a late payment
-- still lands in the wallet; after that its unique nominal is released.
CREATE OR REPLACE FUNCTION public.expire_awaiting_qris_orders()
RETURNS VOID AS $$
    UPDATE public.orders SET status = 'cancelled'
    WHERE status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '15 minutes';
    UPDATE public.topup_requests SET status = 'cancelled', updated_at = NOW()
    WHERE status = 'pending' AND order_id IS NOT NULL AND created_at < NOW() - INTERVAL '2 hours';
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.expire_awaiting_qris_orders() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('wira-expire-qris-orders', '* * * * *', 'SELECT public.expire_awaiting_qris_orders()');
