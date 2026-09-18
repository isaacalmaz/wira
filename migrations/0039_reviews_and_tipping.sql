-- 1. Create Reviews Table
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id),
    driver_id UUID REFERENCES public.users(id),
    merchant_id UUID REFERENCES public.users(id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    tip_amount NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Add is_reviewed to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_reviewed BOOLEAN DEFAULT false;

-- 3. Enable RLS
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all reviews"
    ON public.reviews FOR SELECT
    USING (true);

CREATE POLICY "Users can insert their own reviews"
    ON public.reviews FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 4. RPC for submitting a review and processing tip securely
CREATE OR REPLACE FUNCTION public.submit_review_and_tip(
    p_order_id UUID,
    p_rating INTEGER,
    p_review_text TEXT,
    p_tip_amount NUMERIC
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_driver_id UUID;
    v_merchant_id UUID;
    v_user_balance NUMERIC;
    v_is_reviewed BOOLEAN;
BEGIN
    -- Get order details
    SELECT user_id, driver_id, merchant_id, is_reviewed 
    INTO v_user_id, v_driver_id, v_merchant_id, v_is_reviewed
    FROM public.orders 
    WHERE id = p_order_id;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF v_is_reviewed THEN
        RAISE EXCEPTION 'Order has already been reviewed';
    END IF;

    -- Process Tip if amount > 0 and a driver exists
    IF p_tip_amount > 0 AND v_driver_id IS NOT NULL THEN
        -- Check balance
        SELECT wallet_balance INTO v_user_balance 
        FROM public.users WHERE id = v_user_id FOR UPDATE;

        IF v_user_balance < p_tip_amount THEN
            RAISE EXCEPTION 'Saldo WiraPay tidak mencukupi untuk memberikan tip';
        END IF;

        -- Deduct from user
        UPDATE public.users 
        SET wallet_balance = wallet_balance - p_tip_amount 
        WHERE id = v_user_id;

        -- Add to driver
        UPDATE public.users 
        SET wallet_balance = wallet_balance + p_tip_amount 
        WHERE id = v_driver_id;

        -- Record Transactions
        INSERT INTO public.transactions (user_id, amount, type, description)
        VALUES (v_user_id, p_tip_amount, 'payment', 'Tip untuk Driver (Order ' || p_order_id || ')');

        INSERT INTO public.transactions (user_id, amount, type, description)
        VALUES (v_driver_id, p_tip_amount, 'transfer_in', 'Tip dari Pelanggan (Order ' || p_order_id || ')');
    END IF;

    -- Insert Review
    INSERT INTO public.reviews (order_id, user_id, driver_id, merchant_id, rating, review_text, tip_amount)
    VALUES (p_order_id, v_user_id, v_driver_id, v_merchant_id, p_rating, p_review_text, p_tip_amount);

    -- Mark order as reviewed
    UPDATE public.orders SET is_reviewed = true WHERE id = p_order_id;

    RETURN TRUE;
END;
$$;
