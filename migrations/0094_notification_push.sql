-- Migration 0094: every in-app notification also reaches the phone.
--
-- Rows in public.notifications (new projects, quotes, extra charges, stage
-- payouts, reviews, auto-cancelled orders, ...) only showed in the app's
-- bell, so a partner with the app closed never heard about new work.
-- Now pg_cron calls the backend (POST /api/push/tick, same secret as the
-- dispatch tick in 0073) every 20 seconds while there is something unsent;
-- the backend claims the rows here and sends them through Firebase Cloud
-- Messaging to users.fcm_token.
--
-- Existing notifications are marked as sent so nobody gets the backlog.
-- Depends on 0073 (pg_cron, pg_net, vault secret dispatch_cron_secret).
-- Re-runnable.

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ;
UPDATE public.notifications SET pushed_at = NOW() WHERE pushed_at IS NULL AND created_at < NOW() - INTERVAL '5 minutes';
CREATE INDEX IF NOT EXISTS notifications_unpushed_idx ON public.notifications (created_at) WHERE pushed_at IS NULL;

-- Marks up to p_limit unsent notifications as sent and returns the ones
-- worth pushing (recipient has a token, created within the last hour).
CREATE OR REPLACE FUNCTION public.claim_notification_pushes(p_limit INT DEFAULT 50)
RETURNS TABLE (id UUID, user_id UUID, title TEXT, description TEXT, fcm_token TEXT, is_partner BOOLEAN) AS $$
    WITH picked AS (
        SELECT n.id FROM public.notifications n
        WHERE n.pushed_at IS NULL
        ORDER BY n.created_at
        LIMIT LEAST(GREATEST(p_limit, 1), 200)
        FOR UPDATE SKIP LOCKED
    ), marked AS (
        UPDATE public.notifications n SET pushed_at = NOW()
        FROM picked WHERE n.id = picked.id
        RETURNING n.id, n.user_id, n.title, n.description, n.created_at
    )
    SELECT m.id, m.user_id, m.title::text, m.description::text, u.fcm_token::text,
           jsonb_typeof(u.mitra_access) = 'array' AND jsonb_array_length(u.mitra_access) > 0
    FROM marked m
    JOIN public.users u ON u.id = m.user_id
    WHERE u.fcm_token IS NOT NULL AND u.fcm_token <> ''
      AND m.created_at > NOW() - INTERVAL '1 hour';
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.claim_notification_pushes(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_pushes(INT) TO service_role;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wira-notification-push') THEN
        PERFORM cron.unschedule('wira-notification-push');
    END IF;
END $$;

SELECT cron.schedule(
    'wira-notification-push',
    '20 seconds',
    $cron$
    SELECT net.http_post(
        url := 'https://wira-backend-seven.vercel.app/api/push/tick',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-dispatch-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                                  WHERE name = 'dispatch_cron_secret')
        ),
        body := '{}'::jsonb
    )
    WHERE EXISTS (SELECT 1 FROM public.notifications WHERE pushed_at IS NULL);
    $cron$
);

-- Verify after applying (and after the backend deploy):
--   SELECT jobname, schedule FROM cron.job WHERE jobname = 'wira-notification-push';
--   Insert a test notification for your own account and watch it arrive:
--   INSERT INTO notifications (user_id, title, description, is_read)
--   VALUES ('<your user id>', 'Tes notifikasi', 'Push dari Wira', false);
