-- Migration 0090: technician price menu, extra charges, check fee and the
-- monthly pool package (technician rebuild phase 1b).
--
-- Owner's decisions (2026-10-01): prices follow Bali market rates (the
-- customer pays the market price, the technician keeps 80% of the work and
-- 100% of materials); the monthly pool package becomes four weekly visits.
--
--   * pricing_rules gets item rows: what exactly is done, priced per unit
--     (item_of = the category's rate_code: AC, Listrik, Plumbing, Tukang).
--     A service order may carry metadata.items = [{code, qty}]; the price
--     trigger (0059 body, extended) prices them server-side and rewrites the
--     items with the real names and prices. Category rows now hold the
--     cheapest item price ("mulai dari").
--   * order_adjustments: the technician asks for an extra charge on site
--     (materials or extra work) with a reason; the customer approves or
--     rejects it in the app. Approved: WiraPay/QRIS orders are debited from
--     the customer's balance, cash orders are paid in hand; the order total
--     grows, materials are tracked in orders.material_amount and carry no
--     commission (credit_payout_on_order_completed, 0075 body extended).
--   * finish_visit_as_check: the customer declines the work after the
--     technician came and checked; with the customer's PIN the visit is
--     finished at the check fee (pricing_rules CHECK_FEE) and anything paid
--     above it goes back to the customer's WiraPay balance.
--   * create_pool_package: four weekly visits (rate MONTHLY_VISIT = a
--     quarter of MONTHLY) with one package_id, paid together with WiraPay;
--     take_package_visits lets a technician take all open visits at once.
--
-- Depends on 0059, 0070, 0075, 0088, 0089. Re-runnable.

-- ---------------------------------------------------------------------------
-- 1. Price menu
-- ---------------------------------------------------------------------------
ALTER TABLE public.pricing_rules ADD COLUMN IF NOT EXISTS item_of TEXT;
ALTER TABLE public.pricing_rules ADD COLUMN IF NOT EXISTS unit_label TEXT;
ALTER TABLE public.pricing_rules ADD COLUMN IF NOT EXISTS max_qty INT NOT NULL DEFAULT 10;
ALTER TABLE public.pricing_rules ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 100;
ALTER TABLE public.pricing_rules ADD COLUMN IF NOT EXISTS description TEXT;

INSERT INTO public.pricing_rules (service_type, code, name, base_price, item_of, unit_label, max_qty, sort_order, description) VALUES
    ('service', 'AC_CUCI_1PK', 'Cuci AC 0,5–1 PK', 75000, 'AC', 'unit', 10, 10, 'Cuci indoor dan outdoor, cek tekanan freon'),
    ('service', 'AC_CUCI_2PK', 'Cuci AC 1,5–2 PK', 85000, 'AC', 'unit', 10, 20, 'Cuci indoor dan outdoor, cek tekanan freon'),
    ('service', 'AC_CUCI_INV', 'Cuci AC Inverter', 125000, 'AC', 'unit', 10, 30, 'Untuk AC inverter 0,5–2 PK'),
    ('service', 'AC_OVERHAUL', 'Cuci Besar AC (Overhaul)', 375000, 'AC', 'unit', 5, 40, 'Indoor dibongkar dan dicuci menyeluruh'),
    ('service', 'AC_FREON', 'Tambah Freon', 200000, 'AC', 'unit', 10, 50, 'Tambah freon R32/R410 sampai tekanan normal'),
    ('service', 'AC_BONGKAR', 'Bongkar Pasang AC', 350000, 'AC', 'unit', 5, 60, 'Pindah unit; pipa dan kabel tambahan dihitung terpisah'),
    ('service', 'LISTRIK_TITIK', 'Pasang / Ganti Titik Listrik', 100000, 'Listrik', 'titik', 20, 10, 'Lampu, saklar atau stop kontak; jasa saja'),
    ('service', 'LISTRIK_PERBAIKAN', 'Perbaikan Listrik Ringan', 100000, 'Listrik', 'kunjungan', 3, 20, 'Korsleting, MCB turun, saklar atau stop kontak rusak'),
    ('service', 'PIPA_BOCOR', 'Perbaikan Pipa Bocor', 200000, 'Plumbing', 'titik', 5, 10, 'Pipa, kran atau sambungan bocor'),
    ('service', 'POMPA_RINGAN', 'Servis Pompa Air Ringan', 180000, 'Plumbing', 'unit', 3, 20, 'Pompa tidak menyedot atau tekanan lemah'),
    ('service', 'POMPA_BESAR', 'Servis Besar Pompa Air', 450000, 'Plumbing', 'unit', 3, 30, 'Pompa dibongkar, ganti seal atau bearing'),
    ('service', 'TOREN_KURAS', 'Kuras Toren Air', 400000, 'Plumbing', 'unit', 3, 40, 'Toren dikuras dan disikat'),
    ('service', 'TUKANG_SETENGAH', 'Tukang Setengah Hari', 100000, 'Tukang', 'orang', 5, 10, 'Sekitar 4 jam kerja; bahan dihitung terpisah'),
    ('service', 'TUKANG_HARIAN', 'Tukang Sehari Penuh', 175000, 'Tukang', 'orang', 5, 20, 'Sekitar 8 jam kerja; bahan dihitung terpisah'),
    ('service', 'CHECK_FEE', 'Biaya Cek di Lokasi', 50000, NULL, 'kunjungan', 1, 900, 'Dibayar bila pekerjaan batal setelah teknisi datang dan mengecek')
ON CONFLICT (service_type, code) DO NOTHING;

-- Category rows show "mulai dari": the cheapest item.
UPDATE public.pricing_rules SET base_price = 75000 WHERE service_type = 'service' AND code = 'AC';
UPDATE public.pricing_rules SET base_price = 100000 WHERE service_type = 'service' AND code = 'Listrik';
UPDATE public.pricing_rules SET base_price = 180000 WHERE service_type = 'service' AND code = 'Plumbing';
UPDATE public.pricing_rules SET base_price = 100000 WHERE service_type = 'service' AND code = 'Tukang';
UPDATE public.pricing_rules SET base_price = 150000 WHERE service_type = 'pool' AND code = 'S1';
UPDATE public.pricing_rules SET name = 'Perawatan Air & Klorinasi' WHERE service_type = 'pool' AND code = 'S2';
UPDATE public.pricing_rules SET name = 'Servis Pompa & Filter Kolam' WHERE service_type = 'pool' AND code = 'S3';
UPDATE public.pricing_rules SET name = 'Paket Bulanan (4 kunjungan)' WHERE service_type = 'pool' AND code = 'MONTHLY';
-- A package visit row so the rate is valid; its price follows MONTHLY / 4.
INSERT INTO public.pricing_rules (service_type, code, name, base_price, unit_label, sort_order, description)
VALUES ('pool', 'MONTHLY_VISIT', 'Kunjungan Paket Bulanan', 125000, 'kunjungan', 900,
        'Harga dihitung otomatis: seperempat Paket Bulanan')
ON CONFLICT (service_type, code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Order columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS material_amount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS package_id UUID;
CREATE INDEX IF NOT EXISTS orders_package_idx ON public.orders (package_id) WHERE package_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Price trigger (0059 body; itemised service orders and package visits)
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
        v_base := v_base + CEIL(v_extra_km * v_per_km);

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
            v_base := v_base + CEIL((NEW.distance_meters / 1000.0) * v_per_km);
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
                v_delivery_fee := v_base + CEIL(NEW.distance_meters / 1000.0) * v_per_km;
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



-- ---------------------------------------------------------------------------
-- 4. Booking fields (0089 body; package_id, server-owned material_amount)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_order_booking_fields()
RETURNS TRIGGER AS $$
DECLARE
    v_at TIMESTAMPTZ;
    v_pref UUID;
    m TEXT[];
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF current_user IN ('authenticated', 'anon') AND NOT is_admin() AND (
            NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
            OR NEW.preferred_partner_id IS DISTINCT FROM OLD.preferred_partner_id
            OR NEW.package_id IS DISTINCT FROM OLD.package_id
        ) THEN
            RAISE EXCEPTION 'Jadwal dan teknisi pilihan tidak bisa diubah setelah pesanan dibuat';
        END IF;
        RETURN NEW;
    END IF;

    -- Server-owned on insert: materials start at zero (0090).
    IF current_user IN ('authenticated', 'anon') THEN
        NEW.material_amount := 0;
    END IF;

    IF NEW.service_type NOT IN ('service', 'pool') THEN
        NEW.scheduled_at := NULL;
        NEW.preferred_partner_id := NULL;
        NEW.package_id := NULL;
        RETURN NEW;
    END IF;

    -- Visits of one monthly pool package share a package_id (0090).
    BEGIN
        NEW.package_id := CASE WHEN NEW.service_type = 'pool' AND NEW.rate_code = 'MONTHLY_VISIT'
                               THEN (NEW.metadata ->> 'package_id')::UUID END;
    EXCEPTION WHEN others THEN
        NEW.package_id := NULL;
    END;

    BEGIN
        v_at := (NEW.metadata ->> 'scheduled_at')::TIMESTAMPTZ;
    EXCEPTION WHEN others THEN
        v_at := NULL;
    END;
    IF v_at IS NULL THEN
        m := regexp_match(COALESCE(NEW.details, ''), 'Jadwal: (\d{4}-\d{2}-\d{2}) pukul (\d{1,2})[:.](\d{2})');
        IF m IS NOT NULL THEN
            v_at := (m[1] || ' ' || m[2] || ':' || m[3])::TIMESTAMP AT TIME ZONE 'Asia/Makassar';
        ELSE
            m := regexp_match(COALESCE(NEW.details, ''), 'Kunjungan: (\d{4}-\d{2}-\d{2})');
            IF m IS NOT NULL THEN
                v_at := (m[1] || ' 08:00')::TIMESTAMP AT TIME ZONE 'Asia/Makassar';
            END IF;
        END IF;
    END IF;
    IF v_at IS NOT NULL AND (v_at < NOW() - INTERVAL '1 hour' OR v_at > NOW() + INTERVAL '90 days') THEN
        RAISE EXCEPTION 'Jadwal kunjungan harus antara sekarang dan 90 hari ke depan';
    END IF;
    NEW.scheduled_at := v_at;

    BEGIN
        v_pref := (NEW.metadata ->> 'preferred_partner_id')::UUID;
    EXCEPTION WHEN others THEN
        v_pref := NULL;
    END;
    IF v_pref IS NOT NULL AND (
        v_pref = NEW.user_id OR NOT public.technician_can_take(v_pref, NEW.service_type, NEW.rate_code)
    ) THEN
        v_pref := NULL;
    END IF;
    NEW.preferred_partner_id := v_pref;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
DROP TRIGGER IF EXISTS trg_set_order_booking_fields ON public.orders;
CREATE TRIGGER trg_set_order_booking_fields BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_order_booking_fields();

-- ---------------------------------------------------------------------------
-- 5. State machine (0089 body; price changes from 0090's functions,
--    material_amount and package_id frozen for clients)
-- ---------------------------------------------------------------------------
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
            IF NEW.payment_status IS DISTINCT FROM 'unpaid' THEN
                RAISE EXCEPTION 'New orders must be created with payment_status = unpaid (got %). WiraPay orders are paid via create_order_and_pay().', NEW.payment_status;
            END IF;
            IF NEW.payment_method = 'wallet'
               AND current_setting('wira.wallet_checkout', true) IS DISTINCT FROM 'on' THEN
                RAISE EXCEPTION 'WiraPay orders must be created via create_order_and_pay()';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- TG_OP = 'UPDATE' from here on.

    IF OLD.status IN ('cancelled', 'completed') AND NOT is_admin() THEN
        RAISE EXCEPTION 'Order is already finalized (%) and cannot be modified', OLD.status;
    END IF;

    -- 0090: approved extra charges and the check-only finish change the
    -- price inside their own functions (wira.price_adjustment, which
    -- PostgREST clients cannot set).
    IF NEW.total_price IS DISTINCT FROM OLD.total_price AND NOT is_admin()
       AND current_setting('wira.price_adjustment', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'total_price cannot be changed after an order is created (except by an admin)';
    END IF;

    IF current_user IN ('authenticated', 'anon') AND NOT is_admin() THEN
        IF NEW.user_id IS DISTINCT FROM OLD.user_id
           OR NEW.merchant_id IS DISTINCT FROM OLD.merchant_id
           OR NEW.service_type IS DISTINCT FROM OLD.service_type
           OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
           OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
           OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
           OR NEW.promo_code IS DISTINCT FROM OLD.promo_code
           OR NEW.rate_code IS DISTINCT FROM OLD.rate_code
           OR NEW.distance_meters IS DISTINCT FROM OLD.distance_meters
           OR NEW.nights IS DISTINCT FROM OLD.nights
           OR NEW.metadata IS DISTINCT FROM OLD.metadata
           OR NEW.pickup_lat IS DISTINCT FROM OLD.pickup_lat
           OR NEW.pickup_lng IS DISTINCT FROM OLD.pickup_lng
           OR NEW.dropoff_lat IS DISTINCT FROM OLD.dropoff_lat
           OR NEW.dropoff_lng IS DISTINCT FROM OLD.dropoff_lng
           OR NEW.material_amount IS DISTINCT FROM OLD.material_amount
           OR NEW.package_id IS DISTINCT FROM OLD.package_id
        THEN
            RAISE EXCEPTION 'Only status and driver assignment can be changed on an existing order';
        END IF;
    END IF;

    -- claiming an unassigned order
    IF OLD.driver_id IS NULL AND NEW.driver_id IS NOT NULL AND NOT is_admin() THEN
        IF NEW.driver_id != auth.uid() THEN
            RAISE EXCEPTION 'You can only assign an order to yourself';
        END IF;
        IF NEW.driver_id = OLD.user_id THEN
            RAISE EXCEPTION 'You cannot claim your own order as its driver';
        END IF;
        IF OLD.service_type IN ('service', 'pool') THEN
            IF NOT public.technician_can_take(NEW.driver_id, OLD.service_type, OLD.rate_code) THEN
                RAISE EXCEPTION 'Pekerjaan ini membutuhkan teknisi aktif dengan keahlian yang sesuai';
            END IF;
            IF OLD.preferred_partner_id IS NOT NULL AND OLD.preferred_partner_id <> NEW.driver_id
               AND OLD.status_changed_at >= NOW() - public.preferred_partner_window() THEN
                RAISE EXCEPTION 'Pekerjaan ini sedang ditawarkan ke teknisi pilihan pelanggan';
            END IF;
        ELSIF NOT public.is_active_partner(NEW.driver_id, 'driver') THEN
            RAISE EXCEPTION 'Only an active driver account can claim this order';
        END IF;
    END IF;

    -- Technician visits: work starts only with the customer's PIN
    -- (start_order_with_pin runs as its owner, not as a client role), and
    -- can only be finished after it started.
    IF OLD.service_type IN ('service', 'pool')
       AND current_user IN ('authenticated', 'anon') AND NOT is_admin() THEN
        IF NEW.status = 'working' AND OLD.status IS DISTINCT FROM 'working' THEN
            RAISE EXCEPTION 'Masukkan PIN dari pelanggan untuk mulai bekerja';
        END IF;
        IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'working' THEN
            RAISE EXCEPTION 'Pekerjaan harus dimulai dengan PIN pelanggan sebelum diselesaikan';
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


-- ---------------------------------------------------------------------------
-- 6. Payout (0075 body; materials pass through without commission)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION credit_payout_on_order_completed()
RETURNS TRIGGER AS $$
DECLARE
    v_commission_rate NUMERIC := 0.20;
    v_delivery_fee NUMERIC := COALESCE(NEW.delivery_fee, 0);
    v_material NUMERIC := LEAST(GREATEST(COALESCE(NEW.material_amount, 0), 0), COALESCE(NEW.total_price, 0));
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

    IF NEW.merchant_id IS NOT NULL THEN
        SELECT owner_id INTO v_merchant_owner FROM public.merchants WHERE id = NEW.merchant_id;
        IF v_merchant_owner IS NOT NULL THEN
            v_merchant_share := GREATEST(COALESCE(NEW.total_price, 0) - v_delivery_fee, 0) * (1 - v_commission_rate);
            IF v_merchant_share > 0 THEN
                UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) + v_merchant_share WHERE id = v_merchant_owner;
            END IF;
        END IF;
    END IF;

    IF NEW.driver_id IS NOT NULL THEN
        IF NEW.merchant_id IS NOT NULL THEN
            v_driver_share := v_delivery_fee * (1 - v_commission_rate); -- food: driver earns the delivery fee only
        ELSE
            -- ride/send/service/pool: 80% of the work, all of the materials
            v_driver_share := (COALESCE(NEW.total_price, 0) - v_material) * (1 - v_commission_rate) + v_material;
        END IF;
        IF v_driver_share > 0 THEN
            UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) + v_driver_share WHERE id = NEW.driver_id;
        END IF;
    END IF;

    -- 0075: cash was collected in hand, so take the full total_price back
    -- from the collector's balance (leaves exactly the platform's cut owed).
    IF NEW.payment_method = 'cash' AND COALESCE(NEW.total_price, 0) > 0 THEN
        v_collector := COALESCE(NEW.driver_id, v_merchant_owner);
        IF v_collector IS NOT NULL THEN
            UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) - NEW.total_price WHERE id = v_collector;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 7. Extra charges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES public.users(id),
    kind TEXT NOT NULL CHECK (kind IN ('material', 'jasa')),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS order_adjustments_order_idx ON public.order_adjustments (order_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS order_adjustments_one_pending
    ON public.order_adjustments (order_id) WHERE status = 'pending';
ALTER TABLE public.order_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_adjustments_select ON public.order_adjustments;
CREATE POLICY order_adjustments_select ON public.order_adjustments FOR SELECT USING (
    is_admin() OR EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_id AND (o.user_id = auth.uid() OR o.driver_id = auth.uid())
    )
);
-- Written only through the functions below.
REVOKE ALL ON public.order_adjustments FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.order_adjustments FROM authenticated;
GRANT SELECT ON public.order_adjustments TO authenticated;

CREATE OR REPLACE FUNCTION public.request_order_adjustment(
    p_order_id UUID, p_kind TEXT, p_amount NUMERIC, p_description TEXT
)
RETURNS UUID AS $$
DECLARE
    v_order RECORD;
    v_id UUID;
    v_desc TEXT := btrim(COALESCE(p_description, ''));
BEGIN
    SELECT id, user_id, driver_id, status, service_type, title INTO v_order
    FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND OR v_order.driver_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Anda tidak menangani pesanan ini';
    END IF;
    IF v_order.service_type NOT IN ('service', 'pool') OR v_order.status NOT IN ('on_the_way', 'working') THEN
        RAISE EXCEPTION 'Biaya tambahan hanya bisa diajukan saat Anda di lokasi pekerjaan';
    END IF;
    IF p_kind NOT IN ('material', 'jasa') THEN
        RAISE EXCEPTION 'Jenis biaya tidak valid';
    END IF;
    IF p_amount IS NULL OR p_amount < 1000 OR p_amount > 20000000 OR p_amount <> round(p_amount) THEN
        RAISE EXCEPTION 'Nominal harus antara Rp 1.000 dan Rp 20.000.000';
    END IF;
    IF length(v_desc) < 3 OR length(v_desc) > 300 THEN
        RAISE EXCEPTION 'Tuliskan rincian biaya (3 sampai 300 huruf)';
    END IF;
    IF EXISTS (SELECT 1 FROM public.order_adjustments WHERE order_id = p_order_id AND status = 'pending') THEN
        RAISE EXCEPTION 'Masih ada pengajuan yang menunggu jawaban pelanggan';
    END IF;

    INSERT INTO public.order_adjustments (order_id, requested_by, kind, amount, description)
    VALUES (p_order_id, auth.uid(), p_kind, p_amount, v_desc)
    RETURNING id INTO v_id;

    INSERT INTO public.notifications (user_id, title, description, is_read)
    VALUES (v_order.user_id, 'Teknisi mengajukan biaya tambahan',
            public.format_rupiah(p_amount) || ' untuk ' || v_desc || '. Buka pesanan Anda untuk menyetujui atau menolak.',
            false);
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.request_order_adjustment(UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_order_adjustment(UUID, TEXT, NUMERIC, TEXT) TO authenticated;

-- Customer answers. Approve: paid-through-Wira orders are charged from the
-- WiraPay balance now; cash orders pay the technician in hand.
CREATE OR REPLACE FUNCTION public.respond_order_adjustment(p_adjustment_id UUID, p_approve BOOLEAN)
RETURNS TEXT AS $$
DECLARE
    v_adj RECORD;
    v_order RECORD;
    v_paid_online BOOLEAN;
BEGIN
    SELECT * INTO v_adj FROM public.order_adjustments WHERE id = p_adjustment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pengajuan tidak ditemukan';
    END IF;
    SELECT id, user_id, driver_id, status, payment_method, payment_status, title INTO v_order
    FROM public.orders WHERE id = v_adj.order_id FOR UPDATE;
    IF v_order.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Anda tidak berhak menjawab pengajuan ini';
    END IF;
    IF v_adj.status <> 'pending' THEN
        RAISE EXCEPTION 'Pengajuan ini sudah dijawab';
    END IF;

    -- The visit already ended or was cancelled: the request lapses.
    IF v_order.status NOT IN ('on_the_way', 'working') THEN
        UPDATE public.order_adjustments SET status = 'cancelled', decided_at = NOW() WHERE id = p_adjustment_id;
        RETURN 'cancelled';
    END IF;

    IF NOT p_approve THEN
        UPDATE public.order_adjustments SET status = 'rejected', decided_at = NOW() WHERE id = p_adjustment_id;
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (v_order.driver_id, 'Biaya tambahan ditolak',
                'Pelanggan menolak ' || public.format_rupiah(v_adj.amount) || ' untuk ' || v_adj.description || '.', false);
        RETURN 'rejected';
    END IF;

    v_paid_online := v_order.payment_method IN ('wallet', 'qris') AND v_order.payment_status = 'paid';
    IF v_paid_online THEN
        UPDATE public.users SET wallet_balance = wallet_balance - v_adj.amount
        WHERE id = v_order.user_id AND wallet_balance >= v_adj.amount;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Saldo WiraPay belum cukup untuk %. Isi saldo dulu, lalu setujui lagi.', public.format_rupiah(v_adj.amount);
        END IF;
        INSERT INTO public.transactions (user_id, amount, type, status, description, reference_id)
        VALUES (v_order.user_id, v_adj.amount, 'payment', 'success',
                'Biaya tambahan: ' || v_adj.description, v_order.id::text);
    END IF;

    PERFORM set_config('wira.price_adjustment', 'on', true);
    UPDATE public.orders
    SET total_price = total_price + v_adj.amount,
        material_amount = material_amount + CASE WHEN v_adj.kind = 'material' THEN v_adj.amount ELSE 0 END
    WHERE id = v_order.id;
    PERFORM set_config('wira.price_adjustment', 'off', true);

    UPDATE public.order_adjustments SET status = 'approved', decided_at = NOW() WHERE id = p_adjustment_id;
    INSERT INTO public.notifications (user_id, title, description, is_read)
    VALUES (v_order.driver_id, 'Biaya tambahan disetujui',
            public.format_rupiah(v_adj.amount) || ' untuk ' || v_adj.description
            || CASE WHEN v_paid_online THEN ' sudah dibayar lewat WiraPay.' ELSE '. Terima pembayarannya tunai dari pelanggan.' END,
            false);
    RETURN 'approved';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.respond_order_adjustment(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_order_adjustment(UUID, BOOLEAN) TO authenticated;

-- The technician withdraws their own pending request.
CREATE OR REPLACE FUNCTION public.cancel_order_adjustment(p_adjustment_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.order_adjustments SET status = 'cancelled', decided_at = NOW()
    WHERE id = p_adjustment_id AND status = 'pending' AND requested_by = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pengajuan tidak bisa dibatalkan';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.cancel_order_adjustment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order_adjustment(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Finish at the check fee (customer declined after the visit)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finish_visit_as_check(p_order_id UUID, p_pin_input VARCHAR(4))
RETURNS JSONB AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_real_pin VARCHAR(4);
    v_fee NUMERIC;
    v_back NUMERIC := 0;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND OR v_order.driver_id IS DISTINCT FROM auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anda tidak menangani pesanan ini');
    END IF;
    IF v_order.service_type NOT IN ('service', 'pool') OR v_order.status NOT IN ('accepted', 'on_the_way') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Hanya untuk kunjungan yang belum mulai dikerjakan');
    END IF;
    IF v_order.pin_attempts >= 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Terlalu banyak percobaan PIN. Hubungi CS Wira.');
    END IF;

    SELECT pin INTO v_real_pin FROM public.order_security_pins WHERE order_id = p_order_id;
    IF v_real_pin IS DISTINCT FROM p_pin_input THEN
        UPDATE public.orders SET pin_attempts = COALESCE(pin_attempts, 0) + 1 WHERE id = p_order_id;
        RETURN jsonb_build_object('success', false, 'error', 'PIN tidak valid. Sisa percobaan: ' || (5 - (COALESCE(v_order.pin_attempts, 0) + 1)));
    END IF;

    SELECT base_price INTO v_fee FROM public.pricing_rules
    WHERE service_type = 'service' AND code = 'CHECK_FEE' AND is_active = true;
    v_fee := LEAST(COALESCE(v_fee, 50000), COALESCE(v_order.total_price, 0));

    IF v_order.payment_method IN ('wallet', 'qris') AND v_order.payment_status = 'paid'
       AND COALESCE(v_order.total_price, 0) > v_fee THEN
        v_back := v_order.total_price - v_fee;
        UPDATE public.users SET wallet_balance = wallet_balance + v_back WHERE id = v_order.user_id;
        INSERT INTO public.transactions (user_id, type, amount, status, description, created_at, reference_id)
        VALUES (v_order.user_id, 'refund', v_back, 'success', 'Pengembalian (pekerjaan batal setelah dicek)', NOW(), p_order_id::text);
    END IF;

    UPDATE public.order_adjustments SET status = 'cancelled', decided_at = NOW()
    WHERE order_id = p_order_id AND status = 'pending';

    PERFORM set_config('wira.price_adjustment', 'on', true);
    UPDATE public.orders
    SET total_price = v_fee, material_amount = 0, status = 'completed', pin_attempts = 0, updated_at = NOW()
    WHERE id = p_order_id;
    PERFORM set_config('wira.price_adjustment', 'off', true);

    INSERT INTO public.notifications (user_id, title, description, is_read)
    VALUES (v_order.user_id, 'Kunjungan selesai: hanya pengecekan',
            'Biaya cek ' || public.format_rupiah(v_fee)
            || CASE WHEN v_back > 0 THEN '. Sisa ' || public.format_rupiah(v_back) || ' sudah kembali ke saldo WiraPay Anda.'
                    WHEN v_order.payment_method = 'cash' THEN ', dibayar tunai ke teknisi.' ELSE '.' END,
            false);
    RETURN jsonb_build_object('success', true, 'fee', v_fee, 'refunded', v_back);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.finish_visit_as_check(UUID, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_visit_as_check(UUID, VARCHAR) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Monthly pool package: four weekly visits, paid together with WiraPay
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_pool_package(
    p_first_visit TIMESTAMPTZ, p_title TEXT, p_details TEXT,
    p_pickup_lat DOUBLE PRECISION DEFAULT NULL, p_pickup_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_package UUID := gen_random_uuid();
    i INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Anda harus login';
    END IF;
    FOR i IN 0..3 LOOP
        -- create_order_and_pay (0070) runs the price, booking and state
        -- checks for each visit and debits it; any failure (e.g. balance)
        -- rolls back the whole package.
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
    END LOOP;
    RETURN v_package;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;
REVOKE ALL ON FUNCTION public.create_pool_package(TIMESTAMPTZ, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pool_package(TIMESTAMPTZ, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- A technician takes every still-open visit of a package (same checks as a
-- normal claim: RLS and the state machine run as the caller).
CREATE OR REPLACE FUNCTION public.take_package_visits(p_package_id UUID)
RETURNS INT AS $$
DECLARE
    n INT;
BEGIN
    UPDATE public.orders
    SET status = 'accepted', driver_id = auth.uid()
    WHERE package_id = p_package_id AND status = 'pending' AND driver_id IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN
        RAISE EXCEPTION 'Kunjungan paket ini sudah diambil teknisi lain';
    END IF;
    RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;
REVOKE ALL ON FUNCTION public.take_package_visits(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.take_package_visits(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Job board returns items and package info (0089 + columns)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_open_technician_jobs();
CREATE FUNCTION public.get_open_technician_jobs()
RETURNS TABLE (
    id UUID, service_type TEXT, rate_code TEXT, title TEXT, details TEXT,
    scheduled_at TIMESTAMPTZ, total_price NUMERIC, payment_method TEXT,
    created_at TIMESTAMPTZ, is_preferred BOOLEAN, items JSONB, package_id UUID
) AS $$
    SELECT o.id, o.service_type::text, o.rate_code::text, o.title::text, o.details::text,
           o.scheduled_at, o.total_price::numeric, o.payment_method::text,
           o.created_at, COALESCE(o.preferred_partner_id = auth.uid(), false),
           o.metadata -> 'items', o.package_id
    FROM public.orders o
    WHERE o.status = 'pending' AND o.driver_id IS NULL
      AND o.service_type IN ('service', 'pool')
      AND o.user_id <> auth.uid()
      AND public.can_see_open_order(o.service_type, o.rate_code, o.status, o.merchant_id,
                                    o.preferred_partner_id, o.status_changed_at)
    ORDER BY COALESCE(o.preferred_partner_id = auth.uid(), false) DESC, o.scheduled_at NULLS LAST, o.created_at;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_open_technician_jobs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_open_technician_jobs() TO authenticated;

-- Verify after applying:
--   SELECT code, base_price FROM pricing_rules WHERE item_of = 'AC' ORDER BY sort_order;  -> 6 rows
--   SELECT count(*) FROM order_adjustments;  -> 0
