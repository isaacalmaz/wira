-- Add security_pin column to orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS security_pin VARCHAR(4);

-- Function to generate a random 4-digit PIN
CREATE OR REPLACE FUNCTION generate_order_pin()
RETURNS TRIGGER AS $$
BEGIN
    -- Only generate a pin if one wasn't provided
    IF NEW.security_pin IS NULL THEN
        NEW.security_pin := lpad(floor(random() * 10000)::text, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically set the PIN on new orders
DROP TRIGGER IF EXISTS trg_generate_order_pin ON public.orders;
CREATE TRIGGER trg_generate_order_pin
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION generate_order_pin();

-- RPC to verify PIN and start the order
CREATE OR REPLACE FUNCTION start_order_with_pin(p_order_id UUID, p_pin_input VARCHAR(4))
RETURNS JSONB AS $$
DECLARE
    v_order public.orders%ROWTYPE;
BEGIN
    -- Get the order
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pesanan tidak ditemukan');
    END IF;

    -- Ensure order is in a state that can be started
    IF v_order.status NOT IN ('accepted', 'picking_up') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pesanan belum siap untuk dimulai');
    END IF;

    -- Verify PIN
    IF v_order.security_pin != p_pin_input THEN
        RETURN jsonb_build_object('success', false, 'error', 'PIN tidak valid');
    END IF;

    -- Update order status to in_trip
    UPDATE public.orders
    SET status = 'in_trip', updated_at = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
