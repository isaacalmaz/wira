-- Setup Wallet and Top-Up System

-- 1. Ensure users table has a wallet_balance column
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC DEFAULT 0;

-- 2. Create Top-Up Requests table
CREATE TABLE IF NOT EXISTS public.topup_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    proof_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure status check constraint supports 'cancelled' if table already exists
DO $$
BEGIN
    ALTER TABLE public.topup_requests DROP CONSTRAINT IF EXISTS topup_requests_status_check;
    ALTER TABLE public.topup_requests ADD CONSTRAINT topup_requests_status_check 
        CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 2b. Ensure Transactions table exists for wallet ledger
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'success',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own transactions" ON public.transactions;
CREATE POLICY "Users can read own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
CREATE POLICY "Users can insert own transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all transactions" ON public.transactions;
CREATE POLICY "Admins can manage all transactions" ON public.transactions FOR ALL USING (true);

-- 3. Security (RLS)
ALTER TABLE public.topup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own topups" ON public.topup_requests;
CREATE POLICY "Users can read own topups" ON public.topup_requests FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own topups" ON public.topup_requests;
CREATE POLICY "Users can insert own topups" ON public.topup_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all topups" ON public.topup_requests;
CREATE POLICY "Admins can manage all topups" ON public.topup_requests FOR ALL USING (true); -- Simplify for now

-- Allow reading pending amounts so collision detection can verify uniqueness across concurrent users
DROP POLICY IF EXISTS "Anyone can check pending amounts" ON public.topup_requests;
CREATE POLICY "Anyone can check pending amounts" ON public.topup_requests FOR SELECT USING (status = 'pending');

-- Allow users to cancel their own pending top-up requests (releases unique code)
DROP POLICY IF EXISTS "Users can cancel own pending topups" ON public.topup_requests;
CREATE POLICY "Users can cancel own pending topups" ON public.topup_requests
FOR UPDATE USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id AND status = 'cancelled');

-- Secure RPC to get active pending unique amounts without exposing any sensitive user data
CREATE OR REPLACE FUNCTION get_pending_topup_codes(base_val NUMERIC)
RETURNS TABLE (amount NUMERIC) AS $$
BEGIN
    RETURN QUERY
    SELECT tr.amount
    FROM public.topup_requests tr
    WHERE tr.status = 'pending'
      AND tr.amount >= (base_val + 101)
      AND tr.amount <= (base_val + 999);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enforce partial uniqueness: No two pending top-ups can share the same exact nominal
CREATE UNIQUE INDEX IF NOT EXISTS idx_topup_requests_pending_unique_amount
ON public.topup_requests (amount)
WHERE status = 'pending';

-- 3b. Database Trigger: Ensure Unique Code (amount % 1000 > 0) & Collision Avoidance
-- Modifies topup_requests so that any round amount inserted automatically gets a 3-digit unique code (101-999)
-- and actively checks against pending collision
CREATE OR REPLACE FUNCTION trg_topup_requests_unique_amount()
RETURNS TRIGGER AS $$
DECLARE
    base_val NUMERIC;
    candidate_code NUMERIC;
    scan_code NUMERIC;
    attempts INT := 0;
BEGIN
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

DROP TRIGGER IF EXISTS trg_ensure_unique_amount ON public.topup_requests;
CREATE TRIGGER trg_ensure_unique_amount
BEFORE INSERT ON public.topup_requests
FOR EACH ROW
EXECUTE FUNCTION trg_topup_requests_unique_amount();

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

    -- Record transaction for wallet history and balance calculation
    INSERT INTO public.transactions (user_id, amount, type, status, description)
    VALUES (req_user_id, req_amount, 'topup', 'success', 'Top Up QRIS Statis DANA');

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create RPC to safely reject a top-up (Guards against approving/rejecting race conditions)
CREATE OR REPLACE FUNCTION reject_topup_request(request_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    req_status TEXT;
BEGIN
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

-- 6. Create RPC to safely cancel a top-up by user (Releases unique code)
CREATE OR REPLACE FUNCTION cancel_topup_request(request_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    req_status TEXT;
    req_user_id UUID;
BEGIN
    SELECT status, user_id INTO req_status, req_user_id
    FROM public.topup_requests
    WHERE id = request_id
    FOR UPDATE;

    IF NOT FOUND OR req_status != 'pending' THEN
        RETURN FALSE;
    END IF;

    -- Verify ownership if authenticated
    IF auth.uid() IS NOT NULL AND req_user_id != auth.uid() THEN
        RETURN FALSE;
    END IF;

    UPDATE public.topup_requests
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = request_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
