-- 1. Tambah kolom pin_attempts ke tabel orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pin_attempts INT DEFAULT 0;

-- 2. Update fungsi start_order_with_pin dengan Rate Limiting
CREATE OR REPLACE FUNCTION start_order_with_pin(p_order_id UUID, p_pin_input VARCHAR(4))
RETURNS JSONB AS $$
DECLARE
    v_order public.orders%ROWTYPE;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    
    IF NOT FOUND THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Pesanan tidak ditemukan'); 
    END IF;

    IF v_order.status NOT IN ('accepted', 'picking_up') THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Pesanan belum siap untuk dimulai'); 
    END IF;

    -- Batasi jumlah percobaan maksimal 5 kali
    IF v_order.pin_attempts >= 5 THEN
        -- Secara otomatis batalkan pesanan jika terdeteksi aktivitas mencurigakan
        UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
        RETURN jsonb_build_object('success', false, 'error', 'Terlalu banyak percobaan PIN (Brute-force). Pesanan dibatalkan otomatis demi keamanan.');
    END IF;

    IF v_order.security_pin != p_pin_input THEN 
        -- Tambah counter percobaan yang gagal
        UPDATE public.orders SET pin_attempts = COALESCE(pin_attempts, 0) + 1 WHERE id = p_order_id;
        RETURN jsonb_build_object('success', false, 'error', 'PIN tidak valid. Sisa percobaan: ' || (5 - (COALESCE(v_order.pin_attempts, 0) + 1))); 
    END IF;
    
    -- PIN Benar, reset attempt dan ubah status
    UPDATE public.orders 
    SET status = 'in_trip', updated_at = NOW(), pin_attempts = 0 
    WHERE id = p_order_id;
    
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Update State Machine Trigger untuk memblokir Double-Spend / Perubahan status setelah final
CREATE OR REPLACE FUNCTION public.enforce_orders_state_machine()
RETURNS TRIGGER AS $$
BEGIN
    IF current_user = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF current_user IN ('authenticated', 'anon') THEN
            IF NEW.status IS DISTINCT FROM 'pending' THEN
                RAISE EXCEPTION 'New orders must be created with status = pending (got %)', NEW.status;
            END IF;
            IF NEW.payment_status IS DISTINCT FROM 'unpaid' AND NEW.payment_status IS DISTINCT FROM 'paid' THEN
                RAISE EXCEPTION 'New orders must be created with payment_status = unpaid or paid (got %)', NEW.payment_status;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- TG_OP = 'UPDATE' from here on.

    -- MENCEGAH PERUBAHAN APAPUN JIKA STATUS SEBELUMNYA ADALAH FINAL (cancelled / completed)
    IF OLD.status IN ('cancelled', 'completed') AND NOT is_admin() THEN
        RAISE EXCEPTION 'Order is already finalized (%) and cannot be modified', OLD.status;
    END IF;

    IF NEW.total_price IS DISTINCT FROM OLD.total_price AND NOT is_admin() THEN
        RAISE EXCEPTION 'total_price cannot be changed after an order is created (except by an admin)';
    END IF;

    -- claiming an unassigned order
    IF OLD.driver_id IS NULL AND NEW.driver_id IS NOT NULL THEN
        IF NEW.driver_id != auth.uid() THEN
            RAISE EXCEPTION 'You can only assign an order to yourself';
        END IF;
        IF NEW.driver_id = OLD.user_id THEN
            RAISE EXCEPTION 'You cannot claim your own order as its driver';
        END IF;
        IF NOT (
            EXISTS (SELECT 1 FROM public.drivers WHERE id = NEW.driver_id)
            OR EXISTS (
                SELECT 1 FROM public.users
                WHERE id = NEW.driver_id
                  AND mitra_access IS NOT NULL
                  AND mitra_access::text ILIKE '%technician%'
            )
        ) THEN
            RAISE EXCEPTION 'Only a registered driver or technician account can claim an order';
        END IF;
    END IF;

    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
        IF NOT (
            is_admin()
            OR auth.uid() = OLD.driver_id
            OR OLD.merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
        ) THEN
            RAISE EXCEPTION 'Only the assigned driver/technician, the owning merchant, or an admin can mark an order completed';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
