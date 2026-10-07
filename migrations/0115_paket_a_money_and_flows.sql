-- =========================================
-- 0115: money and flow fixes from the cross-portal audit (paket A)
--
-- Owner decisions 2026-10-08:
--   * Wira funds every promo (was: only cash food; elsewhere the driver
--     absorbed ~80% of it). Partner shares and commission are now computed
--     on the pre-discount price (total_price + promo_discount); on a cash
--     order Wira credits the promo back to whoever collected the cash.
--   * Villa cancellation (common rule): free until 3 days before check-in,
--     50% refund within 3 days (the other half goes to the host minus the
--     villa commission), no customer cancellation from the check-in day.
--   * Food: the customer can cancel only while the restaurant has not
--     accepted, or within 3 minutes after; then it goes through CS.
--   * Monthly pool packages can be paid in cash per visit (not only WiraPay).
-- Fixes:
--   * Villa: host can decline (merchant_reject_order, full refund);
--     completion only from the check-out date (non-admins); stays complete
--     themselves after check-out; unanswered requests expire after 24 h with
--     a refund (pg_cron).
--   * Restaurants decline any order still pending (WiraPay/QRIS refunded).
--   * A courier who drops a food order puts it back to 'ready' (it was
--     reset to 'pending', so the restaurant saw it as a new order).
--   * Partners are told when the customer cancels; restaurants and villa
--     hosts are told about every new order (also after QRIS payment);
--     online couriers are told when food is ready - all through
--     notifications rows, which 0094 pushes even with the app closed.
--   * Restaurants/villas whose owner is debt-blocked take no new orders.
--   * Ride/send/food complete only from in_trip (non-admins); nothing
--     completes from awaiting_payment; non-cash shares are credited only
--     when the order was actually paid.
-- Depends on 0088, 0089, 0095, 0101, 0104, 0109, 0113.
-- =========================================

-- ---------------------------------------------------------------------------
-- 1. Price trigger: 0113 body + promo_discount stamped on every service
-- ---------------------------------------------------------------------------
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

    -- 0115: every promo is funded by Wira; stamp it on every service.
    NEW.promo_discount := GREATEST(COALESCE(v_discount, 0), 0);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;


-- ---------------------------------------------------------------------------
-- 2. Shares on completion: Wira-funded promos, paid-only non-cash shares
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_payout_on_order_completed()
RETURNS TRIGGER AS $$
DECLARE
    v_commission_rate NUMERIC := COALESCE(NEW.commission_rate, public.platform_commission_rate(NEW.service_type));
    v_delivery_fee NUMERIC := COALESCE(NEW.delivery_fee, 0);
    v_discount NUMERIC := GREATEST(COALESCE(NEW.promo_discount, 0), 0);
    v_gross NUMERIC := COALESCE(NEW.total_price, 0) + GREATEST(COALESCE(NEW.promo_discount, 0), 0);
    v_material NUMERIC := LEAST(GREATEST(COALESCE(NEW.material_amount, 0), 0), COALESCE(NEW.total_price, 0));
    v_is_cash BOOLEAN := NEW.payment_method = 'cash';
    v_subtotal NUMERIC;
    v_merchant_owner UUID;
    v_merchant_share NUMERIC;
    v_driver_share NUMERIC;
    v_collector UUID;
BEGIN
    IF NEW.status IS DISTINCT FROM 'completed' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
        RETURN NEW;
    END IF;
    -- Money Wira never received is never paid out.
    IF NOT v_is_cash AND NEW.payment_status IS DISTINCT FROM 'paid' THEN
        RETURN NEW;
    END IF;

    IF NEW.merchant_id IS NOT NULL THEN
        SELECT owner_id INTO v_merchant_owner FROM public.merchants WHERE id = NEW.merchant_id;
    END IF;

    -- 0109 model A: cash food with a courier.
    IF v_is_cash AND NEW.service_type = 'food' AND NEW.driver_id IS NOT NULL AND v_merchant_owner IS NOT NULL THEN
        v_subtotal := GREATEST(COALESCE(NEW.total_price, 0) - v_delivery_fee, 0) + v_discount;
        UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) - ROUND(v_subtotal * v_commission_rate)
        WHERE id = v_merchant_owner;
        UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) + v_discount - ROUND(v_delivery_fee * v_commission_rate)
        WHERE id = NEW.driver_id;
        RETURN NEW;
    END IF;

    IF v_merchant_owner IS NOT NULL THEN
        v_merchant_share := GREATEST(v_gross - v_delivery_fee, 0) * (1 - v_commission_rate);
        IF v_merchant_share > 0 THEN
            UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) + v_merchant_share WHERE id = v_merchant_owner;
        END IF;
    END IF;

    IF NEW.driver_id IS NOT NULL THEN
        IF NEW.merchant_id IS NOT NULL THEN
            v_driver_share := v_delivery_fee * (1 - v_commission_rate);
        ELSE
            v_driver_share := (v_gross - v_material) * (1 - v_commission_rate) + v_material;
        END IF;
        IF v_driver_share > 0 THEN
            UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) + v_driver_share WHERE id = NEW.driver_id;
        END IF;
    END IF;

    -- Cash: the collector already holds total_price; take it back. What is
    -- left is the promo Wira owes them minus the commission.
    IF v_is_cash AND COALESCE(NEW.total_price, 0) > 0 THEN
        v_collector := COALESCE(NEW.driver_id, v_merchant_owner);
        IF v_collector IS NOT NULL THEN
            UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) - NEW.total_price WHERE id = v_collector;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 3. Notifications helper (partner-facing link paths of Wira Mitra)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_user(p_user UUID, p_title TEXT, p_desc TEXT, p_link TEXT)
RETURNS VOID AS $$
    INSERT INTO public.notifications (user_id, title, description, is_read, link)
    SELECT p_user, p_title, p_desc, false, p_link WHERE p_user IS NOT NULL;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.notify_user(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Cancellation: villa policy, food rule, partner told, food requeue
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.villa_cancel_refund_ratio(p_check_in DATE)
RETURNS NUMERIC AS $$
    SELECT CASE
        WHEN p_check_in IS NULL THEN 1
        WHEN p_check_in - (NOW() AT TIME ZONE 'Asia/Makassar')::date >= 3 THEN 1
        WHEN p_check_in - (NOW() AT TIME ZONE 'Asia/Makassar')::date >= 1 THEN 0.5
        ELSE 0 END;
$$ LANGUAGE sql STABLE;

-- Refunds p_ratio of a paid WiraPay/QRIS order; the kept part goes to the
-- villa host minus the commission. Returns the refunded amount.
CREATE OR REPLACE FUNCTION public.refund_villa_partially(p_order_id UUID, p_ratio NUMERIC, p_description TEXT)
RETURNS NUMERIC AS $$
DECLARE
    v RECORD;
    v_refund NUMERIC;
    v_kept NUMERIC;
    v_owner UUID;
BEGIN
    SELECT id, user_id, total_price, payment_method, payment_status, merchant_id, service_type
    INTO v FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND OR v.payment_status IS DISTINCT FROM 'paid' OR COALESCE(v.total_price, 0) <= 0 THEN
        RETURN 0;
    END IF;
    v_refund := ROUND(v.total_price * LEAST(GREATEST(p_ratio, 0), 1));
    v_kept := v.total_price - v_refund;
    IF v_refund > 0 THEN
        UPDATE public.users SET wallet_balance = wallet_balance + v_refund WHERE id = v.user_id;
        INSERT INTO public.transactions (user_id, type, amount, status, description, created_at, reference_id)
        VALUES (v.user_id, 'refund', v_refund, 'success', p_description, NOW(), p_order_id::text);
    END IF;
    IF v_kept > 0 THEN
        SELECT owner_id INTO v_owner FROM public.merchants WHERE id = v.merchant_id;
        UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0)
            + ROUND(v_kept * (1 - public.platform_commission_rate(v.service_type)))
        WHERE id = v_owner;
    END IF;
    UPDATE public.orders SET payment_status = 'refunded' WHERE id = p_order_id;
    RETURN v_refund;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.refund_villa_partially(UUID, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION wallet_refund_matched_ride(p_order_id UUID, p_description TEXT DEFAULT 'Refund Pembatalan Perjalanan')
RETURNS BOOLEAN AS $$
DECLARE
    v_order RECORD;
    v_caller UUID := auth.uid();
    v_is_driver BOOLEAN;
    v_is_visit BOOLEAN;
    v_since INTERVAL;
    v_owner UUID;
    v_ratio NUMERIC;
    v_refund NUMERIC := 0;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Anda harus login untuk membatalkan perjalanan';
    END IF;

    SELECT id, user_id, driver_id, merchant_id, status, accepted_at, service_type, scheduled_at, check_in, title
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;

    IF v_order.merchant_id IS NOT NULL THEN
        SELECT owner_id INTO v_owner FROM public.merchants WHERE id = v_order.merchant_id;
    END IF;
    v_is_driver := (v_order.driver_id IS NOT NULL AND v_order.driver_id = v_caller);
    v_is_visit := v_order.service_type IN ('service', 'pool');

    IF v_order.user_id IS DISTINCT FROM v_caller AND NOT v_is_driver THEN
        RAISE EXCEPTION 'Anda tidak berhak membatalkan pesanan ini';
    END IF;

    -- 0115: villa (customer only; hosts use merchant_reject_order).
    IF v_order.service_type IN ('villa', 'WiraVilla') THEN
        IF v_order.status NOT IN ('pending', 'accepted') THEN
            RAISE EXCEPTION 'Pesanan ini sudah tidak bisa dibatalkan (status saat ini: %)', v_order.status;
        END IF;
        v_ratio := CASE WHEN v_order.status = 'pending' THEN 1 ELSE public.villa_cancel_refund_ratio(v_order.check_in) END;
        IF v_ratio <= 0 THEN
            RAISE EXCEPTION 'Sudah masuk hari check-in, pesanan tidak bisa dibatalkan lagi. Hubungi CS jika ada masalah.';
        END IF;
        IF v_ratio >= 1 THEN
            v_refund := public.refund_order_to_wallet(p_order_id, p_description);
        ELSE
            v_refund := public.refund_villa_partially(p_order_id, v_ratio, p_description || ' (50%, kurang dari 3 hari sebelum check-in)');
        END IF;
        UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
        PERFORM public.notify_user(v_owner, 'Reservasi dibatalkan tamu',
            COALESCE(v_order.title, 'Reservasi') || CASE WHEN v_ratio < 1 THEN ' dibatalkan kurang dari 3 hari sebelum check-in. 50% tetap untuk Anda (dikurangi komisi).' ELSE ' dibatalkan tamu.' END,
            '/merchant/orders');
        RETURN TRUE;
    END IF;

    IF v_is_visit THEN
        IF v_order.status = 'working' THEN
            RAISE EXCEPTION 'Pekerjaan sudah dimulai, tidak bisa dibatalkan lagi. Hubungi CS jika ada masalah.';
        ELSIF v_order.status NOT IN ('pending', 'accepted', 'on_the_way') THEN
            RAISE EXCEPTION 'Pesanan ini sudah tidak bisa dibatalkan (status saat ini: %)', v_order.status;
        END IF;
        IF NOT v_is_driver AND v_order.status IN ('accepted', 'on_the_way') THEN
            IF NOT (
                (v_order.accepted_at IS NOT NULL AND NOW() - v_order.accepted_at <= INTERVAL '3 minutes')
                OR v_order.scheduled_at IS NULL
                OR NOW() < v_order.scheduled_at - INTERVAL '2 hours'
                OR NOW() > v_order.scheduled_at + INTERVAL '1 hour'
            ) THEN
                RAISE EXCEPTION 'Teknisi sudah dijadwalkan datang kurang dari 2 jam lagi. Pembatalan gratis tersedia lagi jika teknisi terlambat lebih dari 1 jam, atau hubungi CS.';
            END IF;
        END IF;
    ELSIF v_order.service_type = 'food' AND NOT v_is_driver THEN
        -- 0115: once the restaurant is cooking, only CS can cancel.
        IF NOT (v_order.status = 'pending'
                OR (v_order.status = 'accepted' AND v_order.accepted_at IS NOT NULL AND NOW() - v_order.accepted_at <= INTERVAL '3 minutes')) THEN
            RAISE EXCEPTION 'Restoran sudah menyiapkan pesanan Anda, jadi pesanan tidak bisa dibatalkan dari aplikasi. Hubungi CS lewat Pusat Bantuan.';
        END IF;
    ELSE
        IF v_order.status = 'in_trip' THEN
            RAISE EXCEPTION 'Perjalanan sudah dimulai (penumpang sudah dijemput), tidak bisa dibatalkan lagi. Hubungi CS jika ada masalah.';
        ELSIF v_order.status NOT IN ('pending', 'accepted', 'picking_up', 'ready') THEN
            RAISE EXCEPTION 'Pesanan ini sudah tidak bisa dibatalkan (status saat ini: %)', v_order.status;
        END IF;
        IF NOT v_is_driver AND v_order.status IN ('accepted', 'picking_up') AND v_order.accepted_at IS NOT NULL THEN
            v_since := NOW() - v_order.accepted_at;
            IF v_since > INTERVAL '3 minutes' AND v_since < INTERVAL '20 minutes' THEN
                RAISE EXCEPTION 'Mitra sedang menuju lokasi Anda. Pembatalan gratis tersedia lagi jika Anda belum dijemput 20 menit setelah pesanan diterima.';
            END IF;
        END IF;
    END IF;

    IF v_is_driver THEN
        -- A food courier hands the order back to the ready queue; anything
        -- else goes back to searching. A chosen technician loses their head start.
        UPDATE public.orders
        SET status = CASE WHEN v_order.service_type = 'food' THEN 'ready' ELSE 'pending' END,
            driver_id = NULL,
            accepted_at = CASE WHEN v_order.service_type = 'food' THEN accepted_at ELSE NULL END,
            preferred_partner_id = CASE WHEN preferred_partner_id = v_caller THEN NULL
                                        ELSE preferred_partner_id END
        WHERE id = p_order_id;
        RETURN TRUE;
    END IF;

    PERFORM public.refund_order_to_wallet(p_order_id, p_description);
    UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
    -- 0115: the partner hears it (driver/technician and/or restaurant).
    PERFORM public.notify_user(v_order.driver_id, 'Pesanan dibatalkan pelanggan',
        COALESCE(v_order.title, 'Pesanan') || ' dibatalkan oleh pelanggan.', NULL);
    IF v_order.status <> 'ready' THEN
        PERFORM public.notify_user(v_owner, 'Pesanan dibatalkan pelanggan',
            COALESCE(v_order.title, 'Pesanan') || ' dibatalkan oleh pelanggan. Hentikan persiapannya.', '/merchant/orders');
    END IF;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 5. Restaurants and villa hosts decline (any payment method)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merchant_reject_order(p_order_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v RECORD;
    v_refund NUMERIC;
    v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
    SELECT o.id, o.user_id, o.status, o.service_type, o.check_in, o.title, m.owner_id
    INTO v FROM public.orders o JOIN public.merchants m ON m.id = o.merchant_id
    WHERE o.id = p_order_id FOR UPDATE OF o;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;
    IF v.owner_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin_panel() THEN
        RAISE EXCEPTION 'Anda tidak berhak menolak pesanan ini' USING ERRCODE = '42501';
    END IF;
    IF NOT (v.status = 'pending'
            OR (v.service_type IN ('villa', 'WiraVilla') AND v.status = 'accepted'
                AND (v.check_in IS NULL OR v.check_in > (NOW() AT TIME ZONE 'Asia/Makassar')::date))) THEN
        RAISE EXCEPTION 'Pesanan ini sudah tidak bisa ditolak (status saat ini: %)', v.status;
    END IF;

    v_refund := public.refund_order_to_wallet(p_order_id, 'Refund: pesanan ditolak mitra');
    UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
    PERFORM public.notify_user(v.user_id,
        CASE WHEN v.service_type IN ('villa', 'WiraVilla') THEN 'Reservasi tidak bisa diterima' ELSE 'Pesanan ditolak restoran' END,
        COALESCE(v.title, 'Pesanan Anda') || ' tidak bisa dilayani'
        || CASE WHEN v_reason IS NOT NULL THEN ': ' || v_reason ELSE '' END || '. '
        || CASE WHEN v_refund > 0 THEN 'Saldo WiraPay ' || public.format_rupiah(v_refund) || ' sudah dikembalikan.' ELSE 'Silakan pesan di tempat lain.' END,
        '/active-order/' || p_order_id);
    RETURN jsonb_build_object('cancelled', true, 'refunded', v_refund);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.merchant_reject_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_reject_order(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Completion guards
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_completion_rules()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
        -- Nobody completes an order that was never paid.
        IF OLD.status = 'awaiting_payment' THEN
            RAISE EXCEPTION 'Pesanan ini belum dibayar, jadi belum bisa diselesaikan.';
        END IF;
        IF current_user IN ('authenticated', 'anon') AND NOT public.is_admin_panel() THEN
            IF NEW.service_type IN ('ride', 'send', 'food') AND OLD.status IS DISTINCT FROM 'in_trip' THEN
                RAISE EXCEPTION 'Mulai perjalanan dengan PIN dulu sebelum menyelesaikan pesanan.';
            END IF;
            IF NEW.service_type IN ('villa', 'WiraVilla') AND NEW.check_out IS NOT NULL
               AND (NOW() AT TIME ZONE 'Asia/Makassar')::date < NEW.check_out THEN
                RAISE EXCEPTION 'Reservasi baru bisa diselesaikan mulai tanggal check-out (%).', to_char(NEW.check_out, 'DD/MM/YYYY');
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public; -- invoker: current_user is the caller's role
DROP TRIGGER IF EXISTS trg_enforce_completion_rules ON public.orders;
CREATE TRIGGER trg_enforce_completion_rules BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.enforce_completion_rules();

-- ---------------------------------------------------------------------------
-- 7. Villa housekeeping (pg_cron): stays complete after check-out,
--    unanswered requests expire after 24 hours (or at check-in) with a refund
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.villa_housekeeping()
RETURNS INT AS $$
DECLARE
    r RECORD;
    v_refund NUMERIC;
    n INT := 0;
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Makassar')::date;
BEGIN
    UPDATE public.orders SET status = 'completed'
    WHERE service_type IN ('villa', 'WiraVilla') AND status = 'accepted'
      AND check_out IS NOT NULL AND check_out <= v_today;
    GET DIAGNOSTICS n = ROW_COUNT;

    FOR r IN SELECT o.id, o.user_id, o.title, m.owner_id FROM public.orders o
             LEFT JOIN public.merchants m ON m.id = o.merchant_id
             WHERE o.service_type IN ('villa', 'WiraVilla') AND o.status = 'pending'
               AND (o.status_changed_at < NOW() - INTERVAL '24 hours' OR (o.check_in IS NOT NULL AND o.check_in <= v_today))
             FOR UPDATE OF o SKIP LOCKED
    LOOP
        v_refund := public.refund_order_to_wallet(r.id, 'Refund: reservasi tidak dikonfirmasi pemilik');
        UPDATE public.orders SET status = 'cancelled' WHERE id = r.id AND status = 'pending';
        PERFORM public.notify_user(r.user_id, 'Reservasi tidak dikonfirmasi',
            COALESCE(r.title, 'Reservasi Anda') || ' belum dikonfirmasi pemilik dalam 24 jam, jadi kami batalkan. '
            || CASE WHEN v_refund > 0 THEN 'Saldo WiraPay ' || public.format_rupiah(v_refund) || ' sudah dikembalikan.' ELSE '' END,
            '/active-order/' || r.id);
        PERFORM public.notify_user(r.owner_id, 'Reservasi kedaluwarsa',
            COALESCE(r.title, 'Reservasi') || ' dibatalkan otomatis karena tidak dikonfirmasi dalam 24 jam.', '/merchant/orders');
        n := n + 1;
    END LOOP;
    RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.villa_housekeeping() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule('wira-villa-housekeeping', '15 * * * *', 'SELECT public.villa_housekeeping()');
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 8. No new orders for a debt-blocked restaurant or villa host
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_villa_booking()
RETURNS TRIGGER AS $$
DECLARE
    v_owner UUID;
BEGIN
    IF NEW.merchant_id IS NOT NULL AND NEW.service_type IN ('villa', 'WiraVilla', 'food', 'WiraFood') THEN
        SELECT m.owner_id INTO v_owner FROM public.merchants m
        WHERE m.id = NEW.merchant_id AND m.listing_status = 'approved'
          AND (NEW.service_type NOT IN ('villa', 'WiraVilla') OR COALESCE(m.is_open, true));
        IF NOT FOUND OR (v_owner IS NOT NULL AND public.commission_debt_block(v_owner) IS NOT NULL) THEN
            RAISE EXCEPTION 'Tempat ini sedang tidak menerima pesanan';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 9. Tell partners: new restaurant/villa order, food ready for couriers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_partners_on_order()
RETURNS TRIGGER AS $$
DECLARE
    v_owner UUID;
    v_villa BOOLEAN := NEW.service_type IN ('villa', 'WiraVilla');
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NULL;
    END IF;

    IF NEW.status = 'pending' AND NEW.merchant_id IS NOT NULL THEN
        SELECT owner_id INTO v_owner FROM public.merchants WHERE id = NEW.merchant_id;
        PERFORM public.notify_user(v_owner,
            CASE WHEN v_villa THEN 'Reservasi baru' ELSE 'Pesanan baru masuk' END,
            COALESCE(NEW.title, 'Pesanan baru') || ' · ' || public.format_rupiah(NEW.total_price)
            || CASE WHEN v_villa THEN '. Konfirmasi dalam 24 jam.' ELSE '. Terima sebelum 30 menit.' END,
            '/merchant/orders');
    ELSIF NEW.status = 'ready' AND NEW.driver_id IS NULL AND NEW.service_type IN ('food', 'WiraFood') THEN
        INSERT INTO public.notifications (user_id, title, description, is_read, link)
        SELECT d.id, 'Makanan siap diantar',
               COALESCE(NEW.title, 'Pesanan WiraFood') || ' menunggu kurir. Ongkir ' || public.format_rupiah(NEW.delivery_fee) || '.',
               false, '/driver'
        FROM public.drivers d JOIN public.users u ON u.id = d.id
        WHERE d.is_online = true
          AND COALESCE(u.mitra_access, '[]'::jsonb) ? 'driver'
          AND COALESCE(u.status, 'Aktif') <> 'Diblokir'
          AND (u.job_type_preferences IS NULL OR jsonb_array_length(u.job_type_preferences) = 0 OR u.job_type_preferences ? 'food')
          AND COALESCE(u.vehicle_type, 'motor') = 'motor'
        LIMIT 30;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_notify_partners_on_order ON public.orders;
CREATE TRIGGER trg_notify_partners_on_order AFTER INSERT OR UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.notify_partners_on_order();

-- ---------------------------------------------------------------------------
-- 10. Monthly pool package: WiraPay up front, or cash paid per visit
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_pool_package(TIMESTAMPTZ, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN);
CREATE OR REPLACE FUNCTION public.create_pool_package(
    p_first_visit TIMESTAMPTZ, p_title TEXT, p_details TEXT,
    p_pickup_lat DOUBLE PRECISION DEFAULT NULL, p_pickup_lng DOUBLE PRECISION DEFAULT NULL,
    p_auto_renew BOOLEAN DEFAULT false, p_payment_method TEXT DEFAULT 'wallet'
)
RETURNS UUID AS $$
DECLARE
    v_package UUID := gen_random_uuid();
    v_cash BOOLEAN := COALESCE(p_payment_method, 'wallet') = 'cash';
    i INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Anda harus login';
    END IF;
    FOR i IN 0..3 LOOP
        IF v_cash THEN
            INSERT INTO public.orders (user_id, service_type, status, payment_method, payment_status, title, details,
                                       pickup_lat, pickup_lng, metadata, rate_code)
            VALUES (auth.uid(), 'pool', 'pending', 'cash', 'unpaid',
                    COALESCE(p_title, 'Paket Kolam Bulanan') || ' (' || (i + 1) || '/4)', p_details,
                    p_pickup_lat, p_pickup_lng,
                    jsonb_build_object('scheduled_at', p_first_visit + make_interval(days => 7 * i),
                                       'package_id', v_package, 'package_visit', i + 1, 'package_size', 4),
                    'MONTHLY_VISIT');
        ELSE
            PERFORM public.create_order_and_pay(
                p_service_type => 'pool',
                p_title => COALESCE(p_title, 'Paket Kolam Bulanan') || ' (' || (i + 1) || '/4)',
                p_details => p_details,
                p_pickup_lat => p_pickup_lat,
                p_pickup_lng => p_pickup_lng,
                p_metadata => jsonb_build_object(
                    'scheduled_at', p_first_visit + make_interval(days => 7 * i),
                    'package_id', v_package, 'package_visit', i + 1, 'package_size', 4),
                p_rate_code => 'MONTHLY_VISIT',
                p_payment_description => 'WiraPool - Paket Bulanan (' || (i + 1) || '/4)'
            );
        END IF;
    END LOOP;
    -- Auto-renew charges WiraPay, so it is offered only for WiraPay packages.
    IF COALESCE(p_auto_renew, false) AND NOT v_cash THEN
        PERFORM public.start_pool_subscription(v_package, p_first_visit + INTERVAL '28 days',
                                               COALESCE(p_title, 'Paket Kolam Bulanan'), p_details, p_pickup_lat, p_pickup_lng);
    END IF;
    RETURN v_package;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;
REVOKE ALL ON FUNCTION public.create_pool_package(TIMESTAMPTZ, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pool_package(TIMESTAMPTZ, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN, TEXT) TO authenticated;

-- Verify:
--   SELECT jobname FROM cron.job WHERE jobname = 'wira-villa-housekeeping';
--   SELECT public.villa_cancel_refund_ratio(CURRENT_DATE + 5), public.villa_cancel_refund_ratio(CURRENT_DATE + 1);  -- 1, 0.5
