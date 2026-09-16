CREATE OR REPLACE FUNCTION wallet_refund(p_amount NUMERIC, p_description TEXT DEFAULT 'Refund Layanan')
RETURNS BOOLEAN AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Anda harus login untuk menerima refund';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Nominal tidak valid';
    END IF;

    UPDATE public.users SET wallet_balance = COALESCE(wallet_balance, 0) + p_amount WHERE id = auth.uid();

    INSERT INTO public.transactions (user_id, amount, type, status, description)
    VALUES (auth.uid(), p_amount, 'refund', 'success', p_description);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
