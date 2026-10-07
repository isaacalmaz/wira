-- =========================================
-- 0108: payments confirmed by hand, admins told right away
--
--   * app_settings (key/value, readable by signed-in users):
--       topup_auto_confirm         false = the Mutasiku webhook no longer
--                                  approves anything (backend/routes/
--                                  mutasiku.js reads it); admins approve
--                                  top-ups in Keuangan. true = as before.
--       qris_order_window_minutes  how long a QRIS-paid order (villa, pool)
--                                  waits for payment before it is cancelled;
--                                  60 (was 15) so an admin can confirm it.
--   * admin_set_app_setting(key, value): core + finance admins, audited.
--   * expire_awaiting_qris_orders (0081) uses the window above; every
--     unpaid manual top-up, order-linked or not, stays open 24 hours so a
--     late confirmation still lands (in the wallet if the order expired).
--   * New top-up request (wallet or QRIS order payment) -> notification +
--     push to every admin incl. Admin Keuangan, opening /finance (0096's
--     pipeline). Payout requests were already alerted (0096).
-- Depends on 0081, 0096, 0101, 0102.
-- =========================================

CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);
INSERT INTO public.app_settings (key, value) VALUES
    ('topup_auto_confirm', 'false'::jsonb),
    ('qris_order_window_minutes', '60'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_settings_read ON public.app_settings;
CREATE POLICY app_settings_read ON public.app_settings FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.app_setting_int(p_key TEXT, p_default INT)
RETURNS INT AS $$
    SELECT COALESCE((SELECT (value #>> '{}')::INT FROM public.app_settings WHERE key = p_key), p_default);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_set_app_setting(p_key TEXT, p_value JSONB)
RETURNS JSONB AS $$
DECLARE
    v_old JSONB;
BEGIN
    IF NOT (public.admin_can('core') OR public.admin_can('finance')) THEN
        RAISE EXCEPTION 'Khusus admin inti atau keuangan' USING ERRCODE = '42501';
    END IF;
    IF p_key = 'topup_auto_confirm' AND jsonb_typeof(p_value) <> 'boolean' THEN
        RAISE EXCEPTION 'Nilai harus true atau false';
    ELSIF p_key = 'qris_order_window_minutes'
          AND (jsonb_typeof(p_value) <> 'number' OR (p_value #>> '{}')::NUMERIC NOT BETWEEN 15 AND 240) THEN
        RAISE EXCEPTION 'Batas waktu pembayaran harus 15 sampai 240 menit';
    ELSIF p_key NOT IN ('topup_auto_confirm', 'qris_order_window_minutes') THEN
        RAISE EXCEPTION 'Pengaturan % tidak dikenal', p_key;
    END IF;

    SELECT value INTO v_old FROM public.app_settings WHERE key = p_key FOR UPDATE;
    UPDATE public.app_settings SET value = p_value, updated_at = NOW(), updated_by = auth.uid() WHERE key = p_key;
    PERFORM public.log_admin_action('app_setting_changed', 'app_setting', p_key, NULL, NULL,
                                    jsonb_build_object('from', v_old, 'to', p_value));
    RETURN jsonb_build_object('key', p_key, 'value', p_value);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_set_app_setting(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_app_setting(TEXT, JSONB) TO authenticated;

-- 0081 with the configurable order window; manual top-ups all get 24 hours.
CREATE OR REPLACE FUNCTION public.expire_awaiting_qris_orders()
RETURNS VOID AS $$
    UPDATE public.orders SET status = 'cancelled'
    WHERE status = 'awaiting_payment'
      AND created_at < NOW() - make_interval(mins => public.app_setting_int('qris_order_window_minutes', 60));
    UPDATE public.topup_requests SET status = 'cancelled', updated_at = NOW()
    WHERE status = 'pending' AND method IS DISTINCT FROM 'midtrans'
      AND created_at < NOW() - INTERVAL '24 hours';
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.expire_awaiting_qris_orders() FROM PUBLIC, anon, authenticated;

-- Admins hear about every top-up waiting for them.
CREATE OR REPLACE FUNCTION public.alert_admins_topup()
RETURNS TRIGGER AS $$
DECLARE
    v_name TEXT;
BEGIN
    IF NEW.status = 'pending' AND NEW.method IS DISTINCT FROM 'midtrans' THEN
        SELECT name INTO v_name FROM public.users WHERE id = NEW.user_id;
        PERFORM public.notify_admins(
            CASE WHEN NEW.order_id IS NOT NULL THEN 'Pembayaran pesanan menunggu konfirmasi'
                 ELSE 'Top-up menunggu konfirmasi' END,
            -- A QRIS order's request is made with the order, before the
            -- customer pays; a wallet top-up's after they tap "sudah bayar".
            CASE WHEN NEW.order_id IS NOT NULL
                 THEN 'Pesanan ' || COALESCE(v_name, 'pelanggan') || ' menunggu QRIS ' || public.format_rupiah(NEW.amount)
                      || '. Setujui di Keuangan setelah dananya masuk.'
                 ELSE COALESCE(v_name, 'Pelanggan') || ' mengisi saldo ' || public.format_rupiah(NEW.amount)
                      || ' lewat QRIS. Cek mutasi, lalu setujui di Keuangan.' END,
            '/finance', true);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_alert_admins_topup ON public.topup_requests;
CREATE TRIGGER trg_alert_admins_topup AFTER INSERT ON public.topup_requests
    FOR EACH ROW EXECUTE FUNCTION public.alert_admins_topup();

-- Verify:
--   SELECT key, value FROM public.app_settings;
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_alert_admins_topup';
