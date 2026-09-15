-- Fix: transaction description text hardcoded "QRIS Statis DANA" even though
-- Wira's actual QRIS is a generic national QRIS (GPN / "Satu QRIS Untuk Semua"),
-- not a DANA-specific code. This only changes the literal description string;
-- all other logic is identical to the version in 0015_wallet_topup_system.sql.

CREATE OR REPLACE FUNCTION approve_topup_request(request_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    req_amount NUMERIC;
    req_user_id UUID;
    req_status TEXT;
BEGIN
    -- Get the request details
    SELECT amount, user_id, status INTO req_amount, req_user_id, req_status
    FROM public.topup_requests
    WHERE id = request_id
    FOR UPDATE;

    -- Ensure it exists and is pending
    IF NOT FOUND OR req_status != 'pending' THEN
        RETURN FALSE;
    END IF;

    -- Update request status
    UPDATE public.topup_requests
    SET status = 'approved', updated_at = NOW()
    WHERE id = request_id;

    -- Update user balance
    UPDATE public.users
    SET wallet_balance = COALESCE(wallet_balance, 0) + req_amount
    WHERE id = req_user_id;

    -- Record transaction for wallet history and balance calculation
    INSERT INTO public.transactions (user_id, amount, type, status, description)
    VALUES (req_user_id, req_amount, 'topup', 'success', 'Top Up QRIS Statis');

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
