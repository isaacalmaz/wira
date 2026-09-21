-- =============================================================================
-- Migration: 0056_admin_wallet_correction_rpc
-- Purpose: Creates an RPC specifically for admin manual wallet corrections.
-- This RPC checks if the caller is an admin, and if so, performs an atomic
-- wallet update (capable of both adding and deducting).
-- =============================================================================

CREATE OR REPLACE FUNCTION admin_correction_wallet_balance(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER -- Runs as the definer (postgres) to bypass RLS for wallet updates
AS $$
DECLARE
    v_new_balance NUMERIC;
    v_is_admin BOOLEAN;
BEGIN
    -- 1. Check if caller is admin
    SELECT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops')
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can perform manual wallet corrections.';
    END IF;

    -- 2. Verify target user exists
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'User % not found', p_user_id;
    END IF;

    -- 3. Perform atomic update (amount can be negative for deductions)
    UPDATE public.users
    SET wallet_balance = COALESCE(wallet_balance, 0) + p_amount
    WHERE id = p_user_id
    RETURNING wallet_balance INTO v_new_balance;

    -- Prevent negative final balance if needed? For manual admin corrections,
    -- we might want to allow it or strictly prevent it. Let's prevent it to be safe.
    IF v_new_balance < 0 THEN
        RAISE EXCEPTION 'Insufficient balance: Correction would result in negative wallet balance (%).', v_new_balance;
    END IF;

    RETURN v_new_balance;
END;
$$;

-- Grant EXECUTE explicitly to authenticated users (so the frontend can call it).
-- The internal `auth.uid()` check guarantees only admins can actually succeed.
GRANT EXECUTE ON FUNCTION admin_correction_wallet_balance(UUID, NUMERIC) TO authenticated;
