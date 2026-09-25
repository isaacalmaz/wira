-- WHY: credit_payout_on_order_completed (0028) credited the 80% mitra share on
-- EVERY completed order, including payment_method = 'cash' (Tunai), where the
-- driver (or, with no driver, e.g. villa, the merchant) already collected the
-- whole total_price from the customer. The mitra kept 100% of the cash AND
-- could withdraw another 80% from Wira.
-- Rule (product owner, option 1a): credit shares exactly as before; then, for
-- cash orders only, debit whoever collected the cash by the full total_price
-- (driver_id if set, else the merchant owner). Net: cash ride/send/pool/service
-- driver -20%; cash food with courier: merchant +80% of food, driver
-- -(total - 80% of delivery_fee); cash villa: merchant -20%.
-- payable_balance may now go negative (0028's CHECK >= 0 is dropped);
-- request_payout (0028, never redefined) already refuses amount > balance, so
-- a negative balance blocks withdrawals until later orders cover the debt.
-- 'wallet' and 'transfer' are unchanged ('transfer' still needs a product
-- decision on where that money actually goes).

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_payable_balance_nonneg;

CREATE OR REPLACE FUNCTION credit_payout_on_order_completed()
RETURNS TRIGGER AS $$
DECLARE
    v_commission_rate NUMERIC := 0.20;
    v_delivery_fee NUMERIC := COALESCE(NEW.delivery_fee, 0);
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
            v_driver_share := COALESCE(NEW.total_price, 0) * (1 - v_commission_rate); -- ride/send/service/pool
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

DROP TRIGGER IF EXISTS trg_credit_payout_on_completed ON public.orders;
CREATE TRIGGER trg_credit_payout_on_completed
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION credit_payout_on_order_completed();

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- 1. SELECT conname FROM pg_constraint WHERE conname = 'users_payable_balance_nonneg';
--    -> 0 rows.
-- 2. Complete a Tunai ride of Rp 50.000: driver payable_balance -10.000.
--    Same ride via WiraPay: +40.000 (unchanged).
-- 3. Tunai food (total 58.000, delivery_fee 8.000) with courier: merchant
--    +40.000, driver -51.600. Tunai villa 1.000.000: merchant -200.000.
-- 4. As a mitra with a negative balance, request_payout(1, ...) must fail
--    with 'Saldo tidak mencukupi'.
