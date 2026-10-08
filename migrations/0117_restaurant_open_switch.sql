-- =========================================
-- 0117: the restaurant "Menerima pesanan" switch really opens/closes the shop
--
-- Wira Mitra's open/closed switch only changed the screen: customers could
-- still order from a "closed" restaurant (merchants.is_open was not
-- writable by owners, and guard_villa_booking checked it for villas only).
--   * set_my_merchant_open(merchant, open): the owner (or an admin) opens or
--     closes their place.
--   * guard_villa_booking (0115 body) now refuses new orders for a closed
--     restaurant too. The customer list already shows it as "Tutup".
-- Depends on 0101, 0109, 0115.
-- =========================================

CREATE OR REPLACE FUNCTION public.set_my_merchant_open(p_merchant_id UUID, p_open BOOLEAN)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.merchants SET is_open = COALESCE(p_open, true)
    WHERE id = p_merchant_id AND (owner_id = auth.uid() OR public.is_admin_panel());
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tempat ini bukan milik Anda' USING ERRCODE = '42501';
    END IF;
    RETURN COALESCE(p_open, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.set_my_merchant_open(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_merchant_open(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_villa_booking()
RETURNS TRIGGER AS $$
DECLARE
    v_owner UUID;
BEGIN
    IF NEW.merchant_id IS NOT NULL AND NEW.service_type IN ('villa', 'WiraVilla', 'food', 'WiraFood') THEN
        SELECT m.owner_id INTO v_owner FROM public.merchants m
        WHERE m.id = NEW.merchant_id AND m.listing_status = 'approved' AND COALESCE(m.is_open, true);
        IF NOT FOUND OR (v_owner IS NOT NULL AND public.commission_debt_block(v_owner) IS NOT NULL) THEN
            RAISE EXCEPTION 'Tempat ini sedang tidak menerima pesanan';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Verify: SELECT proname FROM pg_proc WHERE proname = 'set_my_merchant_open';
