-- Fixes a live, actively exploitable "print money" bug: approve_topup_request
-- and reject_topup_request are SECURITY DEFINER (bypass RLS) with no caller
-- authorization check at all, and no GRANT/REVOKE restricting who can call
-- them — so any anonymous, logged-out client could call
-- supabase.rpc('approve_topup_request', { request_id: '<any pending id>' })
-- directly and instantly credit that amount into that user's wallet_balance.
-- Empirically confirmed exploitable against the live DB via the anon key
-- with zero authentication, 2026-09-15.
--
-- This was already drafted (unapplied) in SECURITY_FIXES_2026-09-15.sql,
-- which withheld it pending confirmation that frontend-admin has a real
-- admin login (it used to have a fake-Superadmin fallback). That fallback
-- has since been removed from frontend-admin/src/context/AuthContext.jsx,
-- and a real admin account with a matching public.users role was confirmed
-- live before applying this. Logic is otherwise unchanged from 0015/0021.

CREATE OR REPLACE FUNCTION approve_topup_request(request_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    req_amount NUMERIC;
    req_user_id UUID;
    req_status TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops')
    ) THEN
        RETURN FALSE;
    END IF;

    SELECT amount, user_id, status INTO req_amount, req_user_id, req_status
    FROM public.topup_requests
    WHERE id = request_id
    FOR UPDATE;

    IF NOT FOUND OR req_status != 'pending' THEN
        RETURN FALSE;
    END IF;

    UPDATE public.topup_requests
    SET status = 'approved', updated_at = NOW()
    WHERE id = request_id;

    UPDATE public.users
    SET wallet_balance = COALESCE(wallet_balance, 0) + req_amount
    WHERE id = req_user_id;

    INSERT INTO public.transactions (user_id, amount, type, status, description)
    VALUES (req_user_id, req_amount, 'topup', 'success', 'Top Up QRIS Statis');

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reject_topup_request(request_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    req_status TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops')
    ) THEN
        RETURN FALSE;
    END IF;

    SELECT status INTO req_status
    FROM public.topup_requests
    WHERE id = request_id
    FOR UPDATE;

    IF NOT FOUND OR req_status != 'pending' THEN
        RETURN FALSE;
    END IF;

    UPDATE public.topup_requests
    SET status = 'rejected', updated_at = NOW()
    WHERE id = request_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- cancel_topup_request already checks auth.uid() = req_user_id — unchanged.
