-- Two things requested together: (1) a payout/withdrawal system so drivers,
-- merchants, and technicians can actually cash out what Wira owes them —
-- until now there was zero payout-destination data anywhere and every
-- "Tarik Saldo" button in the mitra app was decorative with no onClick at
-- all — and (2) the DB-side support for WiraFood courier assignment (the
-- RLS change that lets a driver claim a 'ready' food order; the merchant-
-- side and driver-side UI/flow changes are in frontend-mitra).
--
-- Business rules confirmed with the product owner before writing this:
--   - Platform commission: 20%. Mitra receive 80% of what an order is
--     worth to them.
--   - Payout is manual, mirroring the existing topup_requests flow in
--     reverse: mitra requests a withdrawal with their bank/e-wallet
--     destination, admin sends the money externally (no payment-gateway
--     integration exists), then marks the request approved. There is no
--     automated disbursement.
--   - For a food order specifically, both a merchant (who cooked) and a
--     driver (who delivered) are now involved for the same total_price —
--     splitting the whole amount 80% to each would double-pay from one
--     total_price. Split by what each side is actually owed for: the
--     merchant earns from the food itself (total_price minus the delivery
--     fee), the driver earns the delivery fee. RestaurantPage.jsx already
--     had a real Rp 8.000 delivery fee in its UI total — it just never got
--     saved as its own column; that pre-existing value now flows into
--     orders.delivery_fee instead of being invented from scratch.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS payable_balance NUMERIC DEFAULT 0;
DO $$
BEGIN
    ALTER TABLE public.users ADD CONSTRAINT users_payable_balance_nonneg CHECK (payable_balance >= 0);
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- --- Auto-credit payable_balance when an order genuinely completes ---------
-- Fires on every order write but only acts once per order (guards against
-- re-crediting if a completed order gets touched again later for an
-- unrelated field edit).
CREATE OR REPLACE FUNCTION credit_payout_on_order_completed()
RETURNS TRIGGER AS $$
DECLARE
    v_commission_rate NUMERIC := 0.20;
    v_delivery_fee NUMERIC := COALESCE(NEW.delivery_fee, 0);
    v_merchant_owner UUID;
    v_merchant_share NUMERIC;
    v_driver_share NUMERIC;
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
            v_driver_share := COALESCE(NEW.total_price, 0) * (1 - v_commission_rate); -- ride/send/service/pool: driver earns the whole thing
        END IF;
        IF v_driver_share > 0 THEN
            UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) + v_driver_share WHERE id = NEW.driver_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_credit_payout_on_completed ON public.orders;
CREATE TRIGGER trg_credit_payout_on_completed
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION credit_payout_on_order_completed();

-- --- payout_requests (mirrors topup_requests, reversed direction) ----------
CREATE TABLE IF NOT EXISTS public.payout_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    payout_method TEXT NOT NULL,
    payout_destination TEXT NOT NULL,
    payout_account_name TEXT,
    admin_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payout_requests_select_own_or_admin" ON public.payout_requests;
CREATE POLICY "payout_requests_select_own_or_admin" ON public.payout_requests
FOR SELECT USING (auth.uid() = user_id OR is_admin());
-- No direct INSERT/UPDATE policy: every write goes through the SECURITY
-- DEFINER RPCs below, same pattern as wallet_pay/wallet_transfer, so the
-- reserve-on-request / refund-on-reject bookkeeping can never be bypassed
-- by a raw client insert/update.

CREATE OR REPLACE FUNCTION request_payout(p_amount NUMERIC, p_payout_method TEXT, p_payout_destination TEXT, p_payout_account_name TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
    v_balance NUMERIC;
    v_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Anda harus login untuk menarik saldo';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Nominal tidak valid';
    END IF;
    IF p_payout_method IS NULL OR p_payout_destination IS NULL OR p_payout_destination = '' THEN
        RAISE EXCEPTION 'Metode dan tujuan pencairan wajib diisi';
    END IF;

    SELECT payable_balance INTO v_balance FROM public.users WHERE id = auth.uid() FOR UPDATE;
    IF COALESCE(v_balance, 0) < p_amount THEN
        RAISE EXCEPTION 'Saldo tidak mencukupi';
    END IF;

    -- Reserve immediately so the same balance can't be requested twice.
    UPDATE public.users SET payable_balance = payable_balance - p_amount WHERE id = auth.uid();

    INSERT INTO public.payout_requests (user_id, amount, status, payout_method, payout_destination, payout_account_name)
    VALUES (auth.uid(), p_amount, 'pending', p_payout_method, p_payout_destination, p_payout_account_name)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION cancel_payout_request(request_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    req_user_id UUID;
    req_amount NUMERIC;
    req_status TEXT;
BEGIN
    SELECT user_id, amount, status INTO req_user_id, req_amount, req_status
    FROM public.payout_requests WHERE id = request_id FOR UPDATE;

    IF NOT FOUND OR req_status != 'pending' THEN RETURN FALSE; END IF;
    IF auth.uid() IS NULL OR auth.uid() != req_user_id THEN RETURN FALSE; END IF;

    UPDATE public.payout_requests SET status = 'cancelled', updated_at = NOW() WHERE id = request_id;
    UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) + req_amount WHERE id = req_user_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION approve_payout_request(request_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    req_status TEXT;
BEGIN
    IF NOT is_admin() THEN RETURN FALSE; END IF;

    SELECT status INTO req_status FROM public.payout_requests WHERE id = request_id FOR UPDATE;
    IF NOT FOUND OR req_status != 'pending' THEN RETURN FALSE; END IF;

    -- Money was already reserved out of payable_balance at request time;
    -- this just confirms the external transfer was actually sent.
    UPDATE public.payout_requests SET status = 'approved', updated_at = NOW() WHERE id = request_id;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reject_payout_request(request_id UUID, p_admin_note TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
    req_user_id UUID;
    req_amount NUMERIC;
    req_status TEXT;
BEGIN
    IF NOT is_admin() THEN RETURN FALSE; END IF;

    SELECT user_id, amount, status INTO req_user_id, req_amount, req_status
    FROM public.payout_requests WHERE id = request_id FOR UPDATE;
    IF NOT FOUND OR req_status != 'pending' THEN RETURN FALSE; END IF;

    UPDATE public.payout_requests SET status = 'rejected', admin_note = p_admin_note, updated_at = NOW() WHERE id = request_id;
    UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) + req_amount WHERE id = req_user_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --- Let a driver claim a 'ready' food order (courier assignment) ----------
DROP POLICY IF EXISTS "orders_update_mitra_or_admin" ON public.orders;
CREATE POLICY "orders_update_mitra_or_admin" ON public.orders
FOR UPDATE USING (
    (status = 'pending' AND driver_id IS NULL)
    OR (status = 'ready' AND driver_id IS NULL AND merchant_id IS NOT NULL)
    OR driver_id = auth.uid()
    OR merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
    OR is_admin()
);

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- 1. Complete a real ride/send order as a driver — their payable_balance
--    should increase by 80% of total_price.
-- 2. Complete a real food order (merchant ready -> driver claims -> driver
--    delivers) — merchant's payable_balance should increase by 80% of
--    (total_price - delivery_fee), driver's by 80% of delivery_fee.
-- 3. As that mitra, call request_payout(...) for less than their balance —
--    should succeed and immediately deduct payable_balance.
-- 4. As admin, call approve_payout_request(...) — should succeed; as a
--    non-admin, should return FALSE.
-- 5. As a driver (not the merchant), UPDATE a 'ready' food order with no
--    driver_id yet, setting driver_id = self — should succeed.
