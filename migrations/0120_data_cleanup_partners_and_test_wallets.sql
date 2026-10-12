-- =========================================
-- 0120: one-off data cleanup found in the admin "Pengguna" review (2026-10-13)
-- Owner approved each point:
--   1. Hide listings whose owner has no restaurant/villa access (sample data
--      owned by a driver account; customers could book places nobody runs).
--      Hidden (suspended), not deleted.
--   2. Approved partner applications whose account no longer has that access
--      are marked 'Revoked', so admins don't read them as active partners.
--   3. Test WiraPay balances (wallet is off since 2026-10-08) are zeroed;
--      the owner confirmed they were test money. Logged in admin_audit_log.
--   4. users.role follows partner access ('mitra' with any access, 'user'
--      without), staff roles untouched; the admin dashboard counts customers
--      by role.
-- =========================================

-- 1. Listings with an owner who cannot run them.
UPDATE public.merchants m
SET listing_status = 'suspended',
    review_note = 'Disembunyikan: pemilik tidak punya akses mitra untuk tempat ini (data contoh)'
WHERE m.listing_status <> 'suspended'
  AND NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = m.owner_id
        AND COALESCE(u.mitra_access, '[]'::jsonb) ?
            CASE WHEN m.service_type IN ('villa', 'WiraVilla') THEN 'villa' ELSE 'merchant' END
  );

-- 2. Approved applications without the access.
UPDATE public.mitra_applications a
SET status = 'Revoked',
    admin_notes = COALESCE(a.admin_notes || ' · ', '') || 'Akses sudah tidak aktif (dirapikan 13 Okt 2026)'
WHERE a.status = 'Active'
  AND NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = a.auth_id
        AND COALESCE(u.mitra_access, '[]'::jsonb) ? (CASE WHEN a.role = 'courier' THEN 'driver' ELSE a.role END)
  );

-- 3. Test wallet balances.
INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, subject_user_id, note, data)
SELECT NULL, 'wallet_zeroed', 'user', u.id::text, u.id,
       'Saldo WiraPay uji coba dinolkan (dompet nonaktif, disetujui pemilik)',
       jsonb_build_object('from', u.wallet_balance)
FROM public.users u WHERE COALESCE(u.wallet_balance, 0) <> 0;
UPDATE public.users SET wallet_balance = 0 WHERE COALESCE(wallet_balance, 0) <> 0;

-- 4. Role follows access (staff untouched).
UPDATE public.users
SET role = CASE WHEN jsonb_array_length(CASE WHEN jsonb_typeof(mitra_access) = 'array' THEN mitra_access ELSE '[]'::jsonb END) > 0
                THEN 'mitra' ELSE 'user' END
WHERE COALESCE(role, 'user') IN ('user', 'mitra')
  AND role IS DISTINCT FROM CASE WHEN jsonb_array_length(CASE WHEN jsonb_typeof(mitra_access) = 'array' THEN mitra_access ELSE '[]'::jsonb END) > 0
                                 THEN 'mitra' ELSE 'user' END;

-- Verify:
--   SELECT name, listing_status FROM merchants WHERE review_note LIKE 'Disembunyikan%';
--   SELECT count(*) FROM users WHERE wallet_balance <> 0;   -- 0
