-- =========================================
-- 0110: security follow-ups (review 2026-10-07)
--
--   * Orders a customer inserts directly (PostgREST) must be cash. WiraPay
--     and QRIS orders are created by their own functions
--     (create_order_and_pay 0070, create_order_awaiting_qris 0077, as
--     'wallet'; both run as the caller and mark their insert with
--     wira.wallet_checkout, which PostgREST clients cannot set). Until now a hand-made
--     request could still insert payment_method 'transfer' (no screen
--     offers it): on completion the partner was credited their share as if
--     Wira held the money, which it never received. No such order exists
--     (checked 2026-10-07: 30 cash, 7 wallet).
--   * commission-proofs read policy (0109) called is_admin_panel() for
--     every object in every bucket, and anon cannot execute it: signed-out
--     storage reads errored in all buckets. anon may now call it (always false).
-- Depends on 0100, 0109.
-- =========================================

CREATE OR REPLACE FUNCTION public.enforce_order_payment_method()
RETURNS TRIGGER AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon')
       AND COALESCE(NEW.payment_method, 'cash') <> 'cash'
       AND NOT (NEW.payment_method = 'wallet' AND current_setting('wira.wallet_checkout', true) IS NOT DISTINCT FROM 'on')
       AND NOT public.is_admin_panel() THEN
        RAISE EXCEPTION 'Metode pembayaran % tidak didukung untuk pesanan ini', NEW.payment_method
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public; -- invoker: current_user is the caller's role
DROP TRIGGER IF EXISTS trg_enforce_order_payment_method ON public.orders;
CREATE TRIGGER trg_enforce_order_payment_method BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.enforce_order_payment_method();

-- is_admin_panel() only answers "is the signed-in user an admin", so anon
-- may call it too (it returns false); then no storage policy can error.
GRANT EXECUTE ON FUNCTION public.is_admin_panel() TO anon;

-- Verify (anon key): storage.from('avatars').list('') -> no error.
