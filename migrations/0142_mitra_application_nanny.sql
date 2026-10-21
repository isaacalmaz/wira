-- ============================================================================
-- 0142: Allow WiraAsuh (nanny) in mitra applications and admin review
-- ============================================================================
-- Allows prospective babysitters / nannies to submit partner applications
-- via public signup (mitra.wira.one/register) and enables admins to review &
-- approve them in ApplicationsPage.
--
-- Updates:
-- 1. submit_mitra_application: accepts 'nanny' role with mandatory KYC
--    (KTP + selfie photo for child safety background checks).
-- 2. admin_review_application: accepts 'nanny' role, grants 'nanny' in
--    users.mitra_access upon approval, and sends notification to applicant.
-- ============================================================================

-- 1. Updated submit_mitra_application (accepts 'nanny' role + KYC photos)
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

    IF v_role IS NULL OR v_role NOT IN ('driver', 'merchant', 'villa', 'technician', 'nanny') THEN
        RAISE EXCEPTION 'Jenis mitra tidak valid: %', v_role;
    END IF;

    IF length(COALESCE(p_application->>'sim_photo', '')) > 3000000
       OR length(COALESCE(p_application->>'ktp_photo', '')) > 3000000
       OR length(COALESCE(p_application->>'selfie_photo', '')) > 3000000 THEN
        RAISE EXCEPTION 'Foto dokumen terlalu besar.';
    END IF;

    -- KYC: technicians and nannies must verify identity with KTP photo and selfie
    IF (v_role IN ('technician', 'nanny')) AND (
        COALESCE(p_application->>'ktp_photo', '') NOT LIKE 'data:image/%'
        OR COALESCE(p_application->>'selfie_photo', '') NOT LIKE 'data:image/%'
    ) THEN
        RAISE EXCEPTION 'Lampirkan foto KTP dan foto selfie Anda.';
    END IF;

    DELETE FROM public.mitra_applications WHERE auth_id = v_uid AND role = v_role AND status = 'Pending';
    INSERT INTO public.mitra_applications (
        auth_id, role, name, phone, email, vehicle, plate,
        vehicle_type, job_type_preferences, sim_photo, restaurant_name, address, service_type,
        specialization, experience, skills, ktp_photo, selfie_photo
    )
    SELECT
        v_uid, v_role, a->>'name', a->>'phone', (SELECT u.email FROM auth.users u WHERE u.id = v_uid),
        a->>'vehicle', a->>'plate', a->>'vehicle_type', NULLIF(a->'job_type_preferences', 'null'::jsonb),
        a->>'sim_photo', a->>'restaurant_name', a->>'address', a->>'service_type',
        a->>'specialization', a->>'experience',
        CASE WHEN v_role = 'technician' AND jsonb_typeof(a->'skills') = 'array'
             THEN public.clean_skill_codes(ARRAY(SELECT jsonb_array_elements_text(a->'skills'))) END,
        CASE WHEN v_role IN ('technician', 'nanny') THEN a->>'ktp_photo' END,
        CASE WHEN v_role IN ('technician', 'nanny') THEN a->>'selfie_photo' END
    FROM (SELECT p_application AS a) s
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.submit_mitra_application(JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_mitra_application(JSONB, UUID) TO anon, authenticated;

-- 2. Updated admin_review_application (supports 'nanny' role)
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
    IF v_kind NOT IN ('driver', 'merchant', 'villa', 'technician', 'nanny') THEN
        RAISE EXCEPTION 'Jenis mitra tidak dikenal: %', a.role;
    END IF;

    v_label := CASE v_kind
        WHEN 'driver' THEN 'driver'
        WHEN 'merchant' THEN 'restoran'
        WHEN 'villa' THEN 'villa'
        WHEN 'nanny' THEN 'pengasuh'
        ELSE 'teknisi'
    END;

    IF NOT p_accept THEN
        IF v_note IS NULL OR length(v_note) < 5 THEN
            RAISE EXCEPTION 'Tulis alasan penolakan agar pendaftar tahu yang perlu diperbaiki';
        END IF;

        UPDATE public.mitra_applications
        SET status = 'Rejected', reviewed_at = NOW(), admin_notes = v_note
        WHERE id = a.id;

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
        VALUES (
            a.auth_id, a.name, a.email, a.phone, 'mitra', 'Aktif', jsonb_build_array(v_kind),
            CASE WHEN v_kind = 'driver' THEN COALESCE(a.vehicle_type, 'motor') END,
            CASE WHEN v_kind = 'driver' THEN COALESCE(a.job_type_preferences, '["ride", "send", "food"]'::jsonb) END
        );
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
        VALUES (
            a.auth_id, COALESCE(NULLIF(btrim(a.restaurant_name), ''), a.name),
            CASE WHEN v_kind = 'villa' THEN 'villa' ELSE 'food' END,
            a.address, NULL, true, 'approved'
        )
        RETURNING id INTO v_merchant;
    END IF;

    IF v_kind = 'technician' AND a.ktp_photo IS NOT NULL AND a.selfie_photo IS NOT NULL THEN
        UPDATE public.technician_profiles SET verified_at = NOW(), verified_by = auth.uid() WHERE user_id = a.auth_id;
    END IF;

    UPDATE public.mitra_applications SET status = 'Active', reviewed_at = NOW(), admin_notes = v_note WHERE id = a.id;

    INSERT INTO public.notifications (user_id, title, description, is_read, link)
    VALUES (
        a.auth_id, 'Pendaftaran ' || v_label || ' disetujui',
        'Selamat bergabung! Buka aplikasi Wira Mitra dan masuk ke portal '
        || CASE v_kind
            WHEN 'driver' THEN 'Driver'
            WHEN 'merchant' THEN 'Restoran'
            WHEN 'villa' THEN 'Villa'
            WHEN 'nanny' THEN 'Wira Asuh'
            ELSE 'Teknisi'
        END
        || CASE v_kind
            WHEN 'merchant' THEN ' untuk mengisi menu.'
            WHEN 'villa' THEN ' untuk menambah foto dan harga properti.'
            WHEN 'nanny' THEN ' untuk mulai menerima permintaan pengasuhan anak.'
            ELSE ' untuk mulai menerima pesanan.'
        END,
        false, '/'
    );

    PERFORM public.log_admin_action('application_approved', 'application', a.id::text, a.auth_id, v_note,
                                    jsonb_build_object('role', a.role, 'name', a.name));

    RETURN jsonb_build_object('status', 'Active');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_review_application(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_application(UUID, BOOLEAN, TEXT) TO authenticated;
