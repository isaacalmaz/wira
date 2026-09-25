-- =============================================================================
-- Migration 0076: count promo usage in the DB at order creation + per_user_limit
-- =============================================================================
-- THE BUG: checkout pages called increment_promo_usage (0046, granted to all
-- authenticated users) from the browser, fire-and-forget, AFTER creating the
-- order: anyone could loop it to exhaust a promo's usage_limit for everyone;
-- one account could reuse a code without limit; a failed call never counted.
-- THE FIX: promos.per_user_limit (NULL = unlimited, existing promos unchanged)
-- and a BEFORE INSERT trigger on orders, SECURITY INVOKER, gated exactly like
-- 0059's price trigger (current_user authenticated/anon + pricing inputs
-- present), so it runs exactly when 0059 applied the promo - for plain client
-- INSERTs and create_order_and_pay (0070, INVOKER) alike, in the INSERT's own
-- transaction. It calls consume_promo_for_order (SECURITY DEFINER: promos
-- UPDATE is admin-only under 0046's RLS, so clients never write `usage`),
-- which raises when pg_trigger_depth() = 0, so calling it as an RPC burns
-- nothing. One guarded UPDATE (usage < usage_limit) takes the row lock, so two
-- concurrent orders cannot both get the last slot; still holding it, the
-- user's non-cancelled orders with the code are counted vs per_user_limit.
-- Exhausted / per-user limit -> RAISE (no order) instead of 0059's silent "no
-- discount": the customer was shown the discounted price and addOrder + every
-- checkout page toast err.message, so "remove the code and retry" beats
-- silently charging (or debiting WiraPay) full price. Unknown/expired/
-- inactive/wrong-service codes are still ignored silently, as in 0059.
-- Not refunded on cancel (never was); cancelled orders skip per_user_limit.
-- DEPLOY: apply BEFORE the frontend deploy. Old frontend + 0076: its leftover
-- increment_promo_usage call gets "permission denied", which it only logs
-- (order already created), so no double count. New frontend without 0076:
-- nothing counted, and saving per_user_limit in the admin page fails.
-- =============================================================================

ALTER TABLE public.promos ADD COLUMN IF NOT EXISTS per_user_limit INTEGER;
ALTER TABLE public.promos DROP CONSTRAINT IF EXISTS promos_per_user_limit_positive;
ALTER TABLE public.promos ADD CONSTRAINT promos_per_user_limit_positive
    CHECK (per_user_limit IS NULL OR per_user_limit > 0);

REVOKE ALL ON FUNCTION public.increment_promo_usage(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_promo_usage(UUID) TO service_role;
CREATE OR REPLACE FUNCTION public.consume_promo_for_order(
    p_promo_code TEXT, p_service_type TEXT, p_user_id UUID
) RETURNS VOID AS $$
DECLARE v_id UUID; v_per_user INTEGER;
BEGIN
    IF pg_trigger_depth() = 0 THEN RAISE EXCEPTION 'Only callable from the orders trigger'; END IF;
    SELECT id INTO v_id FROM public.promos -- = compute_promo_discount's match, minus usage
    WHERE code = p_promo_code AND (service_type = p_service_type OR service_type IS NULL)
      AND status = 'Active' AND ("validUntil" IS NULL OR "validUntil" >= CURRENT_DATE)
      AND COALESCE(discount, 0) > 0 LIMIT 1;
    IF NOT FOUND THEN RETURN; END IF; -- 0059 applied no discount either
    UPDATE public.promos SET usage = COALESCE(usage, 0) + 1
    WHERE id = v_id AND (usage_limit IS NULL OR COALESCE(usage, 0) < usage_limit)
    RETURNING per_user_limit INTO v_per_user;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Kuota promo % sudah habis. Hapus kode promo lalu pesan lagi.', p_promo_code;
    END IF;
    IF v_per_user IS NOT NULL AND (
        SELECT count(*) FROM public.orders
        WHERE user_id = p_user_id AND promo_code = p_promo_code
          AND status IS DISTINCT FROM 'cancelled') >= v_per_user THEN
        RAISE EXCEPTION 'Promo % sudah Anda gunakan sebanyak batas maksimal. Hapus kode promo lalu pesan lagi.', p_promo_code;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.consume_promo_for_order(TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_promo_for_order(TEXT, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_orders_promo_usage() RETURNS TRIGGER AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') AND NEW.promo_code IS NOT NULL AND COALESCE(
        (NEW.service_type = 'ride' AND NEW.rate_code IS NOT NULL AND NEW.distance_meters IS NOT NULL)
        OR (NEW.service_type IN ('send', 'service', 'pool') AND NEW.rate_code IS NOT NULL)
        OR (NEW.service_type = 'food' AND NEW.metadata ? 'items')
        OR (NEW.service_type = 'villa' AND NEW.nights >= 1 AND NEW.merchant_id IS NOT NULL), false)
    THEN
        PERFORM public.consume_promo_for_order(NEW.promo_code, NEW.service_type, NEW.user_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_orders_promo_usage ON public.orders;
CREATE TRIGGER trg_orders_promo_usage BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_orders_promo_usage();

-- VERIFY (rollback-only DO block, WIRA_HANDOFF 6.8), as a customer: order with
-- a usage_limit=1 promo -> discounted, usage +1; next order -> 'Kuota promo ...
-- sudah habis', no row. per_user_limit=1 -> own 2nd order refused, other user
-- OK. create_order_and_pay -> usage +1, discounted price charged. RPC
-- increment_promo_usage -> permission denied; consume_promo_for_order ->
-- raises; UPDATE promos SET usage = 0 -> 0 rows.
