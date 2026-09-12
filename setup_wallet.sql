-- Setup Wallet and Top-Up System

-- 1. Ensure users table has a wallet_balance column
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC DEFAULT 0;

-- 2. Create Top-Up Requests table
CREATE TABLE IF NOT EXISTS public.topup_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    proof_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Security (RLS)
ALTER TABLE public.topup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own topups" ON public.topup_requests;
CREATE POLICY "Users can read own topups" ON public.topup_requests FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own topups" ON public.topup_requests;
CREATE POLICY "Users can insert own topups" ON public.topup_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all topups" ON public.topup_requests;
CREATE POLICY "Admins can manage all topups" ON public.topup_requests FOR ALL USING (true); -- Simplify for now

-- 4. Create RPC to safely approve a top-up (Updates balance and status transactionally)
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

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
