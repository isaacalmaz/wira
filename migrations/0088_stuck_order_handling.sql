-- Migration 0088: orders no longer hang forever.
--
-- Three gaps made orders stick (two test orders sat in picking_up/in_trip for
-- 5-9 days and had to be cancelled by hand in SQL):
--   a) 'pending' with no partner: dispatch (0072/0083) stops offering after
--      30 minutes, but nothing ever closed the order, so a WiraPay/QRIS
--      payment stayed locked. Only QRIS 'awaiting_payment' had an expiry.
--   b) an accepted order whose partner stopped updating it had no timeout,
--      the customer could cancel only in the first 3 minutes, and admins had
--      no tool to resolve it.
--   c) nothing recorded when an order's status last changed, so "stuck"
--      could not even be detected (orders.updated_at has no trigger).
-- Owner's decisions (2026-10-01): auto-cancel + refund after 30 minutes
-- without a partner; flag stuck active orders for admins with resolve
-- buttons (no automatic money decisions); let the customer cancel for free
-- when the partner has not picked them up 20 minutes after accepting.
--
-- Also fixes: a paid QRIS order is debited from the wallet (0078/0083
-- pay_order_after_qris_topup) but wallet_refund_matched_ride only refunded
-- payment_method = 'wallet', so cancelling a paid QRIS order refunded
-- nothing. All refunds now go through refund_order_to_wallet().
--
-- Re-runnable. Needs pg_cron (already used by 0073/0078).

-- ---------------------------------------------------------------------------
-- 1. When did the status last change?
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
UPDATE public.orders
SET status_changed_at = COALESCE(accepted_at, paid_at, created_at)
WHERE status_changed_at IS NULL;
ALTER TABLE public.orders ALTER COLUMN status_changed_at SET DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.touch_order_status_changed_at()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.status_changed_at := NOW();
    ELSE
        -- Server-owned: a client update can't move it.
        NEW.status_changed_at := OLD.status_changed_at;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_order_status_changed_at ON public.orders;
CREATE TRIGGER trg_touch_order_status_changed_at
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.touch_order_status_changed_at();

-- ---------------------------------------------------------------------------
-- 2. One refund path. Idempotent: only a 'paid' order is refunded, and it
--    becomes 'refunded'. WiraPay and paid QRIS orders were both debited from
--    the wallet; cash was never collected by Wira, so nothing to return.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_order_to_wallet(p_order_id UUID, p_description TEXT)
RETURNS NUMERIC AS $$
DECLARE
    v RECORD;
BEGIN
    SELECT id, user_id, total_price, payment_method, payment_status
    INTO v FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    IF v.payment_status = 'paid' AND v.payment_method IN ('wallet', 'qris') AND COALESCE(v.total_price, 0) > 0 THEN
        UPDATE public.users SET wallet_balance = wallet_balance + v.total_price WHERE id = v.user_id;
        INSERT INTO public.transactions (user_id, type, amount, status, description, created_at, reference_id)
        VALUES (v.user_id, 'refund', v.total_price, 'success', p_description, NOW(), p_order_id::text);
        UPDATE public.orders SET payment_status = 'refunded' WHERE id = p_order_id;
        RETURN v.total_price;
    END IF;
    RETURN 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.refund_order_to_wallet(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- "Rp 65.000" for notification text.
CREATE OR REPLACE FUNCTION public.format_rupiah(p_amount NUMERIC)
RETURNS TEXT AS $$
    SELECT 'Rp ' || replace(to_char(round(COALESCE(p_amount, 0)), 'FM999,999,999,990'), ',', '.');
$$ LANGUAGE sql IMMUTABLE;

-- ---------------------------------------------------------------------------
-- 3. (a) No partner 30 minutes after the order became payable -> cancelled,
--    refunded, customer notified. Villa bookings are confirmed by the owner
--    on their own schedule and are left alone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_unmatched_orders()
RETURNS INT AS $$
DECLARE
    r RECORD;
    v_refund NUMERIC;
    n INT := 0;
BEGIN
    FOR r IN
        SELECT id, user_id, title
        FROM public.orders
        WHERE status = 'pending'
          AND driver_id IS NULL
          AND service_type IN ('ride', 'send', 'food', 'service', 'pool')
          AND COALESCE(paid_at, created_at) < NOW() - INTERVAL '30 minutes'
        FOR UPDATE SKIP LOCKED
    LOOP
        v_refund := public.refund_order_to_wallet(r.id, 'Refund Pembatalan Otomatis (Tidak Ada Mitra)');
        UPDATE public.orders SET status = 'cancelled' WHERE id = r.id AND status = 'pending';
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (
            r.user_id,
            'Pesanan dibatalkan otomatis',
            'Belum ada mitra yang tersedia untuk ' || COALESCE(r.title, 'pesanan Anda') || '. '
            || CASE WHEN v_refund > 0
                    THEN 'Saldo WiraPay ' || public.format_rupiah(v_refund) || ' sudah dikembalikan.'
                    ELSE 'Silakan coba pesan lagi.' END,
            false
        );
        n := n + 1;
    END LOOP;
    RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.expire_unmatched_orders() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('wira-expire-unmatched-orders', '* * * * *', 'SELECT public.expire_unmatched_orders()');

-- ---------------------------------------------------------------------------
-- 4. (b) Customer / driver cancellation (replaces 0066's body).
--    Customer: free while pending, in the first 3 minutes after a partner
--    accepts, and again once 20 minutes have passed without the pickup
--    (status still accepted / picking_up). Driver: unchanged, the order goes
--    back to the queue.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wallet_refund_matched_ride(p_order_id UUID, p_description TEXT DEFAULT 'Refund Pembatalan Perjalanan')
RETURNS BOOLEAN AS $$
DECLARE
    v_order RECORD;
    v_caller UUID := auth.uid();
    v_is_driver BOOLEAN;
    v_since INTERVAL;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Anda harus login untuk membatalkan perjalanan';
    END IF;

    SELECT id, user_id, driver_id, status, accepted_at
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;

    v_is_driver := (v_order.driver_id IS NOT NULL AND v_order.driver_id = v_caller);

    IF v_order.user_id IS DISTINCT FROM v_caller AND NOT v_is_driver THEN
        RAISE EXCEPTION 'Anda tidak berhak membatalkan pesanan ini';
    END IF;

    IF v_order.status = 'in_trip' THEN
        RAISE EXCEPTION 'Perjalanan sudah dimulai (penumpang sudah dijemput), tidak bisa dibatalkan lagi. Hubungi CS jika ada masalah.';
    ELSIF v_order.status NOT IN ('pending', 'accepted', 'picking_up') THEN
        RAISE EXCEPTION 'Pesanan ini sudah tidak bisa dibatalkan (status saat ini: %)', v_order.status;
    END IF;

    IF NOT v_is_driver AND v_order.status IN ('accepted', 'picking_up') AND v_order.accepted_at IS NOT NULL THEN
        v_since := NOW() - v_order.accepted_at;
        IF v_since > INTERVAL '3 minutes' AND v_since < INTERVAL '20 minutes' THEN
            RAISE EXCEPTION 'Mitra sedang menuju lokasi Anda. Pembatalan gratis tersedia lagi jika Anda belum dijemput 20 menit setelah pesanan diterima.';
        END IF;
    END IF;

    IF v_is_driver THEN
        UPDATE public.orders
        SET status = 'pending',
            driver_id = NULL,
            accepted_at = NULL
        WHERE id = p_order_id;
        RETURN TRUE;
    END IF;

    PERFORM public.refund_order_to_wallet(p_order_id, p_description);
    UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 5. (b) Admin: list stuck orders and resolve them.
--    "Stuck" = an active order whose status has not changed for longer than
--    p_minutes (real-time services: ride, send, food) or 48 hours (service
--    and pool visits, which can be booked days ahead). Villa stays excluded.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_stale_orders(p_minutes INT DEFAULT 60)
RETURNS TABLE (
    order_id UUID, service_type TEXT, order_status TEXT, title TEXT,
    total_price NUMERIC, payment_method TEXT, payment_status TEXT,
    customer_name TEXT, partner_name TEXT, last_change TIMESTAMPTZ
) AS $$
    SELECT o.id, o.service_type::text, o.status::text, o.title::text,
           o.total_price::numeric, o.payment_method::text, o.payment_status::text,
           cu.name::text, pu.name::text, o.status_changed_at
    FROM public.orders o
    LEFT JOIN public.users cu ON cu.id = o.user_id
    LEFT JOIN public.users pu ON pu.id = o.driver_id
    WHERE EXISTS (
            SELECT 1 FROM public.users a
            WHERE a.id = auth.uid()
              AND a.role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops', 'Admin Keuangan', 'CS'))
      AND o.status NOT IN ('pending', 'awaiting_payment', 'completed', 'cancelled', 'expired')
      AND COALESCE(o.service_type, '') <> 'villa'
      AND o.status_changed_at < NOW() - CASE
              WHEN o.service_type IN ('service', 'pool') THEN INTERVAL '48 hours'
              ELSE make_interval(mins => GREATEST(p_minutes, 15))
          END
    ORDER BY o.status_changed_at;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_stale_orders(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stale_orders(INT) TO authenticated;

-- p_action: 'complete' (partner is paid by 0028's trigger, as if they had
-- finished it) or 'cancel' (customer refunded if they paid through Wira).
-- Only roles that is_admin() (0026) recognises, since the state machine
-- (0054) requires is_admin() to mark an order completed.
CREATE OR REPLACE FUNCTION public.admin_resolve_order(p_order_id UUID, p_action TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v RECORD;
    v_refund NUMERIC := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin yang bisa menyelesaikan pesanan' USING ERRCODE = '42501';
    END IF;
    IF p_action NOT IN ('complete', 'cancel') THEN
        RAISE EXCEPTION 'Aksi tidak dikenal: %', p_action;
    END IF;

    SELECT id, user_id, status, title INTO v FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;
    IF v.status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'Pesanan ini sudah %', v.status;
    END IF;

    IF p_action = 'complete' THEN
        UPDATE public.orders SET status = 'completed' WHERE id = p_order_id;
    ELSE
        v_refund := public.refund_order_to_wallet(p_order_id, 'Refund Pembatalan oleh Admin');
        UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (
            v.user_id,
            'Pesanan dibatalkan oleh admin',
            COALESCE(v.title, 'Pesanan Anda') || ' dibatalkan oleh tim Wira.'
            || CASE WHEN v_refund > 0 THEN ' Saldo WiraPay ' || public.format_rupiah(v_refund) || ' sudah dikembalikan.' ELSE '' END
            || CASE WHEN NULLIF(trim(p_note), '') IS NOT NULL THEN ' Catatan: ' || trim(p_note) ELSE '' END,
            false
        );
    END IF;

    RETURN jsonb_build_object('status', CASE WHEN p_action = 'complete' THEN 'completed' ELSE 'cancelled' END, 'refunded', v_refund);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_resolve_order(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_order(UUID, TEXT, TEXT) TO authenticated;
