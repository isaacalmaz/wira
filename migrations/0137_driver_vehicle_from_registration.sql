-- =========================================
-- Migration 0137: a driver's vehicle is what they registered, and only
-- admins change it
-- =========================================
-- Found 2026-10-14 when a pickup owner registered as "Mobil": the account was
-- approved as "Motor". public.users.vehicle_type defaults to 'motor', so the
-- user row made at sign-up already said motor, and admin_review_application
-- (0101) kept the existing value (COALESCE(vehicle_type, a.vehicle_type)).
-- Every car applicant became a motorbike driver and never got car orders.
-- The owner also noticed drivers could switch Motor/Mobil themselves in
-- Pengaturan, although the vehicle is checked by an admin (SIM & STNK).
--
--   1. admin_review_application: the application's vehicle wins.
--   2. Existing drivers whose approved application said mobil but whose
--      account says motor are corrected (one account on 2026-10-14).
--   3. trg_guard_driver_vehicle: an approved driver cannot change
--      users.vehicle_type; admins can (admin_set_driver_vehicle, audited).
--      A driver without a vehicle yet may still set it once.
--
-- Verify:
--   SELECT u.name, u.vehicle_type FROM users u WHERE u.mitra_access ? 'driver';
-- =========================================

-- 1. Approval keeps the registered vehicle (body from 0101, one line changed).
CREATE OR REPLACE FUNCTION public.admin_review_application(p_application_id UUID, p_accept BOOLEAN, p_note TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    a RECORD;
    u RECORD;
    v_kind TEXT;
    v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
    v_label TEXT;
    v_merchant UUID;
    v_access JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin inti yang bisa memutuskan pendaftaran' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO a FROM public.mitra_applications WHERE id = p_application_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pendaftaran tidak ditemukan';
    END IF;
    IF a.status <> 'Pending' THEN
        RAISE EXCEPTION 'Pendaftaran ini sudah diputuskan (%)', a.status;
    END IF;
    v_kind := CASE a.role WHEN 'courier' THEN 'driver' ELSE a.role END;
    IF v_kind NOT IN ('driver', 'merchant', 'villa', 'technician') THEN
        RAISE EXCEPTION 'Jenis mitra tidak dikenal: %', a.role;
    END IF;
    v_label := CASE v_kind WHEN 'driver' THEN 'driver' WHEN 'merchant' THEN 'restoran' WHEN 'villa' THEN 'villa' ELSE 'teknisi' END;

    IF NOT p_accept THEN
        IF v_note IS NULL OR length(v_note) < 5 THEN
            RAISE EXCEPTION 'Tulis alasan penolakan agar pendaftar tahu yang perlu diperbaiki';
        END IF;
        UPDATE public.mitra_applications SET status = 'Rejected', reviewed_at = NOW(), admin_notes = v_note WHERE id = a.id;
        IF a.auth_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.users WHERE id = a.auth_id) THEN
            INSERT INTO public.notifications (user_id, title, description, is_read, link)
            VALUES (a.auth_id, 'Pendaftaran ' || v_label || ' belum disetujui', v_note, false, '/');
        END IF;
        PERFORM public.log_admin_action('application_rejected', 'application', a.id::text, a.auth_id, v_note,
                                        jsonb_build_object('role', a.role, 'name', a.name));
        RETURN jsonb_build_object('status', 'Rejected');
    END IF;

    IF a.auth_id IS NULL THEN
        RAISE EXCEPTION 'Pendaftaran ini tidak terhubung ke akun mana pun; minta pendaftar mendaftar ulang dari aplikasi';
    END IF;

    SELECT * INTO u FROM public.users WHERE id = a.auth_id FOR UPDATE;
    IF NOT FOUND THEN
        INSERT INTO public.users (id, name, email, phone, role, status, mitra_access, vehicle_type, job_type_preferences)
        VALUES (a.auth_id, a.name, a.email, a.phone, 'mitra', 'Aktif', jsonb_build_array(v_kind),
                CASE WHEN v_kind = 'driver' THEN COALESCE(a.vehicle_type, 'motor') END,
                CASE WHEN v_kind = 'driver' THEN COALESCE(a.job_type_preferences, '["ride", "send", "food"]'::jsonb) END);
    ELSE
        v_access := CASE WHEN jsonb_typeof(u.mitra_access) = 'array' THEN u.mitra_access ELSE '[]'::jsonb END;
        IF NOT v_access ? v_kind THEN
            v_access := v_access || jsonb_build_array(v_kind);
        END IF;
        UPDATE public.users
        SET mitra_access = v_access,
            status = CASE WHEN status = 'Diblokir' THEN status ELSE 'Aktif' END,
            vehicle_type = CASE WHEN v_kind = 'driver' THEN COALESCE(a.vehicle_type, vehicle_type, 'motor') ELSE vehicle_type END,
            job_type_preferences = CASE
                WHEN v_kind = 'driver' AND (job_type_preferences IS NULL OR jsonb_array_length(job_type_preferences) = 0)
                    THEN COALESCE(a.job_type_preferences, '["ride", "send", "food"]'::jsonb)
                ELSE job_type_preferences END
        WHERE id = a.auth_id;
    END IF;

    IF v_kind IN ('merchant', 'villa') THEN
        INSERT INTO public.merchants (owner_id, name, service_type, address, image, is_open, listing_status)
        VALUES (a.auth_id, COALESCE(NULLIF(btrim(a.restaurant_name), ''), a.name),
                CASE WHEN v_kind = 'villa' THEN 'villa' ELSE 'food' END,
                a.address, NULL, true, 'approved')
        RETURNING id INTO v_merchant;
    END IF;

    -- Profile created by ensure_technician_profile (0089) when access was granted.
    IF v_kind = 'technician' AND a.ktp_photo IS NOT NULL AND a.selfie_photo IS NOT NULL THEN
        UPDATE public.technician_profiles SET verified_at = NOW(), verified_by = auth.uid() WHERE user_id = a.auth_id;
    END IF;

    UPDATE public.mitra_applications SET status = 'Active', reviewed_at = NOW(), admin_notes = v_note WHERE id = a.id;
    INSERT INTO public.notifications (user_id, title, description, is_read, link)
    VALUES (a.auth_id, 'Pendaftaran ' || v_label || ' disetujui',
            'Selamat bergabung! Buka aplikasi Wira Mitra dan masuk ke portal '
            || CASE v_kind WHEN 'driver' THEN 'Driver' WHEN 'merchant' THEN 'Restoran' WHEN 'villa' THEN 'Villa' ELSE 'Teknisi' END
            || CASE v_kind WHEN 'merchant' THEN ' untuk mengisi menu.' WHEN 'villa' THEN ' untuk menambah foto dan harga properti.' ELSE ' untuk mulai menerima pesanan.' END,
            false, '/');
    PERFORM public.log_admin_action('application_approved', 'application', a.id::text, a.auth_id, v_note,
                                    jsonb_build_object('role', a.role, 'name', a.name, 'merchant_id', v_merchant));
    RETURN jsonb_build_object('status', 'Active', 'user_id', a.auth_id, 'merchant_id', v_merchant);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Correct drivers approved as motor although they registered a car.
UPDATE public.users u
SET vehicle_type = 'mobil'
WHERE u.mitra_access ? 'driver'
  AND u.vehicle_type = 'motor'
  AND (SELECT m.vehicle_type FROM public.mitra_applications m
       WHERE m.auth_id = u.id AND m.role IN ('driver', 'courier') AND m.status = 'Active'
       ORDER BY m.created_at DESC LIMIT 1) = 'mobil';

-- 3. Only admins change an approved driver's vehicle.
CREATE OR REPLACE FUNCTION public.guard_driver_vehicle()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.vehicle_type IS DISTINCT FROM OLD.vehicle_type
       AND current_user IN ('authenticated', 'anon')
       AND NOT public.is_admin()
       AND OLD.vehicle_type IS NOT NULL
       AND jsonb_typeof(OLD.mitra_access) = 'array' AND OLD.mitra_access ? 'driver' THEN
        RAISE EXCEPTION 'Jenis kendaraan hanya bisa diubah admin. Hubungi admin lewat Pusat Bantuan dengan foto SIM & STNK kendaraan baru.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_guard_driver_vehicle ON public.users;
CREATE TRIGGER trg_guard_driver_vehicle
    BEFORE UPDATE OF vehicle_type ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.guard_driver_vehicle();

CREATE OR REPLACE FUNCTION public.admin_set_driver_vehicle(p_user UUID, p_vehicle TEXT, p_note TEXT DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
    v_old TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin' USING ERRCODE = '42501';
    END IF;
    IF p_vehicle NOT IN ('motor', 'mobil') THEN
        RAISE EXCEPTION 'Jenis kendaraan harus motor atau mobil';
    END IF;
    SELECT vehicle_type INTO v_old FROM public.users WHERE id = p_user FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mitra tidak ditemukan';
    END IF;
    UPDATE public.users
    SET vehicle_type = p_vehicle,
        job_type_preferences = CASE WHEN p_vehicle = 'mobil' AND jsonb_typeof(job_type_preferences) = 'array'
                                    THEN job_type_preferences - 'food' ELSE job_type_preferences END
    WHERE id = p_user;
    PERFORM public.log_admin_action('driver_vehicle_changed', 'user', p_user::text, p_user,
                                    NULLIF(btrim(COALESCE(p_note, '')), ''),
                                    jsonb_build_object('from', v_old, 'to', p_vehicle));
    PERFORM public.notify_user(p_user, 'Jenis kendaraan diubah',
        'Admin mengubah kendaraan Anda menjadi ' || CASE p_vehicle WHEN 'mobil' THEN 'Mobil' ELSE 'Motor' END || '.', '/');
    RETURN p_vehicle;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_set_driver_vehicle(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_driver_vehicle(UUID, TEXT, TEXT) TO authenticated;
