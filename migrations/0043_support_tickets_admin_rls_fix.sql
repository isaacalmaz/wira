-- Fixes two live RLS bugs in 0035_support_tickets.sql, both confirmed by a
-- real before/after test against the live database (two throwaway auth
-- test accounts, cleaned up afterward — see conversation notes, not
-- checked into this repo):
--
-- BUG 1 — wide-open read hole. `"Admins can view all tickets" ... FOR
-- SELECT USING (true)` has no actual admin check at all: it grants SELECT
-- on every row to ANY authenticated user, not just admins. Confirmed live:
-- a fresh non-admin test customer (B) could read a private test ticket
-- created by a different customer (A), including A's joined name/phone via
-- the `users(name, phone)` embed `SupportTicketsPage.jsx` does — i.e. any
-- logged-in customer could currently browse every other customer's
-- complaints and phone number. Fixed by replacing it with a real
-- `is_admin()`-gated policy (same SECURITY DEFINER helper introduced by
-- migrations/0026_fix_users_rls_infinite_recursion.sql — reused here
-- rather than reinventing an inline
-- `EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = ...)`
-- check, which is exactly the shape of check 0026 had to fix once already
-- for causing infinite recursion when written directly into a policy on a
-- table whose own rows that check reads).
--
-- BUG 2 — no UPDATE policy at all. `frontend-admin` uses the plain anon
-- key (no service-role bypass), so `SupportTicketsPage.jsx`'s
-- `handleUpdateStatus` UPDATE matched zero rows under RLS. Confirmed live:
-- a real (test) admin account, updating a real test ticket through the
-- anon-key client exactly like the admin frontend does, got back
-- `{ error: null, data: [] }` — Postgres/PostgREST's classic "RLS trap"
-- (a write blocked by RLS looks identical to a successful write that
-- happened to touch 0 rows) — and a follow-up service-role read confirmed
-- the ticket's status was genuinely unchanged. This means every "Tandai
-- Diproses" / "Selesaikan Kasus" click in the admin dashboard was silently
-- doing nothing while showing a success toast. Fixed by adding a real
-- `is_admin()`-gated UPDATE policy. (The corresponding defensive fix in
-- `SupportTicketsPage.jsx` — chaining `.select()` on the update and
-- checking the returned row count before toasting success — is a separate
-- frontend change in the same commit as this migration, kept as a
-- permanent guard so a future RLS regression here fails loudly instead of
-- silently.)
--
-- Ordinary ticket owners intentionally get no UPDATE policy: only the
-- reporting user (SELECT, already correct) and admins (SELECT + UPDATE)
-- ever need write access here — a customer should never be able to
-- resolve or edit their own ticket's status/admin_response.

DROP POLICY IF EXISTS "Admins can view all tickets" ON public.support_tickets;
CREATE POLICY "Admins can view all tickets"
ON public.support_tickets FOR SELECT
USING (is_admin());

DROP POLICY IF EXISTS "Admins can update tickets" ON public.support_tickets;
CREATE POLICY "Admins can update tickets"
ON public.support_tickets FOR UPDATE
USING (is_admin())
WITH CHECK (is_admin());

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- 1. As a non-admin user, SELECT support_tickets — should return only
--    rows where user_id = auth.uid() (the pre-existing "Users can view
--    their own support tickets" policy), never another user's ticket.
-- 2. As a real admin, SELECT support_tickets — should return every row.
-- 3. As a real admin, UPDATE a ticket's status/admin_response through the
--    anon-key client (not service role) — should succeed and return the
--    updated row (non-empty data array).
-- 4. As a non-admin user (including the ticket's own reporter), UPDATE any
--    support_tickets row — should affect 0 rows (RLS-blocked), not error.
