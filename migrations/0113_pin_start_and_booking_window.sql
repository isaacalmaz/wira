-- =========================================
-- 0113: trips and sessions start only with the PIN; bookings up to 7 days
--
-- Found in the end-to-end test (2026-10-07):
--   * The driver home screen moved Ride/Send/Food to 'in_trip' with a plain
--     status update, so the customer's / restaurant's PIN was never asked.
--     Only start_order_with_pin (SECURITY DEFINER) may now move an order to
--     'in_trip' or 'working'; a partner's direct update is refused. Admins
--     are exempt.
--   * A WiraAsuh or service visit could be started days before its slot.
--     start_order_with_pin now allows it from 2 hours before scheduled_at.
--   * Owner decision: visits (service, pool, WiraAsuh) can be booked at
--     most 7 days ahead (was 90). Monthly pool package visits are exempt.
--   * Distance prices (WiraRide, WiraFood delivery fee, WiraSend per km)
--     round up to the next Rp500 - Rp20.734 is awkward to pay in cash.
--   * get_my_acceptance_rate counts orders the driver took from the list.
-- Depends on 0089, 0107.
-- =========================================

CREATE OR REPLACE FUNCTION public.enforce_order_start_with_pin()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('in_trip', 'working') AND NEW.status IS DISTINCT FROM OLD.status
       AND current_user IN ('authenticated', 'anon') AND NOT public.is_admin_panel() THEN
        RAISE EXCEPTION 'Masukkan PIN dari pelanggan untuk memulai.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public; -- invoker: current_user is the caller's role
DROP TRIGGER IF EXISTS trg_enforce_order_start_with_pin ON public.orders;
CREATE TRIGGER trg_enforce_order_start_with_pin BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.enforce_order_start_with_pin();

-- Runs after trg_set_order_booking_fields (triggers fire in name order),
-- which fills scheduled_at for service/pool from the order's metadata.
CREATE OR REPLACE FUNCTION public.enforce_booking_window()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.service_type IN ('service', 'pool', 'babysit') AND NEW.package_id IS NULL
       AND NEW.scheduled_at IS NOT NULL
       AND (NEW.scheduled_at AT TIME ZONE 'Asia/Makassar')::date > (NOW() AT TIME ZONE 'Asia/Makassar')::date + 7 THEN
        RAISE EXCEPTION 'Pesanan bisa dibuat paling jauh 7 hari ke depan.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
DROP TRIGGER IF EXISTS trg_zz_enforce_booking_window ON public.orders;
CREATE TRIGGER trg_zz_enforce_booking_window BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_window();

-- 0107 body + the 2-hour start window for visits.
CREATE OR REPLACE FUNCTION public.start_order_with_pin(p_order_id UUID, p_pin_input VARCHAR(4))
RETURNS JSONB AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_caller UUID := auth.uid();
    v_real_pin VARCHAR(4);
    v_is_visit BOOLEAN;
    v_next TEXT;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pesanan tidak ditemukan');
    END IF;

    IF v_order.driver_id IS DISTINCT FROM v_caller AND NOT is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anda tidak berhak memulai pesanan ini');
    END IF;

    v_is_visit := v_order.service_type IN ('service', 'pool', 'babysit');
    v_next := CASE WHEN v_is_visit THEN 'working' ELSE 'in_trip' END;

    IF (v_is_visit AND v_order.status NOT IN ('accepted', 'on_the_way'))
       OR (NOT v_is_visit AND v_order.status NOT IN ('accepted', 'picking_up')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pesanan belum siap untuk dimulai');
    END IF;

    -- 0113: a visit (service, pool, WiraAsuh) starts at most 2 hours early.
    IF v_is_visit AND v_order.scheduled_at IS NOT NULL AND NOW() < v_order.scheduled_at - INTERVAL '2 hours' THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Belum waktunya. Sesi ini bisa dimulai mulai pukul '
            || to_char((v_order.scheduled_at - INTERVAL '2 hours') AT TIME ZONE 'Asia/Makassar', 'HH24.MI')
            || ' WITA, ' || to_char(v_order.scheduled_at AT TIME ZONE 'Asia/Makassar', 'DD/MM') || '.');
    END IF;

    IF v_order.pin_attempts >= 5 THEN
        PERFORM public.refund_order_to_wallet(p_order_id, 'Refund Pembatalan (PIN salah berulang)');
        UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
        RETURN jsonb_build_object('success', false, 'error', 'Terlalu banyak percobaan PIN. Pesanan dibatalkan otomatis demi keamanan.');
    END IF;

    SELECT pin INTO v_real_pin FROM public.order_security_pins WHERE order_id = p_order_id;

    IF v_real_pin IS DISTINCT FROM p_pin_input THEN
        UPDATE public.orders SET pin_attempts = COALESCE(pin_attempts, 0) + 1 WHERE id = p_order_id;
        RETURN jsonb_build_object('success', false, 'error', 'PIN tidak valid. Sisa percobaan: ' || (5 - (COALESCE(v_order.pin_attempts, 0) + 1)));
    END IF;

    UPDATE public.orders
    SET status = v_next, updated_at = NOW(), pin_attempts = 0
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'status', v_next);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- Acceptance rate (0087) counted only orders offered by push (dispatch
-- pings), so a driver who took orders from the list saw "no offers yet".
-- Orders the driver took now count as offered and accepted.
CREATE OR REPLACE FUNCTION public.get_my_acceptance_rate(p_days INT DEFAULT 30)
RETURNS TABLE (offered INT, accepted INT) AS $$
    WITH seen AS (
        SELECT p.order_id FROM public.order_dispatch_pings p
        WHERE p.driver_id = auth.uid() AND p.pinged_at > NOW() - make_interval(days => GREATEST(p_days, 1))
        UNION
        SELECT o.id FROM public.orders o
        WHERE o.driver_id = auth.uid() AND o.created_at > NOW() - make_interval(days => GREATEST(p_days, 1))
    )
    SELECT COUNT(*)::INT,
           COUNT(*) FILTER (WHERE o.driver_id = auth.uid())::INT
    FROM seen s JOIN public.orders o ON o.id = s.order_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_my_acceptance_rate(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_acceptance_rate(INT) TO authenticated;

-- Price trigger: 0109 body with distance prices rounded up to Rp500.
CREATE OR REPLACE FUNCTION public.enforce_orders_price_computation()
RETURNS TRIGGER AS $$
DECLARE
    v_base NUMERIC;
    v_per_km NUMERIC;
    v_dist_km NUMERIC;
    v_extra_km NUMERIC;
    v_subtotal NUMERIC;
    v_delivery_fee NUMERIC;
    v_discount NUMERIC;
    v_price_per_night NUMERIC;
    v_item JSONB;
    v_item_price NUMERIC;
    v_items JSONB;
    v_qty INT;
    v_rule RECORD;
BEGIN
    -- service_role (backend) and any role besides authenticated/anon are
    -- trusted contexts, exempt here - same reasoning as 0051's trigger.
    IF current_user NOT IN ('authenticated', 'anon') THEN
        RETURN NEW;
    END IF;

    IF NEW.service_type = 'ride' THEN
        IF NEW.rate_code IS NULL OR NEW.distance_meters IS NULL THEN
            RETURN NEW;
        END IF;

        SELECT price, per_km_rate INTO v_base, v_per_km
        FROM public.vehicles
        WHERE type = NEW.rate_code AND service_type = 'ride' AND is_active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid or inactive rate_code % for a ride order', NEW.rate_code;
        END IF;

        v_dist_km := NEW.distance_meters / 1000.0;
        v_extra_km := GREATEST(0, v_dist_km - 2);
        v_base := CEIL((v_base + CEIL(v_extra_km * v_per_km)) / 500.0) * 500; -- 0113: round up to Rp500

        v_discount := public.compute_promo_discount(NEW.service_type, NEW.promo_code, v_base);
        NEW.total_price := GREATEST(0, v_base - v_discount);

    ELSIF NEW.service_type = 'service' AND NEW.rate_code IS NOT NULL
          AND NEW.metadata IS NOT NULL AND jsonb_typeof(NEW.metadata -> 'items') = 'array' THEN
        -- 0090: itemised visit. Every item must belong to the order's
        -- category (rate_code); the stored items are rewritten with the
        -- server's names and prices so the technician sees what was paid for.
        v_subtotal := 0;
        v_items := '[]'::jsonb;
        FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.metadata -> 'items')
        LOOP
            v_qty := COALESCE(NULLIF(v_item ->> 'qty', '')::INT, 1);
            SELECT code, name, base_price, max_qty INTO v_rule
            FROM public.pricing_rules
            WHERE service_type = 'service' AND code = v_item ->> 'code'
              AND item_of = NEW.rate_code AND is_active = true;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Layanan % tidak tersedia untuk kategori %', v_item ->> 'code', NEW.rate_code;
            END IF;
            IF v_qty < 1 OR v_qty > COALESCE(v_rule.max_qty, 10) THEN
                RAISE EXCEPTION 'Jumlah % untuk % tidak valid', v_qty, v_rule.name;
            END IF;
            v_subtotal := v_subtotal + v_rule.base_price * v_qty;
            v_items := v_items || jsonb_build_array(jsonb_build_object(
                'code', v_rule.code, 'name', v_rule.name, 'qty', v_qty, 'price', v_rule.base_price));
        END LOOP;
        IF jsonb_array_length(v_items) = 0 THEN
            RAISE EXCEPTION 'Pilih minimal satu pekerjaan';
        END IF;
        NEW.metadata := jsonb_set(NEW.metadata, '{items}', v_items);
        v_discount := public.compute_promo_discount(NEW.service_type, NEW.promo_code, v_subtotal);
        NEW.total_price := GREATEST(0, v_subtotal - v_discount);

    ELSIF NEW.service_type = 'pool' AND NEW.rate_code = 'MONTHLY_VISIT' THEN
        -- 0090: one visit of the monthly package = a quarter of its price.
        SELECT base_price INTO v_base FROM public.pricing_rules
        WHERE service_type = 'pool' AND code = 'MONTHLY' AND is_active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Paket bulanan sedang tidak tersedia';
        END IF;
        NEW.total_price := CEIL(v_base / 4);

    ELSIF NEW.service_type IN ('send', 'service', 'pool') THEN
        IF NEW.rate_code IS NULL THEN
            RETURN NEW;
        END IF;

        SELECT base_price, per_km_rate INTO v_base, v_per_km
        FROM public.pricing_rules
        WHERE service_type = NEW.service_type AND code = NEW.rate_code AND is_active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid or inactive rate_code % for a % order', NEW.rate_code, NEW.service_type;
        END IF;

        -- per_km_rate is 0 for all send/service/pool rows today, but honor
        -- distance_meters if a future rate is ever made distance-based.
        IF NEW.distance_meters IS NOT NULL AND v_per_km > 0 THEN
            v_base := CEIL((v_base + CEIL((NEW.distance_meters / 1000.0) * v_per_km)) / 500.0) * 500; -- 0113
        END IF;

        v_discount := public.compute_promo_discount(NEW.service_type, NEW.promo_code, v_base);
        NEW.total_price := GREATEST(0, v_base - v_discount);

    ELSIF NEW.service_type = 'food' THEN
        IF NEW.metadata IS NULL OR NOT (NEW.metadata ? 'items') THEN
            RETURN NEW;
        END IF;

        v_subtotal := 0;
        FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.metadata -> 'items')
        LOOP
            SELECT price INTO v_item_price
            FROM public.products
            WHERE id = (v_item ->> 'id')::UUID;

            IF v_item_price IS NULL THEN
                RAISE EXCEPTION 'Order references a nonexistent product %', v_item ->> 'id';
            END IF;

            v_subtotal := v_subtotal + v_item_price * COALESCE((v_item ->> 'qty')::NUMERIC, 1);
        END LOOP;

        IF NEW.distance_meters IS NOT NULL THEN
            SELECT base_price, per_km_rate INTO v_base, v_per_km
            FROM public.pricing_rules
            WHERE service_type = 'food_delivery' AND code = 'default' AND is_active = true;

            IF FOUND THEN
                v_delivery_fee := CEIL((v_base + CEIL(NEW.distance_meters / 1000.0) * v_per_km) / 500.0) * 500; -- 0113
            ELSE
                v_delivery_fee := COALESCE(NEW.delivery_fee, 0);
            END IF;
        ELSE
            -- No distance given yet (pre-0059-frontend client) - trust the
            -- client's delivery_fee for this one leg only; the subtotal
            -- above is still independently verified regardless.
            v_delivery_fee := COALESCE(NEW.delivery_fee, 0);
        END IF;

        v_discount := public.compute_promo_discount(NEW.service_type, NEW.promo_code, v_subtotal);
        NEW.delivery_fee := v_delivery_fee;
        NEW.total_price := GREATEST(0, v_subtotal - v_discount + v_delivery_fee);
        NEW.promo_discount := LEAST(COALESCE(v_discount, 0), v_subtotal); -- 0109

    ELSIF NEW.service_type = 'villa' THEN
        IF NEW.nights IS NULL OR NEW.nights < 1 OR NEW.merchant_id IS NULL THEN
            RETURN NEW;
        END IF;

        SELECT price_per_night INTO v_price_per_night
        FROM public.merchants
        WHERE id = NEW.merchant_id AND service_type = 'villa';

        IF v_price_per_night IS NULL THEN
            RAISE EXCEPTION 'Villa merchant % has no price_per_night set', NEW.merchant_id;
        END IF;

        v_base := v_price_per_night * NEW.nights;
        v_discount := public.compute_promo_discount(NEW.service_type, NEW.promo_code, v_base);
        NEW.total_price := GREATEST(0, v_base - v_discount);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

