-- =========================================
-- Migration 0134: WiraPay off on the server too, not only in the apps
-- =========================================
-- WiraPay has been hidden in every app since 2026-10-08 (Google Play
-- rejected wallet features for an individual developer account), but the
-- database still let a signed-in customer spend a balance by calling the
-- RPCs directly: wallet_pay, wallet_transfer, submit_review_and_tip,
-- create_order_and_pay (charge_wallet_for_order), respond_order_adjustment
-- and the project payments. Together with the Midtrans webhook that accepted
-- the placeholder key (switched off in backend/server.js, same day) that
-- meant a forged balance could be spent. The owner approved a server-side
-- switch on 2026-10-14.
--
-- Rule: while app setting wallet_enabled is not true, a request made by a
-- signed-in user who is not an admin may not LOWER anyone's
-- users.wallet_balance. Everything else keeps working:
--   * QRIS per order: approve_topup_and_credit -> pay_order_after_qris_topup
--     credits and then debits the wallet, but it runs from the Mutasiku
--     webhook (service role, no auth.uid()) or from an admin in Keuangan.
--   * pg_cron jobs (no auth.uid()), e.g. renew_pool_subscriptions.
--   * Credits (QRIS refunds land in the wallet; the admin pays them back by
--     hand), admin corrections, migrations run in the SQL Editor.
-- Partner payable_balance and payouts are not touched.
--
-- wallet_enabled is read from app_settings (absent = off). It is not in
-- admin_set_app_setting's list on purpose: turning WiraPay on again needs the
-- owner (it blocks Google Play publishing).
--
-- Verify:
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.users'::regclass AND tgname = 'trg_users_wallet_switch';
--   -- as a signed-in customer with balance: SELECT wallet_pay(1000, 'x');  -> 'WiraPay sedang tidak aktif...'
-- =========================================

CREATE OR REPLACE FUNCTION public.wallet_enabled()
RETURNS BOOLEAN AS $$
    SELECT COALESCE((SELECT value FROM public.app_settings WHERE key = 'wallet_enabled') = 'true'::jsonb, false);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.enforce_wallet_switch()
RETURNS TRIGGER AS $$
BEGIN
    IF COALESCE(NEW.wallet_balance, 0) < COALESCE(OLD.wallet_balance, 0)
       AND auth.uid() IS NOT NULL
       AND NOT public.is_admin()
       AND NOT public.wallet_enabled() THEN
        RAISE EXCEPTION 'WiraPay sedang tidak aktif. Bayar tunai atau QRIS per pesanan.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.enforce_wallet_switch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_users_wallet_switch ON public.users;
CREATE TRIGGER trg_users_wallet_switch
    BEFORE UPDATE OF wallet_balance ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.enforce_wallet_switch();
