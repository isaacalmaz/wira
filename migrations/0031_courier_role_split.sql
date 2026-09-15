-- Extends tonight's Restoran/Villa mitra_access split to Ride/Send: a driver
-- and a courier are now two distinct mitra_access values ('driver' and
-- 'courier') instead of one undifferentiated 'driver' role covering both
-- ride and send jobs (see orderService.js's DRIVER_SERVICE_TYPES =
-- ['ride','send',...] for how thoroughly conflated they were before this).
--
-- NOTE on column type: public.users.mitra_access is JSONB (added by 0005,
-- confirmed still JSONB as of 0025/0026's `u.mitra_access::text ILIKE
-- '...'` casts) - NOT a native Postgres text[]. This migration uses JSONB
-- operators (`?`, `||`) to match, mirroring 0005's own
-- `mitra_access || '["merchant"]'::jsonb ... AND NOT mitra_access ? 'merchant'`
-- pattern exactly, rather than array_append/@> (which target text[] and
-- would fail against a jsonb column).
--
-- Unlike Restoran vs Villa (a merchant can never simultaneously BE a
-- restaurant and a villa), a single real driver with one motorbike CAN
-- realistically do both ride and delivery jobs, and does so *today* with
-- zero friction. This migration must not regress that for any real,
-- currently-active driver account:
--
--   - No new role TABLE is needed - mitra_access already holds an arbitrary
--     list of role strings per user, and 'driver'/'courier' can coexist in
--     it exactly like someone could already hold ["merchant","technician"]
--     together.
--   - Backfill: every user who currently holds 'driver' also gets 'courier'
--     appended, so every driver who is live and receiving both ride and
--     send jobs right now keeps receiving both after this ships - nobody's
--     job queue silently shrinks the moment the split goes live. New
--     registrants after this point choose ONE of Driver/Kurir at signup
--     (frontend-mitra/src/pages/RegisterPage.jsx) and can self-service
--     activate the other later from Pengaturan Akun
--     (frontend-mitra/src/pages/shared/SettingsPage.jsx) without needing a
--     second admin approval - they're already a vetted mitra.
--
-- No RLS policy in this project checks mitra_access value-by-value (every
-- policy that cares about a mitra role checks driver_id/owner_id/auth.uid()
-- ownership instead - see 0024/0028), so no policy needs to change here.
-- This is purely a data backfill.

UPDATE public.users
SET mitra_access = mitra_access || '["courier"]'::jsonb
WHERE mitra_access ? 'driver'
  AND NOT mitra_access ? 'courier';

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- 1. SELECT id, mitra_access FROM public.users WHERE mitra_access ? 'driver';
--    — every row should now also contain 'courier'.
-- 2. A user who had ONLY 'merchant' (no 'driver') before this should be
--    completely unaffected - SELECT id, mitra_access FROM public.users
--    WHERE NOT (mitra_access ? 'driver') AND mitra_access ? 'courier'
--    should return zero rows (nobody gains 'courier' without already
--    having had 'driver').
-- 3. Re-running this statement a second time should be a no-op (the
--    `AND NOT mitra_access ? 'courier'` guard makes it idempotent).
