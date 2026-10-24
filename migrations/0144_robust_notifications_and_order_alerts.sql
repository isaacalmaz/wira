-- ============================================================================
-- 0144: Robust Customer & Support Notifications, Villa Links, Admin Application
--       Alerts, Technician Dispatch Guard, Announcement Nanny Segment, and
--       Wallet Transfer Note Support
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Customer Order Status Notification Trigger (trg_notify_customer_on_order_status)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_customer_on_order_status()
RETURNS TRIGGER AS $$
DECLARE
    v_type TEXT := lower(COALESCE(NEW.service_type, ''));
    v_title TEXT := NULL;
    v_message TEXT := NULL;
BEGIN
    IF NEW.user_id IS NULL OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    CASE NEW.status
        WHEN 'accepted' THEN
            IF v_type IN ('ride', 'send', 'wiraride', 'wirasend') THEN
                v_title := 'Driver Ditemukan';
                v_message := 'Driver telah menerima pesanan Anda dan sedang menuju lokasi penjemputan.';
            ELSIF v_type IN ('food', 'wirafood') THEN
                v_title := 'Pesanan Diterima Restoran';
                v_message := 'Restoran telah menerima pesanan Anda dan segera menyiapkan makanan.';
            ELSIF v_type IN ('villa', 'wiravilla') THEN
                v_title := 'Reservasi Villa Dikonfirmasi';
                v_message := 'Pemilik villa telah mengonfirmasi reservasi Anda.';
            ELSIF v_type IN ('babysit', 'wiraasuh') THEN
                v_title := 'Wira Asuh Dikonfirmasi';
                v_message := 'Mitra Wira Asuh telah menerima jadwal layanan Anda.';
            ELSE
                v_title := 'Teknisi Ditemukan';
                v_message := 'Mitra teknisi telah menerima pesanan layanan Anda.';
            END IF;

        WHEN 'preparing' THEN
            IF v_type IN ('food', 'wirafood') THEN
                v_title := 'Pesanan Sedang Disiapkan';
                v_message := 'Restoran sedang memasak/menyiapkan pesanan Anda.';
            END IF;

        WHEN 'ready' THEN
            IF v_type IN ('food', 'wirafood') THEN
                v_title := 'Pesanan Siap Diambil';
                v_message := 'Pesanan makanan Anda sudah siap untuk diambil kurir.';
            END IF;

        WHEN 'picking_up' THEN
            IF v_type IN ('ride', 'send', 'food', 'wiraride', 'wirasend', 'wirafood') THEN
                v_title := 'Driver Menuju Lokasi Jemput';
                v_message := 'Driver sedang dalam perjalanan menuju titik penjemputan.';
            END IF;

        WHEN 'on_the_way' THEN
            IF v_type IN ('service', 'pool', 'babysit', 'ride', 'send', 'wiraservice', 'wirapool', 'wiraasuh', 'wiraride', 'wirasend') THEN
                v_title := 'Mitra Dalam Perjalanan';
                v_message := 'Mitra sedang menuju lokasi Anda.';
            END IF;

        WHEN 'in_trip', 'delivering' THEN
            IF v_type IN ('ride', 'wiraride') THEN
                v_title := 'Perjalanan Dimulai';
                v_message := 'Selamat menikmati perjalanan Anda bersama Wira.';
            ELSIF v_type IN ('send', 'food', 'wirasend', 'wirafood') THEN
                v_title := 'Pesanan Sedang Diantar';
                v_message := 'Driver sedang mengantarkan pesanan menuju lokasi tujuan.';
            END IF;

        WHEN 'working' THEN
            IF v_type IN ('service', 'pool', 'babysit', 'wiraservice', 'wirapool', 'wiraasuh') THEN
                v_title := 'Layanan Dimulai';
                v_message := 'Mitra telah memulai pengerjaan layanan di lokasi Anda.';
            END IF;

        WHEN 'completed' THEN
            v_title := 'Pesanan Selesai';
            v_message := 'Pesanan Anda telah selesai. Terima kasih telah menggunakan Wira!';

        ELSE
            -- Other statuses (e.g. 'cancelled', 'waiting_approval') are handled by their dedicated RPCs/triggers
            NULL;
    END CASE;

    IF v_title IS NOT NULL AND v_message IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, description, is_read, link)
        VALUES (
            NEW.user_id,
            v_title,
            v_message,
            false,
            '/active-order/' || NEW.id::text
        );
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_customer_on_order_status failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.notify_customer_on_order_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_customer_on_order_status ON public.orders;
CREATE TRIGGER trg_notify_customer_on_order_status
    AFTER UPDATE OF status ON public.orders
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.notify_customer_on_order_status();

-- Deduplicate same-transaction customer notifications for the same active order
-- (e.g. when babysit_respond, babysit_set_status, or start_titip_delivery
-- updates orders.status and then inserts its own detailed notification).
CREATE OR REPLACE FUNCTION public.dedup_same_tx_order_notification()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id IS NOT NULL AND NEW.link LIKE '/active-order/%' THEN
        UPDATE public.notifications
        SET title = NEW.title,
            description = NEW.description,
            is_read = false
        WHERE id = (
            SELECT id FROM public.notifications
            WHERE user_id = NEW.user_id
              AND link = NEW.link
              AND created_at = NOW()
            ORDER BY id DESC
            LIMIT 1
        );
        IF FOUND THEN
            RETURN NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.dedup_same_tx_order_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dedup_same_tx_order_notification ON public.notifications;
CREATE TRIGGER trg_dedup_same_tx_order_notification
    BEFORE INSERT ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.dedup_same_tx_order_notification();

-- ---------------------------------------------------------------------------
-- 2. Support Ticket Admin Reply / Status Change Trigger (trg_notify_user_on_support_ticket_update)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_user_on_support_ticket_update()
RETURNS TRIGGER AS $$
DECLARE
    v_status_label TEXT;
    v_reply_snippet TEXT;
    v_message TEXT;
BEGIN
    IF NEW.user_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF OLD.status IS NOT DISTINCT FROM NEW.status
       AND COALESCE(btrim(OLD.admin_response), '') IS NOT DISTINCT FROM COALESCE(btrim(NEW.admin_response), '') THEN
        RETURN NEW;
    END IF;

    v_status_label := CASE NEW.status
        WHEN 'in_progress' THEN 'Sedang Diproses'
        WHEN 'resolved' THEN 'Selesai'
        ELSE 'Menunggu'
    END;

    v_reply_snippet := NULLIF(left(btrim(COALESCE(NEW.admin_response, '')), 140), '');

    v_message := 'Tiket "' || COALESCE(NULLIF(btrim(NEW.subject), ''), 'Bantuan') || '" kini berstatus ' || v_status_label || '.'
        || CASE WHEN v_reply_snippet IS NOT NULL THEN ' Balasan Admin: ' || v_reply_snippet ELSE '' END;

    INSERT INTO public.notifications (user_id, title, description, is_read, link)
    VALUES (
        NEW.user_id,
        'Update Tiket Bantuan',
        v_message,
        false,
        '/support'
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_user_on_support_ticket_update failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.notify_user_on_support_ticket_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_user_on_support_ticket_update ON public.support_tickets;
CREATE TRIGGER trg_notify_user_on_support_ticket_update
    AFTER UPDATE ON public.support_tickets
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.admin_response IS DISTINCT FROM NEW.admin_response)
    EXECUTE FUNCTION public.notify_user_on_support_ticket_update();

-- ---------------------------------------------------------------------------
-- 3. Fix Villa Notification Links in Existing Functions
-- ---------------------------------------------------------------------------

-- 3a. public.notify_partners_on_order() (from 0115, villa link -> '/villa/orders')
CREATE OR REPLACE FUNCTION public.notify_partners_on_order()
RETURNS TRIGGER AS $$
DECLARE
    v_owner UUID;
    v_villa BOOLEAN := NEW.service_type IN ('villa', 'WiraVilla');
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NULL;
    END IF;

    IF NEW.status = 'pending' AND NEW.merchant_id IS NOT NULL THEN
        SELECT owner_id INTO v_owner FROM public.merchants WHERE id = NEW.merchant_id;
        PERFORM public.notify_user(v_owner,
            CASE WHEN v_villa THEN 'Reservasi baru' ELSE 'Pesanan baru masuk' END,
            COALESCE(NEW.title, 'Pesanan baru') || ' · ' || public.format_rupiah(NEW.total_price)
            || CASE WHEN v_villa THEN '. Konfirmasi dalam 24 jam.' ELSE '. Terima sebelum 30 menit.' END,
            CASE WHEN v_villa THEN '/villa/orders' ELSE '/merchant/orders' END);
    ELSIF NEW.status = 'ready' AND NEW.driver_id IS NULL AND NEW.service_type IN ('food', 'WiraFood') THEN
        INSERT INTO public.notifications (user_id, title, description, is_read, link)
        SELECT d.id, 'Makanan siap diantar',
               COALESCE(NEW.title, 'Pesanan WiraFood') || ' menunggu kurir. Ongkir ' || public.format_rupiah(NEW.delivery_fee) || '.',
               false, '/driver'
        FROM public.drivers d JOIN public.users u ON u.id = d.id
        WHERE d.is_online = true
          AND COALESCE(u.mitra_access, '[]'::jsonb) ? 'driver'
          AND COALESCE(u.status, 'Aktif') <> 'Diblokir'
          AND (u.job_type_preferences IS NULL OR jsonb_array_length(u.job_type_preferences) = 0 OR u.job_type_preferences ? 'food')
          AND COALESCE(u.vehicle_type, 'motor') = 'motor'
        LIMIT 30;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.notify_partners_on_order() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_partners_on_order ON public.orders;
CREATE TRIGGER trg_notify_partners_on_order AFTER INSERT OR UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.notify_partners_on_order();

-- 3b. public.villa_housekeeping() (from 0115, villa link -> '/villa/orders')
CREATE OR REPLACE FUNCTION public.villa_housekeeping()
RETURNS INT AS $$
DECLARE
    r RECORD;
    v_refund NUMERIC;
    n INT := 0;
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Makassar')::date;
BEGIN
    UPDATE public.orders SET status = 'completed'
    WHERE service_type IN ('villa', 'WiraVilla') AND status = 'accepted'
      AND check_out IS NOT NULL AND check_out <= v_today;
    GET DIAGNOSTICS n = ROW_COUNT;

    FOR r IN SELECT o.id, o.user_id, o.title, m.owner_id FROM public.orders o
             LEFT JOIN public.merchants m ON m.id = o.merchant_id
             WHERE o.service_type IN ('villa', 'WiraVilla') AND o.status = 'pending'
               AND (o.status_changed_at < NOW() - INTERVAL '24 hours' OR (o.check_in IS NOT NULL AND o.check_in <= v_today))
             FOR UPDATE OF o SKIP LOCKED
    LOOP
        v_refund := public.refund_order_to_wallet(r.id, 'Refund: reservasi tidak dikonfirmasi pemilik');
        UPDATE public.orders SET status = 'cancelled' WHERE id = r.id AND status = 'pending';
        PERFORM public.notify_user(r.user_id, 'Reservasi tidak dikonfirmasi',
            COALESCE(r.title, 'Reservasi Anda') || ' belum dikonfirmasi pemilik dalam 24 jam, jadi kami batalkan. '
            || CASE WHEN v_refund > 0 THEN 'Saldo WiraPay ' || public.format_rupiah(v_refund) || ' sudah dikembalikan.' ELSE '' END,
            '/active-order/' || r.id);
        PERFORM public.notify_user(r.owner_id, 'Reservasi kedaluwarsa',
            COALESCE(r.title, 'Reservasi') || ' dibatalkan otomatis karena tidak dikonfirmasi dalam 24 jam.', '/villa/orders');
        n := n + 1;
    END LOOP;
    RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.villa_housekeeping() FROM PUBLIC, anon, authenticated;

-- 3c. public.wallet_refund_matched_ride() (from 0132, villa link -> '/villa/orders')
CREATE OR REPLACE FUNCTION public.wallet_refund_matched_ride(p_order_id UUID, p_description TEXT DEFAULT 'Refund Pembatalan Perjalanan')
RETURNS BOOLEAN AS $$
DECLARE
    v_order RECORD;
    v_caller UUID := auth.uid();
    v_is_driver BOOLEAN;
    v_is_visit BOOLEAN;
    v_since INTERVAL;
    v_owner UUID;
    v_ratio NUMERIC;
    v_refund NUMERIC := 0;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Anda harus login untuk membatalkan perjalanan';
    END IF;

    SELECT id, user_id, driver_id, merchant_id, status, accepted_at, service_type, scheduled_at, check_in, title
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;

    IF v_order.merchant_id IS NOT NULL THEN
        SELECT owner_id INTO v_owner FROM public.merchants WHERE id = v_order.merchant_id;
    END IF;
    v_is_driver := (v_order.driver_id IS NOT NULL AND v_order.driver_id = v_caller);
    v_is_visit := v_order.service_type IN ('service', 'pool');

    IF v_order.user_id IS DISTINCT FROM v_caller AND NOT v_is_driver THEN
        RAISE EXCEPTION 'Anda tidak berhak membatalkan pesanan ini';
    END IF;

    -- 0115: villa (customer only; hosts use merchant_reject_order).
    IF v_order.service_type IN ('villa', 'WiraVilla') THEN
        IF v_order.status NOT IN ('pending', 'accepted') THEN
            RAISE EXCEPTION 'Pesanan ini sudah tidak bisa dibatalkan (status saat ini: %)', v_order.status;
        END IF;
        v_ratio := CASE WHEN v_order.status = 'pending' THEN 1 ELSE public.villa_cancel_refund_ratio(v_order.check_in) END;
        IF v_ratio <= 0 THEN
            RAISE EXCEPTION 'Sudah masuk hari check-in, pesanan tidak bisa dibatalkan lagi. Hubungi CS jika ada masalah.';
        END IF;
        IF v_ratio >= 1 THEN
            v_refund := public.refund_order_to_wallet(p_order_id, p_description);
        ELSE
            v_refund := public.refund_villa_partially(p_order_id, v_ratio, p_description || ' (50%, kurang dari 3 hari sebelum check-in)');
        END IF;
        UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
        PERFORM public.notify_user(v_owner, 'Reservasi dibatalkan tamu',
            COALESCE(v_order.title, 'Reservasi') || CASE WHEN v_ratio < 1 THEN ' dibatalkan kurang dari 3 hari sebelum check-in. 50% tetap untuk Anda (dikurangi komisi).' ELSE ' dibatalkan tamu.' END,
            '/villa/orders');
        RETURN TRUE;
    END IF;

    IF v_is_visit THEN
        IF v_order.status = 'working' THEN
            RAISE EXCEPTION 'Pekerjaan sudah dimulai, tidak bisa dibatalkan lagi. Hubungi CS jika ada masalah.';
        ELSIF v_order.status NOT IN ('pending', 'accepted', 'on_the_way') THEN
            RAISE EXCEPTION 'Pesanan ini sudah tidak bisa dibatalkan (status saat ini: %)', v_order.status;
        END IF;
        IF NOT v_is_driver AND v_order.status IN ('accepted', 'on_the_way') THEN
            IF NOT (
                (v_order.accepted_at IS NOT NULL AND NOW() - v_order.accepted_at <= INTERVAL '3 minutes')
                OR v_order.scheduled_at IS NULL
                OR NOW() < v_order.scheduled_at - INTERVAL '2 hours'
                OR NOW() > v_order.scheduled_at + INTERVAL '1 hour'
            ) THEN
                RAISE EXCEPTION 'Teknisi sudah dijadwalkan datang kurang dari 2 jam lagi. Pembatalan gratis tersedia lagi jika teknisi terlambat lebih dari 1 jam, atau hubungi CS.';
            END IF;
        END IF;
    ELSIF v_order.service_type = 'food' AND NOT v_is_driver THEN
        -- 0115: once the restaurant is cooking, only CS can cancel.
        IF NOT (v_order.status = 'pending'
                OR (v_order.status = 'accepted' AND v_order.accepted_at IS NOT NULL AND NOW() - v_order.accepted_at <= INTERVAL '3 minutes')) THEN
            RAISE EXCEPTION 'Restoran sudah menyiapkan pesanan Anda, jadi pesanan tidak bisa dibatalkan dari aplikasi. Hubungi CS lewat Pusat Bantuan.';
        END IF;
    ELSE
        IF v_order.status = 'in_trip' THEN
            RAISE EXCEPTION 'Perjalanan sudah dimulai (penumpang sudah dijemput), tidak bisa dibatalkan lagi. Hubungi CS jika ada masalah.';
        ELSIF v_order.status NOT IN ('pending', 'accepted', 'picking_up', 'ready') THEN
            RAISE EXCEPTION 'Pesanan ini sudah tidak bisa dibatalkan (status saat ini: %)', v_order.status;
        END IF;
        IF NOT v_is_driver AND v_order.status IN ('accepted', 'picking_up') AND v_order.accepted_at IS NOT NULL
           AND v_order.scheduled_at IS NULL THEN
            v_since := NOW() - v_order.accepted_at;
            IF v_since > INTERVAL '3 minutes' AND v_since < INTERVAL '20 minutes' THEN
                RAISE EXCEPTION 'Mitra sedang menuju lokasi Anda. Pembatalan gratis tersedia lagi jika Anda belum dijemput 20 menit setelah pesanan diterima.';
            END IF;
        END IF;
    END IF;

    -- 0132: a scheduled ride cancelled close to its pickup time is noted
    -- (no fee; the admin sees late driver cancels in Penanda Mitra).
    IF v_order.service_type = 'ride' AND v_order.scheduled_at IS NOT NULL AND v_order.status IN ('accepted', 'picking_up')
       AND NOW() > v_order.scheduled_at - make_interval(hours => public.app_setting_int('ride_schedule_free_cancel_hours', 2)) THEN
        INSERT INTO public.order_events (order_id, kind, from_status, to_status, actor_id, note)
        VALUES (p_order_id, 'note', v_order.status, v_order.status, v_caller,
                CASE WHEN v_is_driver THEN 'Sopir batal kurang dari ' ELSE 'Pelanggan batal kurang dari ' END
                || public.app_setting_int('ride_schedule_free_cancel_hours', 2) || ' jam sebelum jadwal');
    END IF;

    IF v_is_driver THEN
        UPDATE public.orders
        SET status = CASE WHEN v_order.service_type = 'food' THEN 'ready' ELSE 'pending' END,
            driver_id = NULL,
            accepted_at = CASE WHEN v_order.service_type = 'food' THEN accepted_at ELSE NULL END,
            preferred_partner_id = CASE WHEN preferred_partner_id = v_caller THEN NULL
                                        ELSE preferred_partner_id END,
            schedule_reminded_at = NULL
        WHERE id = p_order_id;
        -- 0132: jaminan dijemput - the customer hears it, the release is noted.
        IF v_order.service_type IN ('ride', 'send') THEN
            INSERT INTO public.order_events (order_id, kind, from_status, to_status, actor_id, note)
            VALUES (p_order_id, 'note', v_order.status, 'pending', v_caller, 'Mitra melepas pesanan');
            PERFORM public.notify_user(v_order.user_id, 'Mencarikan mitra pengganti',
                'Mitra sebelumnya membatalkan ' || COALESCE(v_order.title, 'pesanan Anda')
                || '. Kami langsung mencarikan pengganti tanpa biaya.', '/active-order/' || p_order_id);
        END IF;
        RETURN TRUE;
    END IF;

    PERFORM public.refund_order_to_wallet(p_order_id, p_description);
    UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
    -- 0115: the partner hears it (driver/technician and/or restaurant).
    PERFORM public.notify_user(v_order.driver_id, 'Pesanan dibatalkan pelanggan',
        COALESCE(v_order.title, 'Pesanan') || ' dibatalkan oleh pelanggan.', NULL);
    IF v_order.status <> 'ready' THEN
        PERFORM public.notify_user(v_owner, 'Pesanan dibatalkan pelanggan',
            COALESCE(v_order.title, 'Pesanan') || ' dibatalkan oleh pelanggan. Hentikan persiapannya.', '/merchant/orders');
    END IF;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 4. Fix public.alert_admins_application() (supports 'nanny' -> 'Wira Asuh', link -> '/applications')
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.alert_admins_application()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'Pending' THEN
        PERFORM public.notify_admins(
            'Pendaftaran mitra baru',
            COALESCE(NEW.name, 'Calon mitra') || ' mendaftar sebagai '
            || CASE NEW.role
                WHEN 'driver' THEN 'Driver'
                WHEN 'merchant' THEN 'Restoran'
                WHEN 'restaurant' THEN 'Restoran'
                WHEN 'villa' THEN 'Villa'
                WHEN 'technician' THEN 'Teknisi'
                WHEN 'nanny' THEN 'Wira Asuh'
                ELSE NEW.role
               END
            || '. Tinjau dan setujui.',
            '/applications');
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.alert_admins_application() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_alert_admins_application ON public.mitra_applications;
CREATE TRIGGER trg_alert_admins_application AFTER INSERT ON public.mitra_applications
    FOR EACH ROW EXECUTE FUNCTION public.alert_admins_application();

-- ---------------------------------------------------------------------------
-- 5. Enforce service_dispatch_mode = 'admin_only' in get_open_technician_jobs,
--    can_see_open_order, enforce_orders_state_machine, dispatch_due_orders,
--    and dispatch_next_ping
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value)
VALUES ('service_dispatch_mode', '"admin_only"'::jsonb)
ON CONFLICT (key) DO NOTHING;

DROP FUNCTION IF EXISTS public.get_open_technician_jobs();
CREATE FUNCTION public.get_open_technician_jobs()
RETURNS TABLE (
    id UUID, service_type TEXT, rate_code TEXT, title TEXT, details TEXT,
    scheduled_at TIMESTAMPTZ, total_price NUMERIC, payment_method TEXT,
    created_at TIMESTAMPTZ, is_preferred BOOLEAN, items JSONB, package_id UUID, job JSONB
) AS $$
    SELECT o.id, o.service_type::text, o.rate_code::text, o.title::text, o.details::text,
           o.scheduled_at, o.total_price::numeric, o.payment_method::text,
           o.created_at, COALESCE(o.preferred_partner_id = auth.uid(), false),
           o.metadata -> 'items', o.package_id, o.metadata -> 'job'
    FROM public.orders o
    WHERE o.status = 'pending' AND o.driver_id IS NULL
      AND o.service_type IN ('service', 'pool')
      AND o.user_id <> auth.uid()
      AND NOT EXISTS (
          SELECT 1 FROM public.app_settings
          WHERE key = 'service_dispatch_mode' AND (value #>> '{}') = 'admin_only'
      )
      AND public.can_see_open_order(o.service_type, o.rate_code, o.status, o.merchant_id,
                                    o.preferred_partner_id, o.status_changed_at)
    ORDER BY COALESCE(o.preferred_partner_id = auth.uid(), false) DESC, o.scheduled_at NULLS LAST, o.created_at;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_open_technician_jobs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_open_technician_jobs() TO authenticated;

-- Also guard can_see_open_order (0131) so RLS on public.orders does not allow
-- technicians to SELECT or UPDATE unassigned service/pool orders when admin_only
CREATE OR REPLACE FUNCTION public.can_see_open_order(p_service_type text, p_rate_code text, p_status text,
    p_merchant_id uuid, p_preferred uuid, p_since timestamp with time zone)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RETURN FALSE;
    END IF;
    IF p_status = 'pending' THEN
        IF p_service_type IN ('service', 'pool') THEN
            IF EXISTS (
                SELECT 1 FROM public.app_settings
                WHERE key = 'service_dispatch_mode' AND (value #>> '{}') = 'admin_only'
            ) THEN
                RETURN FALSE;
            END IF;
            RETURN public.technician_can_take(v_uid, p_service_type, p_rate_code)
               AND (p_preferred IS NULL OR p_preferred = v_uid
                    OR p_since < NOW() - public.preferred_partner_window());
        ELSIF p_service_type IN ('ride', 'send', 'food') THEN
            RETURN public.is_active_partner(v_uid, 'driver')
               AND (p_service_type <> 'send' OR p_rate_code IS DISTINCT FROM 'BESAR' OR public.driver_has_car(v_uid))
               AND (p_service_type <> 'ride' OR public.ride_vehicle_ok(p_rate_code, v_uid))
               AND (p_preferred IS NULL OR p_preferred = v_uid
                    OR p_since < NOW() - public.preferred_driver_window());
        END IF;
        RETURN FALSE;
    ELSIF p_status = 'ready' AND p_merchant_id IS NOT NULL THEN
        RETURN public.is_active_partner(v_uid, 'driver');
    END IF;
    RETURN FALSE;
END;
$function$;
REVOKE ALL ON FUNCTION public.can_see_open_order(TEXT, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_open_order(TEXT, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ) TO authenticated;

-- Guard both 'service' and 'pool' in enforce_orders_state_machine (0141 only guarded 'service')
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
    IF OLD.status IN ('cancelled', 'completed') AND NOT is_admin()
       AND current_setting('wira.review_mark', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Order is already finalized (%) and cannot be modified', OLD.status;
    END IF;

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
        IF OLD.service_type IN ('service', 'pool') THEN
            IF COALESCE((SELECT value #>> '{}' FROM public.app_settings WHERE key = 'service_dispatch_mode'), 'admin_only') = 'admin_only' THEN
                RAISE EXCEPTION 'Pesanan ini hanya dapat ditugaskan oleh admin';
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

-- Guard dispatch_due_orders (0132) and dispatch_next_ping (0131) when service_dispatch_mode = 'admin_only'
CREATE OR REPLACE FUNCTION public.dispatch_due_orders(p_limit INT DEFAULT 20)
RETURNS SETOF UUID AS $$
    SELECT o.id FROM public.orders o
    WHERE o.status = 'pending' AND o.driver_id IS NULL
      AND (
          (o.service_type IN ('ride', 'send') AND o.scheduled_at IS NULL AND o.status_changed_at > NOW() - INTERVAL '30 minutes')
          OR (o.service_type = 'ride' AND o.scheduled_at IS NOT NULL
              AND NOW() >= o.scheduled_at - make_interval(mins => public.app_setting_int('ride_schedule_queue_minutes', 30))
              AND NOW() <= o.scheduled_at + INTERVAL '15 minutes')
          OR (o.service_type IN ('pool', 'service')
              AND o.status_changed_at > NOW() - INTERVAL '2 hours'
              AND NOT EXISTS (
                  SELECT 1 FROM public.app_settings
                  WHERE key = 'service_dispatch_mode' AND (value #>> '{}') = 'admin_only'
              ))
      )
      AND NOT EXISTS (SELECT 1 FROM public.order_dispatch_pings p
                      WHERE p.order_id = o.id AND p.pinged_at > NOW() - INTERVAL '15 seconds')
    ORDER BY o.created_at
    LIMIT p_limit;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.dispatch_due_orders(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_due_orders(INT) TO service_role;

CREATE OR REPLACE FUNCTION public.dispatch_next_ping(p_order_id UUID)
RETURNS TABLE (driver_id UUID, service_type TEXT, pinged_count INT, total_candidates INT) AS $$
DECLARE
    o RECORD;
    v_cands UUID[];
    v_round INT;
    v_last TIMESTAMPTZ;
    v_next UUID;
BEGIN
    SELECT x.id, x.user_id, x.status, x.driver_id, x.service_type,
           x.pickup_lat, x.pickup_lng, x.rate_code, x.preferred_partner_id, x.status_changed_at
    INTO o FROM public.orders x WHERE x.id = p_order_id FOR UPDATE;
    IF NOT FOUND OR o.status <> 'pending' OR o.driver_id IS NOT NULL
       OR o.service_type NOT IN ('ride', 'send', 'pool', 'service') THEN
        RETURN;
    END IF;

    IF o.service_type IN ('pool', 'service') AND EXISTS (
        SELECT 1 FROM public.app_settings
        WHERE key = 'service_dispatch_mode' AND (value #>> '{}') = 'admin_only'
    ) THEN
        RETURN;
    END IF;

    IF o.service_type = 'ride' AND o.preferred_partner_id IS NOT NULL
       AND o.status_changed_at < NOW() - public.preferred_driver_window() THEN
        UPDATE public.orders SET preferred_partner_id = NULL WHERE id = p_order_id;
        o.preferred_partner_id := NULL;
    END IF;

    IF o.service_type = 'ride' AND o.preferred_partner_id IS NOT NULL THEN
        v_cands := CASE WHEN public.is_active_partner(o.preferred_partner_id, 'driver')
                             AND public.ride_vehicle_ok(o.rate_code, o.preferred_partner_id)
                        THEN ARRAY[o.preferred_partner_id] ELSE '{}'::UUID[] END;
    ELSIF o.service_type IN ('ride', 'send') THEN
        SELECT COALESCE(array_agg(n.id ORDER BY n.distance_meters), '{}') INTO v_cands
        FROM public.get_nearest_drivers(o.pickup_lat, o.pickup_lng,
             CASE WHEN o.service_type = 'ride' THEN o.rate_code END, true, 10) n
        WHERE o.pickup_lat IS NOT NULL AND n.id <> o.user_id
          AND public.is_active_partner(n.id, 'driver')
          AND (o.rate_code IS DISTINCT FROM 'BESAR' OR public.driver_has_car(n.id));
    ELSE
        SELECT COALESCE(array_agg(t.user_id ORDER BY COALESCE(t.user_id = o.preferred_partner_id, false) DESC, t.created_at), '{}')
        INTO v_cands
        FROM public.technician_profiles t
        WHERE t.is_accepting
          AND t.user_id <> o.user_id
          AND public.technician_can_take(t.user_id, o.service_type, o.rate_code)
          AND (o.preferred_partner_id IS NULL OR t.user_id = o.preferred_partner_id
               OR o.status_changed_at < NOW() - public.preferred_partner_window());
    END IF;

    SELECT COALESCE(MAX(p.round), 1), MAX(p.pinged_at) INTO v_round, v_last
    FROM public.order_dispatch_pings p WHERE p.order_id = p_order_id;

    IF v_last IS NULL OR v_last <= NOW() - INTERVAL '15 seconds' THEN
        SELECT c INTO v_next FROM unnest(v_cands) WITH ORDINALITY AS u(c, i)
        WHERE c NOT IN (SELECT p.driver_id FROM public.order_dispatch_pings p
                        WHERE p.order_id = p_order_id AND p.round = v_round)
        ORDER BY i LIMIT 1;
        IF v_next IS NULL AND cardinality(v_cands) > 0 AND o.service_type IN ('ride', 'send')
           AND o.preferred_partner_id IS NULL THEN
            v_round := v_round + 1;
            v_next := v_cands[1];
        END IF;
        IF v_next IS NOT NULL THEN
            INSERT INTO public.order_dispatch_pings (order_id, driver_id, round)
            VALUES (p_order_id, v_next, v_round);
        END IF;
    END IF;

    RETURN QUERY SELECT v_next, o.service_type::TEXT,
        (SELECT COUNT(*)::INT FROM public.order_dispatch_pings p
         WHERE p.order_id = p_order_id AND p.round = v_round),
        cardinality(v_cands);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.dispatch_next_ping(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_next_ping(UUID) TO service_role;

-- Update admin_assign_technician (0141) so it does not duplicate the customer
-- notification already inserted by trg_notify_customer_on_order_status
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
    IF NOT public.admin_can('core') THEN
        RAISE EXCEPTION 'Khusus admin inti' USING ERRCODE = '42501';
    END IF;

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

    SELECT id, name INTO v_tech
    FROM public.users
    WHERE id = p_technician_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Teknisi tidak ditemukan';
    END IF;

    v_tech_name := COALESCE(v_tech.name, 'mitra');

    -- Update order status and assigned technician (fires trg_notify_customer_on_order_status for customer)
    UPDATE public.orders
    SET status = 'accepted',
        driver_id = p_technician_id,
        accepted_at = NOW()
    WHERE id = p_order_id;

    v_event_note := 'Penugasan teknisi (' || v_tech_name || ')' ||
        CASE WHEN p_note IS NOT NULL AND length(btrim(p_note)) > 0
             THEN ': ' || btrim(p_note)
             ELSE ''
        END;

    INSERT INTO public.order_events (order_id, kind, actor_id, note)
    VALUES (p_order_id, 'note', auth.uid(), v_event_note);

    -- Insert notification for the assigned technician
    INSERT INTO public.notifications (user_id, title, description, is_read, link)
    VALUES (
        p_technician_id,
        'Tugas Servis Baru!',
        'Admin menugaskan Anda untuk pesanan ' || COALESCE(v_order.title, 'servis') || '. Silakan cek jadwal di aplikasi Mitra.',
        false,
        '/technician/active-order/' || p_order_id::text
    );

    RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_assign_technician(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_technician(UUID, UUID, TEXT) TO authenticated;

-- Also support 'nanny' segment in announcements (0103) for AnnouncementsPage.jsx
CREATE OR REPLACE FUNCTION public.announcement_recipients(p_segment TEXT)
RETURNS TABLE (user_id UUID, is_partner BOOLEAN) AS $$
    SELECT u.id,
           jsonb_typeof(u.mitra_access) = 'array' AND jsonb_array_length(u.mitra_access) > 0
    FROM public.users u
    WHERE COALESCE(u.status, 'Aktif') <> 'Diblokir'
      AND COALESCE(u.role, 'user') NOT IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops', 'Admin Keuangan', 'CS')
      AND CASE p_segment
            WHEN 'customers' THEN COALESCE(u.role, 'user') = 'user'
            WHEN 'partners' THEN jsonb_typeof(u.mitra_access) = 'array' AND jsonb_array_length(u.mitra_access) > 0
            WHEN 'everyone' THEN true
            WHEN 'driver' THEN COALESCE(u.mitra_access, '[]'::jsonb) ? 'driver'
            WHEN 'merchant' THEN COALESCE(u.mitra_access, '[]'::jsonb) ? 'merchant'
            WHEN 'villa' THEN COALESCE(u.mitra_access, '[]'::jsonb) ? 'villa'
            WHEN 'technician' THEN COALESCE(u.mitra_access, '[]'::jsonb) ? 'technician'
            WHEN 'nanny' THEN COALESCE(u.mitra_access, '[]'::jsonb) ? 'nanny'
            ELSE false
          END;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.announcement_recipients(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_announcement_audience()
RETURNS JSONB AS $$
DECLARE
    v JSONB := '{}'::jsonb;
    s TEXT;
BEGIN
    IF NOT public.admin_can('support') THEN
        RAISE EXCEPTION 'Khusus admin' USING ERRCODE = '42501';
    END IF;
    FOREACH s IN ARRAY ARRAY['everyone', 'customers', 'partners', 'driver', 'merchant', 'villa', 'technician', 'nanny'] LOOP
        v := v || jsonb_build_object(s, (
            SELECT jsonb_build_object('count', COUNT(*),
                                      'push', COUNT(*) FILTER (WHERE u.fcm_token IS NOT NULL AND u.fcm_token <> ''))
            FROM public.announcement_recipients(s) r JOIN public.users u ON u.id = r.user_id));
    END LOOP;
    RETURN v;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_announcement_audience() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_announcement_audience() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_send_announcement(p_segment TEXT, p_title TEXT, p_body TEXT)
RETURNS JSONB AS $$
DECLARE
    v_title TEXT := btrim(COALESCE(p_title, ''));
    v_body TEXT := btrim(COALESCE(p_body, ''));
    v_id UUID;
    v_n INT;
BEGIN
    IF NOT public.admin_can('support') THEN
        RAISE EXCEPTION 'Khusus admin' USING ERRCODE = '42501';
    END IF;
    IF p_segment NOT IN ('everyone', 'customers', 'partners', 'driver', 'merchant', 'villa', 'technician', 'nanny') THEN
        RAISE EXCEPTION 'Segmen tidak dikenal: %', p_segment;
    END IF;
    IF length(v_title) NOT BETWEEN 3 AND 80 THEN
        RAISE EXCEPTION 'Judul 3-80 karakter';
    END IF;
    IF length(v_body) NOT BETWEEN 5 AND 300 THEN
        RAISE EXCEPTION 'Isi 5-300 karakter';
    END IF;
    IF (SELECT COUNT(*) FROM public.announcements WHERE created_at > NOW() - INTERVAL '1 hour') >= 5 THEN
        RAISE EXCEPTION 'Sudah 5 pengumuman dalam satu jam terakhir. Tunggu sebentar agar pengguna tidak merasa di-spam.';
    END IF;

    INSERT INTO public.announcements (segment, title, body, sent_by)
    VALUES (p_segment, v_title, v_body, auth.uid()) RETURNING id INTO v_id;

    INSERT INTO public.notifications (user_id, title, description, is_read, link)
    SELECT r.user_id, v_title, v_body, false, CASE WHEN r.is_partner AND p_segment <> 'customers' THEN '/' ELSE '/notifications' END
    FROM public.announcement_recipients(p_segment) r;
    GET DIAGNOSTICS v_n = ROW_COUNT;

    UPDATE public.announcements SET recipients = v_n WHERE id = v_id;
    PERFORM public.log_admin_action('announcement_sent', 'announcement', v_id::text, NULL, v_title,
                                    jsonb_build_object('segment', p_segment, 'recipients', v_n, 'body', v_body));
    RETURN jsonb_build_object('id', v_id, 'recipients', v_n);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_send_announcement(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_send_announcement(TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Wallet Transfer RPC with optional p_note support
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.wallet_transfer(NUMERIC, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.wallet_transfer(
    p_amount NUMERIC,
    p_recipient_phone TEXT,
    p_description TEXT DEFAULT NULL,
    p_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_sender_id UUID := auth.uid();
    v_recipient_id UUID;
    v_recipient_name TEXT;
    v_sender_name TEXT;
    v_sender_balance NUMERIC;
    v_lock_first UUID;
    v_lock_second UUID;
    v_clean_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
    v_sender_desc TEXT;
    v_recipient_desc TEXT;
BEGIN
    IF v_sender_id IS NULL THEN
        RAISE EXCEPTION 'Anda harus login untuk transfer';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Nominal tidak valid';
    END IF;

    SELECT id, name INTO v_recipient_id, v_recipient_name
    FROM public.users WHERE phone = p_recipient_phone;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Nomor tujuan tidak ditemukan';
    END IF;
    IF v_recipient_id = v_sender_id THEN
        RAISE EXCEPTION 'Tidak bisa transfer ke diri sendiri';
    END IF;

    SELECT name INTO v_sender_name FROM public.users WHERE id = v_sender_id;

    v_lock_first := LEAST(v_sender_id, v_recipient_id);
    v_lock_second := GREATEST(v_sender_id, v_recipient_id);
    PERFORM 1 FROM public.users WHERE id = v_lock_first FOR UPDATE;
    PERFORM 1 FROM public.users WHERE id = v_lock_second FOR UPDATE;

    SELECT wallet_balance INTO v_sender_balance FROM public.users WHERE id = v_sender_id;
    IF COALESCE(v_sender_balance, 0) < p_amount THEN
        RETURN FALSE;
    END IF;

    UPDATE public.users SET wallet_balance = wallet_balance - p_amount WHERE id = v_sender_id;
    UPDATE public.users SET wallet_balance = COALESCE(wallet_balance, 0) + p_amount WHERE id = v_recipient_id;

    v_sender_desc := COALESCE(NULLIF(btrim(COALESCE(p_description, '')), ''), 'Transfer ke ' || COALESCE(v_recipient_name, p_recipient_phone));
    IF v_clean_note IS NOT NULL AND position(v_clean_note in v_sender_desc) = 0 THEN
        v_sender_desc := v_sender_desc || ' - ' || v_clean_note;
    END IF;

    v_recipient_desc := 'Transfer dari ' || COALESCE(v_sender_name, 'Pengguna Wira')
        || CASE WHEN v_clean_note IS NOT NULL THEN ' - ' || v_clean_note ELSE '' END;

    INSERT INTO public.transactions (user_id, amount, type, status, description)
    VALUES (v_sender_id, p_amount, 'transfer', 'success', v_sender_desc);

    INSERT INTO public.transactions (user_id, amount, type, status, description)
    VALUES (v_recipient_id, p_amount, 'transfer_in', 'success', v_recipient_desc);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.wallet_transfer(NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_transfer(NUMERIC, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.transfer_wallet_funds(
    p_recipient_phone TEXT,
    p_amount NUMERIC,
    p_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.wallet_transfer(p_amount, p_recipient_phone, NULL, p_note);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.transfer_wallet_funds(TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_wallet_funds(TEXT, NUMERIC, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Ensure authenticated users can clear their own fcm_token on logout
-- ---------------------------------------------------------------------------
GRANT UPDATE (fcm_token) ON public.users TO authenticated;

