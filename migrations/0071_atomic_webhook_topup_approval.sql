-- =============================================================================
-- Migration 0071: approve a webhook top-up and credit the wallet atomically
-- =============================================================================
--
-- THE BUG
-- -------
-- Both payment webhooks (backend/routes/midtrans.js, backend/routes/
-- mutasiku.js) approved a top-up in three separate PostgREST calls:
--
--   1. UPDATE topup_requests SET status = 'approved' WHERE status = 'pending'
--   2. rpc credit_wallet_balance_atomic(user_id, amount)
--   3. INSERT INTO transactions (... 'topup' ...)
--
-- Step 1 is what makes a webhook retry safe (a replay matches zero rows and
-- is a no-op). But if step 2 or 3 failed after step 1 committed (network
-- blip, serverless timeout, DB hiccup), the request was already 'approved':
-- the webhook returned 500, the gateway retried, the retry saw a non-pending
-- row and treated it as "already processed". The customer paid real money
-- and the wallet was never credited (or credited with no ledger row), with
-- no automatic recovery. Exactly the failure mode an idempotency guard is
-- supposed to prevent.
--
-- The admin manual-approval path (approve_topup_request, 0022) never had
-- this problem - it already does all three inside one SECURITY DEFINER
-- function.
--
-- THE FIX
-- -------
-- approve_topup_and_credit(...) does the same three steps inside ONE
-- transaction, holding a row lock on the topup_requests row: either the
-- request is approved AND the wallet credited AND the ledger row written,
-- or nothing changes and the webhook's retry can try again cleanly.
--
-- It returns a status word instead of raising for the expected no-op cases,
-- so the webhooks can keep answering 200 to replays:
--   'approved'          - this call approved and credited it
--   'already_processed' - the row exists but is no longer pending (replay)
--   'not_found'         - no such request
-- An amount or method mismatch RAISES (never credits), so a malformed
-- payload surfaces as an error rather than a silent no-op.
--
-- service_role only (the backend's key), same as credit_wallet_balance_atomic
-- (0052/0055): no client may approve its own top-up.
--
-- Depends on: 0015 (topup_requests, transactions), 0045 (topup_requests.
-- method, transactions.reference_id).
-- Companion backend change: routes/midtrans.js and routes/mutasiku.js call
-- this instead of the three separate steps. Apply this migration BEFORE the
-- backend deploy that calls it; the old backend keeps working after it is
-- applied (nothing it uses is changed or removed).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.approve_topup_and_credit(
    p_request_id UUID,
    p_expected_amount NUMERIC,
    p_expected_method TEXT,
    p_description TEXT,
    p_reference_id TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
    v_req RECORD;
BEGIN
    SELECT id, user_id, amount, status, method
    INTO v_req
    FROM public.topup_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;

    IF v_req.status IS DISTINCT FROM 'pending' THEN
        RETURN 'already_processed';
    END IF;

    IF COALESCE(v_req.method, 'manual') IS DISTINCT FROM p_expected_method THEN
        RAISE EXCEPTION 'Top-up % has method %, expected %', p_request_id, v_req.method, p_expected_method;
    END IF;

    IF ROUND(v_req.amount) IS DISTINCT FROM ROUND(p_expected_amount) THEN
        RAISE EXCEPTION 'Top-up % amount mismatch: stored %, notified %', p_request_id, v_req.amount, p_expected_amount;
    END IF;

    UPDATE public.topup_requests
    SET status = 'approved', updated_at = NOW()
    WHERE id = p_request_id;

    UPDATE public.users
    SET wallet_balance = COALESCE(wallet_balance, 0) + v_req.amount
    WHERE id = v_req.user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Top-up % belongs to user % which does not exist', p_request_id, v_req.user_id;
    END IF;

    INSERT INTO public.transactions (user_id, amount, type, status, description, reference_id)
    VALUES (v_req.user_id, v_req.amount, 'topup', 'success', p_description, p_reference_id);

    RETURN 'approved';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.approve_topup_and_credit(UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_topup_and_credit(UUID, NUMERIC, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.approve_topup_and_credit(UUID, NUMERIC, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_topup_and_credit(UUID, NUMERIC, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================
-- Verification - run after applying
-- ============================================================
-- 1. Permissions: as anon or authenticated (e.g. PostgREST with the anon
--    key), calling approve_topup_and_credit must fail with
--    "permission denied for function".
-- 2. Happy path (service role): create a pending 'manual' topup_requests
--    row for a test user, call approve_topup_and_credit(id, amount,
--    'manual', 'test') -> 'approved'; wallet_balance up by exactly amount;
--    one 'topup' transactions row; request status 'approved'.
-- 3. Replay: call it again with the same arguments -> 'already_processed',
--    balance unchanged, still exactly one transactions row.
-- 4. Mismatch: a fresh pending row, called with a different amount or
--    method -> raises; row still 'pending', balance unchanged.
-- 5. All-or-nothing: if any step raises, the status flip is rolled back too
--    (row stays 'pending'), so the gateway's retry can still succeed.
