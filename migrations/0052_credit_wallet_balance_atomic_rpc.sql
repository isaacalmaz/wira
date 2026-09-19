-- =============================================================================
-- Migration 0052: credit_wallet_balance_atomic() — atomic wallet credit RPC
-- for the top-up webhooks (CRITICAL)
-- =============================================================================
--
-- Companion fix to a separate, concurrently-in-progress fix to
-- backend/routes/midtrans.js and backend/routes/mutasiku.js: both webhooks
-- currently credit `users.wallet_balance` with a non-atomic
-- SELECT-then-UPDATE pair from Node.js (read the current balance, compute
-- the new value in application code, write it back), which is a classic
-- race condition — two webhook deliveries for the same user arriving close
-- together (a real possibility: payment gateways retry webhooks on slow
-- responses, and Mutasiku's mutation feed can plausibly deliver near-
-- simultaneous top-ups) can both read the same starting balance and each
-- write back their own `balance + amount`, silently losing one of the two
-- credits.
--
-- This RPC replaces that pattern with a single atomic
-- `UPDATE ... SET wallet_balance = wallet_balance + amount ... RETURNING`,
-- which Postgres executes as one row-locked statement — no read-modify-
-- write window for a second concurrent call to land in.
--
-- Restricted to `service_role` only (both webhooks run under the backend's
-- service-role Supabase client — see backend/config/supabase.js) —
-- `anon`/`authenticated` cannot call this at all, so it can't become a new
-- "any client can credit any wallet" hole the way approve_topup_request
-- was before migrations/0022 fixed it.
--
-- Name and signature are EXACT per the requesting task, since the backend
-- code calling this (written by a separate, concurrent fix to midtrans.js/
-- mutasiku.js) calls it by this exact name: credit_wallet_balance_atomic
-- (p_user_id UUID, p_amount NUMERIC). Not renamed, not reordered.
-- =============================================================================

CREATE OR REPLACE FUNCTION credit_wallet_balance_atomic(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC AS $$
DECLARE v_new_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'p_amount must be positive';
  END IF;
  UPDATE public.users SET wallet_balance = COALESCE(wallet_balance, 0) + p_amount
  WHERE id = p_user_id
  RETURNING wallet_balance INTO v_new_balance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;
  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION credit_wallet_balance_atomic(UUID, NUMERIC) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION credit_wallet_balance_atomic(UUID, NUMERIC) TO service_role;

-- ============================================================
-- Verification — run after applying (cannot be executed by the agent that
-- wrote this migration; no DB execution access in that environment)
-- ============================================================
-- 1. supabase.rpc('credit_wallet_balance_atomic', { p_user_id: '<id>',
--    p_amount: 10000 }) using the anon or authenticated key should fail
--    with a permission-denied error.
-- 2. The same call using the service-role key should succeed and return
--    the new balance.
-- 3. Two concurrent calls for the same p_user_id (e.g. two overlapping
--    `psql` sessions, or a quick load-test script) should both land —
--    final wallet_balance should reflect both credits, not just one.
-- 4. p_amount = 0 or negative should raise 'p_amount must be positive'.
-- 5. A nonexistent p_user_id should raise 'User % not found'.
-- 6. NOTE (not verifiable without seeing the other agent's code): this
--    migration only adds the RPC — it does not itself modify
--    backend/routes/midtrans.js or backend/routes/mutasiku.js to call it.
--    Confirm separately that both webhooks were actually updated to call
--    `credit_wallet_balance_atomic` instead of their old SELECT-then-UPDATE
--    pattern before considering this race condition closed end-to-end.
-- =============================================================================
