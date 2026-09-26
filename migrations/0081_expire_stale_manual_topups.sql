-- Migration 0081: expire abandoned manual (static QRIS) top-up requests.
-- The Mutasiku webhook (routes/mutasiku.js) only matches pending manual
-- requests created in the last 2 hours, but nothing ever closed the ones
-- nobody paid: they stayed 'pending' forever, kept their unique nominal
-- (0045's partial unique index) and still showed as pending in the wallet.
-- 0078's expire_awaiting_qris_orders() only cancelled order-linked ones.
-- Redefines it so every pending non-Midtrans request older than 2 hours is
-- cancelled (frees the nominal). Midtrans requests are keyed by order_id
-- with Midtrans and are never touched. Order expiry is unchanged. The
-- existing pg_cron job 'wira-expire-qris-orders' (0078, every minute)
-- keeps calling it, so no schedule change. Idempotent. Depends on 0078.

CREATE OR REPLACE FUNCTION public.expire_awaiting_qris_orders()
RETURNS VOID AS $$
    UPDATE public.orders SET status = 'cancelled'
    WHERE status = 'awaiting_payment' AND created_at < NOW() - INTERVAL '15 minutes';
    UPDATE public.topup_requests SET status = 'cancelled', updated_at = NOW()
    WHERE status = 'pending' AND method IS DISTINCT FROM 'midtrans'
      AND created_at < NOW() - INTERVAL '2 hours';
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.expire_awaiting_qris_orders() FROM PUBLIC, anon, authenticated;
