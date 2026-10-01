-- Migration 0089: technician foundation (WiraService / WiraPool), phase 1 of
-- the technician rebuild.
--
-- What was broken (audit 2026-10-01):
--   a) list_technicians() / get_technician_profiles() were executable by
--      anon and returned every technician's email and phone.
--   b) every logged-in user could read (and the update policy matched) every
--      unassigned pending order, address and complaint text included.
--   c) any account could insert its own public.drivers row, which satisfied
--      the claim guardrail in enforce_orders_state_machine (0070); the
--      partner app did exactly that for technicians through its GPS loop.
--   d) a blocked partner (users.status = 'Diblokir') was still dispatched to
--      and could still claim orders.
--   e) the booked visit time only existed inside orders.details, so a visit
--      booked for 3 days later was auto-cancelled 30 minutes after payment
--      (0088), and a re-queued order was cancelled within a minute because
--      the window ran from creation.
--   f) dispatch offered every service/pool job to every technician in id
--      order, ignoring their skill and the technician the customer picked.
--   g) the customer PIN was never asked of technicians.
--
-- New here:
--   * public.service_skills: the skill list, editable by admins. Group
--     'servis' = fixed-price jobs booked directly (codes match
--     pricing_rules.code for service, plus Pool); group 'proyek' = trades
--     for larger jobs (finishing, terazzo, ...) used by the project /
--     quote flow later.
--   * public.technician_profiles: a technician's skills (several allowed)
--     and the persisted "accepting jobs" switch. Created automatically when
--     a user gains 'technician' access, with the skills from their
--     application (mitra_applications.skills, new).
--   * orders.scheduled_at and orders.preferred_partner_id, derived on insert
--     from orders.metadata (scheduled_at, preferred_partner_id) with the old
--     "Jadwal: … pukul …" / "Kunjungan: …" details text as a fallback.
--     Clients cannot change them afterwards.
--   * The technician the customer picked gets the job alone for 10 minutes,
--     then it opens to every active technician with that skill.
--   * Service/pool: accepted -> on_the_way -> working (only through
--     start_order_with_pin) -> completed.
--   * get_open_technician_jobs(), list_service_technicians() for the apps.
--
-- Depends on 0070, 0072, 0083, 0084, 0088. Re-runnable.

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

-- Active partner of a kind ('driver', 'technician', ...): has the access and
-- is not blocked.
CREATE OR REPLACE FUNCTION public.is_active_partner(p_user_id UUID, p_kind TEXT)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = p_user_id
          AND COALESCE(u.status, 'Aktif') <> 'Diblokir'
          AND COALESCE(u.mitra_access, '[]'::jsonb) ? p_kind
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- The skill an order needs: pool jobs need 'Pool', service jobs need their
-- pricing_rules code.
CREATE OR REPLACE FUNCTION public.order_required_skill(p_service_type TEXT, p_rate_code TEXT)
RETURNS TEXT AS $$
    SELECT CASE WHEN p_service_type = 'pool' THEN 'Pool'
                WHEN p_service_type = 'service' THEN p_rate_code END;
$$ LANGUAGE sql IMMUTABLE;

-- Registration specialization (frontend-mitra RegisterPage) -> skill code.
CREATE OR REPLACE FUNCTION public.technician_skill_from_specialization(p_specialization TEXT)
RETURNS TEXT AS $$
    SELECT CASE p_specialization
        WHEN 'AC & Pendingin' THEN 'AC'
        WHEN 'Instalasi Listrik' THEN 'Listrik'
        WHEN 'Pipa & Pompa Air' THEN 'Plumbing'
        WHEN 'Tukang Bangunan' THEN 'Tukang'
        WHEN 'Maintenance Kolam Renang' THEN 'Pool'
    END;
$$ LANGUAGE sql IMMUTABLE;

-- ---------------------------------------------------------------------------
-- 2. Skills and technician_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_skills (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    skill_group TEXT NOT NULL CHECK (skill_group IN ('servis', 'proyek')),
    sort_order INT NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.service_skills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_skills_select ON public.service_skills;
CREATE POLICY service_skills_select ON public.service_skills FOR SELECT USING (true);
DROP POLICY IF EXISTS service_skills_admin ON public.service_skills;
CREATE POLICY service_skills_admin ON public.service_skills FOR ALL USING (is_admin()) WITH CHECK (is_admin());
-- Read on the registration form, before the applicant has an account.
GRANT SELECT ON public.service_skills TO anon, authenticated;

INSERT INTO public.service_skills (code, name, skill_group, sort_order) VALUES
    ('AC', 'Servis & Cuci AC', 'servis', 10),
    ('Listrik', 'Instalasi Listrik', 'servis', 20),
    ('Plumbing', 'Pipa & Pompa Air', 'servis', 30),
    ('Tukang', 'Tukang Bangunan (perbaikan)', 'servis', 40),
    ('Pool', 'Perawatan Kolam Renang', 'servis', 50),
    ('Finishing', 'Cat & Finishing', 'proyek', 110),
    ('Terazzo', 'Terazzo', 'proyek', 120),
    ('Keramik', 'Keramik & Granit', 'proyek', 130),
    ('Plafon', 'Plafon & Gypsum', 'proyek', 140),
    ('Kayu', 'Kayu, Kusen & Furnitur', 'proyek', 150),
    ('Bambu', 'Konstruksi Bambu', 'proyek', 160),
    ('Atap', 'Atap, Baja Ringan & Alang-alang', 'proyek', 170),
    ('Las', 'Las, Besi & Kanopi', 'proyek', 180),
    ('Waterproofing', 'Anti Bocor & Waterproofing', 'proyek', 190),
    ('KolamBaru', 'Pembuatan Kolam Renang', 'proyek', 200),
    ('Taman', 'Taman & Lanskap', 'proyek', 210),
    ('CCTV', 'CCTV & Jaringan', 'proyek', 220),
    ('PanelSurya', 'Panel Surya', 'proyek', 230),
    ('SumurBor', 'Sumur Bor & Pompa', 'proyek', 240)
ON CONFLICT (code) DO NOTHING;

-- Only codes that exist in service_skills, without duplicates.
CREATE OR REPLACE FUNCTION public.clean_skill_codes(p_codes TEXT[])
RETURNS TEXT[] AS $$
    SELECT COALESCE(array_agg(s.code ORDER BY s.sort_order), '{}')
    FROM public.service_skills s
    WHERE s.code = ANY (COALESCE(p_codes, '{}'));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

ALTER TABLE public.mitra_applications ADD COLUMN IF NOT EXISTS skills TEXT[];

CREATE TABLE IF NOT EXISTS public.technician_profiles (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    skills TEXT[] NOT NULL DEFAULT '{}',
    is_accepting BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.technician_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS technician_profiles_select ON public.technician_profiles;
CREATE POLICY technician_profiles_select ON public.technician_profiles
    FOR SELECT USING (user_id = auth.uid() OR is_admin());
DROP POLICY IF EXISTS technician_profiles_update ON public.technician_profiles;
CREATE POLICY technician_profiles_update ON public.technician_profiles
    FOR UPDATE USING (user_id = auth.uid() OR is_admin())
    WITH CHECK (user_id = auth.uid() OR is_admin());
DROP POLICY IF EXISTS technician_profiles_insert_admin ON public.technician_profiles;
CREATE POLICY technician_profiles_insert_admin ON public.technician_profiles
    FOR INSERT WITH CHECK (is_admin());

-- Technicians may only flip their own switch; skills are set by admins.
REVOKE ALL ON public.technician_profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.technician_profiles FROM authenticated;
GRANT SELECT, INSERT ON public.technician_profiles TO authenticated;
GRANT UPDATE (is_accepting, skills, updated_at) ON public.technician_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_technician_profile_update()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND current_user IN ('authenticated', 'anon') AND NOT is_admin()
       AND NEW.skills IS DISTINCT FROM OLD.skills THEN
        RAISE EXCEPTION 'Keahlian teknisi hanya bisa diubah oleh admin';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(NEW.skills) c
               WHERE NOT EXISTS (SELECT 1 FROM public.service_skills s WHERE s.code = c)) THEN
        RAISE EXCEPTION 'Kode keahlian tidak dikenal';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
DROP TRIGGER IF EXISTS trg_guard_technician_profile_update ON public.technician_profiles;
CREATE TRIGGER trg_guard_technician_profile_update BEFORE INSERT OR UPDATE ON public.technician_profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_technician_profile_update();

-- Skills from the latest technician application: the chosen list, or else
-- the specialization text (one legacy option, or a ", "-joined list of
-- skill names sent before this migration ran).
CREATE OR REPLACE FUNCTION public.technician_application_skills(p_user_id UUID)
RETURNS TEXT[] AS $$
    SELECT COALESCE((
        SELECT public.clean_skill_codes(
            CASE WHEN cardinality(a.skills) > 0 THEN a.skills
                 ELSE ARRAY(
                     SELECT public.technician_skill_from_specialization(a.specialization)
                     UNION
                     SELECT s.code FROM public.service_skills s
                     WHERE s.name = ANY (string_to_array(COALESCE(a.specialization, ''), ', '))
                 ) END)
        FROM public.mitra_applications a
        WHERE a.auth_id = p_user_id AND a.role = 'technician'
        ORDER BY a.created_at DESC LIMIT 1
    ), '{}');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- A user who gains 'technician' access gets a profile with the skill from
-- their latest application (empty when an admin granted access by hand;
-- the admin then picks skills on the Technicians page).
CREATE OR REPLACE FUNCTION public.ensure_technician_profile()
RETURNS TRIGGER AS $$
BEGIN
    IF COALESCE(NEW.mitra_access, '[]'::jsonb) ? 'technician'
       AND (TG_OP = 'INSERT' OR NOT (COALESCE(OLD.mitra_access, '[]'::jsonb) ? 'technician')) THEN
        INSERT INTO public.technician_profiles (user_id, skills)
        SELECT NEW.id, public.technician_application_skills(NEW.id)
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_ensure_technician_profile ON public.users;
CREATE TRIGGER trg_ensure_technician_profile AFTER INSERT OR UPDATE OF mitra_access ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.ensure_technician_profile();

-- Backfill technicians that already exist.
INSERT INTO public.technician_profiles (user_id, skills)
SELECT u.id, public.technician_application_skills(u.id)
FROM public.users u
WHERE COALESCE(u.mitra_access, '[]'::jsonb) ? 'technician'
ON CONFLICT (user_id) DO NOTHING;

-- Active technician who has the skill this order needs.
CREATE OR REPLACE FUNCTION public.technician_can_take(p_user_id UUID, p_service_type TEXT, p_rate_code TEXT)
RETURNS BOOLEAN AS $$
    SELECT public.is_active_partner(p_user_id, 'technician')
       AND EXISTS (
           SELECT 1 FROM public.technician_profiles t
           WHERE t.user_id = p_user_id
             AND public.order_required_skill(p_service_type, p_rate_code) = ANY (t.skills)
       );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Applications now carry the chosen skills (0084 body plus `skills`).
CREATE OR REPLACE FUNCTION public.submit_mitra_application(p_application JSONB, p_auth_id UUID DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_role TEXT := p_application->>'role';
    v_id UUID;
BEGIN
    IF v_uid IS NULL THEN
        SELECT u.id INTO v_uid FROM auth.users u
        WHERE u.id = p_auth_id AND u.created_at > NOW() - INTERVAL '1 hour'
          AND NOT EXISTS (SELECT 1 FROM public.mitra_applications a WHERE a.auth_id = u.id);
        IF v_uid IS NULL THEN RAISE EXCEPTION 'Silakan login terlebih dahulu.'; END IF;
    END IF;
    IF v_role IS NULL OR v_role NOT IN ('driver', 'merchant', 'villa', 'technician') THEN
        RAISE EXCEPTION 'Jenis mitra tidak valid: %', v_role;
    END IF;
    IF length(COALESCE(p_application->>'sim_photo', '')) > 3000000 THEN
        RAISE EXCEPTION 'Foto dokumen terlalu besar.';
    END IF;
    DELETE FROM public.mitra_applications WHERE auth_id = v_uid AND role = v_role AND status = 'Pending';
    INSERT INTO public.mitra_applications (auth_id, role, name, phone, email, vehicle, plate,
        vehicle_type, job_type_preferences, sim_photo, restaurant_name, address, service_type,
        specialization, experience, skills)
    SELECT v_uid, v_role, a->>'name', a->>'phone', (SELECT u.email FROM auth.users u WHERE u.id = v_uid),
        a->>'vehicle', a->>'plate', a->>'vehicle_type', NULLIF(a->'job_type_preferences', 'null'::jsonb),
        a->>'sim_photo', a->>'restaurant_name', a->>'address', a->>'service_type',
        a->>'specialization', a->>'experience',
        CASE WHEN v_role = 'technician' AND jsonb_typeof(a->'skills') = 'array'
             THEN public.clean_skill_codes(ARRAY(SELECT jsonb_array_elements_text(a->'skills'))) END
    FROM (SELECT p_application AS a) s
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.submit_mitra_application(JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_mitra_application(JSONB, UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Booking fields on orders
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS preferred_partner_id UUID
    REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS orders_open_jobs_idx ON public.orders (service_type, status)
    WHERE driver_id IS NULL;

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
        ) THEN
            RAISE EXCEPTION 'Jadwal dan teknisi pilihan tidak bisa diubah setelah pesanan dibuat';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.service_type NOT IN ('service', 'pool') THEN
        NEW.scheduled_at := NULL;
        NEW.preferred_partner_id := NULL;
        RETURN NEW;
    END IF;

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
DROP TRIGGER IF EXISTS trg_set_order_booking_fields ON public.orders;
CREATE TRIGGER trg_set_order_booking_fields BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_order_booking_fields();

-- ---------------------------------------------------------------------------
-- 4. Who may see / claim an unassigned order
-- ---------------------------------------------------------------------------
-- How long the customer's chosen technician has the job to themselves.
CREATE OR REPLACE FUNCTION public.preferred_partner_window()
RETURNS INTERVAL AS $$ SELECT INTERVAL '10 minutes'; $$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.can_see_open_order(
    p_service_type TEXT, p_rate_code TEXT, p_status TEXT, p_merchant_id UUID,
    p_preferred UUID, p_since TIMESTAMPTZ
)
RETURNS BOOLEAN AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RETURN FALSE;
    END IF;
    IF p_status = 'pending' THEN
        IF p_service_type IN ('service', 'pool') THEN
            RETURN public.technician_can_take(v_uid, p_service_type, p_rate_code)
               AND (p_preferred IS NULL OR p_preferred = v_uid
                    OR p_since < NOW() - public.preferred_partner_window());
        ELSIF p_service_type IN ('ride', 'send', 'food') THEN
            RETURN public.is_active_partner(v_uid, 'driver');
        END IF;
        RETURN FALSE;
    ELSIF p_status = 'ready' AND p_merchant_id IS NOT NULL THEN
        RETURN public.is_active_partner(v_uid, 'driver');
    END IF;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "orders_select_own_or_relevant" ON public.orders;
CREATE POLICY "orders_select_own_or_relevant" ON public.orders
FOR SELECT USING (
    auth.uid() = user_id
    OR driver_id = auth.uid()
    OR (driver_id IS NULL AND status IN ('pending', 'ready')
        AND public.can_see_open_order(service_type, rate_code, status, merchant_id,
                                      preferred_partner_id, status_changed_at))
    OR merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
    OR is_admin()
);

DROP POLICY IF EXISTS "orders_update_mitra_or_admin" ON public.orders;
CREATE POLICY "orders_update_mitra_or_admin" ON public.orders
FOR UPDATE USING (
    (driver_id IS NULL AND status IN ('pending', 'ready')
     AND public.can_see_open_order(service_type, rate_code, status, merchant_id,
                                   preferred_partner_id, status_changed_at))
    OR driver_id = auth.uid()
    OR merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
    OR is_admin()
);

-- Only active drivers may create their own drivers row (0014 let anyone).
DROP POLICY IF EXISTS "Drivers can insert own record" ON public.drivers;
CREATE POLICY "Drivers can insert own record" ON public.drivers
FOR INSERT WITH CHECK (auth.uid() = id AND public.is_active_partner(id, 'driver'));

-- ---------------------------------------------------------------------------
-- 5. State machine (0070 body, with the claim guardrail and the
--    technician flow changed; everything else verbatim)
-- ---------------------------------------------------------------------------
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

    IF OLD.status IN ('cancelled', 'completed') AND NOT is_admin() THEN
        RAISE EXCEPTION 'Order is already finalized (%) and cannot be modified', OLD.status;
    END IF;

    IF NEW.total_price IS DISTINCT FROM OLD.total_price AND NOT is_admin() THEN
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
        THEN
            RAISE EXCEPTION 'Only status and driver assignment can be changed on an existing order';
        END IF;
    END IF;

    -- claiming an unassigned order
    IF OLD.driver_id IS NULL AND NEW.driver_id IS NOT NULL AND NOT is_admin() THEN
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
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 6. PIN start: technician visits go to 'working'; too many wrong PINs now
--    refund a paid order instead of cancelling it with the money kept.
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

    v_is_visit := v_order.service_type IN ('service', 'pool');
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
-- 7. Dispatch: technicians matched by skill, chosen technician first, each
--    technician pinged once per order (the job board shows the rest).
--    Windows run from status_changed_at = when the order last became
--    pending (covers QRIS payment and re-queue).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_due_orders(p_limit INT DEFAULT 20)
RETURNS SETOF UUID AS $$
    SELECT o.id FROM public.orders o
    WHERE o.status = 'pending' AND o.driver_id IS NULL
      AND (
          (o.service_type IN ('ride', 'send') AND o.status_changed_at > NOW() - INTERVAL '30 minutes')
          OR (o.service_type IN ('pool', 'service') AND o.status_changed_at > NOW() - INTERVAL '2 hours')
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

    IF o.service_type IN ('ride', 'send') THEN
        SELECT COALESCE(array_agg(n.id ORDER BY n.distance_meters), '{}') INTO v_cands
        FROM public.get_nearest_drivers(o.pickup_lat, o.pickup_lng,
             CASE WHEN o.service_type = 'ride' THEN o.rate_code END, true, 10) n
        WHERE o.pickup_lat IS NOT NULL AND n.id <> o.user_id
          AND public.is_active_partner(n.id, 'driver');
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
        -- Drivers: everyone in this round was pinged, start over from the
        -- nearest. Technicians are pinged once; the job board does the rest.
        IF v_next IS NULL AND cardinality(v_cands) > 0 AND o.service_type IN ('ride', 'send') THEN
            v_round := v_round + 1;
            v_next := v_cands[1];
        END IF;
        IF v_next IS NOT NULL THEN
            INSERT INTO public.order_dispatch_pings (order_id, driver_id, round)
            VALUES (p_order_id, v_next, v_round);
        END IF;
    END IF;

    RETURN QUERY SELECT v_next, o.service_type,
        (SELECT COUNT(*)::INT FROM public.order_dispatch_pings p
         WHERE p.order_id = p_order_id AND p.round = v_round),
        cardinality(v_cands);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.dispatch_next_ping(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_next_ping(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Expiry: a booked visit waits until one hour before the visit (at least
--    30 minutes); everything else 30 minutes after it last became pending.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_unmatched_orders()
RETURNS INT AS $$
DECLARE
    r RECORD;
    v_refund NUMERIC;
    n INT := 0;
BEGIN
    FOR r IN
        SELECT id, user_id, title, service_type
        FROM public.orders
        WHERE status = 'pending'
          AND driver_id IS NULL
          AND service_type IN ('ride', 'send', 'food', 'service', 'pool')
          AND CASE
                WHEN service_type IN ('service', 'pool') AND scheduled_at IS NOT NULL THEN
                    NOW() > GREATEST(status_changed_at + INTERVAL '30 minutes', scheduled_at - INTERVAL '1 hour')
                ELSE status_changed_at < NOW() - INTERVAL '30 minutes'
              END
        FOR UPDATE SKIP LOCKED
    LOOP
        v_refund := public.refund_order_to_wallet(r.id, 'Refund Pembatalan Otomatis (Tidak Ada Mitra)');
        UPDATE public.orders SET status = 'cancelled' WHERE id = r.id AND status = 'pending';
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (
            r.user_id,
            'Pesanan dibatalkan otomatis',
            CASE WHEN r.service_type IN ('service', 'pool')
                 THEN 'Belum ada teknisi yang bisa mengambil '
                 ELSE 'Belum ada mitra yang tersedia untuk ' END
            || COALESCE(r.title, 'pesanan Anda') || '. '
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

-- ---------------------------------------------------------------------------
-- 9. Cancellation (0088 body; visits get their own customer rule and the
--    technician can release an accepted or en-route job back to the queue)
--    Customer, visit: free while pending, within 3 minutes of acceptance,
--    until 2 hours before the visit, or once the technician is more than an
--    hour late; never once work has started.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wallet_refund_matched_ride(p_order_id UUID, p_description TEXT DEFAULT 'Refund Pembatalan Perjalanan')
RETURNS BOOLEAN AS $$
DECLARE
    v_order RECORD;
    v_caller UUID := auth.uid();
    v_is_driver BOOLEAN;
    v_is_visit BOOLEAN;
    v_since INTERVAL;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Anda harus login untuk membatalkan perjalanan';
    END IF;

    SELECT id, user_id, driver_id, status, accepted_at, service_type, scheduled_at
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;

    v_is_driver := (v_order.driver_id IS NOT NULL AND v_order.driver_id = v_caller);
    v_is_visit := v_order.service_type IN ('service', 'pool');

    IF v_order.user_id IS DISTINCT FROM v_caller AND NOT v_is_driver THEN
        RAISE EXCEPTION 'Anda tidak berhak membatalkan pesanan ini';
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
    ELSE
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
    END IF;

    IF v_is_driver THEN
        -- A chosen technician who gives the job back loses their head start.
        UPDATE public.orders
        SET status = 'pending',
            driver_id = NULL,
            accepted_at = NULL,
            preferred_partner_id = CASE WHEN preferred_partner_id = v_caller THEN NULL
                                        ELSE preferred_partner_id END
        WHERE id = p_order_id;
        RETURN TRUE;
    END IF;

    PERFORM public.refund_order_to_wallet(p_order_id, p_description);
    UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 10. Admin stuck list: a booked visit is stuck 12 hours after its visit
--     time (48 hours after its last change when it has no visit time).
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
      AND CASE
            WHEN o.service_type IN ('service', 'pool') AND o.scheduled_at IS NOT NULL
                THEN NOW() > o.scheduled_at + INTERVAL '12 hours'
            WHEN o.service_type IN ('service', 'pool')
                THEN o.status_changed_at < NOW() - INTERVAL '48 hours'
            ELSE o.status_changed_at < NOW() - make_interval(mins => GREATEST(p_minutes, 15))
          END
    ORDER BY o.status_changed_at;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_stale_orders(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stale_orders(INT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. Directory RPCs: no email/phone, logged-in users only, active only
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_technicians();
CREATE FUNCTION public.list_technicians()
RETURNS TABLE (id UUID, name TEXT, avatar_url TEXT) AS $$
    SELECT u.id, u.name::text, u.avatar_url::text
    FROM public.users u
    JOIN public.technician_profiles t ON t.user_id = u.id
    WHERE public.is_active_partner(u.id, 'technician')
      AND cardinality(t.skills) > 0;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.list_technicians() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_technicians() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_technician_profiles()
RETURNS TABLE (id UUID, specialization TEXT, experience TEXT) AS $$
    SELECT DISTINCT ON (a.auth_id) a.auth_id, a.specialization, a.experience
    FROM public.mitra_applications a
    WHERE a.role = 'technician' AND a.auth_id IS NOT NULL
      AND public.is_active_partner(a.auth_id, 'technician')
    ORDER BY a.auth_id, a.created_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_technician_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_technician_profiles() TO authenticated;

-- What the customer app shows: active technicians with at least one skill.
CREATE OR REPLACE FUNCTION public.list_service_technicians(p_skill TEXT DEFAULT NULL)
RETURNS TABLE (
    id UUID, name TEXT, avatar_url TEXT, skills TEXT[],
    experience_years INT, jobs_completed INT
) AS $$
    SELECT u.id, u.name::text, u.avatar_url::text, t.skills,
           NULLIF(substring(regexp_replace(COALESCE(app.experience, ''), '\D', '', 'g') FROM 1 FOR 2), '')::INT,
           (SELECT COUNT(*)::INT FROM public.orders o
            WHERE o.driver_id = u.id AND o.status = 'completed' AND o.service_type IN ('service', 'pool'))
    FROM public.technician_profiles t
    JOIN public.users u ON u.id = t.user_id
    LEFT JOIN LATERAL (
        SELECT a.experience FROM public.mitra_applications a
        WHERE a.auth_id = u.id AND a.role = 'technician'
        ORDER BY a.created_at DESC LIMIT 1
    ) app ON true
    WHERE public.is_active_partner(u.id, 'technician')
      AND cardinality(t.skills) > 0
      AND (p_skill IS NULL OR p_skill = ANY (t.skills))
    ORDER BY 6 DESC, 2;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.list_service_technicians(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_service_technicians(TEXT) TO authenticated;

-- The technician's job board: open visits they can take right now.
CREATE OR REPLACE FUNCTION public.get_open_technician_jobs()
RETURNS TABLE (
    id UUID, service_type TEXT, rate_code TEXT, title TEXT, details TEXT,
    scheduled_at TIMESTAMPTZ, total_price NUMERIC, payment_method TEXT,
    created_at TIMESTAMPTZ, is_preferred BOOLEAN
) AS $$
    SELECT o.id, o.service_type::text, o.rate_code::text, o.title::text, o.details::text,
           o.scheduled_at, o.total_price::numeric, o.payment_method::text,
           o.created_at, COALESCE(o.preferred_partner_id = auth.uid(), false)
    FROM public.orders o
    WHERE o.status = 'pending' AND o.driver_id IS NULL
      AND o.service_type IN ('service', 'pool')
      AND o.user_id <> auth.uid()
      AND public.can_see_open_order(o.service_type, o.rate_code, o.status, o.merchant_id,
                                    o.preferred_partner_id, o.status_changed_at)
    ORDER BY COALESCE(o.preferred_partner_id = auth.uid(), false) DESC, o.scheduled_at NULLS LAST, o.created_at;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_open_technician_jobs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_open_technician_jobs() TO authenticated;

-- Helpers are internal.
REVOKE ALL ON FUNCTION public.is_active_partner(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.technician_can_take(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_see_open_order(TEXT, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_partner(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.technician_can_take(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_open_order(TEXT, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ) TO authenticated;

-- Verify after applying (anon key): rpc list_technicians and
-- get_technician_profiles -> permission denied.
