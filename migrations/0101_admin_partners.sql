-- Migration 0101: partners, managed in one place (stage 2 of the admin overhaul).
--
--   * admin_review_application(id, accept, note): approving a driver,
--     restaurant, villa or technician registration used to be 3-4 separate
--     writes from the admin's browser (users row, mitra_access, merchants
--     row, application status), copied across four pages; a failure halfway
--     left half an approval. Now one transaction: access granted, merchants
--     row created for restaurants and villas, technicians with KTP + selfie
--     verified, the applicant notified, the decision logged. Rejecting needs
--     a reason, which the applicant receives.
--   * admin_set_user_status(user, blocked, note): suspend or reactivate an
--     account, with a reason, the partner notified.
--   * admin_set_partner_access(user, kind, enabled, note): remove (or give
--     back) one kind of partner access without touching the others.
--   * admin_set_merchant_active(merchant, active, note): a restaurant or
--     villa is suspended instead of deleted (listing_status 'suspended'):
--     hidden from customers, no new orders, history kept.
--   * admin_partner_overview(user): everything about one partner for the
--     profile page.
--   * admin_audit_log: every admin decision above (and 0100's order
--     actions from now on read in order_events) with who, when and why.
--
-- Depends on 0089, 0091, 0092, 0096, 0097, 0100. Re-runnable.

-- ---------------------------------------------------------------------------
-- 1. Audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    subject_user_id UUID,
    note TEXT,
    data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_subject_idx ON public.admin_audit_log (subject_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_at_idx ON public.admin_audit_log (created_at DESC);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_audit_log_read ON public.admin_audit_log;
CREATE POLICY admin_audit_log_read ON public.admin_audit_log FOR SELECT USING (public.is_admin_panel());
REVOKE ALL ON public.admin_audit_log FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.admin_audit_log FROM authenticated;
GRANT SELECT ON public.admin_audit_log TO authenticated;

CREATE OR REPLACE FUNCTION public.log_admin_action(
    p_action TEXT, p_target_type TEXT, p_target_id TEXT, p_subject UUID, p_note TEXT, p_data JSONB DEFAULT NULL
)
RETURNS VOID AS $$
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, subject_user_id, note, data)
    VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_subject, NULLIF(btrim(COALESCE(p_note, '')), ''), p_data);
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.log_admin_action(TEXT, TEXT, TEXT, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Registration decisions
-- ---------------------------------------------------------------------------
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
            vehicle_type = CASE WHEN v_kind = 'driver' THEN COALESCE(vehicle_type, a.vehicle_type, 'motor') ELSE vehicle_type END,
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
REVOKE ALL ON FUNCTION public.admin_review_application(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_application(UUID, BOOLEAN, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Account status and access
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_status(p_user_id UUID, p_blocked BOOLEAN, p_note TEXT)
RETURNS TEXT AS $$
DECLARE
    u RECORD;
    v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
    v_status TEXT := CASE WHEN p_blocked THEN 'Diblokir' ELSE 'Aktif' END;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Khusus admin inti' USING ERRCODE = '42501';
    END IF;
    IF v_note IS NULL OR length(v_note) < 5 THEN
        RAISE EXCEPTION 'Tulis alasan (minimal 5 karakter)';
    END IF;
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Tidak bisa mengubah status akun sendiri';
    END IF;
    SELECT * INTO u FROM public.users WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Akun tidak ditemukan';
    END IF;
    IF u.role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops', 'Admin Keuangan', 'CS') THEN
        RAISE EXCEPTION 'Akun admin diatur dari Settings, bukan di sini';
    END IF;
    IF COALESCE(u.status, 'Aktif') = v_status THEN
        RETURN v_status;
    END IF;
    UPDATE public.users SET status = v_status WHERE id = p_user_id;
    INSERT INTO public.notifications (user_id, title, description, is_read, link)
    VALUES (p_user_id,
            CASE WHEN p_blocked THEN 'Akun Anda ditangguhkan' ELSE 'Akun Anda aktif kembali' END,
            CASE WHEN p_blocked THEN 'Alasan: ' || v_note || '. Hubungi tim Wira lewat Pusat Bantuan.' ELSE v_note END,
            false, '/');
    PERFORM public.log_admin_action(CASE WHEN p_blocked THEN 'user_suspended' ELSE 'user_reactivated' END,
                                    'user', p_user_id::text, p_user_id, v_note, jsonb_build_object('from', u.status));
    RETURN v_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_set_user_status(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(UUID, BOOLEAN, TEXT) TO authenticated;

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
    IF p_kind NOT IN ('driver', 'merchant', 'villa', 'technician') THEN
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
REVOKE ALL ON FUNCTION public.admin_set_partner_access(UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_partner_access(UUID, TEXT, BOOLEAN, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Suspend a restaurant or villa instead of deleting it
-- ---------------------------------------------------------------------------
ALTER TABLE public.merchants DROP CONSTRAINT IF EXISTS merchants_listing_status_check;
ALTER TABLE public.merchants ADD CONSTRAINT merchants_listing_status_check
    CHECK (listing_status IN ('pending', 'approved', 'rejected', 'suspended'));

CREATE OR REPLACE FUNCTION public.admin_set_merchant_active(p_merchant_id UUID, p_active BOOLEAN, p_note TEXT)
RETURNS TEXT AS $$
DECLARE
    m RECORD;
    v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Khusus admin inti' USING ERRCODE = '42501';
    END IF;
    IF v_note IS NULL OR length(v_note) < 5 THEN
        RAISE EXCEPTION 'Tulis alasan (minimal 5 karakter)';
    END IF;
    SELECT * INTO m FROM public.merchants WHERE id = p_merchant_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Restoran/villa tidak ditemukan';
    END IF;
    IF p_active AND m.listing_status <> 'suspended' THEN
        RAISE EXCEPTION 'Hanya yang dinonaktifkan yang bisa diaktifkan lagi';
    END IF;
    IF NOT p_active AND m.listing_status = 'suspended' THEN
        RETURN 'suspended';
    END IF;
    UPDATE public.merchants
    SET listing_status = CASE WHEN p_active THEN 'approved' ELSE 'suspended' END,
        review_note = CASE WHEN p_active THEN NULL ELSE v_note END,
        reviewed_at = NOW()
    WHERE id = p_merchant_id;
    IF m.owner_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, description, is_read, link)
        VALUES (m.owner_id,
                CASE WHEN p_active THEN '"' || m.name || '" aktif kembali' ELSE '"' || m.name || '" dinonaktifkan' END,
                CASE WHEN p_active THEN v_note ELSE 'Tidak tampil untuk pelanggan. Alasan: ' || v_note || '. Hubungi tim Wira lewat Pusat Bantuan.' END,
                false, '/');
    END IF;
    PERFORM public.log_admin_action(CASE WHEN p_active THEN 'merchant_reactivated' ELSE 'merchant_suspended' END,
                                    'merchant', p_merchant_id::text, m.owner_id, v_note,
                                    jsonb_build_object('name', m.name, 'service_type', m.service_type, 'from', m.listing_status));
    RETURN CASE WHEN p_active THEN 'approved' ELSE 'suspended' END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_set_merchant_active(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_merchant_active(UUID, BOOLEAN, TEXT) TO authenticated;

-- 0097's booking guard, now for restaurants too: no new orders for a
-- restaurant or villa that is not live (or a villa its host paused).
CREATE OR REPLACE FUNCTION public.guard_villa_booking()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.merchant_id IS NOT NULL AND NEW.service_type IN ('villa', 'WiraVilla', 'food', 'WiraFood')
       AND NOT EXISTS (SELECT 1 FROM public.merchants m
                       WHERE m.id = NEW.merchant_id AND m.listing_status = 'approved'
                         AND (NEW.service_type NOT IN ('villa', 'WiraVilla') OR COALESCE(m.is_open, true))) THEN
        RAISE EXCEPTION 'Tempat ini sedang tidak menerima pesanan';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 5. One partner, everything an admin needs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_partner_overview(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v JSONB;
BEGIN
    IF NOT public.is_admin_panel() THEN
        RAISE EXCEPTION 'Khusus admin' USING ERRCODE = '42501';
    END IF;
    SELECT jsonb_build_object(
        'user', (SELECT jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'phone', u.phone,
                                           'role', u.role, 'status', COALESCE(u.status, 'Aktif'), 'mitra_access', u.mitra_access,
                                           'vehicle_type', u.vehicle_type, 'job_type_preferences', u.job_type_preferences,
                                           'avatar_url', u.avatar_url, 'wallet_balance', u.wallet_balance,
                                           'payable_balance', u.payable_balance, 'created_at', u.created_at)
                 FROM public.users u WHERE u.id = p_user_id),
        'applications', COALESCE((SELECT jsonb_agg(to_jsonb(a) - 'auth_id' ORDER BY a.created_at DESC)
                                  FROM public.mitra_applications a WHERE a.auth_id = p_user_id), '[]'::jsonb),
        'merchants', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'service_type', m.service_type,
                                                                 'listing_status', m.listing_status, 'is_open', m.is_open,
                                                                 'address', m.address, 'image', m.image, 'rating', m.rating,
                                                                 'review_note', m.review_note) ORDER BY m.created_at)
                               FROM public.merchants m WHERE m.owner_id = p_user_id), '[]'::jsonb),
        'technician', (SELECT jsonb_build_object('skills', t.skills, 'is_accepting', t.is_accepting,
                                                 'verified_at', t.verified_at, 'service_areas', t.service_areas)
                       FROM public.technician_profiles t WHERE t.user_id = p_user_id),
        'rating', (SELECT jsonb_build_object('avg', r.rating_avg, 'count', r.rating_count) FROM public.partner_rating(p_user_id) r),
        'stats', (SELECT jsonb_build_object(
                      'completed', COUNT(*) FILTER (WHERE o.status = 'completed'),
                      'cancelled', COUNT(*) FILTER (WHERE o.status = 'cancelled'),
                      'active', COUNT(*) FILTER (WHERE o.status NOT IN ('completed', 'cancelled', 'expired', 'pending', 'awaiting_payment')),
                      'gmv_30d', COALESCE(SUM(o.total_price) FILTER (WHERE o.status = 'completed' AND o.created_at > NOW() - INTERVAL '30 days'), 0),
                      'completed_30d', COUNT(*) FILTER (WHERE o.status = 'completed' AND o.created_at > NOW() - INTERVAL '30 days'))
                  FROM public.orders o
                  WHERE o.driver_id = p_user_id
                     OR o.merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = p_user_id)),
        'recent_orders', COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
                              SELECT o.id, o.service_type, o.status, o.total_price, o.title, o.created_at, o.payment_method
                              FROM public.orders o
                              WHERE o.driver_id = p_user_id
                                 OR o.merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = p_user_id)
                              ORDER BY o.created_at DESC LIMIT 15) x), '[]'::jsonb),
        'reviews', COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
                        SELECT r.id, r.rating, r.review_text, r.tags, r.is_hidden, r.created_at
                        FROM public.reviews r
                        WHERE r.driver_id = p_user_id
                           OR r.merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = p_user_id)
                        ORDER BY r.created_at DESC LIMIT 10) x), '[]'::jsonb),
        'payouts', COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
                        SELECT p.id, p.amount, p.status, p.payout_method, p.created_at
                        FROM public.payout_requests p WHERE p.user_id = p_user_id
                        ORDER BY p.created_at DESC LIMIT 10) x), '[]'::jsonb),
        'audit', COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
                      SELECT l.id, l.action, l.note, l.data, l.created_at, au.name AS actor_name
                      FROM public.admin_audit_log l LEFT JOIN public.users au ON au.id = l.actor_id
                      WHERE l.subject_user_id = p_user_id
                      ORDER BY l.created_at DESC LIMIT 30) x), '[]'::jsonb)
    ) INTO v;
    RETURN v;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_partner_overview(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_partner_overview(UUID) TO authenticated;

-- Verify after applying:
--   SELECT conname FROM pg_constraint WHERE conname = 'merchants_listing_status_check';
--   (as an admin, from the app) SELECT admin_partner_overview('<partner id>');
