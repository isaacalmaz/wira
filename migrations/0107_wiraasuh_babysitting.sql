-- =========================================
-- 0107: WiraAsuh (babysitting) - one in-house nanny, bookings need approval
--
--   * orders.service_type 'babysit'. Created only through
--     create_babysit_booking (server price, schedule in scheduled_at,
--     children and notes in metadata, cash at the end). Every later change
--     goes through the functions below; direct client inserts/updates of
--     babysit orders are refused (trg_babysit_orders_guard).
--   * Flow: pending (waiting for approval) -> accepted (nanny or admin
--     approves; overlapping sessions refused) -> on_the_way -> working
--     (customer's PIN via start_order_with_pin) -> completed.
--   * Nanny = an account with mitra_access 'nanny' (set by an admin; no
--     public signup). New requests notify the nanny; decisions notify the
--     customer.
--   * Price: pricing_rules babysit/HOURLY (Rp50.000) x hours, plus
--     babysit/EXTRA_CHILD per extra child per hour (Rp0 to start); both
--     editable in Admin. Commission: commission_rates 'babysit' (20%,
--     editable in Komisi). Payout and cash commission use the existing
--     completion trigger (driver_id = nanny).
--   * Cancel: customer free while pending, or until 2 hours before the
--     start once approved (or when the nanny is an hour late); nanny or
--     admin any time before the session starts. Requests still pending at
--     their start time are cancelled by cron.
-- =========================================

INSERT INTO public.commission_rates (service_type, label, description, rate, sort_order)
VALUES ('babysit', 'WiraAsuh', 'Jasa pengasuh anak, per jam', 0.20, 80)
ON CONFLICT (service_type) DO NOTHING;

INSERT INTO public.pricing_rules (service_type, code, name, base_price, per_km_rate, is_active, sort_order, unit_label, description)
VALUES
    ('babysit', 'HOURLY', 'Pengasuh anak per jam', 50000, 0, true, 10, 'jam', 'Tarif per jam untuk 1 anak'),
    ('babysit', 'EXTRA_CHILD', 'Tambahan per anak per jam', 0, 0, true, 20, 'anak/jam', 'Ditambahkan per jam untuk anak kedua dan ketiga')
ON CONFLICT (service_type, code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Booking fields (0090 body): babysit keeps the scheduled_at its own
-- function sets instead of having it cleared.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_order_booking_fields()
RETURNS TRIGGER AS $$
DECLARE
    v_at TIMESTAMPTZ;
    v_pref UUID;
    m TEXT[];
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF current_user IN ('authenticated', 'anon') AND NOT is_admin() AND (
            NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
            OR NEW.preferred_partner_id IS DISTINCT FROM OLD.preferred_partner_id
            OR NEW.package_id IS DISTINCT FROM OLD.package_id
        ) THEN
            RAISE EXCEPTION 'Jadwal dan teknisi pilihan tidak bisa diubah setelah pesanan dibuat';
        END IF;
        RETURN NEW;
    END IF;

    -- Server-owned on insert: materials start at zero (0090).
    IF current_user IN ('authenticated', 'anon') THEN
        NEW.material_amount := 0;
    END IF;

    -- 0107: set by create_babysit_booking.
    IF NEW.service_type = 'babysit' THEN
        NEW.preferred_partner_id := NULL;
        NEW.package_id := NULL;
        RETURN NEW;
    END IF;

    IF NEW.service_type NOT IN ('service', 'pool') THEN
        NEW.scheduled_at := NULL;
        NEW.preferred_partner_id := NULL;
        NEW.package_id := NULL;
        RETURN NEW;
    END IF;

    -- Visits of one monthly pool package share a package_id (0090).
    BEGIN
        NEW.package_id := CASE WHEN NEW.service_type = 'pool' AND NEW.rate_code = 'MONTHLY_VISIT'
                               THEN (NEW.metadata ->> 'package_id')::UUID END;
    EXCEPTION WHEN others THEN
        NEW.package_id := NULL;
    END;

    BEGIN
        v_at := (NEW.metadata ->> 'scheduled_at')::TIMESTAMPTZ;
    EXCEPTION WHEN others THEN
        v_at := NULL;
    END;
    IF v_at IS NULL THEN
        m := regexp_match(COALESCE(NEW.details, ''), 'Jadwal: (\d{4}-\d{2}-\d{2}) pukul (\d{1,2})[:.](\d{2})');
        IF m IS NOT NULL THEN
            v_at := (m[1] || ' ' || m[2] || ':' || m[3])::TIMESTAMP AT TIME ZONE 'Asia/Makassar';
        ELSE
            m := regexp_match(COALESCE(NEW.details, ''), 'Kunjungan: (\d{4}-\d{2}-\d{2})');
            IF m IS NOT NULL THEN
                v_at := (m[1] || ' 08:00')::TIMESTAMP AT TIME ZONE 'Asia/Makassar';
            END IF;
        END IF;
    END IF;
    IF v_at IS NOT NULL AND (v_at < NOW() - INTERVAL '1 hour' OR v_at > NOW() + INTERVAL '90 days') THEN
        RAISE EXCEPTION 'Jadwal kunjungan harus antara sekarang dan 90 hari ke depan';
    END IF;
    NEW.scheduled_at := v_at;

    BEGIN
        v_pref := (NEW.metadata ->> 'preferred_partner_id')::UUID;
    EXCEPTION WHEN others THEN
        v_pref := NULL;
    END;
    IF v_pref IS NOT NULL AND (
        v_pref = NEW.user_id OR NOT public.technician_can_take(v_pref, NEW.service_type, NEW.rate_code)
    ) THEN
        v_pref := NULL;
    END IF;
    NEW.preferred_partner_id := v_pref;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ---------------------------------------------------------------------------
-- Babysit orders change only through the functions below (they run as
-- their owner, so this guard leaves them alone).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_babysit_orders()
RETURNS TRIGGER AS $$
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') OR is_admin() THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' AND NEW.service_type = 'babysit' THEN
        RAISE EXCEPTION 'Pesan WiraAsuh lewat halaman WiraAsuh';
    END IF;
    IF TG_OP = 'UPDATE' AND (OLD.service_type = 'babysit' OR NEW.service_type = 'babysit')
       AND current_setting('wira.review_mark', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Pesanan WiraAsuh diubah lewat tombol di aplikasi';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
DROP TRIGGER IF EXISTS trg_babysit_orders_guard ON public.orders;
CREATE TRIGGER trg_babysit_orders_guard BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_babysit_orders();

-- End of a babysitting session.
CREATE OR REPLACE FUNCTION public.babysit_end_at(o public.orders)
RETURNS TIMESTAMPTZ AS $$
    SELECT o.scheduled_at + make_interval(hours => COALESCE((o.metadata ->> 'hours')::INT, 0));
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.babysit_can_manage()
RETURNS BOOLEAN AS $$
    SELECT public.is_active_partner(auth.uid(), 'nanny') OR public.admin_can('core');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Admins grant the nanny portal like any other (0101 body + 'nanny').
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_partner_access(p_user_id UUID, p_kind TEXT, p_enabled BOOLEAN, p_note TEXT)
RETURNS JSONB AS $$
DECLARE
    u RECORD;
    v_access JSONB;
    v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Khusus admin inti' USING ERRCODE = '42501';
    END IF;
    IF p_kind NOT IN ('driver', 'merchant', 'villa', 'technician', 'nanny') THEN
        RAISE EXCEPTION 'Jenis mitra tidak dikenal: %', p_kind;
    END IF;
    IF v_note IS NULL OR length(v_note) < 5 THEN
        RAISE EXCEPTION 'Tulis alasan (minimal 5 karakter)';
    END IF;
    SELECT * INTO u FROM public.users WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Akun tidak ditemukan';
    END IF;
    v_access := CASE WHEN jsonb_typeof(u.mitra_access) = 'array' THEN u.mitra_access ELSE '[]'::jsonb END;
    IF p_enabled AND NOT v_access ? p_kind THEN
        v_access := v_access || jsonb_build_array(p_kind);
    ELSIF NOT p_enabled THEN
        v_access := v_access - p_kind;
    END IF;
    UPDATE public.users SET mitra_access = v_access WHERE id = p_user_id;
    INSERT INTO public.notifications (user_id, title, description, is_read, link)
    VALUES (p_user_id,
            CASE WHEN p_enabled THEN 'Akses mitra dibuka' ELSE 'Akses mitra dicabut' END,
            'Portal ' || p_kind || ': ' || v_note, false, '/');
    PERFORM public.log_admin_action(CASE WHEN p_enabled THEN 'access_granted' ELSE 'access_revoked' END,
                                    'user', p_user_id::text, p_user_id, v_note, jsonb_build_object('kind', p_kind));
    RETURN v_access;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Create a request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_babysit_booking(
    p_start TIMESTAMPTZ,
    p_hours INT,
    p_children JSONB,
    p_address TEXT,
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_notes TEXT DEFAULT NULL,
    p_emergency_phone TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_hourly NUMERIC;
    v_extra NUMERIC;
    v_count INT;
    v_child JSONB;
    v_age NUMERIC;
    v_under3 INT := 0;
    v_total NUMERIC;
    v_id UUID;
    v_address TEXT := NULLIF(btrim(COALESCE(p_address, '')), '');
    v_notes TEXT := NULLIF(btrim(COALESCE(p_notes, '')), '');
    v_phone TEXT := NULLIF(btrim(COALESCE(p_emergency_phone, '')), '');
    v_nanny RECORD;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Silakan masuk terlebih dahulu' USING ERRCODE = '42501';
    END IF;
    IF p_start IS NULL OR p_start < NOW() + INTERVAL '2 hours' OR p_start > NOW() + INTERVAL '60 days' THEN
        RAISE EXCEPTION 'Pilih waktu mulai paling cepat 2 jam dari sekarang dan paling lambat 60 hari ke depan';
    END IF;
    IF p_hours IS NULL OR p_hours < 2 OR p_hours > 12 THEN
        RAISE EXCEPTION 'Durasi 2 sampai 12 jam';
    END IF;
    IF v_address IS NULL OR length(v_address) < 5 THEN
        RAISE EXCEPTION 'Isi alamat lengkap';
    END IF;
    IF v_phone IS NULL OR length(regexp_replace(v_phone, '\D', '', 'g')) < 8 THEN
        RAISE EXCEPTION 'Isi nomor darurat yang bisa dihubungi selama sesi';
    END IF;
    IF p_children IS NULL OR jsonb_typeof(p_children) <> 'array' THEN
        RAISE EXCEPTION 'Isi data anak';
    END IF;
    v_count := jsonb_array_length(p_children);
    IF v_count < 1 OR v_count > 3 THEN
        RAISE EXCEPTION 'Satu pengasuh untuk 1 sampai 3 anak';
    END IF;
    FOR v_child IN SELECT * FROM jsonb_array_elements(p_children) LOOP
        BEGIN
            v_age := (v_child ->> 'age_years')::NUMERIC;
        EXCEPTION WHEN others THEN
            v_age := NULL;
        END;
        IF v_age IS NULL OR v_age < 0 OR v_age > 12 THEN
            RAISE EXCEPTION 'Usia anak 0 sampai 12 tahun';
        END IF;
        IF v_age < 3 THEN v_under3 := v_under3 + 1; END IF;
    END LOOP;
    IF v_under3 > 2 THEN
        RAISE EXCEPTION 'Maksimal 2 anak di bawah 3 tahun per pengasuh';
    END IF;

    SELECT base_price INTO v_hourly FROM public.pricing_rules
    WHERE service_type = 'babysit' AND code = 'HOURLY' AND is_active = true;
    IF v_hourly IS NULL THEN
        RAISE EXCEPTION 'WiraAsuh sedang tidak menerima pesanan';
    END IF;
    SELECT base_price INTO v_extra FROM public.pricing_rules
    WHERE service_type = 'babysit' AND code = 'EXTRA_CHILD' AND is_active = true;
    v_total := (v_hourly + COALESCE(v_extra, 0) * (v_count - 1)) * p_hours;

    IF EXISTS (SELECT 1 FROM public.orders o
               WHERE o.user_id = v_uid AND o.service_type = 'babysit'
                 AND o.status IN ('pending', 'accepted', 'on_the_way', 'working')
                 AND o.scheduled_at < p_start + make_interval(hours => p_hours)
                 AND public.babysit_end_at(o) > p_start) THEN
        RAISE EXCEPTION 'Anda sudah punya pesanan WiraAsuh di jam itu';
    END IF;

    INSERT INTO public.orders (
        user_id, service_type, status, payment_method, payment_status, total_price,
        title, details, pickup_lat, pickup_lng, scheduled_at, metadata
    ) VALUES (
        v_uid, 'babysit', 'pending', 'cash', 'unpaid', v_total,
        'Pengasuh anak · ' || p_hours || ' jam',
        'Jadwal: ' || to_char(p_start AT TIME ZONE 'Asia/Makassar', 'YYYY-MM-DD "pukul" HH24:MI') || ' WITA • '
            || v_count || ' anak • Lokasi: ' || v_address,
        p_lat, p_lng, p_start,
        jsonb_build_object('hours', p_hours, 'children', p_children, 'address', v_address,
                           'notes', v_notes, 'emergency_phone', v_phone,
                           'hourly', v_hourly, 'extra_child', COALESCE(v_extra, 0))
    ) RETURNING id INTO v_id;

    FOR v_nanny IN SELECT id FROM public.users
                   WHERE COALESCE(mitra_access, '[]'::jsonb) ? 'nanny' AND COALESCE(status, 'Aktif') <> 'Diblokir'
    LOOP
        INSERT INTO public.notifications (user_id, title, description, is_read, link)
        VALUES (v_nanny.id, 'Permintaan WiraAsuh baru',
                to_char(p_start AT TIME ZONE 'Asia/Makassar', 'DD Mon, HH24:MI') || ' · ' || p_hours || ' jam · '
                    || v_count || ' anak. Setujui atau tolak di aplikasi.',
                false, '/nanny');
    END LOOP;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Approve or decline (nanny or core admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.babysit_respond(p_order_id UUID, p_accept BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
    o public.orders%ROWTYPE;
    v_uid UUID := auth.uid();
    v_nanny UUID;
    v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
    v_when TEXT;
BEGIN
    IF NOT public.babysit_can_manage() THEN
        RAISE EXCEPTION 'Khusus pengasuh WiraAsuh' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO o FROM public.orders WHERE id = p_order_id AND service_type = 'babysit' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;
    IF o.status <> 'pending' THEN
        RAISE EXCEPTION 'Pesanan ini sudah diproses';
    END IF;
    v_when := to_char(o.scheduled_at AT TIME ZONE 'Asia/Makassar', 'DD Mon, HH24:MI');

    IF NOT p_accept THEN
        UPDATE public.orders SET status = 'cancelled', updated_at = NOW() WHERE id = o.id;
        INSERT INTO public.order_events (order_id, actor_id, kind, note)
        VALUES (o.id, v_uid, 'cancel', v_reason);
        INSERT INTO public.notifications (user_id, title, description, is_read, link)
        VALUES (o.user_id, 'Pesanan WiraAsuh belum bisa diterima',
                'Jadwal ' || v_when || ' tidak tersedia' || COALESCE('. ' || v_reason, '') || '. Silakan pilih waktu lain.',
                false, '/active-order/' || o.id);
        RETURN 'cancelled';
    END IF;

    IF o.scheduled_at <= NOW() THEN
        RAISE EXCEPTION 'Waktu mulai sudah lewat';
    END IF;
    -- The approving nanny takes it; an admin approves on behalf of the
    -- (single) active nanny.
    IF public.is_active_partner(v_uid, 'nanny') THEN
        v_nanny := v_uid;
    ELSE
        SELECT id INTO v_nanny FROM public.users
        WHERE COALESCE(mitra_access, '[]'::jsonb) ? 'nanny' AND COALESCE(status, 'Aktif') <> 'Diblokir'
        ORDER BY created_at LIMIT 1;
        IF v_nanny IS NULL THEN
            RAISE EXCEPTION 'Belum ada akun pengasuh aktif';
        END IF;
    END IF;
    IF v_nanny = o.user_id THEN
        RAISE EXCEPTION 'Tidak bisa menerima pesanan sendiri';
    END IF;
    -- One session at a time, with an hour to travel between them.
    PERFORM 1 FROM public.users WHERE id = v_nanny FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.orders x
               WHERE x.driver_id = v_nanny AND x.service_type = 'babysit' AND x.id <> o.id
                 AND x.status IN ('accepted', 'on_the_way', 'working')
                 AND x.scheduled_at < public.babysit_end_at(o) + INTERVAL '1 hour'
                 AND public.babysit_end_at(x) + INTERVAL '1 hour' > o.scheduled_at) THEN
        RAISE EXCEPTION 'Bentrok dengan sesi lain yang sudah disetujui';
    END IF;

    UPDATE public.orders SET status = 'accepted', driver_id = v_nanny, accepted_at = NOW(), updated_at = NOW()
    WHERE id = o.id;
    INSERT INTO public.notifications (user_id, title, description, is_read, link)
    VALUES (o.user_id, 'Pesanan WiraAsuh disetujui',
            'Pengasuh datang ' || v_when || ' WITA. Berikan PIN di aplikasi saat pengasuh tiba.',
            false, '/active-order/' || o.id);
    RETURN 'accepted';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Nanny steps: on the way, finished (the PIN start is start_order_with_pin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.babysit_set_status(p_order_id UUID, p_status TEXT)
RETURNS TEXT AS $$
DECLARE
    o public.orders%ROWTYPE;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order_id AND service_type = 'babysit' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;
    IF o.driver_id IS DISTINCT FROM auth.uid() AND NOT public.admin_can('core') THEN
        RAISE EXCEPTION 'Khusus pengasuh pesanan ini' USING ERRCODE = '42501';
    END IF;
    IF p_status = 'on_the_way' AND o.status = 'accepted' THEN
        NULL;
    ELSIF p_status = 'completed' AND o.status = 'working' THEN
        NULL;
    ELSE
        RAISE EXCEPTION 'Langkah ini belum bisa dilakukan (status sekarang: %)', o.status;
    END IF;
    UPDATE public.orders SET status = p_status, updated_at = NOW() WHERE id = o.id;
    INSERT INTO public.notifications (user_id, title, description, is_read, link)
    VALUES (o.user_id,
            CASE p_status WHEN 'on_the_way' THEN 'Pengasuh dalam perjalanan' ELSE 'Sesi WiraAsuh selesai' END,
            CASE p_status WHEN 'on_the_way' THEN 'Siapkan PIN untuk memulai sesi.'
                          ELSE 'Terima kasih. Bayar tunai ke pengasuh, lalu beri penilaian.' END,
            false, '/active-order/' || o.id);
    RETURN p_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Cancel
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.babysit_cancel(p_order_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
    o public.orders%ROWTYPE;
    v_uid UUID := auth.uid();
    v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
    v_staff BOOLEAN;
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order_id AND service_type = 'babysit' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;
    v_staff := o.driver_id = v_uid OR public.admin_can('core')
               OR (o.status = 'pending' AND public.is_active_partner(v_uid, 'nanny'));
    IF o.user_id IS DISTINCT FROM v_uid AND NOT v_staff THEN
        RAISE EXCEPTION 'Tidak berhak membatalkan pesanan ini' USING ERRCODE = '42501';
    END IF;
    IF o.status NOT IN ('pending', 'accepted', 'on_the_way') THEN
        RAISE EXCEPTION 'Sesi sudah dimulai atau selesai, tidak bisa dibatalkan';
    END IF;
    IF o.user_id = v_uid AND NOT v_staff AND o.status <> 'pending'
       AND NOW() >= o.scheduled_at - INTERVAL '2 hours'
       AND NOW() < o.scheduled_at + INTERVAL '1 hour' THEN
        RAISE EXCEPTION 'Pembatalan gratis hanya sampai 2 jam sebelum mulai. Hubungi pengasuh lewat chat.';
    END IF;

    UPDATE public.orders SET status = 'cancelled', updated_at = NOW() WHERE id = o.id;
    INSERT INTO public.order_events (order_id, actor_id, kind, note)
    VALUES (o.id, v_uid, 'cancel', v_reason);
    IF o.user_id = v_uid THEN
        IF o.driver_id IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, title, description, is_read, link)
            VALUES (o.driver_id, 'Pesanan WiraAsuh dibatalkan pelanggan',
                    to_char(o.scheduled_at AT TIME ZONE 'Asia/Makassar', 'DD Mon, HH24:MI') || COALESCE(' · ' || v_reason, ''),
                    false, '/nanny');
        END IF;
    ELSE
        INSERT INTO public.notifications (user_id, title, description, is_read, link)
        VALUES (o.user_id, 'Pesanan WiraAsuh dibatalkan',
                'Jadwal ' || to_char(o.scheduled_at AT TIME ZONE 'Asia/Makassar', 'DD Mon, HH24:MI')
                    || ' dibatalkan oleh Wira' || COALESCE('. ' || v_reason, '') || '.',
                false, '/active-order/' || o.id);
    END IF;
    RETURN 'cancelled';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Open requests for the nanny (orders RLS hides unassigned rows from
-- partners); customer first name and phone so the nanny can decide.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_babysit_requests()
RETURNS TABLE (
    id UUID, scheduled_at TIMESTAMPTZ, hours INT, total_price NUMERIC, details TEXT,
    metadata JSONB, customer_name TEXT, created_at TIMESTAMPTZ
) AS $$
BEGIN
    IF NOT public.babysit_can_manage() THEN
        RAISE EXCEPTION 'Khusus pengasuh WiraAsuh' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT o.id, o.scheduled_at, COALESCE((o.metadata ->> 'hours')::INT, 0), o.total_price, o.details,
           o.metadata, split_part(COALESCE(u.name, 'Pelanggan'), ' ', 1), o.created_at
    FROM public.orders o
    LEFT JOIN public.users u ON u.id = o.user_id
    WHERE o.service_type = 'babysit' AND o.status = 'pending'
    ORDER BY o.scheduled_at;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Busy times for the booking form (no customer data)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_babysit_busy(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (start_at TIMESTAMPTZ, end_at TIMESTAMPTZ) AS $$
    SELECT o.scheduled_at, public.babysit_end_at(o)
    FROM public.orders o
    WHERE o.service_type = 'babysit' AND o.status IN ('accepted', 'on_the_way', 'working')
      AND o.scheduled_at < p_to AND public.babysit_end_at(o) > p_from
    ORDER BY o.scheduled_at;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- PIN start (0089 body): babysitting starts like a technician visit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_order_with_pin(p_order_id UUID, p_pin_input VARCHAR(4))
RETURNS JSONB AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_caller UUID := auth.uid();
    v_real_pin VARCHAR(4);
    v_is_visit BOOLEAN;
    v_next TEXT;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pesanan tidak ditemukan');
    END IF;

    IF v_order.driver_id IS DISTINCT FROM v_caller AND NOT is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anda tidak berhak memulai pesanan ini');
    END IF;

    v_is_visit := v_order.service_type IN ('service', 'pool', 'babysit');
    v_next := CASE WHEN v_is_visit THEN 'working' ELSE 'in_trip' END;

    IF (v_is_visit AND v_order.status NOT IN ('accepted', 'on_the_way'))
       OR (NOT v_is_visit AND v_order.status NOT IN ('accepted', 'picking_up')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pesanan belum siap untuk dimulai');
    END IF;

    IF v_order.pin_attempts >= 5 THEN
        PERFORM public.refund_order_to_wallet(p_order_id, 'Refund Pembatalan (PIN salah berulang)');
        UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
        RETURN jsonb_build_object('success', false, 'error', 'Terlalu banyak percobaan PIN. Pesanan dibatalkan otomatis demi keamanan.');
    END IF;

    SELECT pin INTO v_real_pin FROM public.order_security_pins WHERE order_id = p_order_id;

    IF v_real_pin IS DISTINCT FROM p_pin_input THEN
        UPDATE public.orders SET pin_attempts = COALESCE(pin_attempts, 0) + 1 WHERE id = p_order_id;
        RETURN jsonb_build_object('success', false, 'error', 'PIN tidak valid. Sisa percobaan: ' || (5 - (COALESCE(v_order.pin_attempts, 0) + 1)));
    END IF;

    UPDATE public.orders
    SET status = v_next, updated_at = NOW(), pin_attempts = 0
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'status', v_next);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Requests nobody approved before their start time
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_babysit_requests()
RETURNS INT AS $$
DECLARE
    r RECORD;
    n INT := 0;
BEGIN
    FOR r IN SELECT id, user_id FROM public.orders
             WHERE service_type = 'babysit' AND status = 'pending' AND scheduled_at <= NOW()
             FOR UPDATE SKIP LOCKED
    LOOP
        UPDATE public.orders SET status = 'cancelled', updated_at = NOW() WHERE id = r.id;
        INSERT INTO public.notifications (user_id, title, description, is_read, link)
        VALUES (r.user_id, 'Pesanan WiraAsuh tidak terkonfirmasi',
                'Maaf, pesanan Anda belum disetujui sampai waktu mulai, jadi kami batalkan.', false, '/active-order/' || r.id);
        n := n + 1;
    END LOOP;
    RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule('wira-babysit-expire', '*/10 * * * *', 'SELECT public.expire_babysit_requests()');
    END IF;
END $$;

REVOKE ALL ON FUNCTION public.babysit_end_at(public.orders) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.babysit_can_manage() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_babysit_booking(TIMESTAMPTZ, INT, JSONB, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.babysit_respond(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.babysit_set_status(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.babysit_cancel(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_babysit_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expire_babysit_requests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.babysit_end_at(public.orders) TO authenticated;
GRANT EXECUTE ON FUNCTION public.babysit_can_manage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_babysit_booking(TIMESTAMPTZ, INT, JSONB, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.babysit_respond(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.babysit_set_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.babysit_cancel(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_babysit_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_babysit_busy(TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;

-- Verify after applying:
--   SELECT code, base_price FROM pricing_rules WHERE service_type = 'babysit';
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_babysit_orders_guard';
--   SELECT jobname FROM cron.job WHERE jobname = 'wira-babysit-expire';
