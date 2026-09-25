-- =============================================================================
-- Migration 0070: atomic WiraPay checkout + freeze payment/ownership columns
-- on orders (CRITICAL - closes a wallet-minting exploit)
-- =============================================================================
--
-- THE BUG
-- -------
-- Until now a WiraPay order was created in two unrelated client-side steps:
--
--   1. wallet_pay(p_amount)  - debits whatever amount the browser computed,
--                              with no link to any order.
--   2. INSERT INTO orders (..., payment_method = 'wallet',
--                               payment_status = 'paid')
--
-- enforce_orders_state_machine (0065) accepted payment_status = 'paid' on
-- INSERT from any authenticated user, and nothing ever checked that step 1
-- happened (0051's header already flagged "the wallet is never actually
-- debited anywhere in this same code path"). Both refund RPCs
-- (wallet_refund, 0040; wallet_refund_matched_ride, 0066) credit back
-- total_price for any `wallet` + `paid` order. So:
--
--   a) API-level: skip step 1, INSERT a wallet/paid order directly via
--      PostgREST, then cancel it -> wallet credited the full server-computed
--      price. Repeatable without limit = WiraPay minted from nothing.
--   b) No tooling needed: PoolPage/VillaPage offer a "Transfer Bank" option.
--      OrderContext mapped every non-"tunai" method to wallet + paid, but
--      the pages only call pay() for 'WiraPay' - so choosing Transfer
--      created a wallet/paid order with no money moved, refundable on
--      cancel through the normal UI.
--   c) The "orders_update_mitra_or_admin" RLS policy (0028) lets ANY
--      authenticated user UPDATE any `pending` order with no driver yet,
--      and the trigger never froze user_id/payment_method/payment_status.
--      So one could flip one's own cash order to wallet/paid and refund it,
--      or set user_id = self on someone else's paid pending order and have
--      its refund land in one's own wallet.
--
-- Separately, step 1 charged the CLIENT's price while 0059's trigger
-- rewrites total_price server-side, so a customer could be charged one
-- amount and refunded another; and a failed step 2 after a successful step
-- 1 lost the customer's money with no order to show for it.
--
-- THE FIX
-- -------
-- 1. create_order_and_pay(...) - the ONLY way to create a WiraPay order.
--    SECURITY INVOKER on purpose: the INSERT must run as `authenticated` so
--    RLS (orders_insert_own), 0059's price trigger (which deliberately skips
--    any role other than authenticated/anon) and the state-machine trigger
--    all apply exactly as for a normal client insert. A SECURITY DEFINER
--    function would run as the owner and silently skip price recomputation,
--    trusting the client's price again. It then calls
--    charge_wallet_for_order() (SECURITY DEFINER, needed to touch
--    users.wallet_balance) in the same transaction, so the order row, the
--    debit of its exact server-computed total_price, the ledger entry and
--    payment_status = 'paid' either all commit or none do (insufficient
--    balance raises and rolls the insert back too).
--
-- 2. enforce_orders_state_machine, for authenticated/anon callers:
--    - INSERT: payment_status must be 'unpaid'; payment_method = 'wallet'
--      is only accepted inside create_order_and_pay (signalled by the
--      transaction-local setting wira.wallet_checkout, which PostgREST
--      clients cannot set - set_config lives in pg_catalog, which is not an
--      exposed schema, and a transaction-local setting cannot outlive the
--      single RPC transaction that set it).
--    - UPDATE (non-admin): user_id, merchant_id, service_type,
--      payment_method, payment_status and the pricing/route inputs are
--      immutable. Every real client update only ever touches status and
--      driver_id (frontend-mitra orderService.js acceptOrder /
--      claimDeliveryOrder / updateOrderStatus, frontend-user
--      ecosystemService.js updateOrderStatus with no extraData caller), so
--      no legitimate flow is affected. SECURITY DEFINER RPCs (refunds, PIN
--      start, payment) run as the owner role and are unaffected, exactly as
--      they already were for 0065's INSERT checks.
--
-- Everything from 0065's version of the trigger is preserved verbatim.
--
-- Depends on: 0028 (orders RLS), 0058 (pricing input columns), 0059 (price
-- trigger), 0045 (transactions.reference_id), 0065 (trigger body).
-- Companion frontend change: frontend-user OrderContext.addOrder() now calls
-- create_order_and_pay for WiraPay and inserts cash/transfer as 'unpaid';
-- the six checkout pages no longer call wallet_pay() themselves.
-- APPLY THIS MIGRATION BEFORE (or together with) DEPLOYING THAT FRONTEND
-- CHANGE - the new frontend calls an RPC that only exists after this runs,
-- and the old frontend's wallet/paid inserts are rejected once it does.
-- =============================================================================

-- --- 1. Trigger: reject unpaid-for 'paid' orders, freeze sensitive columns --
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

    -- MENCEGAH PERUBAHAN APAPUN JIKA STATUS SEBELUMNYA ADALAH FINAL (cancelled / completed)
    IF OLD.status IN ('cancelled', 'completed') AND NOT is_admin() THEN
        RAISE EXCEPTION 'Order is already finalized (%) and cannot be modified', OLD.status;
    END IF;

    IF NEW.total_price IS DISTINCT FROM OLD.total_price AND NOT is_admin() THEN
        RAISE EXCEPTION 'total_price cannot be changed after an order is created (except by an admin)';
    END IF;

    -- Who the order belongs to, how it is paid, and what was priced are
    -- fixed at creation for ordinary client roles (see header, THE BUG c).
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
        THEN
            RAISE EXCEPTION 'Only status and driver assignment can be changed on an existing order';
        END IF;
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

-- --- 2. Debit the wallet for one specific, just-created order -------------
-- SECURITY DEFINER (needs users.wallet_balance). Only ever charges the
-- caller's own pending, unpaid WiraPay order, for that row's server-computed
-- total_price. Raises (never returns FALSE) on insufficient balance so the
-- enclosing create_order_and_pay transaction - including the order INSERT -
-- rolls back.
CREATE OR REPLACE FUNCTION public.charge_wallet_for_order(
    p_order_id UUID,
    p_description TEXT DEFAULT 'Pembayaran Layanan'
)
RETURNS VOID AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_order RECORD;
    v_balance NUMERIC;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Anda harus login untuk membayar';
    END IF;

    SELECT id, user_id, status, total_price, payment_method, payment_status
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;
    IF v_order.user_id IS DISTINCT FROM v_caller THEN
        RAISE EXCEPTION 'Anda tidak berhak membayar pesanan ini';
    END IF;
    IF v_order.status IS DISTINCT FROM 'pending'
       OR v_order.payment_method IS DISTINCT FROM 'wallet'
       OR v_order.payment_status IS DISTINCT FROM 'unpaid' THEN
        RAISE EXCEPTION 'Pesanan ini tidak menunggu pembayaran WiraPay';
    END IF;
    IF COALESCE(v_order.total_price, 0) <= 0 THEN
        RAISE EXCEPTION 'Nominal pesanan tidak valid';
    END IF;

    SELECT wallet_balance INTO v_balance
    FROM public.users
    WHERE id = v_caller
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Akun tidak ditemukan';
    END IF;
    IF COALESCE(v_balance, 0) < v_order.total_price THEN
        RAISE EXCEPTION 'Saldo WiraPay tidak mencukupi';
    END IF;

    UPDATE public.users
    SET wallet_balance = wallet_balance - v_order.total_price
    WHERE id = v_caller;

    INSERT INTO public.transactions (user_id, amount, type, status, description, reference_id)
    VALUES (v_caller, v_order.total_price, 'payment', 'success',
            COALESCE(p_description, 'Pembayaran Layanan'), p_order_id::text);

    UPDATE public.orders
    SET payment_status = 'paid'
    WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.charge_wallet_for_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.charge_wallet_for_order(UUID, TEXT) TO authenticated;

-- --- 3. Create + pay a WiraPay order in one transaction --------------------
-- SECURITY INVOKER on purpose - see header, THE FIX 1.
CREATE OR REPLACE FUNCTION public.create_order_and_pay(
    p_service_type TEXT,
    p_merchant_id UUID DEFAULT NULL,
    p_title TEXT DEFAULT NULL,
    p_details TEXT DEFAULT NULL,
    p_total_price NUMERIC DEFAULT NULL,
    p_pickup_lat DOUBLE PRECISION DEFAULT NULL,
    p_pickup_lng DOUBLE PRECISION DEFAULT NULL,
    p_dropoff_lat DOUBLE PRECISION DEFAULT NULL,
    p_dropoff_lng DOUBLE PRECISION DEFAULT NULL,
    p_delivery_fee NUMERIC DEFAULT 0,
    p_package_size TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL,
    p_rate_code TEXT DEFAULT NULL,
    p_distance_meters NUMERIC DEFAULT NULL,
    p_nights INTEGER DEFAULT NULL,
    p_promo_code TEXT DEFAULT NULL,
    p_payment_description TEXT DEFAULT NULL
)
RETURNS public.orders AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_order public.orders%ROWTYPE;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Anda harus login untuk membayar dengan WiraPay';
    END IF;

    -- A wallet charge must be for a price 0059's trigger actually computed.
    -- Without these inputs the trigger falls back to the client-supplied
    -- total_price, which is fine for cash but not for moving wallet money.
    -- COALESCE: a NULL p_metadata/p_nights would otherwise make the whole
    -- condition NULL, and IF NOT NULL does not raise.
    IF NOT COALESCE(
        (p_service_type = 'ride' AND p_rate_code IS NOT NULL AND p_distance_meters IS NOT NULL)
        OR (p_service_type IN ('send', 'service', 'pool') AND p_rate_code IS NOT NULL)
        OR (p_service_type = 'food' AND COALESCE(p_metadata ? 'items', false))
        OR (p_service_type = 'villa' AND COALESCE(p_nights >= 1, false) AND p_merchant_id IS NOT NULL),
        false
    ) THEN
        RAISE EXCEPTION 'Data harga pesanan % tidak lengkap untuk pembayaran WiraPay', p_service_type;
    END IF;

    PERFORM set_config('wira.wallet_checkout', 'on', true);

    INSERT INTO public.orders (
        user_id, merchant_id, service_type, status, total_price, title, details,
        payment_method, payment_status,
        pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
        delivery_fee, package_size, metadata,
        rate_code, distance_meters, nights, promo_code
    ) VALUES (
        v_caller, p_merchant_id, p_service_type, 'pending', p_total_price, p_title, p_details,
        'wallet', 'unpaid',
        p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng,
        COALESCE(p_delivery_fee, 0), p_package_size, p_metadata,
        p_rate_code, p_distance_meters, p_nights, p_promo_code
    )
    RETURNING * INTO v_order;

    PERFORM set_config('wira.wallet_checkout', 'off', true);

    PERFORM public.charge_wallet_for_order(v_order.id, COALESCE(p_payment_description, 'Pembayaran Layanan'));

    SELECT * INTO v_order FROM public.orders WHERE id = v_order.id;
    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

REVOKE ALL ON FUNCTION public.create_order_and_pay(
    TEXT, UUID, TEXT, TEXT, NUMERIC, DOUBLE PRECISION, DOUBLE PRECISION,
    DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC, TEXT, JSONB, TEXT, NUMERIC,
    INTEGER, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_and_pay(
    TEXT, UUID, TEXT, TEXT, NUMERIC, DOUBLE PRECISION, DOUBLE PRECISION,
    DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC, TEXT, JSONB, TEXT, NUMERIC,
    INTEGER, TEXT, TEXT
) TO authenticated;

-- ============================================================
-- Verification - run after applying (real magic-link sessions per
-- WIRA_HANDOFF.md 2.1; read balances/rows back with the service-role client
-- before AND after each step, never just trust `error`; clean up after)
-- ============================================================
-- 1. Exploit (a) closed: as a customer, direct PostgREST INSERT into orders
--    with payment_method='wallet', payment_status='paid' -> must fail
--    ("payment_status = unpaid"). Same with payment_status='unpaid' but
--    payment_method='wallet' -> must fail ("create_order_and_pay").
-- 2. Exploit (c) closed: as a DIFFERENT authenticated user, UPDATE someone's
--    pending unassigned order SET user_id = self -> must fail. As the owner,
--    UPDATE own cash order SET payment_method='wallet', payment_status='paid'
--    -> must fail.
-- 3. Happy path: create_order_and_pay(p_service_type => 'ride',
--    p_rate_code => 'motor', p_distance_meters => 5000, p_total_price => 1)
--    with enough balance -> returns the order with payment_status='paid' and
--    total_price = the server price (NOT 1); wallet_balance dropped by
--    exactly that total_price; one 'payment' transaction with
--    reference_id = order id.
-- 4. Insufficient balance: same call on a wallet below the price -> raises
--    'Saldo WiraPay tidak mencukupi', NO order row created, balance
--    unchanged.
-- 5. Cancel the order from (3) via wallet_refund_matched_ride -> balance
--    back to the pre-(3) value exactly (same amount charged and refunded).
-- 6. Cash / transfer order via plain INSERT with payment_status='unpaid'
--    still succeeds; a driver can still accept it (status/driver_id update)
--    and complete it.
