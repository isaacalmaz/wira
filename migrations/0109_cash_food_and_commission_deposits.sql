-- =========================================
-- 0109: cash food paid to the restaurant by the driver, commission
--       deposits ("Setor Komisi"), billing every 3 days, debt limit
--
-- Owner decisions 2026-10-07 (payment model: customers pay partners
-- directly; Wira only collects commission):
--
--   * Food paid in cash (model A, like Gojek/Grab): the driver pays the
--     restaurant the full menu price at pickup and collects the order
--     total from the customer. Nothing passes through Wira, so on
--     completion:
--       restaurant  balance -= commission on the menu subtotal
--       driver      balance -= commission on the delivery fee
--                           += the promo discount (Wira funds promos; the
--                              driver paid the full price but collected
--                              the discounted total)
--     orders.promo_discount (new) is stamped by the price trigger so the
--     subtotal the driver pays = total - delivery_fee + promo_discount.
--     Non-cash food and every other service are unchanged (0099).
--   * commission_deposits: a partner transfers/QRIS to Wira, uploads the
--     proof (private bucket commission-proofs), an admin approves in
--     Keuangan and the amount is added to payable_balance. A deposit made
--     while nothing is owed is a prepayment that later commissions use up.
--   * Billing: pg_cron daily; a partner owing commission gets a reminder
--     at most every 3 days (users.commission_billed_at).
--   * Debt limit: a partner owing >= Rp 200.000 for more than 7 days
--     (users.commission_debt_since) cannot accept new orders until they
--     deposit. Admin assignments are never blocked. Both numbers live in
--     app_settings (commission_debt_limit, commission_debt_grace_days),
--     with commission_payment_info: where partners send the money.
-- Depends on 0090, 0096, 0099, 0101, 0102, 0108.
-- =========================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promo_discount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS commission_debt_since TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS commission_billed_at TIMESTAMPTZ;

INSERT INTO public.app_settings (key, value) VALUES
    ('commission_debt_limit', '200000'::jsonb),
    ('commission_debt_grace_days', '7'::jsonb),
    ('commission_payment_info', '"Hubungi admin Wira untuk nomor rekening atau QRIS setoran komisi."'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 0108's setter, now knowing the new keys.
CREATE OR REPLACE FUNCTION public.admin_set_app_setting(p_key TEXT, p_value JSONB)
RETURNS JSONB AS $$
DECLARE
    v_old JSONB;
BEGIN
    IF NOT (public.admin_can('core') OR public.admin_can('finance')) THEN
        RAISE EXCEPTION 'Khusus admin inti atau keuangan' USING ERRCODE = '42501';
    END IF;
    IF p_key = 'topup_auto_confirm' AND jsonb_typeof(p_value) <> 'boolean' THEN
        RAISE EXCEPTION 'Nilai harus true atau false';
    ELSIF p_key = 'qris_order_window_minutes'
          AND (jsonb_typeof(p_value) <> 'number' OR (p_value #>> '{}')::NUMERIC NOT BETWEEN 15 AND 240) THEN
        RAISE EXCEPTION 'Batas waktu pembayaran harus 15 sampai 240 menit';
    ELSIF p_key = 'commission_debt_limit'
          AND (jsonb_typeof(p_value) <> 'number' OR (p_value #>> '{}')::NUMERIC NOT BETWEEN 10000 AND 10000000) THEN
        RAISE EXCEPTION 'Batas utang komisi harus Rp 10.000 sampai Rp 10.000.000';
    ELSIF p_key = 'commission_debt_grace_days'
          AND (jsonb_typeof(p_value) <> 'number' OR (p_value #>> '{}')::NUMERIC NOT BETWEEN 0 AND 60) THEN
        RAISE EXCEPTION 'Masa tenggang harus 0 sampai 60 hari';
    ELSIF p_key = 'commission_payment_info'
          AND (jsonb_typeof(p_value) <> 'string' OR length(p_value #>> '{}') NOT BETWEEN 5 AND 500) THEN
        RAISE EXCEPTION 'Info pembayaran harus 5 sampai 500 karakter';
    ELSIF p_key NOT IN ('topup_auto_confirm', 'qris_order_window_minutes', 'commission_debt_limit',
                        'commission_debt_grace_days', 'commission_payment_info') THEN
        RAISE EXCEPTION 'Pengaturan % tidak dikenal', p_key;
    END IF;

    SELECT value INTO v_old FROM public.app_settings WHERE key = p_key FOR UPDATE;
    UPDATE public.app_settings SET value = p_value, updated_at = NOW(), updated_by = auth.uid() WHERE key = p_key;
    PERFORM public.log_admin_action('app_setting_changed', 'app_setting', p_key, NULL, NULL,
                                    jsonb_build_object('from', v_old, 'to', p_value));
    RETURN jsonb_build_object('key', p_key, 'value', p_value);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_set_app_setting(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_app_setting(TEXT, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. Price trigger (0090 body + promo_discount stamped on food orders)
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


-- Only an admin (or the backend) may change the stamped discount later.
CREATE OR REPLACE FUNCTION public.protect_order_promo_discount()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.promo_discount IS DISTINCT FROM OLD.promo_discount
       AND current_user IN ('authenticated', 'anon') AND NOT public.is_admin_panel() THEN
        NEW.promo_discount := OLD.promo_discount;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public; -- invoker: current_user is the caller's role
DROP TRIGGER IF EXISTS trg_protect_order_promo_discount ON public.orders;
CREATE TRIGGER trg_protect_order_promo_discount BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.protect_order_promo_discount();

-- ---------------------------------------------------------------------------
-- 2. Shares on completion (0099 + cash food model A)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_payout_on_order_completed()
RETURNS TRIGGER AS $$
DECLARE
    v_commission_rate NUMERIC := COALESCE(NEW.commission_rate, public.platform_commission_rate(NEW.service_type));
    v_delivery_fee NUMERIC := COALESCE(NEW.delivery_fee, 0);
    v_material NUMERIC := LEAST(GREATEST(COALESCE(NEW.material_amount, 0), 0), COALESCE(NEW.total_price, 0));
    v_discount NUMERIC := GREATEST(COALESCE(NEW.promo_discount, 0), 0);
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

    IF NEW.merchant_id IS NOT NULL THEN
        SELECT owner_id INTO v_merchant_owner FROM public.merchants WHERE id = NEW.merchant_id;
    END IF;

    -- 0109 model A: cash food with a courier. The driver paid the restaurant
    -- the menu subtotal at pickup; only commissions (and the promo Wira
    -- funds) move through balances.
    IF NEW.payment_method = 'cash' AND NEW.service_type = 'food'
       AND NEW.driver_id IS NOT NULL AND v_merchant_owner IS NOT NULL THEN
        v_subtotal := GREATEST(COALESCE(NEW.total_price, 0) - v_delivery_fee, 0) + v_discount;
        UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) - ROUND(v_subtotal * v_commission_rate)
        WHERE id = v_merchant_owner;
        UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) + v_discount - ROUND(v_delivery_fee * v_commission_rate)
        WHERE id = NEW.driver_id;
        RETURN NEW;
    END IF;

    IF v_merchant_owner IS NOT NULL THEN
        v_merchant_share := GREATEST(COALESCE(NEW.total_price, 0) - v_delivery_fee, 0) * (1 - v_commission_rate);
        IF v_merchant_share > 0 THEN
            UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) + v_merchant_share WHERE id = v_merchant_owner;
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 3. When did this partner start owing? (for the grace period)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_commission_debt()
RETURNS TRIGGER AS $$
BEGIN
    IF COALESCE(NEW.payable_balance, 0) < 0 THEN
        IF NEW.commission_debt_since IS NULL OR COALESCE(OLD.payable_balance, 0) >= 0 THEN
            NEW.commission_debt_since := NOW();
        END IF;
    ELSE
        NEW.commission_debt_since := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
DROP TRIGGER IF EXISTS trg_track_commission_debt ON public.users;
CREATE TRIGGER trg_track_commission_debt BEFORE UPDATE OF payable_balance ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.track_commission_debt();

-- Partners already owing start their grace period now.
UPDATE public.users SET commission_debt_since = NOW()
WHERE COALESCE(payable_balance, 0) < 0 AND commission_debt_since IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Debt limit when taking a new order
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.commission_debt_block(p_user UUID)
RETURNS TEXT AS $$
DECLARE
    v_balance NUMERIC;
    v_since TIMESTAMPTZ;
    v_limit INT := public.app_setting_int('commission_debt_limit', 200000);
    v_grace INT := public.app_setting_int('commission_debt_grace_days', 7);
BEGIN
    SELECT payable_balance, commission_debt_since INTO v_balance, v_since FROM public.users WHERE id = p_user;
    IF COALESCE(v_balance, 0) <= -v_limit AND v_since IS NOT NULL
       AND v_since < NOW() - make_interval(days => v_grace) THEN
        RETURN 'Komisi Rp ' || replace(to_char(-v_balance, 'FM999,999,999,999'), ',', '.')
            || ' belum disetor lebih dari ' || v_grace || ' hari. Setor dulu lewat menu Pendapatan -> Setor Komisi untuk menerima pesanan baru.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.commission_debt_block(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_debt_block(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_commission_debt_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_owner UUID;
    v_msg TEXT;
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin_panel() THEN
        RETURN NEW;
    END IF;
    -- A driver/technician taking the order.
    IF NEW.driver_id IS NOT NULL AND OLD.driver_id IS NULL AND NEW.driver_id = auth.uid() THEN
        v_msg := public.commission_debt_block(NEW.driver_id);
    -- A restaurant or villa host accepting it.
    ELSIF OLD.status = 'pending' AND NEW.status = 'accepted' AND NEW.merchant_id IS NOT NULL THEN
        SELECT owner_id INTO v_owner FROM public.merchants WHERE id = NEW.merchant_id;
        IF v_owner = auth.uid() THEN
            v_msg := public.commission_debt_block(v_owner);
        END IF;
    END IF;
    IF v_msg IS NOT NULL THEN
        RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public; -- invoker: current_user is the caller's role
DROP TRIGGER IF EXISTS trg_enforce_commission_debt_limit ON public.orders;
CREATE TRIGGER trg_enforce_commission_debt_limit BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.enforce_commission_debt_limit();

-- ---------------------------------------------------------------------------
-- 5. Commission deposits
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('commission-proofs', 'commission-proofs', false)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "commission_proofs_owner_insert" ON storage.objects;
CREATE POLICY "commission_proofs_owner_insert" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'commission-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "commission_proofs_read" ON storage.objects;
CREATE POLICY "commission_proofs_read" ON storage.objects
FOR SELECT USING (bucket_id = 'commission-proofs'
                  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin_panel()));

CREATE TABLE IF NOT EXISTS public.commission_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    proof_path TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reject_reason TEXT,
    reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS commission_deposits_user_idx ON public.commission_deposits (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS commission_deposits_pending_idx ON public.commission_deposits (created_at) WHERE status = 'pending';
ALTER TABLE public.commission_deposits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS commission_deposits_read ON public.commission_deposits;
CREATE POLICY commission_deposits_read ON public.commission_deposits
    FOR SELECT USING (user_id = auth.uid() OR public.is_admin_panel());
-- No insert/update policies: only the functions below write.

CREATE OR REPLACE FUNCTION public.submit_commission_deposit(p_amount NUMERIC, p_proof_path TEXT, p_note TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_id UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Silakan masuk terlebih dahulu' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_uid
                   AND jsonb_typeof(mitra_access) = 'array' AND jsonb_array_length(mitra_access) > 0) THEN
        RAISE EXCEPTION 'Khusus akun mitra' USING ERRCODE = '42501';
    END IF;
    IF p_amount IS NULL OR p_amount < 10000 OR p_amount > 10000000 THEN
        RAISE EXCEPTION 'Jumlah setoran Rp 10.000 sampai Rp 10.000.000';
    END IF;
    IF p_proof_path IS NULL OR split_part(p_proof_path, '/', 1) <> v_uid::text THEN
        RAISE EXCEPTION 'Lampirkan foto bukti transfer';
    END IF;
    IF (SELECT count(*) FROM public.commission_deposits WHERE user_id = v_uid AND status = 'pending') >= 3 THEN
        RAISE EXCEPTION 'Masih ada 3 setoran menunggu dicek admin. Tunggu sebentar, lalu coba lagi.';
    END IF;

    INSERT INTO public.commission_deposits (user_id, amount, proof_path, note)
    VALUES (v_uid, ROUND(p_amount), p_proof_path, NULLIF(btrim(COALESCE(p_note, '')), ''))
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.submit_commission_deposit(NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_commission_deposit(NUMERIC, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_commission_deposit(p_id UUID, p_approve BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    d RECORD;
    v_balance NUMERIC;
BEGIN
    IF NOT (public.admin_can('core') OR public.admin_can('finance')) THEN
        RAISE EXCEPTION 'Khusus admin inti atau keuangan' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO d FROM public.commission_deposits WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Setoran tidak ditemukan';
    END IF;
    IF d.status <> 'pending' THEN
        RAISE EXCEPTION 'Setoran ini sudah diproses';
    END IF;
    IF NOT p_approve AND NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Tulis alasan penolakan';
    END IF;

    UPDATE public.commission_deposits
    SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
        reject_reason = CASE WHEN p_approve THEN NULL ELSE btrim(p_reason) END,
        reviewed_by = auth.uid(), reviewed_at = NOW()
    WHERE id = p_id;

    IF p_approve THEN
        UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) + d.amount
        WHERE id = d.user_id RETURNING payable_balance INTO v_balance;
        INSERT INTO public.notifications (user_id, title, description, is_read, link)
        VALUES (d.user_id, 'Setoran komisi diterima',
                'Setoran ' || public.format_rupiah(d.amount) || ' sudah masuk. Saldo Anda sekarang '
                || CASE WHEN v_balance < 0 THEN '-' ELSE '' END || public.format_rupiah(abs(v_balance)) || '.',
                false, '/earnings');
    ELSE
        INSERT INTO public.notifications (user_id, title, description, is_read, link)
        VALUES (d.user_id, 'Setoran komisi ditolak',
                'Setoran ' || public.format_rupiah(d.amount) || ' ditolak: ' || btrim(p_reason), false, '/earnings');
    END IF;

    PERFORM public.log_admin_action(CASE WHEN p_approve THEN 'commission_deposit_approved' ELSE 'commission_deposit_rejected' END,
                                    'commission_deposit', p_id::text, d.user_id, p_reason,
                                    jsonb_build_object('amount', d.amount));
    RETURN jsonb_build_object('id', p_id, 'approved', p_approve, 'balance', v_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_review_commission_deposit(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_commission_deposit(UUID, BOOLEAN, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.alert_admins_commission_deposit()
RETURNS TRIGGER AS $$
DECLARE
    v_name TEXT;
BEGIN
    SELECT name INTO v_name FROM public.users WHERE id = NEW.user_id;
    PERFORM public.notify_admins('Setoran komisi menunggu konfirmasi',
        COALESCE(v_name, 'Mitra') || ' menyetor komisi ' || public.format_rupiah(NEW.amount)
        || '. Cek mutasi, lalu setujui di Keuangan.', '/finance', true);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_alert_admins_commission_deposit ON public.commission_deposits;
CREATE TRIGGER trg_alert_admins_commission_deposit AFTER INSERT ON public.commission_deposits
    FOR EACH ROW EXECUTE FUNCTION public.alert_admins_commission_deposit();

-- ---------------------------------------------------------------------------
-- 6. Reminder every 3 days to partners who owe commission
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bill_commission_debts()
RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    WITH due AS (
        UPDATE public.users SET commission_billed_at = NOW()
        WHERE COALESCE(payable_balance, 0) < 0
          AND (status IS DISTINCT FROM 'Dihapus')
          AND (commission_billed_at IS NULL OR commission_billed_at < NOW() - INTERVAL '3 days' + INTERVAL '1 hour')
        RETURNING id, payable_balance
    )
    INSERT INTO public.notifications (user_id, title, description, is_read, link)
    SELECT id, 'Tagihan komisi Wira',
           'Komisi Anda ' || public.format_rupiah(-payable_balance)
           || '. Setor lewat menu Pendapatan -> Setor Komisi. Utang di atas '
           || public.format_rupiah(public.app_setting_int('commission_debt_limit', 200000))
           || ' lebih dari ' || public.app_setting_int('commission_debt_grace_days', 7)
           || ' hari membuat Anda tidak bisa menerima pesanan baru.',
           false, '/earnings'
    FROM due;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.bill_commission_debts() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- 09:00 Lombok (01:00 UTC) every day; each partner at most every 3 days.
        PERFORM cron.schedule('wira-commission-billing', '0 1 * * *', 'SELECT public.bill_commission_debts()');
    END IF;
END $$;

-- Verify:
--   SELECT key, value FROM public.app_settings WHERE key LIKE 'commission%';
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'promo_discount';
--   SELECT jobname, schedule FROM cron.job WHERE jobname = 'wira-commission-billing';
