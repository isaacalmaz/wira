-- =========================================
-- 0106: users delete their own account (Google Play account-deletion rule)
--
--   * delete_my_account('HAPUS'): for a customer or partner, from the app
--     or from wira.one/hapus-akun. Refused while something is still open:
--     an active order or project, WiraPay balance left, or partner earnings
--     / commission not settled (money is never silently destroyed).
--   * What it does, in one transaction:
--       - public.users: name -> 'Akun dihapus', email/phone/photo/push token
--         cleared, status 'Dihapus', partner access removed
--       - saved addresses deleted; partner applications stripped of ID
--         card, selfie, licence photos and contact data
--       - restaurants/villas suspended, driver set offline
--       - auth: sign-in email replaced, phone cleared, account banned,
--         sessions and identities removed, so nobody can sign in to it and
--         the same email can register again as a brand-new account
--   * Kept, as the privacy policy says: orders, payments and reviews (now
--     pointing at "Akun dihapus") for bookkeeping.
--   * account_deletions: one row per deletion (who, when, which stored
--     files an admin should purge from Storage), readable by admins.
-- =========================================

CREATE TABLE IF NOT EXISTS public.account_deletions (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    role TEXT,
    files_to_purge TEXT[] NOT NULL DEFAULT '{}',
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_deletions_admin_read ON public.account_deletions;
CREATE POLICY account_deletions_admin_read ON public.account_deletions
    FOR SELECT USING (public.is_admin_panel());

CREATE OR REPLACE FUNCTION public.delete_my_account(p_confirm TEXT)
RETURNS JSONB AS $$
DECLARE
    v_uid UUID := auth.uid();
    u RECORD;
    v_files TEXT[];
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Silakan masuk terlebih dahulu' USING ERRCODE = '42501';
    END IF;
    IF upper(btrim(COALESCE(p_confirm, ''))) <> 'HAPUS' THEN
        RAISE EXCEPTION 'Ketik HAPUS untuk mengonfirmasi';
    END IF;

    SELECT * INTO u FROM public.users WHERE id = v_uid FOR UPDATE;
    IF NOT FOUND OR u.status = 'Dihapus' THEN
        RAISE EXCEPTION 'Akun tidak ditemukan';
    END IF;
    IF u.role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops', 'Admin Keuangan', 'CS') THEN
        RAISE EXCEPTION 'Akun admin tidak bisa dihapus dari sini. Minta Superadmin mencabut aksesnya.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.orders
               WHERE (user_id = v_uid OR driver_id = v_uid
                      OR merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = v_uid))
                 AND status NOT IN ('completed', 'cancelled', 'expired')) THEN
        RAISE EXCEPTION 'Masih ada pesanan yang berjalan. Selesaikan atau batalkan dulu, lalu coba lagi.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.projects
               WHERE (customer_id = v_uid OR awarded_to = v_uid)
                 AND status IN ('open', 'awarded')) THEN
        RAISE EXCEPTION 'Masih ada proyek yang berjalan. Selesaikan atau batalkan dulu, lalu coba lagi.';
    END IF;
    IF COALESCE(u.wallet_balance, 0) > 0 THEN
        RAISE EXCEPTION 'Saldo WiraPay Anda masih Rp %. Gunakan atau minta pengembalian lewat Pusat Bantuan dulu.',
            replace(to_char(u.wallet_balance, 'FM999,999,999,999'), ',', '.');
    END IF;
    IF COALESCE(u.payable_balance, 0) > 0 THEN
        RAISE EXCEPTION 'Pendapatan Anda masih Rp %. Cairkan dulu lewat menu Pendapatan.',
            replace(to_char(u.payable_balance, 'FM999,999,999,999'), ',', '.');
    END IF;
    IF COALESCE(u.payable_balance, 0) < 0 THEN
        RAISE EXCEPTION 'Masih ada komisi Rp % yang belum disetor. Lunasi dulu, lalu coba lagi.',
            replace(to_char(-u.payable_balance, 'FM999,999,999,999'), ',', '.');
    END IF;

    -- Stored files an admin should remove from Storage afterwards.
    SELECT COALESCE(array_agg(f) FILTER (WHERE f IS NOT NULL AND f <> ''), '{}') INTO v_files
    FROM (
        SELECT u.avatar_url AS f
        UNION ALL SELECT unnest(ARRAY[a.ktp_photo, a.selfie_photo, a.sim_photo])
        FROM public.mitra_applications a WHERE a.auth_id = v_uid
    ) s;

    UPDATE public.users
    SET name = 'Akun dihapus', email = NULL, phone = NULL, avatar_url = NULL, fcm_token = NULL,
        status = 'Dihapus', mitra_access = '[]'::jsonb, job_type_preferences = '[]'::jsonb
    WHERE id = v_uid;

    DELETE FROM public.saved_addresses WHERE user_id = v_uid;

    UPDATE public.mitra_applications
    SET name = NULL, phone = NULL, email = NULL, plate = NULL, address = NULL,
        ktp_photo = NULL, selfie_photo = NULL, sim_photo = NULL
    WHERE auth_id = v_uid;

    UPDATE public.merchants SET listing_status = 'suspended' WHERE owner_id = v_uid;
    UPDATE public.drivers SET is_online = false WHERE id = v_uid;

    UPDATE auth.users
    SET email = 'deleted-' || v_uid || '@deleted.wira.invalid', phone = NULL,
        raw_user_meta_data = '{}'::jsonb, banned_until = '2999-12-31'::timestamptz, updated_at = NOW()
    WHERE id = v_uid;
    DELETE FROM auth.identities WHERE user_id = v_uid;
    DELETE FROM auth.sessions WHERE user_id = v_uid;

    INSERT INTO public.account_deletions (user_id, role, files_to_purge) VALUES (v_uid, u.role, v_files);

    RETURN jsonb_build_object('deleted', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.delete_my_account(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account(TEXT) TO authenticated;
