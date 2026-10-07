-- =========================================
-- 0114: partners can change their own phone number
--
-- Wira Mitra -> Pengaturan Akun saves name and phone together, but 0050's
-- column grant left phone out, so every save (even a name-only change)
-- failed with "permission denied for table users". The number customers
-- call must be editable by the partner. RLS still limits the update to the
-- caller's own row; phone stays unique.
-- Depends on 0050.
-- =========================================

GRANT UPDATE (phone) ON public.users TO authenticated;

-- Verify (signed in as a partner): update({ phone: '0812...' }) on own row -> 1 row.
