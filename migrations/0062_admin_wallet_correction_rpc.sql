-- =============================================================================
-- Migration 0062: admin_correction_wallet_balance() — atomic manual wallet
-- correction RPC, with the ledger entry inside the same transaction
-- =============================================================================
-- Renumbered and hardened from an unapplied draft (originally
-- "0056_admin_wallet_correction_rpc.sql", written by a separate AI agent
-- session working this same repo). Two real issues found before this ever
-- reached production, fixed here rather than layered on top as a patch
-- since the original file was never applied to the database:
--
-- 1. NUMBERING COLLISION: 0056 was already taken by
--    0056_drop_untracked_feature_flags_policy.sql (applied and live-verified
--    days earlier) - migrations/0061_add_accepted_at_to_orders.sql is also
--    already live, so 0062 is the real next free slot. Always check
--    `ls migrations/ | tail -5` before naming a new migration - this
--    project has hit exactly this collision before (see the 0034 duplicate
--    noted in migrations/README.md's "Known issues" section).
--
-- 2. NON-ATOMIC LEDGER WRITE (the more important fix): the original design
--    had the RPC update wallet_balance ONLY, and left the frontend
--    (frontend-admin/src/pages/UsersPage.jsx) to insert the matching
--    public.transactions row as a SEPARATE, later Supabase call. If that
--    second call failed for any reason (network blip, a future RLS change,
--    a validation error) after the RPC had already committed the balance
--    change, the result is a wallet that silently moved with NO audit
--    trail at all - defeating the entire stated purpose of this feature
--    (FinancePage.jsx's new "Semua Transaksi (Buku Besar)" tab exists
--    specifically so an admin can trace every real balance movement,
--    including corrections like the Baiq Erliana case this feature was
--    built to fix). The ledger insert now happens inside this same
--    SECURITY DEFINER function, in the same implicit transaction as the
--    balance UPDATE - both commit together or neither does.
--
-- Also fixed while moving the insert server-side: the original frontend
-- code stored corrections as `type: 'topup'` or `'payment'` (to "make the
-- UI happy"), even though frontend-admin/src/pages/FinancePage.jsx's ledger
-- tab was ALREADY written to specifically recognize `'correction_in'`
-- (line ~371, `tx.type === 'correction_in'`) - the mismatch was silently
-- masked by that same line's `|| tx.amount > 0` fallback, but a real
-- correction was being stored mislabeled as if it were a genuine top-up or
-- payment. Now stores the real `correction_in`/`correction_out` type
-- FinancePage.jsx already expects.
--
-- Everything else (role check via the established
-- ('admin','Superadmin','superadmin','Admin Ops') pattern, atomic single
-- UPDATE...RETURNING, negative-final-balance guard, GRANT EXECUTE TO
-- authenticated with the auth.uid() check as the real gate - the same
-- pattern already used by approve_topup_request/reject_topup_request)
-- is unchanged from the original draft; it was sound.
-- =============================================================================

CREATE OR REPLACE FUNCTION admin_correction_wallet_balance(
    p_user_id UUID,
    p_amount NUMERIC,
    p_description TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_balance NUMERIC;
    v_is_admin BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops')
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can perform manual wallet corrections.';
    END IF;

    IF p_amount IS NULL OR p_amount = 0 THEN
        RAISE EXCEPTION 'Correction amount cannot be zero';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'User % not found', p_user_id;
    END IF;

    UPDATE public.users
    SET wallet_balance = COALESCE(wallet_balance, 0) + p_amount
    WHERE id = p_user_id
    RETURNING wallet_balance INTO v_new_balance;

    IF v_new_balance < 0 THEN
        RAISE EXCEPTION 'Insufficient balance: correction would result in a negative wallet balance (%).', v_new_balance;
    END IF;

    -- Ledger entry in the SAME transaction as the balance change - see
    -- header for why this moved out of the frontend's separate call.
    INSERT INTO public.transactions (user_id, amount, type, status, description, reference_id)
    VALUES (
        p_user_id,
        ABS(p_amount),
        CASE WHEN p_amount > 0 THEN 'correction_in' ELSE 'correction_out' END,
        'success',
        'KOREKSI ADMIN: ' || COALESCE(NULLIF(TRIM(p_description), ''), '(tanpa catatan)'),
        'admin_correction_' || gen_random_uuid()
    );

    RETURN v_new_balance;
END;
$$;

-- Explicit EXECUTE grant to authenticated (the frontend calls this
-- directly) - the internal auth.uid()/role check above is the real
-- authorization boundary, same pattern as approve_topup_request /
-- reject_topup_request (migrations/0022).
GRANT EXECUTE ON FUNCTION admin_correction_wallet_balance(UUID, NUMERIC, TEXT) TO authenticated;

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- 1. As a non-admin authenticated session: calling this RPC should fail
--    with "Unauthorized: Only admins can perform manual wallet corrections."
-- 2. As a real admin session, on a real (or disposable test) user: call
--    with a positive p_amount - wallet_balance should increase by exactly
--    that amount, AND a matching public.transactions row should appear
--    with type='correction_in', amount = the positive value, description
--    starting with "KOREKSI ADMIN: ", in the SAME query round-trip (no
--    separate insert needed from the frontend anymore).
-- 3. Same with a negative p_amount - type should be 'correction_out'.
-- 4. Attempt a negative p_amount large enough to push wallet_balance below
--    zero - should be rejected with the "Insufficient balance" exception,
--    and the balance must be confirmed UNCHANGED afterward (the UPDATE and
--    the exception happen in the same function call, so a failed check
--    after RETURNING still needs confirming it didn't partially apply -
--    Postgres rolls back the whole function on RAISE EXCEPTION, but verify
--    this empirically rather than assuming).
-- 5. frontend-admin/src/pages/FinancePage.jsx's "Semua Transaksi (Buku
--    Besar)" tab should now show the correction with the correct
--    correction_in/correction_out styling, not falling back to the
--    amount-sign heuristic.
-- =============================================================================
