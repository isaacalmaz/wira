-- =========================================
-- Migration 0135: extra costs on a QRIS-paid order are paid in cash
-- =========================================
-- The owner's decision (2026-10-14, option A): when a customer approves an
-- extra cost (material, jasa, quote) on an order that was already paid by
-- QRIS, they pay that extra in cash to the partner on the spot, like villa
-- special requests (0132).
--
-- Before: respond_order_adjustment took the extra from the customer's
-- WiraPay balance. WiraPay is off (0134) and can't be topped up, so every
-- approval of an extra on a QRIS-paid Pool package failed with "Saldo
-- WiraPay belum cukup".
--
-- Now, while WiraPay is off (wallet_enabled() = false):
--   * the extra is approved and marked order_adjustments.paid_cash = true;
--   * orders.total_price stays what Wira received by QRIS, so
--     credit_payout_on_order_completed pays the partner only for that part;
--   * when the order completes, trg_cash_extras_commission takes the
--     commission on the cash jasa/quote extras from the partner's
--     payable_balance (materials are never cut). Villa requests keep their
--     own trigger (0132, trg_villa_extras_commission).
-- With WiraPay on again the old wallet charge is used unchanged.
-- Cash orders are unchanged: the extra is added to total_price as before.
--
-- Verify:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'order_adjustments' AND column_name = 'paid_cash';
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_cash_extras_commission';
-- =========================================

ALTER TABLE public.order_adjustments ADD COLUMN IF NOT EXISTS paid_cash BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.respond_order_adjustment(p_adjustment_id uuid, p_approve boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_adj RECORD;
    v_order RECORD;
    v_paid_online BOOLEAN;
    v_open TEXT[];
    v_partner UUID;
BEGIN
    SELECT * INTO v_adj FROM public.order_adjustments WHERE id = p_adjustment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pengajuan tidak ditemukan';
    END IF;
    SELECT id, user_id, driver_id, merchant_id, status, payment_method, payment_status, title, service_type, rate_code INTO v_order
    FROM public.orders WHERE id = v_adj.order_id FOR UPDATE;
    -- 0132: a villa request is answered to the host.
    v_partner := COALESCE(v_order.driver_id, (SELECT owner_id FROM public.merchants WHERE id = v_order.merchant_id));
    IF v_adj.kind = 'sewa' THEN
        RAISE EXCEPTION 'Permintaan tambah waktu dijawab oleh sopir';
    END IF;
    IF v_order.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Anda tidak berhak menjawab pengajuan ini';
    END IF;
    IF v_adj.status <> 'pending' THEN
        RAISE EXCEPTION 'Pengajuan ini sudah dijawab';
    END IF;

    v_open := CASE
        WHEN v_order.service_type = 'send' AND v_adj.kind = 'quote' THEN ARRAY['accepted']
        WHEN v_order.service_type = 'send' AND v_adj.kind = 'belanja' THEN ARRAY['picking_up']
        WHEN v_order.service_type = 'send' THEN ARRAY['picking_up', 'in_trip']
        WHEN v_order.service_type IN ('villa', 'WiraVilla') THEN ARRAY['pending', 'accepted']
        ELSE ARRAY['on_the_way', 'working'] END;
    IF NOT (v_order.status = ANY (v_open)) THEN
        UPDATE public.order_adjustments SET status = 'cancelled', decided_at = NOW() WHERE id = p_adjustment_id;
        RETURN 'cancelled';
    END IF;

    IF NOT p_approve THEN
        IF v_adj.kind = 'belanja' THEN
            RAISE EXCEPTION 'Barang sudah dibeli. Kalau ada yang salah, chat driver atau CS Wira.';
        END IF;
        UPDATE public.order_adjustments SET status = 'rejected', decided_at = NOW() WHERE id = p_adjustment_id;
        IF v_order.service_type = 'send' AND v_adj.kind = 'quote' THEN
            UPDATE public.orders SET status = 'cancelled', updated_at = NOW() WHERE id = v_order.id;
            INSERT INTO public.order_events (order_id, kind, from_status, to_status, actor_id, note)
            VALUES (v_order.id, 'note', v_order.status, 'cancelled', auth.uid(), 'Pelanggan menolak penawaran barang besar');
            PERFORM public.notify_user(v_partner, 'Penawaran ditolak',
                'Pelanggan menolak ' || public.format_rupiah(v_adj.amount) || ' untuk ' || COALESCE(v_order.title, 'barang besar')
                || '. Pesanan dibatalkan tanpa biaya.', '/driver');
            RETURN 'rejected';
        END IF;
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (v_partner, CASE WHEN v_adj.kind = 'villa' THEN 'Permintaan khusus ditolak' ELSE 'Biaya tambahan ditolak' END,
                'Pelanggan menolak ' || public.format_rupiah(v_adj.amount) || ' untuk ' || v_adj.description || '.', false);
        RETURN 'rejected';
    END IF;

    v_paid_online := v_order.payment_method IN ('wallet', 'qris') AND v_order.payment_status = 'paid';
    -- 0132: villa requests on a booking paid by QRIS are paid in cash to the
    -- host on arrival; the total stays as paid and villa_extras_commission
    -- charges the host's commission on them when the stay completes.
    IF v_adj.kind = 'villa' AND v_order.payment_method <> 'cash' THEN
        UPDATE public.order_adjustments SET status = 'approved', decided_at = NOW() WHERE id = p_adjustment_id;
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (v_partner, 'Permintaan khusus disetujui',
                public.format_rupiah(v_adj.amount) || ' untuk permintaan khusus disetujui tamu. Terima pembayarannya tunai saat tamu tiba.', false);
        RETURN 'approved';
    END IF;
    -- 0135: on an order paid by QRIS (WiraPay off) the extra is paid in cash
    -- to the partner. total_price stays what Wira received; the commission
    -- on cash jasa/quote extras is taken at completion (cash_extras_commission).
    IF v_paid_online AND v_adj.amount > 0 AND v_adj.kind <> 'belanja' AND NOT public.wallet_enabled() THEN
        UPDATE public.order_adjustments SET status = 'approved', decided_at = NOW(), paid_cash = true
        WHERE id = p_adjustment_id;
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (v_partner,
                CASE v_adj.kind WHEN 'quote' THEN 'Penawaran disetujui' ELSE 'Biaya tambahan disetujui' END,
                public.format_rupiah(v_adj.amount) || ' untuk ' || v_adj.description
                || ' disetujui. Terima pembayarannya tunai dari pelanggan.',
                false);
        RETURN 'approved';
    END IF;
    IF v_paid_online AND v_adj.amount > 0 THEN
        UPDATE public.users SET wallet_balance = wallet_balance - v_adj.amount
        WHERE id = v_order.user_id AND wallet_balance >= v_adj.amount;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Saldo WiraPay belum cukup untuk %. Isi saldo dulu, lalu setujui lagi.', public.format_rupiah(v_adj.amount);
        END IF;
        INSERT INTO public.transactions (user_id, amount, type, status, description, reference_id)
        VALUES (v_order.user_id, v_adj.amount, 'payment', 'success',
                'Biaya tambahan: ' || v_adj.description, v_order.id::text);
    END IF;

    PERFORM set_config('wira.price_adjustment', 'on', true);
    UPDATE public.orders
    SET total_price = total_price + v_adj.amount,
        material_amount = material_amount + CASE WHEN v_adj.kind IN ('material', 'belanja') THEN v_adj.amount ELSE 0 END
    WHERE id = v_order.id;
    PERFORM set_config('wira.price_adjustment', 'off', true);

    UPDATE public.order_adjustments SET status = 'approved', decided_at = NOW() WHERE id = p_adjustment_id;
    INSERT INTO public.notifications (user_id, title, description, is_read)
    VALUES (v_partner,
            CASE v_adj.kind WHEN 'belanja' THEN 'Total belanja disetujui' WHEN 'quote' THEN 'Penawaran disetujui' WHEN 'villa' THEN 'Permintaan khusus disetujui' ELSE 'Biaya tambahan disetujui' END,
            CASE v_adj.kind
                WHEN 'belanja' THEN 'Pelanggan menyetujui belanja ' || public.format_rupiah(v_adj.amount) || '. Silakan antar sekarang.'
                ELSE public.format_rupiah(v_adj.amount) || ' untuk ' || v_adj.description
                     || CASE WHEN v_paid_online THEN ' sudah dibayar lewat WiraPay.' ELSE '. Terima pembayarannya tunai dari pelanggan.' END
            END,
            false);
    RETURN 'approved';
END;
$function$;

-- Commission on the cash extras of a non-cash order, when it completes.
-- The partner holds that cash, so the commission comes off what Wira owes
-- them for the QRIS part (payable_balance). Materials carry no commission.
CREATE OR REPLACE FUNCTION public.cash_extras_commission()
RETURNS TRIGGER AS $$
DECLARE
    v_extra NUMERIC;
BEGIN
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
       AND NEW.payment_method <> 'cash' AND NEW.driver_id IS NOT NULL THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_extra FROM public.order_adjustments
        WHERE order_id = NEW.id AND status = 'approved' AND paid_cash AND kind <> 'material';
        IF v_extra > 0 THEN
            UPDATE public.users
            SET payable_balance = COALESCE(payable_balance, 0)
                - ROUND(v_extra * COALESCE(NEW.commission_rate, public.platform_commission_rate(NEW.service_type)))
            WHERE id = NEW.driver_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.cash_extras_commission() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cash_extras_commission ON public.orders;
CREATE TRIGGER trg_cash_extras_commission
    AFTER UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.cash_extras_commission();
