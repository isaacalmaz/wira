-- =============================================================================
-- Migration 0045: Midtrans top-up `method` column + amount-drift fix
-- =============================================================================
-- Context: backend/routes/midtrans.js's /charge endpoint inserts
-- topup_requests rows with `method: 'midtrans'`, but no `method` column has
-- ever existed on public.topup_requests (created in 0015) - every Midtrans
-- charge insert has been failing at the database level (PostgREST rejects
-- unknown columns on insert).
--
-- This also fixes a real amount-drift/money bug: 0015's
-- trg_topup_requests_unique_amount BEFORE INSERT trigger mutates NEW.amount
-- for any round-number amount, appending a random 101-999 "unique code" -
-- a scheme designed only for the manual QRIS-static bank-transfer flow, so a
-- human admin could visually match an incoming transfer to a pending
-- request. A Midtrans-sourced top-up is already unambiguously identified by
-- its own Midtrans order_id, so that mutation is not just unnecessary but
-- actively dangerous there: /charge builds the Snap transaction_details
-- from the amount that exists on the row AFTER the insert (see updated
-- backend code), but before this fix, a concurrently-running trigger could
-- still randomize a round-number request between the moment it's inserted
-- and read back, silently making the wallet credit diverge from whatever
-- amount actually got charged. Skipping the mutation entirely for
-- method = 'midtrans' rows removes that possibility at the source.
-- =============================================================================

-- 1. Add the missing `method` column (nullable, defaults to 'manual' to
--    match every historical row, which all came from the manual QRIS-static
--    flow via frontend-user/src/services/topupService.js).
ALTER TABLE public.topup_requests ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'manual';

-- 1b. backend/routes/midtrans.js's webhook has always inserted a
--     `reference_id` (the Midtrans order_id) into public.transactions for
--     audit/support traceability, but that column has never existed on the
--     table (created in 0015) - confirmed live by actually POSTing a real,
--     correctly-signed synthetic webhook notification against a local
--     backend instance and observing PGRST204 "Could not find the
--     'reference_id' column of 'transactions' in the schema cache" AFTER
--     the wallet had already been credited and the request marked
--     'approved' - i.e. every real Midtrans top-up before this fix would
--     have silently left an un-audited wallet credit with no matching
--     ledger row. Adding the column (nullable, so it doesn't affect any
--     other transaction type that doesn't set it).
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reference_id TEXT;

-- 2. Re-create the unique-amount trigger function, skipping the mutation
--    entirely for Midtrans-sourced requests.
CREATE OR REPLACE FUNCTION trg_topup_requests_unique_amount()
RETURNS TRIGGER AS $$
DECLARE
    base_val NUMERIC;
    candidate_code NUMERIC;
    scan_code NUMERIC;
    attempts INT := 0;
BEGIN
    -- Midtrans top-ups are identified by their own Midtrans order_id, not by
    -- a visually-matched manual transfer nominal - never randomize their
    -- amount. Doing so would make the amount Midtrans actually charges the
    -- customer diverge from the amount later credited to their wallet.
    IF NEW.method = 'midtrans' THEN
        RETURN NEW;
    END IF;

    IF NEW.amount IS NOT NULL THEN
        -- If amount has no unique code (ends in 000) OR collides with an active pending request
        IF (NEW.amount::numeric % 1000) = 0 OR EXISTS (
            SELECT 1 FROM public.topup_requests
            WHERE status = 'pending' AND amount = NEW.amount AND (NEW.id IS NULL OR id != NEW.id)
        ) THEN
            base_val := floor(NEW.amount::numeric / 1000) * 1000;
            LOOP
                candidate_code := floor(random() * 899 + 101)::numeric;
                attempts := attempts + 1;
                IF NOT EXISTS (
                    SELECT 1 FROM public.topup_requests
                    WHERE status = 'pending' AND amount = (base_val + candidate_code)
                ) THEN
                    NEW.amount := base_val + candidate_code;
                    EXIT;
                END IF;

                -- If 50 random attempts encounter collision, systematically scan 101..999 to guarantee an open slot
                IF attempts >= 50 THEN
                    FOR scan_code IN 101..999 LOOP
                        IF NOT EXISTS (
                            SELECT 1 FROM public.topup_requests
                            WHERE status = 'pending' AND amount = (base_val + scan_code)
                        ) THEN
                            NEW.amount := base_val + scan_code;
                            EXIT;
                        END IF;
                    END LOOP;
                    EXIT;
                END IF;
            END LOOP;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger itself (name/timing/table) is unchanged from 0015, CREATE OR
-- REPLACE FUNCTION above is enough since it just points at the function
-- name - but re-assert it defensively in case it was ever dropped.
DROP TRIGGER IF EXISTS trg_ensure_unique_amount ON public.topup_requests;
CREATE TRIGGER trg_ensure_unique_amount
BEFORE INSERT ON public.topup_requests
FOR EACH ROW
EXECUTE FUNCTION trg_topup_requests_unique_amount();

-- 3. The partial unique index on (amount) WHERE status = 'pending' was also
--    written only for the manual flow's "no two pending manual transfers
--    share the same nominal" rule. Two different customers legitimately
--    topping up a round Midtrans amount (e.g. two people both choosing the
--    Rp 50.000 quick-amount button) at the same time would otherwise hit a
--    unique-constraint violation on INSERT for no real reason - Midtrans
--    rows don't need amount-uniqueness, they're keyed by order_id.
DROP INDEX IF EXISTS idx_topup_requests_pending_unique_amount;
CREATE UNIQUE INDEX IF NOT EXISTS idx_topup_requests_pending_unique_amount
ON public.topup_requests (amount)
WHERE status = 'pending' AND method IS DISTINCT FROM 'midtrans';
