-- Migration 0100: admin control room (stage 1 of the admin overhaul).
--
-- Admins could see trouble but act on very little: the dashboard listed
-- partner applications and a stuck-order count, and only stuck orders had
-- action buttons. This adds:
--
--   * order_events: every status change of every order (who, from, to,
--     when) plus admin notes and actions with their reason, so an order's
--     story can be read in one place. Status rows are written by trigger;
--     admin rows by admin_order_action.
--   * admin_order_action(order, action, note, amount, charge_partner):
--       cancel      any open order; customer refunded when paid via Wira
--       complete    an open order that has a partner (partner is paid)
--       reassign    take the order off its partner and offer it again
--                   (ride/send/service/pool back to pending, food courier
--                   back to ready); not once the work has started
--       compensate  credit the customer's WiraPay for a finished or
--                   cancelled order, at most the order total in all;
--                   optionally taken from the partner's earnings
--       note        internal note (CS may add notes too)
--     Every action needs a reason and is written to order_events; the
--     customer (and partner, when it concerns them) is notified.
--   * admin_attention(): what is waiting for an admin, by kind, with how
--     many and since when (applications, villa listings, stuck orders,
--     unmatched orders, project disputes, payouts, top-ups, tickets, low
--     reviews).
--
-- Depends on 0088, 0089, 0093, 0096, 0097. Re-runnable.

-- Every admin-panel role (is_admin() from 0026 covers only the core ones).
CREATE OR REPLACE FUNCTION public.is_admin_panel()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (SELECT 1 FROM public.users
                   WHERE id = auth.uid()
                     AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops', 'Admin Keuangan', 'CS'));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.is_admin_panel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_panel() TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. Order timeline
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_events (
    id BIGSERIAL PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('status', 'cancel', 'complete', 'reassign', 'compensate', 'note')),
    from_status TEXT,
    to_status TEXT,
    actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    note TEXT,
    amount NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON public.order_events (order_id, created_at);
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_events_admin_read ON public.order_events;
CREATE POLICY order_events_admin_read ON public.order_events FOR SELECT USING (public.is_admin_panel());
REVOKE ALL ON public.order_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.order_events FROM authenticated;
GRANT SELECT ON public.order_events TO authenticated;

CREATE OR REPLACE FUNCTION public.log_order_status_event()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO public.order_events (order_id, kind, from_status, to_status, actor_id)
        VALUES (NEW.id, 'status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status, auth.uid());
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_log_order_status_event ON public.orders;
CREATE TRIGGER trg_log_order_status_event AFTER INSERT OR UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.log_order_status_event();

-- ---------------------------------------------------------------------------
-- 2. Admin actions on any order
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_order_action(
    p_order_id UUID, p_action TEXT, p_note TEXT,
    p_amount NUMERIC DEFAULT NULL, p_charge_partner BOOLEAN DEFAULT false
)
RETURNS JSONB AS $$
DECLARE
    o RECORD;
    v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
    v_refund NUMERIC := 0;
    v_paid_comp NUMERIC;
    v_partner UUID;
    v_title TEXT;
BEGIN
    IF p_action = 'note' THEN
        IF NOT public.is_admin_panel() THEN
            RAISE EXCEPTION 'Khusus admin' USING ERRCODE = '42501';
        END IF;
    ELSIF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin inti yang bisa mengubah pesanan' USING ERRCODE = '42501';
    END IF;
    IF p_action NOT IN ('cancel', 'complete', 'reassign', 'compensate', 'note') THEN
        RAISE EXCEPTION 'Aksi tidak dikenal: %', p_action;
    END IF;
    IF v_note IS NULL OR length(v_note) < 5 THEN
        RAISE EXCEPTION 'Tulis alasan atau catatan (minimal 5 karakter)';
    END IF;

    SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;
    v_title := COALESCE(o.title, 'Pesanan Anda');
    IF o.driver_id IS NOT NULL THEN
        v_partner := o.driver_id;
    ELSIF o.merchant_id IS NOT NULL THEN
        SELECT owner_id INTO v_partner FROM public.merchants WHERE id = o.merchant_id;
    END IF;

    IF p_action = 'note' THEN
        INSERT INTO public.order_events (order_id, kind, actor_id, note) VALUES (p_order_id, 'note', auth.uid(), v_note);
        RETURN jsonb_build_object('ok', true);
    END IF;

    IF p_action IN ('cancel', 'complete', 'reassign') AND o.status IN ('completed', 'cancelled', 'expired') THEN
        RAISE EXCEPTION 'Pesanan ini sudah %', o.status;
    END IF;

    IF p_action = 'cancel' THEN
        v_refund := public.refund_order_to_wallet(p_order_id, 'Refund Pembatalan oleh Admin');
        UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (o.user_id, 'Pesanan dibatalkan oleh admin',
                v_title || ' dibatalkan oleh tim Wira.'
                || CASE WHEN v_refund > 0 THEN ' Saldo WiraPay ' || public.format_rupiah(v_refund) || ' sudah dikembalikan.' ELSE '' END
                || ' Alasan: ' || v_note, false);
        IF v_partner IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, title, description, is_read)
            VALUES (v_partner, 'Pesanan dibatalkan oleh admin', v_title || ' dibatalkan. Alasan: ' || v_note, false);
        END IF;
        INSERT INTO public.order_events (order_id, kind, from_status, to_status, actor_id, note, amount)
        VALUES (p_order_id, 'cancel', o.status, 'cancelled', auth.uid(), v_note, NULLIF(v_refund, 0));
        RETURN jsonb_build_object('status', 'cancelled', 'refunded', v_refund);
    END IF;

    IF p_action = 'complete' THEN
        IF v_partner IS NULL THEN
            RAISE EXCEPTION 'Pesanan belum punya mitra; batalkan saja';
        END IF;
        UPDATE public.orders SET status = 'completed' WHERE id = p_order_id;
        INSERT INTO public.order_events (order_id, kind, from_status, to_status, actor_id, note)
        VALUES (p_order_id, 'complete', o.status, 'completed', auth.uid(), v_note);
        RETURN jsonb_build_object('status', 'completed');
    END IF;

    IF p_action = 'reassign' THEN
        IF o.driver_id IS NULL THEN
            RAISE EXCEPTION 'Pesanan ini belum punya driver/teknisi';
        END IF;
        IF o.service_type IN ('food', 'WiraFood') THEN
            IF o.status <> 'picking_up' THEN
                RAISE EXCEPTION 'Kurir hanya bisa diganti sebelum makanan diambil (status sekarang: %)', o.status;
            END IF;
            UPDATE public.orders SET status = 'ready', driver_id = NULL WHERE id = p_order_id;
        ELSIF o.service_type IN ('ride', 'send', 'service', 'pool') THEN
            IF o.status NOT IN ('accepted', 'on_the_way', 'picking_up') THEN
                RAISE EXCEPTION 'Mitra tidak bisa diganti setelah pekerjaan dimulai (status sekarang: %)', o.status;
            END IF;
            UPDATE public.orders
            SET status = 'pending', driver_id = NULL, accepted_at = NULL,
                preferred_partner_id = CASE WHEN preferred_partner_id = o.driver_id THEN NULL ELSE preferred_partner_id END
            WHERE id = p_order_id;
        ELSE
            RAISE EXCEPTION 'Layanan ini tidak memakai driver/teknisi';
        END IF;
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (o.driver_id, 'Pesanan dialihkan oleh admin', v_title || ' dialihkan ke mitra lain. Alasan: ' || v_note, false),
               (o.user_id, 'Kami carikan mitra lain', 'Tim Wira sedang mencarikan mitra baru untuk ' || v_title || '.', false);
        INSERT INTO public.order_events (order_id, kind, from_status, to_status, actor_id, note)
        VALUES (p_order_id, 'reassign', o.status,
                CASE WHEN o.service_type IN ('food', 'WiraFood') THEN 'ready' ELSE 'pending' END, auth.uid(), v_note);
        RETURN jsonb_build_object('status', CASE WHEN o.service_type IN ('food', 'WiraFood') THEN 'ready' ELSE 'pending' END);
    END IF;

    -- compensate
    IF o.status NOT IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'Kompensasi hanya untuk pesanan yang sudah selesai atau dibatalkan';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Isi nominal kompensasi';
    END IF;
    -- Already returned: earlier compensation plus a full refund, if any.
    SELECT COALESCE(SUM(amount), 0) INTO v_paid_comp FROM public.order_events
    WHERE order_id = p_order_id AND kind = 'compensate';
    IF o.payment_status = 'refunded' THEN
        v_paid_comp := v_paid_comp + COALESCE(o.total_price, 0);
    END IF;
    IF v_paid_comp + p_amount > COALESCE(o.total_price, 0) THEN
        RAISE EXCEPTION 'Total pengembalian melebihi nilai pesanan (%; sudah %)',
            public.format_rupiah(o.total_price), public.format_rupiah(v_paid_comp);
    END IF;
    IF p_charge_partner AND v_partner IS NULL THEN
        RAISE EXCEPTION 'Pesanan ini tidak punya mitra untuk dibebankan';
    END IF;

    UPDATE public.users SET wallet_balance = wallet_balance + p_amount WHERE id = o.user_id;
    INSERT INTO public.transactions (user_id, type, amount, status, description, created_at, reference_id)
    VALUES (o.user_id, 'refund', p_amount, 'success', 'Kompensasi pesanan: ' || v_title, NOW(), p_order_id::text);
    INSERT INTO public.notifications (user_id, title, description, is_read)
    VALUES (o.user_id, 'Kompensasi dari Wira',
            public.format_rupiah(p_amount) || ' masuk ke saldo WiraPay Anda untuk ' || v_title || '. ' || v_note, false);
    IF p_charge_partner THEN
        UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) - p_amount WHERE id = v_partner;
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (v_partner, 'Potongan kompensasi pelanggan',
                public.format_rupiah(p_amount) || ' dipotong dari saldo pendapatan untuk ' || v_title || '. Alasan: ' || v_note, false);
    END IF;
    INSERT INTO public.order_events (order_id, kind, actor_id, note, amount)
    VALUES (p_order_id, 'compensate', auth.uid(),
            v_note || CASE WHEN p_charge_partner THEN ' (dibebankan ke mitra)' ELSE ' (ditanggung Wira)' END, p_amount);
    RETURN jsonb_build_object('compensated', p_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_order_action(UUID, TEXT, TEXT, NUMERIC, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_order_action(UUID, TEXT, TEXT, NUMERIC, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. What is waiting for an admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_attention()
RETURNS JSONB AS $$
DECLARE
    v JSONB;
BEGIN
    IF NOT public.is_admin_panel() THEN
        RAISE EXCEPTION 'Khusus admin' USING ERRCODE = '42501';
    END IF;
    SELECT jsonb_build_object(
        'applications', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(created_at),
                                 'by_role', COALESCE(jsonb_object_agg(role, n) FILTER (WHERE role IS NOT NULL), '{}'::jsonb))
                         FROM (SELECT role, COUNT(*) AS n, MIN(created_at) AS created_at
                               FROM public.mitra_applications WHERE status = 'Pending' GROUP BY role) a),
        'villa_listings', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(submitted_at))
                           FROM public.merchants WHERE listing_status = 'pending'),
        'stale_orders', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(last_change))
                         FROM public.admin_stale_orders(60)),
        'unmatched_orders', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(COALESCE(paid_at, created_at)))
                             FROM public.orders
                             WHERE status = 'pending' AND driver_id IS NULL
                               AND service_type IN ('ride', 'send', 'food', 'service', 'pool')
                               AND scheduled_at IS NULL
                               AND COALESCE(paid_at, created_at) < NOW() - INTERVAL '10 minutes'),
        'disputes', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(submitted_at))
                     FROM public.project_milestones WHERE status = 'disputed'),
        'payouts', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(created_at), 'amount', COALESCE(SUM(amount), 0))
                    FROM public.payout_requests WHERE status = 'pending'),
        'topups', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(created_at), 'amount', COALESCE(SUM(amount), 0))
                   FROM public.topup_requests WHERE status = 'pending'),
        'tickets', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(created_at))
                    FROM public.support_tickets WHERE status IN ('open', 'in_progress')),
        'low_reviews', (SELECT jsonb_build_object('count', COUNT(*), 'oldest', MIN(created_at))
                        FROM public.reviews
                        WHERE rating <= 2 AND NOT COALESCE(is_hidden, false) AND created_at > NOW() - INTERVAL '7 days')
    ) INTO v;
    RETURN v;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_attention() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_attention() TO authenticated;

-- Verify after applying:
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_log_order_status_event';  -> 1 row
--   (as an admin, from the app) SELECT admin_attention();
