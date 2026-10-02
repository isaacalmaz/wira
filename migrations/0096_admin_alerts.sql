-- Migration 0096: admins are told about things that need them.
--
-- Pushes (through 0094's pipeline) go to every admin account when:
--   * a new partner application arrives (driver, restaurant, villa,
--     technician)                                       -> /drivers etc.
--   * a customer objects to a project stage (Wira holds the money until an
--     admin decides)                                    -> /projects
--   * a review of 1-2 stars comes in                    -> /reviews
--   * a partner asks to withdraw their balance (finance roles too)
--                                                       -> /finance
--   * an order gets stuck (same rule as admin_stale_orders, once per
--     order; pg_cron every 10 minutes)                  -> /orders
-- notifications.link (new) is the page a tapped notification opens; the
-- push tick sends it along. Re-runnable. Depends on 0088, 0089, 0091,
-- 0093, 0094.

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stale_alerted_at TIMESTAMPTZ;

-- 0094's claim, now also returning the link.
DROP FUNCTION IF EXISTS public.claim_notification_pushes(INT);
CREATE FUNCTION public.claim_notification_pushes(p_limit INT DEFAULT 50)
RETURNS TABLE (id UUID, user_id UUID, title TEXT, description TEXT, fcm_token TEXT, is_partner BOOLEAN, link TEXT) AS $$
    WITH picked AS (
        SELECT n.id FROM public.notifications n
        WHERE n.pushed_at IS NULL
        ORDER BY n.created_at
        LIMIT LEAST(GREATEST(p_limit, 1), 200)
        FOR UPDATE SKIP LOCKED
    ), marked AS (
        UPDATE public.notifications n SET pushed_at = NOW()
        FROM picked WHERE n.id = picked.id
        RETURNING n.id, n.user_id, n.title, n.description, n.created_at, n.link
    )
    SELECT m.id, m.user_id, m.title::text, m.description::text, u.fcm_token::text,
           jsonb_typeof(u.mitra_access) = 'array' AND jsonb_array_length(u.mitra_access) > 0,
           m.link::text
    FROM marked m
    JOIN public.users u ON u.id = m.user_id
    WHERE u.fcm_token IS NOT NULL AND u.fcm_token <> ''
      AND m.created_at > NOW() - INTERVAL '1 hour';
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.claim_notification_pushes(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_pushes(INT) TO service_role;

-- One notification per admin account. p_finance adds 'Admin Keuangan'.
CREATE OR REPLACE FUNCTION public.notify_admins(p_title TEXT, p_description TEXT, p_link TEXT, p_finance BOOLEAN DEFAULT false)
RETURNS VOID AS $$
    INSERT INTO public.notifications (user_id, title, description, is_read, link)
    SELECT u.id, p_title, p_description, false, p_link
    FROM public.users u
    WHERE u.role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops')
       OR (p_finance AND u.role = 'Admin Keuangan');
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.notify_admins(TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- New partner application.
CREATE OR REPLACE FUNCTION public.alert_admins_application()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'Pending' THEN
        PERFORM public.notify_admins(
            'Pendaftaran mitra baru',
            COALESCE(NEW.name, 'Calon mitra') || ' mendaftar sebagai '
            || CASE NEW.role WHEN 'driver' THEN 'driver' WHEN 'merchant' THEN 'restoran'
                             WHEN 'villa' THEN 'villa' WHEN 'technician' THEN 'teknisi' ELSE NEW.role END
            || '. Tinjau dan setujui.',
            CASE NEW.role WHEN 'driver' THEN '/drivers' WHEN 'merchant' THEN '/merchants'
                          WHEN 'villa' THEN '/villas' WHEN 'technician' THEN '/technicians' ELSE '/users' END);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_alert_admins_application ON public.mitra_applications;
CREATE TRIGGER trg_alert_admins_application AFTER INSERT ON public.mitra_applications
    FOR EACH ROW EXECUTE FUNCTION public.alert_admins_application();

-- Project stage objection.
CREATE OR REPLACE FUNCTION public.alert_admins_dispute()
RETURNS TRIGGER AS $$
DECLARE
    v_title TEXT;
BEGIN
    IF NEW.status = 'disputed' AND OLD.status IS DISTINCT FROM 'disputed' THEN
        SELECT title INTO v_title FROM public.projects WHERE id = NEW.project_id;
        PERFORM public.notify_admins(
            'Keberatan proyek perlu diputuskan',
            COALESCE(v_title, 'Proyek') || ': ' || NEW.label || ' (' || public.format_rupiah(NEW.amount) || ' ditahan).',
            '/projects');
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_alert_admins_dispute ON public.project_milestones;
CREATE TRIGGER trg_alert_admins_dispute AFTER UPDATE OF status ON public.project_milestones
    FOR EACH ROW EXECUTE FUNCTION public.alert_admins_dispute();

-- Low review.
CREATE OR REPLACE FUNCTION public.alert_admins_low_review()
RETURNS TRIGGER AS $$
DECLARE
    v_partner TEXT;
BEGIN
    IF NEW.rating <= 2 THEN
        SELECT name INTO v_partner FROM public.users WHERE id = NEW.driver_id;
        IF v_partner IS NULL THEN
            SELECT name INTO v_partner FROM public.merchants WHERE id = NEW.merchant_id;
        END IF;
        PERFORM public.notify_admins(
            'Ulasan buruk: ' || repeat('★', NEW.rating),
            COALESCE(v_partner, 'Mitra') || COALESCE(': "' || left(NEW.review_text, 120) || '"', '') || '. Periksa dan hubungi bila perlu.',
            '/reviews');
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_alert_admins_low_review ON public.reviews;
CREATE TRIGGER trg_alert_admins_low_review AFTER INSERT ON public.reviews
    FOR EACH ROW EXECUTE FUNCTION public.alert_admins_low_review();

-- Withdrawal request (finance roles included).
CREATE OR REPLACE FUNCTION public.alert_admins_payout()
RETURNS TRIGGER AS $$
DECLARE
    v_name TEXT;
BEGIN
    IF NEW.status = 'pending' THEN
        SELECT name INTO v_name FROM public.users WHERE id = NEW.user_id;
        PERFORM public.notify_admins(
            'Permintaan pencairan',
            COALESCE(v_name, 'Mitra') || ' meminta ' || public.format_rupiah(NEW.amount) || ' ke ' || NEW.payout_method || '.',
            '/finance', true);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_alert_admins_payout ON public.payout_requests;
CREATE TRIGGER trg_alert_admins_payout AFTER INSERT ON public.payout_requests
    FOR EACH ROW EXECUTE FUNCTION public.alert_admins_payout();

-- Stuck orders, once each (same thresholds as admin_stale_orders, 0089).
CREATE OR REPLACE FUNCTION public.alert_stale_orders()
RETURNS INT AS $$
DECLARE
    r RECORD;
    n INT := 0;
BEGIN
    FOR r IN
        SELECT o.id, o.title, o.service_type, o.status
        FROM public.orders o
        WHERE o.stale_alerted_at IS NULL
          AND o.status NOT IN ('pending', 'awaiting_payment', 'completed', 'cancelled', 'expired')
          AND COALESCE(o.service_type, '') <> 'villa'
          AND CASE
                WHEN o.service_type IN ('service', 'pool') AND o.scheduled_at IS NOT NULL
                    THEN NOW() > o.scheduled_at + INTERVAL '12 hours'
                WHEN o.service_type IN ('service', 'pool')
                    THEN o.status_changed_at < NOW() - INTERVAL '48 hours'
                ELSE o.status_changed_at < NOW() - INTERVAL '60 minutes'
              END
        FOR UPDATE SKIP LOCKED
    LOOP
        UPDATE public.orders SET stale_alerted_at = NOW() WHERE id = r.id;
        n := n + 1;
    END LOOP;
    IF n > 0 THEN
        PERFORM public.notify_admins(
            CASE WHEN n = 1 THEN 'Ada pesanan macet' ELSE n || ' pesanan macet' END,
            'Statusnya tidak bergerak terlalu lama. Selesaikan atau batalkan di halaman Orders.',
            '/orders');
    END IF;
    RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.alert_stale_orders() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule('wira-stale-order-alerts', '*/10 * * * *', 'SELECT public.alert_stale_orders()');
    END IF;
END $$;

-- Verify after applying (and after the backend deploy):
--   SELECT jobname FROM cron.job WHERE jobname = 'wira-stale-order-alerts';
--   SELECT public.notify_admins('Tes notifikasi admin', 'Push dari Wira', '/dashboard');
--   -> every admin signed in on a device with notifications allowed gets it.
