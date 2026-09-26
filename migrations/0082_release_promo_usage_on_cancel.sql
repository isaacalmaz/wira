-- Migration 0082: give a promo use back when its order is cancelled/expired.
-- 0076 counts a use at order INSERT but never returned it: every order
-- cancelled (customer, driver, admin, 0078's QRIS expiry) burned a slot.
-- orders.promo_code alone can't say whether a use was taken: 0059 keeps the
-- code even when it gave no discount (unknown/expired/wrong-service code),
-- 0076 skips service_role/admin inserts and orders without pricing inputs,
-- and an admin may edit promo_code later. So 0076's BEFORE INSERT trigger now
-- records the promo it actually consumed in orders.promo_usage_id
-- (consume_promo_for_order returns that id instead of VOID; matching is
-- unchanged: exact, case-sensitive code, as in 0059/0076). A client-supplied
-- value is always overwritten, and a BEFORE UPDATE guard keeps the column
-- frozen for everyone and clears it once the order is cancelled.
-- trg_orders_promo_release (AFTER UPDATE, status -> 'cancelled', a use held)
-- then does usage - 1 (never below 0) on exactly that promo, once: the
-- marker is gone afterwards, so re-cancelling, admin un-cancel + cancel, or
-- editing other columns can't release twice. Pre-0082 orders have no marker
-- and release nothing (never over-release). Apply after 0076.

-- No FK: ON DELETE SET NULL would UPDATE finalized orders (0070 rejects).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promo_usage_id UUID;

DROP FUNCTION IF EXISTS public.consume_promo_for_order(TEXT, TEXT, UUID);
CREATE FUNCTION public.consume_promo_for_order(
    p_promo_code TEXT, p_service_type TEXT, p_user_id UUID
) RETURNS UUID AS $$
DECLARE v_id UUID; v_per_user INTEGER;
BEGIN
    IF pg_trigger_depth() = 0 THEN RAISE EXCEPTION 'Only callable from the orders trigger'; END IF;
    SELECT id INTO v_id FROM public.promos -- = compute_promo_discount's match, minus usage
    WHERE code = p_promo_code AND (service_type = p_service_type OR service_type IS NULL)
      AND status = 'Active' AND ("validUntil" IS NULL OR "validUntil" >= CURRENT_DATE)
      AND COALESCE(discount, 0) > 0 LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF; -- 0059 applied no discount either
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
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.consume_promo_for_order(TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_promo_for_order(TEXT, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_orders_promo_usage() RETURNS TRIGGER AS $$
BEGIN
    NEW.promo_usage_id := NULL; -- only this trigger may set it
    IF current_user IN ('authenticated', 'anon') AND NEW.promo_code IS NOT NULL AND COALESCE(
        (NEW.service_type = 'ride' AND NEW.rate_code IS NOT NULL AND NEW.distance_meters IS NOT NULL)
        OR (NEW.service_type IN ('send', 'service', 'pool') AND NEW.rate_code IS NOT NULL)
        OR (NEW.service_type = 'food' AND NEW.metadata ? 'items')
        OR (NEW.service_type = 'villa' AND NEW.nights >= 1 AND NEW.merchant_id IS NOT NULL), false)
    THEN
        NEW.promo_usage_id := public.consume_promo_for_order(NEW.promo_code, NEW.service_type, NEW.user_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.guard_orders_promo_usage_id() RETURNS TRIGGER AS $$
BEGIN
    NEW.promo_usage_id := CASE WHEN NEW.status = 'cancelled' THEN NULL ELSE OLD.promo_usage_id END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_orders_promo_usage_guard ON public.orders;
CREATE TRIGGER trg_orders_promo_usage_guard BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_orders_promo_usage_id();

CREATE OR REPLACE FUNCTION public.release_promo_on_order_cancel() RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.promos SET usage = GREATEST(COALESCE(usage, 0) - 1, 0) WHERE id = OLD.promo_usage_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.release_promo_on_order_cancel(), public.guard_orders_promo_usage_id()
    FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_orders_promo_release ON public.orders;
CREATE TRIGGER trg_orders_promo_release AFTER UPDATE ON public.orders
FOR EACH ROW WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled'
    AND OLD.promo_code IS NOT NULL AND OLD.promo_usage_id IS NOT NULL)
EXECUTE FUNCTION public.release_promo_on_order_cancel();
