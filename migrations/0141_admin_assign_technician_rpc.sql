-- ===========================================================================
-- 0126_admin_assign_technician_rpc.sql
--
-- Atomize Technician Dispatch:
-- 1. admin_assign_technician RPC:
--    Single atomic SECURITY DEFINER function to assign a technician to a
--    pending WiraService order. Updates status to 'accepted', sets driver_id
--    and accepted_at, writes an order_events row (which trg_audit_order_event
--    automatically mirrors to admin_audit_log), and creates notifications
--    for both technician and customer.
-- 2. State machine guard in enforce_orders_state_machine:
--    Guards unassigned service orders so non-admins cannot self-claim
--    when app_settings.service_dispatch_mode = 'admin_only'.
-- 3. App setting service_dispatch_mode support in admin_set_app_setting.
-- ===========================================================================

-- 1. Seed service_dispatch_mode setting if not present
INSERT INTO public.app_settings (key, value)
VALUES ('service_dispatch_mode', '"admin_only"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. Update admin_set_app_setting to allow service_dispatch_mode
CREATE OR REPLACE FUNCTION public.admin_set_app_setting(p_key TEXT, p_value JSONB)
RETURNS JSONB AS $$
DECLARE
    v_old JSONB;
    v_num NUMERIC;
BEGIN
    IF NOT (public.admin_can('core') OR public.admin_can('finance')) THEN
        RAISE EXCEPTION 'Khusus admin inti atau keuangan' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_value) = 'number' THEN
        v_num := (p_value #>> '{}')::NUMERIC;
    END IF;
    IF p_key = 'topup_auto_confirm' AND jsonb_typeof(p_value) <> 'boolean' THEN
        RAISE EXCEPTION 'Nilai harus true atau false';
    ELSIF p_key = 'service_dispatch_mode' AND (jsonb_typeof(p_value) <> 'string' OR (p_value #>> '{}') NOT IN ('admin_only', 'hybrid')) THEN
        RAISE EXCEPTION 'Mode penugasan servis harus admin_only atau hybrid';
    ELSIF p_key = 'qris_order_window_minutes' AND (v_num IS NULL OR v_num NOT BETWEEN 15 AND 240) THEN
        RAISE EXCEPTION 'Batas waktu pembayaran harus 15 sampai 240 menit';
    ELSIF p_key = 'commission_debt_limit' AND (v_num IS NULL OR v_num NOT BETWEEN 10000 AND 10000000) THEN
        RAISE EXCEPTION 'Batas utang komisi harus Rp 10.000 sampai Rp 10.000.000';
    ELSIF p_key = 'commission_debt_grace_days' AND (v_num IS NULL OR v_num NOT BETWEEN 0 AND 60) THEN
        RAISE EXCEPTION 'Masa tenggang harus 0 sampai 60 hari';
    ELSIF p_key = 'commission_payment_info'
          AND (jsonb_typeof(p_value) <> 'string' OR length(p_value #>> '{}') NOT BETWEEN 5 AND 500) THEN
        RAISE EXCEPTION 'Info pembayaran harus 5 sampai 500 karakter';
    ELSIF p_key = 'titip_budget_max' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 10000 AND 5000000) THEN
        RAISE EXCEPTION 'Batas belanja titip beli harus Rp 10.000 sampai Rp 5.000.000';
    ELSIF p_key = 'titip_auto_approve_minutes' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 5 AND 240) THEN
        RAISE EXCEPTION 'Persetujuan otomatis harus 5 sampai 240 menit';
    ELSIF p_key = 'big_item_quote_min' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 5000 AND 5000000) THEN
        RAISE EXCEPTION 'Harga minimum barang besar harus Rp 5.000 sampai Rp 5.000.000';
    ELSIF p_key = 'big_item_quote_max' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 50000 AND 50000000) THEN
        RAISE EXCEPTION 'Harga maksimum barang besar harus Rp 50.000 sampai Rp 50.000.000';
    ELSIF p_key = 'visit_quote_max' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 100000 AND 100000000) THEN
        RAISE EXCEPTION 'Batas penawaran teknisi harus Rp 100.000 sampai Rp 100.000.000';
    ELSIF p_key IN ('ride_hourly_min_hours', 'ride_hourly_max_hours') AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 1 AND 24) THEN
        RAISE EXCEPTION 'Lama sewa harus 1 sampai 24 jam';
    ELSIF p_key = 'ride_hourly_grace_minutes' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 0 AND 60) THEN
        RAISE EXCEPTION 'Toleransi lewat waktu harus 0 sampai 60 menit';
    ELSIF p_key = 'ride_schedule_min_minutes' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 15 AND 1440) THEN
        RAISE EXCEPTION 'Jadwal paling cepat harus 15 sampai 1440 menit';
    ELSIF p_key = 'ride_schedule_max_days' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 1 AND 30) THEN
        RAISE EXCEPTION 'Jadwal paling jauh harus 1 sampai 30 hari';
    ELSIF p_key = 'ride_schedule_free_cancel_hours' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 0 AND 48) THEN
        RAISE EXCEPTION 'Batas batal gratis harus 0 sampai 48 jam';
    ELSIF p_key = 'ride_schedule_queue_minutes' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 5 AND 180) THEN
        RAISE EXCEPTION 'Waktu antrean admin harus 5 sampai 180 menit';
    ELSIF p_key = 'service_warranty_days' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 0 AND 90) THEN
        RAISE EXCEPTION 'Garansi Service harus 0 sampai 90 hari';
    ELSIF p_key = 'pool_warranty_hours' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 12 AND 168) THEN
        RAISE EXCEPTION 'Waktu kunjungan ulang Pool harus 12 sampai 168 jam';
    ELSIF p_key = 'warranty_response_hours' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 1 AND 72) THEN
        RAISE EXCEPTION 'Batas jawab teknisi harus 1 sampai 72 jam';
    ELSIF p_key = 'villa_request_max' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 0 AND 20000000) THEN
        RAISE EXCEPTION 'Maksimal harga permintaan villa harus Rp 0 sampai Rp 20.000.000';
    ELSIF p_key = 'titip_budget_new_max' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 10000 AND 5000000) THEN
        RAISE EXCEPTION 'Batas belanja pelanggan baru harus Rp 10.000 sampai Rp 5.000.000';
    ELSIF p_key = 'titip_trusted_orders' AND (v_num IS NULL OR v_num <> round(v_num) OR v_num NOT BETWEEN 0 AND 50) THEN
        RAISE EXCEPTION 'Jumlah pesanan selesai harus 0 sampai 50';
    ELSIF p_key NOT IN ('topup_auto_confirm', 'service_dispatch_mode', 'qris_order_window_minutes', 'commission_debt_limit',
                        'commission_debt_grace_days', 'commission_payment_info', 'titip_budget_max',
                        'titip_auto_approve_minutes', 'big_item_quote_min', 'big_item_quote_max',
                        'visit_quote_max', 'ride_hourly_min_hours', 'ride_hourly_max_hours',
                        'ride_hourly_grace_minutes', 'ride_schedule_min_minutes', 'ride_schedule_max_days',
                        'ride_schedule_free_cancel_hours', 'ride_schedule_queue_minutes',
                        'service_warranty_days', 'pool_warranty_hours', 'warranty_response_hours',
                        'villa_request_max', 'titip_budget_new_max', 'titip_trusted_orders') THEN
        RAISE EXCEPTION 'Pengaturan % tidak dikenal', p_key;
    END IF;
    IF p_key = 'big_item_quote_min' AND v_num >= public.app_setting_int('big_item_quote_max', 1000000) THEN
        RAISE EXCEPTION 'Harga minimum harus di bawah harga maksimum';
    ELSIF p_key = 'big_item_quote_max' AND v_num <= public.app_setting_int('big_item_quote_min', 30000) THEN
        RAISE EXCEPTION 'Harga maksimum harus di atas harga minimum';
    ELSIF p_key = 'ride_hourly_min_hours' AND v_num > public.app_setting_int('ride_hourly_max_hours', 12) THEN
        RAISE EXCEPTION 'Lama sewa minimum tidak boleh di atas maksimum';
    ELSIF p_key = 'ride_hourly_max_hours' AND v_num < public.app_setting_int('ride_hourly_min_hours', 2) THEN
        RAISE EXCEPTION 'Lama sewa maksimum tidak boleh di bawah minimum';
    ELSIF p_key = 'ride_schedule_min_minutes' AND v_num >= public.app_setting_int('ride_schedule_max_days', 7) * 1440 THEN
        RAISE EXCEPTION 'Waktu paling cepat harus di bawah waktu paling jauh';
    ELSIF p_key = 'titip_budget_new_max' AND v_num > public.app_setting_int('titip_budget_max', 300000) THEN
        RAISE EXCEPTION 'Batas pelanggan baru tidak boleh di atas batas umum';
    END IF;

    INSERT INTO public.app_settings (key, value) VALUES (p_key, p_value) ON CONFLICT (key) DO NOTHING;
    SELECT value INTO v_old FROM public.app_settings WHERE key = p_key FOR UPDATE;
    UPDATE public.app_settings SET value = p_value, updated_at = NOW(), updated_by = auth.uid() WHERE key = p_key;

    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, note, data)
    VALUES (auth.uid(), 'app_setting_changed', 'app_setting', p_key,
            'Pengaturan ' || p_key || ' diubah',
            jsonb_build_object('from', v_old, 'to', p_value));

    RETURN jsonb_build_object('key', p_key, 'old', v_old, 'new', p_value);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_set_app_setting(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_app_setting(TEXT, JSONB) TO authenticated;

-- 3. Atomic technician dispatch RPC
CREATE OR REPLACE FUNCTION public.admin_assign_technician(
    p_order_id UUID,
    p_technician_id UUID,
    p_note TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_tech RECORD;
    v_tech_name TEXT;
    v_event_note TEXT;
BEGIN
    -- Check admin permission (core roles: Superadmin, Admin Ops, admin)
    IF NOT public.admin_can('core') THEN
        RAISE EXCEPTION 'Khusus admin inti' USING ERRCODE = '42501';
    END IF;

    -- Fetch order and lock for update
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;

    IF v_order.status <> 'pending' THEN
        RAISE EXCEPTION 'Pesanan tidak dalam status pending (status saat ini: %)', v_order.status;
    END IF;

    -- Fetch technician from users
    SELECT id, name INTO v_tech
    FROM public.users
    WHERE id = p_technician_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Teknisi tidak ditemukan';
    END IF;

    v_tech_name := COALESCE(v_tech.name, 'mitra');

    -- Update order status and assigned technician
    UPDATE public.orders
    SET status = 'accepted',
        driver_id = p_technician_id,
        accepted_at = NOW()
    WHERE id = p_order_id;

    -- Insert into order_events (kind = 'note') so trg_audit_order_event automatically records to admin_audit_log
    v_event_note := 'Penugasan teknisi (' || v_tech_name || ')' ||
        CASE WHEN p_note IS NOT NULL AND length(btrim(p_note)) > 0
             THEN ': ' || btrim(p_note)
             ELSE ''
        END;

    INSERT INTO public.order_events (order_id, kind, actor_id, note)
    VALUES (p_order_id, 'note', auth.uid(), v_event_note);

    -- Insert notifications for technician and customer
    INSERT INTO public.notifications (user_id, title, description, link)
    VALUES (
        p_technician_id,
        'Tugas Servis Baru!',
        'Admin menugaskan Anda untuk pesanan ' || COALESCE(v_order.title, 'servis') || '. Silakan cek jadwal di aplikasi Mitra.',
        '/technician/active-order/' || p_order_id::text
    );

    IF v_order.user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, description, link)
        VALUES (
            v_order.user_id,
            'Teknisi Telah Ditugaskan',
            'Teknisi ' || v_tech_name || ' telah ditugaskan untuk pesanan Anda.',
            '/active-order/' || p_order_id::text
        );
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_assign_technician(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_technician(UUID, UUID, TEXT) TO authenticated;

-- 4. Update enforce_orders_state_machine with service_dispatch_mode guard
CREATE OR REPLACE FUNCTION public.enforce_orders_state_machine()
RETURNS TRIGGER AS $$
BEGIN
    IF current_user = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF current_user IN ('authenticated', 'anon') THEN
            IF NEW.status IS DISTINCT FROM 'pending' THEN
                RAISE EXCEPTION 'New orders must be created with status = pending (got %)', NEW.status;
            END IF;
            IF NEW.payment_status IS DISTINCT FROM 'unpaid' THEN
                RAISE EXCEPTION 'New orders must be created with payment_status = unpaid (got %). WiraPay orders are paid via create_order_and_pay().', NEW.payment_status;
            END IF;
            IF NEW.payment_method = 'wallet'
               AND current_setting('wira.wallet_checkout', true) IS DISTINCT FROM 'on' THEN
                RAISE EXCEPTION 'WiraPay orders must be created via create_order_and_pay()';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- TG_OP = 'UPDATE' from here on.

    -- 0091: submit_review_and_tip marks a finished order reviewed (and
    -- nothing else) under wira.review_mark, which clients cannot set.
    IF OLD.status IN ('cancelled', 'completed') AND NOT is_admin()
       AND current_setting('wira.review_mark', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Order is already finalized (%) and cannot be modified', OLD.status;
    END IF;

    -- 0090: approved extra charges and the check-only finish change the
    -- price inside their own functions (wira.price_adjustment, which
    -- PostgREST clients cannot set).
    IF NEW.total_price IS DISTINCT FROM OLD.total_price AND NOT is_admin()
       AND current_setting('wira.price_adjustment', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'total_price cannot be changed after an order is created (except by an admin)';
    END IF;

    IF current_user IN ('authenticated', 'anon') AND NOT is_admin() THEN
        IF NEW.user_id IS DISTINCT FROM OLD.user_id
           OR NEW.merchant_id IS DISTINCT FROM OLD.merchant_id
           OR NEW.service_type IS DISTINCT FROM OLD.service_type
           OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
           OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
           OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
           OR NEW.promo_code IS DISTINCT FROM OLD.promo_code
           OR NEW.rate_code IS DISTINCT FROM OLD.rate_code
           OR NEW.distance_meters IS DISTINCT FROM OLD.distance_meters
           OR NEW.nights IS DISTINCT FROM OLD.nights
           OR NEW.metadata IS DISTINCT FROM OLD.metadata
           OR NEW.pickup_lat IS DISTINCT FROM OLD.pickup_lat
           OR NEW.pickup_lng IS DISTINCT FROM OLD.pickup_lng
           OR NEW.dropoff_lat IS DISTINCT FROM OLD.dropoff_lat
           OR NEW.dropoff_lng IS DISTINCT FROM OLD.dropoff_lng
           OR NEW.material_amount IS DISTINCT FROM OLD.material_amount
           OR NEW.package_id IS DISTINCT FROM OLD.package_id
        THEN
            RAISE EXCEPTION 'Only status and driver assignment can be changed on an existing order';
        END IF;
    END IF;

    -- claiming an unassigned order
    IF OLD.driver_id IS NULL AND NEW.driver_id IS NOT NULL AND NOT is_admin() THEN
        IF OLD.service_type = 'service' THEN
            IF COALESCE((SELECT value #>> '{}' FROM public.app_settings WHERE key = 'service_dispatch_mode'), 'admin_only') = 'admin_only' THEN
                RAISE EXCEPTION 'Pesanan WiraService hanya dapat ditugaskan oleh admin';
            END IF;
        END IF;
        IF NEW.driver_id != auth.uid() THEN
            RAISE EXCEPTION 'You can only assign an order to yourself';
        END IF;
        IF NEW.driver_id = OLD.user_id THEN
            RAISE EXCEPTION 'You cannot claim your own order as its driver';
        END IF;
        IF OLD.service_type IN ('service', 'pool') THEN
            IF NOT public.technician_can_take(NEW.driver_id, OLD.service_type, OLD.rate_code) THEN
                RAISE EXCEPTION 'Pekerjaan ini membutuhkan teknisi aktif dengan keahlian yang sesuai';
            END IF;
            IF OLD.preferred_partner_id IS NOT NULL AND OLD.preferred_partner_id <> NEW.driver_id
               AND OLD.status_changed_at >= NOW() - public.preferred_partner_window() THEN
                RAISE EXCEPTION 'Pekerjaan ini sedang ditawarkan ke teknisi pilihan pelanggan';
            END IF;
        ELSIF NOT public.is_active_partner(NEW.driver_id, 'driver') THEN
            RAISE EXCEPTION 'Only an active driver account can claim this order';
        END IF;
    END IF;

    -- Technician visits: work starts only with the customer's PIN
    -- (start_order_with_pin runs as its owner, not as a client role), and
    -- can only be finished after it started.
    IF OLD.service_type IN ('service', 'pool')
       AND current_user IN ('authenticated', 'anon') AND NOT is_admin() THEN
        IF NEW.status = 'working' AND OLD.status IS DISTINCT FROM 'working' THEN
            RAISE EXCEPTION 'Masukkan PIN dari pelanggan untuk mulai bekerja';
        END IF;
        IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'working' THEN
            RAISE EXCEPTION 'Pekerjaan harus dimulai dengan PIN pelanggan sebelum diselesaikan';
        END IF;
    END IF;

    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
        IF NOT (
            is_admin()
            OR auth.uid() = OLD.driver_id
            OR OLD.merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
        ) THEN
            RAISE EXCEPTION 'Only the assigned driver/technician, the owning merchant, or an admin can mark an order completed';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
