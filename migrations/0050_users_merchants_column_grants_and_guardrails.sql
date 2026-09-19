-- =============================================================================
-- Migration 0050: Close self-service privilege/wallet escalation on
-- public.users and public.merchants (CRITICAL)
-- =============================================================================
--
-- THE VULNERABILITY (public.users)
-- ---------------------------------
-- The live "users_update" policy (migrations/0026_fix_users_rls_infinite_
-- recursion.sql:64-69, never redefined since — confirmed the final
-- effective policy by grepping every CREATE POLICY/DROP POLICY touching
-- "users_update" across 0001-0049) is:
--
--     CREATE POLICY "users_update" ON public.users
--     FOR UPDATE USING (auth.uid() = id OR is_admin());
--
-- There is no WITH CHECK and no column restriction. `USING` alone gates
-- UPDATE by controlling which ROWS may be touched, not which COLUMNS or
-- what VALUES they may be set to. Since `auth.uid() = id` is true both
-- before and after an update (a row's own id never changes), any logged-in
-- user can run, against their own row:
--
--     supabase.from('users').update({
--       role: 'Superadmin',
--       wallet_balance: 999999999,
--       payable_balance: 999999999,
--     }).eq('id', myOwnId)
--
-- and it succeeds — instant admin escalation plus unlimited spendable/
-- payable balance, with zero DB-side guard anywhere in the current schema.
--
-- Also found while doing the same close read on public.users this fix
-- requires (verifying the "genuinely self-editable columns" the task asked
-- for meant reading every INSERT policy too, not just UPDATE): the
-- "users_insert" policy (also 0026, `WITH CHECK (auth.uid() = id OR
-- is_admin())`) has the exact same shape of hole on INSERT. A signed-up
-- auth.users account with no public.users row yet (nothing in this schema
-- auto-creates one — there is no `on_auth_user_created` trigger anywhere in
-- migrations/) can insert its OWN row directly via the REST API with
-- `role: 'Superadmin', wallet_balance: 999999999, ...}` instead of going
-- through frontend-user's AuthContext.jsx (which only ever sends
-- `role: 'user', status: 'Aktif'`, but that's an app-level default, not a
-- DB-enforced one). This is the identical exploit class on the same table,
-- just via INSERT instead of UPDATE, and is closed in the same trigger
-- below rather than left half-fixed.
--
-- THE FIX (public.users): Postgres column-level privileges, per-row logic
-- layered on top via trigger
-- ---------------------------------------------------------------------
-- `REVOKE UPDATE ... GRANT UPDATE (<safe columns>)` blocks changing
-- role/wallet_balance/payable_balance for the `authenticated` Postgres
-- role at the strongest layer available — a raw permission check that
-- fires before RLS or any trigger even runs, and can't be bypassed by a
-- future RLS policy mistake.
--
-- The full live column list for public.users (found by grepping every
-- `CREATE TABLE public.users` / `ALTER TABLE public.users ADD COLUMN`
-- across 0001, 0005, 0008, 0011, 0015, 0028, 0033, 0037, 0038) is: id,
-- name, email, phone, role, status, created_at, vehicle_type,
-- plate_number, specialization, mitra_access, wallet_balance,
-- payable_balance, fcm_token, job_type_preferences, avatar_url.
--
-- The self/admin-editable subset actually granted below was determined by
-- exhaustively grepping every `.from('users').update(` call site across
-- frontend-user, frontend-mitra, and frontend-admin (not guessed):
--   - name, email, avatar_url — frontend-user/src/pages/EditProfilePage.jsx.
--     `phone` is deliberately NOT granted — EditProfilePage's own phone
--     field is rendered `disabled` with the caption "Nomor HP tidak dapat
--     diubah demi keamanan akun" (phone can't be changed, for account
--     security) — the app's own design intent, not an oversight.
--   - fcm_token — frontend-user & frontend-mitra AuthContext.jsx (push
--     token registration on login).
--   - vehicle_type, job_type_preferences — self-edited by a driver in
--     frontend-mitra/src/pages/shared/SettingsPage.jsx, and also written by
--     an admin approving a driver application
--     (frontend-admin/src/pages/DriversPage.jsx).
--   - status — self-set to 'Pending' by frontend-mitra/src/pages/
--     UnauthorizedPage.jsx (submitting a mitra application queues the
--     account for review); set to 'Aktif'/'Diblokir' by
--     frontend-admin/src/pages/{Users,Drivers,Technicians,Merchants}Page.jsx
--     (ban/unban, approve).
--   - mitra_access — written only by frontend-admin (UsersPage.jsx's
--     toggle, and the three approval pages), never by a non-admin self
--     update anywhere in the app.
--   - plate_number, specialization — NOT granted: grepped every
--     `.from('users').update(` call site in the repo and neither column is
--     ever part of an UPDATE payload (only used at initial admin-driven
--     INSERT). No UPDATE grant needed.
--   - role, wallet_balance, payable_balance — NEVER granted. Confirmed by
--     the same exhaustive grep that no legitimate call site anywhere in the
--     app updates these columns directly; every real balance change goes
--     through a SECURITY DEFINER RPC (wallet_pay, wallet_transfer,
--     approve_topup_request, credit_wallet_balance_atomic (0052),
--     request_payout and friends (0028), submit_review_and_tip (0041/0053),
--     credit_payout_on_order_completed (0028)) or, for `role`, is only ever
--     set once at row creation.
--
-- A COMPLICATION THE TASK BRIEF DIDN'T ACCOUNT FOR — why status/mitra_access
-- need a trigger, not just a grant
-- ---------------------------------------------------------------------
-- Supabase has no separate Postgres role for "admin" — an admin and a
-- plain customer both connect as the exact same `authenticated` role;
-- "admin" is purely an application-level check (`is_admin()` reading
-- `public.users.role`). A column GRANT applies uniformly to that whole
-- role, so it CANNOT by itself express "an admin may change this column on
-- ANY row, but a non-admin may only touch their own row and only in a
-- narrow way" — that distinction can only be enforced with row-aware logic
-- (RLS or a trigger), never with a grant alone.
--
-- role/wallet_balance/payable_balance sidestep this entirely: they are
-- NEVER written via a direct client UPDATE by anyone, admin included (only
-- by SECURITY DEFINER RPCs, which run as the function owner, not as
-- `authenticated`), so revoking them from `authenticated` outright has zero
-- collateral. status and mitra_access are different — frontend-admin's own
-- approval/ban dashboards write them directly via `authenticated`,
-- targeting OTHER users' rows, so they cannot be revoked from
-- `authenticated` without breaking real admin flows. They stay in the
-- GRANT list below, and the residual "can a non-admin escalate their own
-- status/mitra_access" gap is closed instead by the trigger further down —
-- see that function's own comments for why a trigger was used here rather
-- than embedding old-vs-new comparisons directly in the RLS policy
-- (short version: migrations/0026 is a live, on-the-record example of a
-- self-referencing subquery inside a public.users RLS policy causing
-- infinite recursion; a BEFORE trigger reading OLD/NEW directly avoids that
-- failure mode entirely since it needs no subquery against users at all).
--
-- THE VULNERABILITY AND FIX (public.merchants) — Fix 7
-- ---------------------------------------------------------------------
-- Same shape of bug, smaller blast radius: "merchants_update_owner_or_admin"
-- (migrations/0026:97-102, `USING (owner_id = auth.uid() OR is_admin())`,
-- no WITH CHECK) lets a merchant run
-- `supabase.from('merchants').update({rating: 5.0}).eq('id', myMerchantId)`
-- on their own listing — `rating` should only ever be derived from real
-- reviews or set by an admin.
--
-- Unlike users, there is no admin/self role-sharing complication here:
-- grepped every `.from('merchants').update(` call site in the app and
-- frontend-admin NEVER updates a merchants row directly (only INSERT/
-- DELETE/SELECT — see MerchantsPage.jsx/VillasPage.jsx). Every real UPDATE
-- is the owning merchant editing their own listing
-- (frontend-mitra/src/pages/merchant/VillaListingPage.jsx sets name/
-- address/price_per_night/description/image; frontend-mitra/src/pages/
-- shared/SettingsPage.jsx sets image alone). So the column GRANT below is a
-- clean, total fix with no trigger needed: `rating`, `owner_id`,
-- `service_type`, and `created_at` become completely unwritable by
-- `authenticated` for this table, full stop.
-- =============================================================================

-- --- public.users: column-level UPDATE privilege -----------------------------
REVOKE UPDATE ON public.users FROM authenticated;
GRANT UPDATE (
    name,
    email,
    avatar_url,
    fcm_token,
    vehicle_type,
    job_type_preferences,
    status,
    mitra_access
) ON public.users TO authenticated;

-- --- public.merchants: column-level UPDATE privilege --------------------------
REVOKE UPDATE ON public.merchants FROM authenticated;
GRANT UPDATE (
    name,
    address,
    image,
    price_per_night,
    description
) ON public.merchants TO authenticated;

-- --- public.users: row-aware guardrail trigger (INSERT + UPDATE) -------------
-- Belt-and-suspenders for role/wallet_balance/payable_balance (already
-- blocked at the grant level above for UPDATE — this also covers INSERT,
-- which grants don't touch, and protects against a future migration
-- accidentally re-granting one of these columns broadly), and the ONLY
-- enforcement at all for status/mitra_access, which — per the comment
-- above — cannot be fully closed at the grant level without breaking real
-- admin flows.
CREATE OR REPLACE FUNCTION public.enforce_users_write_guardrails()
RETURNS TRIGGER AS $$
BEGIN
    -- Only guard writes coming directly from a PostgREST request
    -- authenticated as the plain `authenticated` role — i.e. a logged-in
    -- user's own JWT, whether that's a customer self-editing or an admin
    -- acting through frontend-admin (both are `authenticated`; Supabase has
    -- no separate DB role for "admin"). Every money-moving SECURITY
    -- DEFINER function in this schema (wallet_pay, wallet_transfer,
    -- approve_topup_request, credit_wallet_balance_atomic (0052),
    -- request_payout/approve/reject/cancel_payout_request (0028),
    -- submit_review_and_tip (0041/0053), credit_payout_on_order_completed
    -- (0028)) executes its internal UPDATE public.users as that function's
    -- OWNER role, not as `authenticated` — Postgres changes the effective
    -- current_user for the duration of a SECURITY DEFINER call (and for
    -- any trigger fired by statements inside it), so this check leaves
    -- every one of those RPCs completely untouched. Verified by reading
    -- every `UPDATE public.users` call site across migrations/ before
    -- writing this.
    IF current_user <> 'authenticated' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- Self-signup (frontend-user/src/context/AuthContext.jsx) always
        -- inserts role='user', status='Aktif', and never sets
        -- wallet_balance/payable_balance (both default to 0 via column
        -- DEFAULT). Admin-driven inserts — frontend-admin's mitra-approval
        -- pages (DriversPage.jsx/MerchantsPage.jsx/TechniciansPage.jsx),
        -- when a pending applicant has no existing public.users row yet —
        -- legitimately insert role='mitra' and similar; those run as the
        -- admin's own `authenticated` session, so is_admin() lets them
        -- through.
        IF NOT is_admin() THEN
            IF NEW.role IS DISTINCT FROM 'user' THEN
                RAISE EXCEPTION 'New accounts must self-register with role = user';
            END IF;
            IF COALESCE(NEW.wallet_balance, 0) <> 0 THEN
                RAISE EXCEPTION 'New accounts cannot set an initial wallet_balance';
            END IF;
            IF COALESCE(NEW.payable_balance, 0) <> 0 THEN
                RAISE EXCEPTION 'New accounts cannot set an initial payable_balance';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- TG_OP = 'UPDATE' from here on.

    IF NEW.role IS DISTINCT FROM OLD.role AND NOT is_admin() THEN
        RAISE EXCEPTION 'role can only be changed by an admin';
    END IF;
    IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance AND NOT is_admin() THEN
        RAISE EXCEPTION 'wallet_balance can only be changed via a wallet RPC or by an admin';
    END IF;
    IF NEW.payable_balance IS DISTINCT FROM OLD.payable_balance AND NOT is_admin() THEN
        RAISE EXCEPTION 'payable_balance can only be changed via a payout RPC or by an admin';
    END IF;

    -- status: a non-admin may only ever move their OWN row to 'Pending'
    -- (submitting a mitra application, per UnauthorizedPage.jsx) — every
    -- other status transition (approving to 'Aktif', banning to
    -- 'Diblokir', etc.) requires is_admin(). This intentionally still
    -- allows a self-transition to 'Pending' from any prior status; that is
    -- not a privilege escalation (Pending is not a privileged state, it
    -- just queues the row for admin review).
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT is_admin() THEN
        IF NEW.status IS DISTINCT FROM 'Pending' THEN
            RAISE EXCEPTION 'You can only change your own status to Pending (mitra registration request) — any other change requires an admin';
        END IF;
    END IF;

    -- mitra_access: grepped every call site: it is NEVER self-updated
    -- anywhere in the current app, only set by an admin on someone else's
    -- row. No legitimate self-transition exists at all, unlike status.
    IF NEW.mitra_access IS DISTINCT FROM OLD.mitra_access AND NOT is_admin() THEN
        RAISE EXCEPTION 'mitra_access can only be changed by an admin';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_users_write_guardrails ON public.users;
CREATE TRIGGER trg_enforce_users_write_guardrails
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.enforce_users_write_guardrails();

-- ============================================================
-- Verification — run after applying (cannot be executed by the agent that
-- wrote this migration; no DB execution access in that environment)
-- ============================================================
-- 1. As a normal logged-in non-admin test user:
--      supabase.from('users').update({ role: 'Superadmin' }).eq('id', myId)
--    should fail with a Postgres "permission denied for column role" error
--    (from the REVOKE/GRANT), not silently succeed or return 0 rows.
-- 2. Same test user:
--      supabase.from('users').update({ name: 'New Name' }).eq('id', myId)
--    should succeed (name is a granted column).
-- 3. Same test user, trying to set their OWN status directly to 'Aktif' or
--    'Diblokir' (not via UnauthorizedPage's 'Pending' flow) should fail
--    with the trigger's RAISE EXCEPTION message.
-- 4. A real admin account performing the existing ban/unban
--    (UsersPage.jsx toggleStatus), mitra-access toggle (UsersPage.jsx
--    toggleMitraAccess), and mitra-approval (Drivers/Technicians/
--    MerchantsPage.jsx handleVerify) flows should all still succeed exactly
--    as before.
-- 5. End-to-end signup (frontend-user register()) should still succeed and
--    produce a row with role='user'.
-- 6. As a normal logged-in merchant owner:
--      supabase.from('merchants').update({ rating: 5.0 }).eq('id', myMerchantId)
--    should fail with "permission denied for column rating".
-- 7. Same merchant owner, using VillaListingPage.jsx's real save flow
--    (name/address/price_per_night/description/image) should still succeed.
-- 8. Re-run wallet_pay/wallet_transfer/approve_topup_request/request_payout/
--    submit_review_and_tip end-to-end — none of these should be affected by
--    this migration; if any of them start failing, the trigger's
--    `current_user <> 'authenticated'` early-return assumption needs
--    re-checking against the live Supabase role model.
-- =============================================================================
