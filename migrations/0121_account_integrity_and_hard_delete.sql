-- =========================================
-- 0121: account states that hold together everywhere, and permanent delete
--
--   * Suspended or deleted customers cannot create any order (until now
--     only WiraAsuh refused them; the customer app never checked).
--   * admin_set_user_status: refuses while the account has a running order
--     (as customer or partner); blocking takes a driver offline and hides
--     the account's restaurants/villas (merchants.hidden_by_admin), and
--     reactivating shows exactly those again. role follows access.
--   * admin_set_partner_access: granting needs what the portal runs on
--     (Restoran: a restaurant row; Driver: a vehicle type), so no partner
--     lands in an empty portal. Revoking refuses while that role has a
--     running order, hides the role's listings, marks the approved
--     application 'Revoked' (granting again re-activates it). role follows
--     access.
--   * Two admin delete buttons (Superadmin only, never staff or yourself,
--     refused while an order or project is running, the admin retypes the
--     account's confirmation text = its email, or 'HAPUS <id8>' when it has
--     none, plus a reason; audited):
--     - admin_delete_account(user, confirm, reason): like the customer's own
--       "Hapus akun" (0106): personal data, ID photos, addresses and the
--       login are wiped, listings hidden; orders and payments stay without
--       a name. Unlike the customer's own, a balance or unpaid commission
--       does not block it (the admin sees it first).
--   * admin_delete_account_permanently(user, confirm, reason):
--     Superadmin only, never staff or yourself, refused while anything is
--     running. Removes the account and everything that hangs off it (orders
--     as customer, their restaurants/villas and menus, chats, reviews,
--     ratings, projects, applications incl. ID photos), sets them to NULL
--     where they were only the driver of someone else's order, then deletes
--     the login. Files in Storage are listed in account_deletions for manual
--     purge. Audited.
-- =========================================

ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS hidden_by_admin BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.account_running_orders(p_user UUID, p_kind TEXT DEFAULT NULL)
RETURNS INT AS $$
    SELECT COUNT(*)::INT FROM public.orders o
    WHERE o.status NOT IN ('completed', 'cancelled', 'expired')
      AND CASE p_kind
          WHEN 'customer' THEN o.user_id = p_user
          WHEN 'driver' THEN o.driver_id = p_user AND o.service_type NOT IN ('service', 'pool', 'babysit')
          WHEN 'technician' THEN o.driver_id = p_user AND o.service_type IN ('service', 'pool')
          WHEN 'nanny' THEN o.driver_id = p_user AND o.service_type = 'babysit'
          WHEN 'merchant' THEN o.merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = p_user AND COALESCE(service_type, '') NOT IN ('villa', 'WiraVilla'))
          WHEN 'villa' THEN o.merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = p_user AND service_type IN ('villa', 'WiraVilla'))
          ELSE o.user_id = p_user OR o.driver_id = p_user
               OR o.merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = p_user)
      END;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.role_for_access(p_role TEXT, p_access JSONB)
RETURNS TEXT AS $$
    SELECT CASE WHEN COALESCE(p_role, 'user') NOT IN ('user', 'mitra') THEN p_role
                WHEN jsonb_array_length(COALESCE(p_access, '[]'::jsonb)) > 0 THEN 'mitra'
                ELSE 'user' END;
$$ LANGUAGE sql IMMUTABLE;

-- ---------------------------------------------------------------------------
-- Suspended/deleted customers cannot order
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_customer_active()
RETURNS TRIGGER AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT status INTO v_status FROM public.users WHERE id = NEW.user_id;
    IF v_status IN ('Diblokir', 'Dihapus') THEN
        RAISE EXCEPTION 'Akun Anda sedang ditangguhkan, jadi belum bisa membuat pesanan. Hubungi tim Wira lewat Pusat Bantuan.'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_enforce_customer_active ON public.orders;
CREATE TRIGGER trg_enforce_customer_active BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_active();

-- ---------------------------------------------------------------------------
-- Suspend / reactivate (0101 body + running-order check + side effects)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_status(p_user_id UUID, p_blocked BOOLEAN, p_note TEXT)
RETURNS TEXT AS $$
DECLARE
    u RECORD;
    v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
    v_status TEXT := CASE WHEN p_blocked THEN 'Diblokir' ELSE 'Aktif' END;
    v_running INT;
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
        RAISE EXCEPTION 'Akun admin diatur dari menu Tim Admin, bukan di sini';
    END IF;
    IF COALESCE(u.status, 'Aktif') = v_status THEN
        RETURN v_status;
    END IF;
    IF p_blocked THEN
        v_running := public.account_running_orders(p_user_id);
        IF v_running > 0 THEN
            RAISE EXCEPTION 'Masih ada % pesanan berjalan di akun ini. Selesaikan, batalkan, atau alihkan dulu dari menu Pesanan.', v_running;
        END IF;
        UPDATE public.drivers SET is_online = false WHERE id = p_user_id;
        UPDATE public.merchants SET listing_status = 'suspended', hidden_by_admin = true
        WHERE owner_id = p_user_id AND listing_status = 'approved';
    ELSE
        UPDATE public.merchants SET listing_status = 'approved', hidden_by_admin = false
        WHERE owner_id = p_user_id AND hidden_by_admin;
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

-- ---------------------------------------------------------------------------
-- Grant / revoke a partner portal (0107 body + checks + side effects)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_partner_access(p_user_id UUID, p_kind TEXT, p_enabled BOOLEAN, p_note TEXT)
RETURNS JSONB AS $$
DECLARE
    u RECORD;
    v_access JSONB;
    v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
    v_running INT;
    v_villa BOOLEAN := p_kind = 'villa';
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
    IF COALESCE(u.status, 'Aktif') = 'Dihapus' THEN
        RAISE EXCEPTION 'Akun ini sudah dihapus';
    END IF;
    v_access := CASE WHEN jsonb_typeof(u.mitra_access) = 'array' THEN u.mitra_access ELSE '[]'::jsonb END;

    IF p_enabled THEN
        IF v_access ? p_kind THEN
            RETURN v_access;
        END IF;
        IF p_kind = 'merchant' AND NOT EXISTS (
            SELECT 1 FROM public.merchants WHERE owner_id = p_user_id AND COALESCE(service_type, '') NOT IN ('villa', 'WiraVilla')) THEN
            RAISE EXCEPTION 'Akun ini belum punya restoran. Setujui lewat menu Pendaftaran (restoran dibuat dari data pendaftarannya).';
        END IF;
        IF p_kind = 'driver' AND u.vehicle_type IS NULL THEN
            RAISE EXCEPTION 'Akun ini belum punya data kendaraan. Setujui lewat menu Pendaftaran (data kendaraan diambil dari pendaftarannya).';
        END IF;
        v_access := v_access || jsonb_build_array(p_kind);
        UPDATE public.merchants SET listing_status = 'approved', hidden_by_admin = false
        WHERE owner_id = p_user_id AND hidden_by_admin
          AND (CASE WHEN v_villa THEN service_type IN ('villa', 'WiraVilla') ELSE p_kind = 'merchant' AND COALESCE(service_type, '') NOT IN ('villa', 'WiraVilla') END);
        UPDATE public.mitra_applications SET status = 'Active'
        WHERE auth_id = p_user_id AND role = p_kind AND status = 'Revoked';
    ELSE
        IF NOT v_access ? p_kind THEN
            RETURN v_access;
        END IF;
        v_running := public.account_running_orders(p_user_id, p_kind);
        IF v_running > 0 THEN
            RAISE EXCEPTION 'Masih ada % pesanan berjalan untuk peran ini. Selesaikan atau alihkan dulu dari menu Pesanan.', v_running;
        END IF;
        v_access := v_access - p_kind;
        IF p_kind IN ('merchant', 'villa') THEN
            UPDATE public.merchants SET listing_status = 'suspended', hidden_by_admin = true
            WHERE owner_id = p_user_id AND listing_status = 'approved'
              AND (CASE WHEN v_villa THEN service_type IN ('villa', 'WiraVilla') ELSE COALESCE(service_type, '') NOT IN ('villa', 'WiraVilla') END);
        END IF;
        IF p_kind IN ('driver', 'technician') AND NOT (v_access ? 'driver' OR v_access ? 'technician') THEN
            UPDATE public.drivers SET is_online = false WHERE id = p_user_id;
        END IF;
        UPDATE public.mitra_applications SET status = 'Revoked',
               admin_notes = COALESCE(admin_notes || ' · ', '') || 'Akses dicabut: ' || v_note
        WHERE auth_id = p_user_id AND role = p_kind AND status = 'Active';
    END IF;

    UPDATE public.users SET mitra_access = v_access, role = public.role_for_access(u.role, v_access) WHERE id = p_user_id;
    INSERT INTO public.notifications (user_id, title, description, is_read, link)
    VALUES (p_user_id,
            CASE WHEN p_enabled THEN 'Akses mitra dibuka' ELSE 'Akses mitra dicabut' END,
            'Portal ' || p_kind || ': ' || v_note, false, '/');
    PERFORM public.log_admin_action(CASE WHEN p_enabled THEN 'access_granted' ELSE 'access_revoked' END,
                                    'user', p_user_id::text, p_user_id, v_note, jsonb_build_object('kind', p_kind));
    RETURN v_access;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The text an admin must retype to delete an account: its email, or
-- 'HAPUS <first 8 of id>' when it has none (already anonymised accounts).
CREATE OR REPLACE FUNCTION public.account_confirm_text(p_user_id UUID)
RETURNS TEXT AS $$
    SELECT COALESCE(
        (SELECT lower(email) FROM auth.users WHERE id = p_user_id AND email IS NOT NULL AND email NOT LIKE 'deleted-%'),
        'HAPUS ' || left(p_user_id::text, 8));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- What a delete would touch (for the confirmation screen)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_account_footprint(p_user_id UUID)
RETURNS JSONB AS $$
BEGIN
    IF NOT public.admin_can('staff') THEN
        RAISE EXCEPTION 'Khusus Superadmin' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
        'orders_as_customer', (SELECT COUNT(*) FROM public.orders WHERE user_id = p_user_id),
        'orders_as_partner', (SELECT COUNT(*) FROM public.orders WHERE driver_id = p_user_id),
        'places', (SELECT COUNT(*) FROM public.merchants WHERE owner_id = p_user_id),
        'place_orders', (SELECT COUNT(*) FROM public.orders WHERE merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = p_user_id)),
        'running_orders', public.account_running_orders(p_user_id),
        'running_projects', (SELECT COUNT(*) FROM public.projects WHERE (customer_id = p_user_id OR awarded_to = p_user_id) AND status IN ('open', 'awarded')),
        'payable_balance', (SELECT COALESCE(payable_balance, 0) FROM public.users WHERE id = p_user_id),
        'wallet_balance', (SELECT COALESCE(wallet_balance, 0) FROM public.users WHERE id = p_user_id),
        'status', (SELECT status FROM public.users WHERE id = p_user_id),
        'confirm_text', public.account_confirm_text(p_user_id)
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Admin "Hapus Akun" (anonymise, keep the bookkeeping; 0106 body)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_account(p_user_id UUID, p_confirm TEXT, p_reason TEXT)
RETURNS JSONB AS $$
DECLARE
    u RECORD;
    v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
    v_files TEXT[];
    v_footprint JSONB;
BEGIN
    IF NOT public.admin_can('staff') THEN
        RAISE EXCEPTION 'Khusus Superadmin' USING ERRCODE = '42501';
    END IF;
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Tidak bisa menghapus akun sendiri';
    END IF;
    IF v_reason IS NULL OR length(v_reason) < 5 THEN
        RAISE EXCEPTION 'Tulis alasan (minimal 5 karakter)';
    END IF;
    SELECT * INTO u FROM public.users WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Akun tidak ditemukan';
    END IF;
    IF u.status = 'Dihapus' THEN
        RAISE EXCEPTION 'Akun ini sudah dihapus. Pakai Hapus Permanen untuk menghapus sisanya.';
    END IF;
    IF COALESCE(u.role, 'user') NOT IN ('user', 'mitra') THEN
        RAISE EXCEPTION 'Akun staf tidak bisa dihapus. Cabut perannya dulu di menu Tim Admin.';
    END IF;
    IF lower(btrim(COALESCE(p_confirm, ''))) IS DISTINCT FROM lower(public.account_confirm_text(p_user_id)) THEN
        RAISE EXCEPTION 'Teks konfirmasi tidak cocok. Ketik: %', public.account_confirm_text(p_user_id);
    END IF;
    v_footprint := public.admin_account_footprint(p_user_id);
    IF (v_footprint ->> 'running_orders')::INT > 0 THEN
        RAISE EXCEPTION 'Masih ada pesanan berjalan. Selesaikan atau batalkan dulu dari menu Pesanan.';
    END IF;
    IF (v_footprint ->> 'running_projects')::INT > 0 THEN
        RAISE EXCEPTION 'Masih ada proyek berjalan. Selesaikan atau batalkan dulu dari menu Proyek.';
    END IF;

    SELECT COALESCE(array_agg(f) FILTER (WHERE f IS NOT NULL AND f <> ''), '{}') INTO v_files
    FROM (
        SELECT u.avatar_url AS f
        UNION ALL SELECT unnest(ARRAY[a.ktp_photo, a.selfie_photo, a.sim_photo])
        FROM public.mitra_applications a WHERE a.auth_id = p_user_id
    ) s;

    UPDATE public.users
    SET name = 'Akun dihapus', email = NULL, phone = NULL, avatar_url = NULL, fcm_token = NULL,
        status = 'Dihapus', mitra_access = '[]'::jsonb, job_type_preferences = '[]'::jsonb, role = 'user'
    WHERE id = p_user_id;
    DELETE FROM public.saved_addresses WHERE user_id = p_user_id;
    UPDATE public.mitra_applications
    SET name = NULL, phone = NULL, email = NULL, plate = NULL, address = NULL,
        ktp_photo = NULL, selfie_photo = NULL, sim_photo = NULL,
        status = CASE WHEN status IN ('Active', 'Pending') THEN 'Revoked' ELSE status END
    WHERE auth_id = p_user_id;
    UPDATE public.merchants SET listing_status = 'suspended', hidden_by_admin = false WHERE owner_id = p_user_id;
    UPDATE public.drivers SET is_online = false WHERE id = p_user_id;

    UPDATE auth.users
    SET email = 'deleted-' || p_user_id || '@deleted.wira.invalid', phone = NULL,
        raw_user_meta_data = '{}'::jsonb, banned_until = '2999-12-31'::timestamptz, updated_at = NOW()
    WHERE id = p_user_id;
    DELETE FROM auth.identities WHERE user_id = p_user_id;
    DELETE FROM auth.sessions WHERE user_id = p_user_id;

    INSERT INTO public.account_deletions (user_id, role, files_to_purge) VALUES (p_user_id, u.role, v_files);
    PERFORM public.log_admin_action('account_deleted', 'user', p_user_id::text, p_user_id, v_reason,
        v_footprint || jsonb_build_object('name', u.name));
    RETURN v_footprint;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Permanent delete
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_account_permanently(p_user_id UUID, p_confirm TEXT, p_reason TEXT)
RETURNS JSONB AS $$
DECLARE
    u RECORD;
    v_email TEXT;
    v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
    v_files TEXT[];
    v_footprint JSONB;
BEGIN
    IF NOT public.admin_can('staff') THEN
        RAISE EXCEPTION 'Khusus Superadmin' USING ERRCODE = '42501';
    END IF;
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Tidak bisa menghapus akun sendiri';
    END IF;
    IF v_reason IS NULL OR length(v_reason) < 5 THEN
        RAISE EXCEPTION 'Tulis alasan (minimal 5 karakter)';
    END IF;
    SELECT * INTO u FROM public.users WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Akun tidak ditemukan';
    END IF;
    IF COALESCE(u.role, 'user') NOT IN ('user', 'mitra') THEN
        RAISE EXCEPTION 'Akun staf tidak bisa dihapus. Cabut perannya dulu di menu Tim Admin.';
    END IF;
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
    IF lower(btrim(COALESCE(p_confirm, ''))) IS DISTINCT FROM lower(public.account_confirm_text(p_user_id)) THEN
        RAISE EXCEPTION 'Teks konfirmasi tidak cocok. Ketik: %', public.account_confirm_text(p_user_id);
    END IF;
    v_footprint := public.admin_account_footprint(p_user_id);
    IF (v_footprint ->> 'running_orders')::INT > 0 THEN
        RAISE EXCEPTION 'Masih ada pesanan berjalan. Selesaikan atau batalkan dulu dari menu Pesanan.';
    END IF;
    IF (v_footprint ->> 'running_projects')::INT > 0 THEN
        RAISE EXCEPTION 'Masih ada proyek berjalan. Selesaikan atau batalkan dulu dari menu Proyek.';
    END IF;

    SELECT COALESCE(array_agg(f) FILTER (WHERE f IS NOT NULL AND f <> ''), '{}') INTO v_files
    FROM (
        SELECT u.avatar_url AS f
        UNION ALL SELECT unnest(ARRAY[a.ktp_photo, a.selfie_photo, a.sim_photo])
        FROM public.mitra_applications a WHERE a.auth_id = p_user_id
        UNION ALL SELECT m.image FROM public.merchants m WHERE m.owner_id = p_user_id
        UNION ALL SELECT unnest(m.photos) FROM public.merchants m WHERE m.owner_id = p_user_id
    ) s;

    -- Rows that would otherwise block the delete (no ON DELETE action).
    DELETE FROM public.reviews WHERE user_id = p_user_id OR driver_id = p_user_id;
    UPDATE public.reviews SET hidden_by = NULL WHERE hidden_by = p_user_id;
    DELETE FROM public.customer_ratings WHERE customer_id = p_user_id OR rated_by = p_user_id;
    DELETE FROM public.order_adjustments WHERE requested_by = p_user_id;
    DELETE FROM public.project_messages WHERE sender_id = p_user_id OR technician_id = p_user_id;
    DELETE FROM public.project_quotes WHERE technician_id = p_user_id;
    UPDATE public.projects SET awarded_to = NULL WHERE awarded_to = p_user_id;
    DELETE FROM public.projects WHERE customer_id = p_user_id;
    UPDATE public.technician_profiles SET verified_by = NULL WHERE verified_by = p_user_id;
    DELETE FROM public.drivers WHERE id = p_user_id;
    DELETE FROM public.restaurants WHERE owner_id = p_user_id;
    DELETE FROM public.mitra_applications WHERE auth_id = p_user_id;

    INSERT INTO public.account_deletions (user_id, role, files_to_purge) VALUES (p_user_id, u.role, v_files);
    PERFORM public.log_admin_action('account_deleted_permanently', 'user', p_user_id::text, NULL, v_reason,
        v_footprint || jsonb_build_object('name', u.name, 'email', v_email));

    -- Cascades to public.users and everything with ON DELETE CASCADE.
    DELETE FROM auth.users WHERE id = p_user_id;
    RETURN v_footprint;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.account_running_orders(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_account_footprint(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.account_confirm_text(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_account(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_account_permanently(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_account(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_account_footprint(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_account_permanently(UUID, TEXT, TEXT) TO authenticated;

-- Verify:
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_enforce_customer_active';
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'hidden_by_admin';
