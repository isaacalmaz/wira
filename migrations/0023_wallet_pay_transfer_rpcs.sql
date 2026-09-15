-- Fixes two more live wallet-integrity holes found in the pre-launch audit
-- (2026-09-15), independent of the topup RPC hole fixed in 0022:
--
-- HOLE 1 — free money via direct transaction insert. The only RLS check on
-- INSERT into public.transactions was `auth.uid() = user_id` (0015) — no
-- restriction on `type` or `amount`. Any logged-in user could run, from
-- devtools:
--   supabase.from('transactions').insert({ user_id: myId, amount: 999999999,
--     type: 'topup', status: 'success', description: 'x' })
-- and frontend-user/src/context/WalletContext.jsx computed the *entire*
-- displayed balance by summing this same table client-side, so the
-- fabricated row was immediately spendable on real bookings.
--
-- HOLE 2 — transfer() silently destroyed money. It only ever debited the
-- sender (one INSERT of a 'transfer' transaction) and never resolved
-- `recipientPhone` to an actual user or credited anyone — every "transfer"
-- was really a one-sided balance burn.
--
-- Also: "Admins can manage all transactions" was `USING (true)` — a fully
-- open policy letting anyone read/update/delete *any* user's transaction
-- history (confirmed live: anon key could read other users' rows). No
-- admin UI in frontend-admin actually reads `transactions` today (grepped),
-- so tightening this breaks nothing.
--
-- THE FIX: make public.users.wallet_balance the single source of truth
-- (it already existed but only approve_topup_request wrote to it — the
-- client-summed-transactions balance was a second, unreconciled number).
-- All spending now goes through SECURITY DEFINER RPCs that check and move
-- wallet_balance server-side and log a transaction row for history/display
-- only. Direct client INSERT into transactions is removed entirely.

-- --- RPCs -------------------------------------------------------------

CREATE OR REPLACE FUNCTION wallet_pay(p_amount NUMERIC, p_description TEXT DEFAULT 'Pembayaran Layanan')
RETURNS BOOLEAN AS $$
DECLARE
    v_balance NUMERIC;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Anda harus login untuk membayar';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Nominal tidak valid';
    END IF;

    SELECT wallet_balance INTO v_balance FROM public.users WHERE id = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Akun tidak ditemukan';
    END IF;
    IF COALESCE(v_balance, 0) < p_amount THEN
        RETURN FALSE; -- insufficient funds — not an error, caller shows a normal toast
    END IF;

    UPDATE public.users SET wallet_balance = wallet_balance - p_amount WHERE id = auth.uid();

    INSERT INTO public.transactions (user_id, amount, type, status, description)
    VALUES (auth.uid(), p_amount, 'payment', 'success', p_description);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION wallet_transfer(p_amount NUMERIC, p_recipient_phone TEXT, p_description TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
    v_sender_id UUID := auth.uid();
    v_recipient_id UUID;
    v_recipient_name TEXT;
    v_sender_name TEXT;
    v_sender_balance NUMERIC;
    v_lock_first UUID;
    v_lock_second UUID;
BEGIN
    IF v_sender_id IS NULL THEN
        RAISE EXCEPTION 'Anda harus login untuk transfer';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Nominal tidak valid';
    END IF;

    SELECT id, name INTO v_recipient_id, v_recipient_name
    FROM public.users WHERE phone = p_recipient_phone;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Nomor tujuan tidak ditemukan';
    END IF;
    IF v_recipient_id = v_sender_id THEN
        RAISE EXCEPTION 'Tidak bisa transfer ke diri sendiri';
    END IF;

    SELECT name INTO v_sender_name FROM public.users WHERE id = v_sender_id;

    -- Lock both rows in a stable (id-sorted) order regardless of transfer
    -- direction, so two concurrent opposite-direction transfers between the
    -- same two users can't deadlock each other.
    v_lock_first := LEAST(v_sender_id, v_recipient_id);
    v_lock_second := GREATEST(v_sender_id, v_recipient_id);
    PERFORM 1 FROM public.users WHERE id = v_lock_first FOR UPDATE;
    PERFORM 1 FROM public.users WHERE id = v_lock_second FOR UPDATE;

    SELECT wallet_balance INTO v_sender_balance FROM public.users WHERE id = v_sender_id;
    IF COALESCE(v_sender_balance, 0) < p_amount THEN
        RETURN FALSE; -- insufficient funds
    END IF;

    UPDATE public.users SET wallet_balance = wallet_balance - p_amount WHERE id = v_sender_id;
    UPDATE public.users SET wallet_balance = COALESCE(wallet_balance, 0) + p_amount WHERE id = v_recipient_id;

    INSERT INTO public.transactions (user_id, amount, type, status, description)
    VALUES (v_sender_id, p_amount, 'transfer', 'success',
            COALESCE(p_description, 'Transfer ke ' || COALESCE(v_recipient_name, p_recipient_phone)));

    INSERT INTO public.transactions (user_id, amount, type, status, description)
    VALUES (v_recipient_id, p_amount, 'transfer_in', 'success',
            'Transfer dari ' || COALESCE(v_sender_name, 'Pengguna Wira'));

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --- Lock down direct client writes to transactions --------------------
-- All balance-affecting writes now go exclusively through the SECURITY
-- DEFINER RPCs above (+ approve_topup_request), which bypass RLS by
-- design. Clients only need read access to their own history now.

DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;

DROP POLICY IF EXISTS "Admins can manage all transactions" ON public.transactions;
CREATE POLICY "Admins can view all transactions" ON public.transactions
FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops'))
);

-- --- Defense-in-depth constraints ---------------------------------------

DO $$
BEGIN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_amount_positive CHECK (amount > 0);
EXCEPTION
    WHEN OTHERS THEN NULL; -- already exists, or pre-existing data violates it — investigate manually if so
END $$;

DO $$
BEGIN
    ALTER TABLE public.users ADD CONSTRAINT users_wallet_balance_nonneg CHECK (wallet_balance >= 0);
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- Verification queries — run after applying
-- ============================================================
-- 1. As a real logged-in customer with balance, pay() and transfer() in the
--    app should still work exactly as before from the user's perspective.
-- 2. Confirm direct insert is now blocked:
--    (as any authenticated non-admin) supabase.from('transactions').insert(...)
--    should now fail with a permission-denied / RLS error.
-- 3. Transfer to a real second account's phone number, confirm BOTH sides'
--    wallet_balance changed and both got a transaction row.
