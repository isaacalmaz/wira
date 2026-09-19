-- =============================================================================
-- Migration 0059: server-side order price computation
-- =============================================================================
-- Closes the gap flagged (deliberately deferred, not silently missed) in
-- migrations/0051 and 0054: `orders.total_price` has been 100% client-
-- supplied for every one of the six service types since day one — nothing
-- server-side ever recomputed or verified it against real fare/menu data,
-- so a customer could always pay whatever number their own browser sent,
-- and that same number drives real money (the wallet debit via wallet_pay,
-- and 20%-commission driver/merchant payouts via
-- credit_payout_on_order_completed, migrations/0028).
--
-- THE FIX
-- --------
-- A BEFORE INSERT trigger on public.orders that recomputes total_price (and,
-- for WiraFood, delivery_fee) from real, trusted data for each service_type,
-- using the structured input columns added in 0058
-- (rate_code/distance_meters/nights/promo_code) plus the food cart already
-- stored in orders.metadata->'items'. The server-computed value always wins
-- over whatever the client sent - this was confirmed with the user rather
-- than assumed: a checkout should never hard-fail just because a client's
-- cached price estimate went stale (e.g. an admin changed a rate seconds
-- earlier), so the trigger silently corrects total_price to the true value
-- instead of rejecting the insert on a mismatch.
--
-- Per service_type:
--   - ride: public.vehicles (by rate_code = vehicles.type) + distance_meters,
--     replicating RidePage.jsx's exact formula: base_price + CEIL(GREATEST(0,
--     distance_km - 2) * per_km_rate).
--   - send / service / pool: public.pricing_rules (0057) by
--     (service_type, rate_code) - flat base_price, no distance involved
--     (matches today's real behavior for these three; none of them use
--     distance in their current pricing).
--   - food: subtotal recomputed by re-reading each cart line's REAL price
--     from public.products (never trusting metadata's own cached price),
--     multiplied by the item's qty. delivery_fee recomputed from
--     pricing_rules('food_delivery','default') x distance_meters when a
--     distance is given.
--   - villa: public.merchants.price_per_night x nights.
--
-- Promo discounts are re-validated against the real public.promos row for
-- every service_type via compute_promo_discount() - a client can still name
-- a promo_code, but the discount only ever comes from actually looking it
-- up (active, not expired, not exhausted), never from a client-supplied
-- discount amount.
--
-- TRANSITION WINDOW: if a given service_type's required structured column(s)
-- are NULL (the customer's client hasn't been updated to this migration's
-- companion frontend changes yet), this trigger leaves total_price
-- completely untouched for that one order rather than zeroing it out or
-- rejecting it - the protection activates per-order as soon as the
-- corresponding frontend change ships, not instantly for every in-flight
-- session. WiraFood is the one exception: since RestaurantPage.jsx already
-- populates metadata.items today (no frontend change needed for that part),
-- its subtotal verification is active immediately; only its delivery_fee
-- recomputation waits on distance_meters being populated.
--
-- An invalid rate_code / nonexistent product / missing villa price DOES
-- raise an exception and reject the insert outright - unlike a stale price
-- estimate, these indicate a request that could never have come from the
-- real app UI (a tampered or malformed rate_code), so failing loudly is
-- correct there.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.compute_promo_discount(
    p_service_type TEXT, p_promo_code TEXT, p_base NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
    v_promo_type TEXT;
    v_promo_discount NUMERIC;
    v_amount NUMERIC := 0;
BEGIN
    IF p_promo_code IS NULL OR p_base IS NULL OR p_base <= 0 THEN
        RETURN 0;
    END IF;

    SELECT type, discount INTO v_promo_type, v_promo_discount
    FROM public.promos
    WHERE code = p_promo_code
      AND (service_type = p_service_type OR service_type IS NULL)
      AND status = 'Active'
      AND ("validUntil" IS NULL OR "validUntil" >= CURRENT_DATE)
      AND (usage_limit IS NULL OR usage < usage_limit)
    LIMIT 1;

    IF NOT FOUND THEN
        -- Unknown, inactive, expired, or exhausted promo_code: silently no
        -- discount rather than an error - a stale/invalidated promo on the
        -- client shouldn't block checkout, it should just not apply.
        RETURN 0;
    END IF;

    IF v_promo_type = 'Percentage' THEN
        v_amount := ROUND(p_base * v_promo_discount / 100.0);
    ELSE
        v_amount := v_promo_discount;
    END IF;

    RETURN GREATEST(0, LEAST(v_amount, p_base));
END;
$$ LANGUAGE plpgsql STABLE;

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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_orders_price_computation ON public.orders;
CREATE TRIGGER trg_enforce_orders_price_computation
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_orders_price_computation();

-- ============================================================
-- Verification — run after applying (and again after the companion
-- frontend changes are deployed, since several checks below only bite once
-- the six checkout pages actually populate rate_code/distance_meters/nights)
-- ============================================================
-- 1. Food (active immediately, no frontend change needed): insert an order
--    with service_type='food', metadata={'items':[{'id':'<real product
--    id>','qty':2}]}, and an absurd total_price like 1 - the row's actual
--    total_price after insert should be the real product.price * 2, not 1.
-- 2. Ride: once RidePage.jsx sends rate_code + distance_meters, insert an
--    order with rate_code='motor', distance_meters=5000, total_price=1 -
--    resulting total_price should be 12000 + CEIL(3km * 3000) = 21000 (or
--    whatever vehicles/motor's live price/per_km_rate are), not 1.
-- 3. Send/Service/Pool: same shape, rate_code from pricing_rules.
-- 4. Villa: nights + merchant_id set, price_per_night pulled from the real
--    merchants row.
-- 5. Invalid rate_code (e.g. 'nonexistent') should raise an exception and
--    reject the insert entirely, for ride/send/service/pool.
-- 6. A real, currently-valid promo_code should reduce total_price by the
--    correct amount; an expired/wrong-service_type/usage-exhausted one
--    should be silently ignored (order still succeeds, at full price).
-- 7. Regression: every real checkout flow (ride/food/send/villa/service/
--    pool) end-to-end, both before and after the companion frontend deploy,
--    should still successfully create an order.
-- =============================================================================
