-- Fixes a bug in 0035_support_tickets.sql caught by live re-verification:
-- that migration's trigger `update_support_tickets_updated_at` references
-- `update_updated_at_column()`, which is defined NOWHERE in this entire
-- repository (confirmed by an exhaustive grep across every `.sql` file).
--
-- Confirmed live before writing this fix: inserted a real test ticket, then
-- ran a real UPDATE on it (service-role, bypassing RLS) changing only
-- `status` — `updated_at` did NOT change, staying pinned to its original
-- INSERT-time value. If the trigger existed and its function worked, that
-- UPDATE would have bumped `updated_at` to NOW() automatically. It didn't,
-- which means on the live database the trigger either never got created
-- (the function it depends on didn't exist yet when 0035 was hand-run,
-- so `CREATE TRIGGER ... EXECUTE FUNCTION update_updated_at_column()`
-- itself failed at apply time and was silently skipped/ignored) or was
-- dropped since. Either way, `support_tickets.updated_at` is currently
-- dead weight that never updates itself.
--
-- This is a simple, standard, reusable `updated_at`-bumping trigger
-- function — safe to define generally (many other tables in this schema
-- have their own `updated_at` column: `users`, `orders`, `payout_requests`,
-- `topup_requests`, etc.) but this migration only *wires it up* to
-- `support_tickets`, per the actual scope of the bug being fixed. Retrofitting
-- it onto every other table's existing triggers is a separate, larger change
-- and is intentionally left out here to avoid scope creep.

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-create the trigger so it definitely exists and points at the function
-- that now definitely exists (idempotent: safe whether or not 0035's
-- original CREATE TRIGGER actually landed on the live DB).
DROP TRIGGER IF EXISTS update_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER update_support_tickets_updated_at
    BEFORE UPDATE ON public.support_tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- 1. information_schema.routines should now show update_updated_at_column
--    in the public schema.
-- 2. UPDATE any support_tickets row without explicitly setting updated_at
--    (e.g. `UPDATE support_tickets SET status = status WHERE id = '<id>'`)
--    — updated_at should change to the current timestamp automatically.
