-- Migration 0073: run driver dispatch (0072) every 15 seconds via pg_cron,
-- so pings continue after the customer closes the app.
--
-- BEFORE running this file, once, in the SQL Editor (NOT committed to git):
--   select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'dispatch_cron_secret');
-- then copy the value from
--   select decrypted_secret from vault.decrypted_secrets where name = 'dispatch_cron_secret';
-- into the wira-backend Vercel env var DISPATCH_CRON_SECRET and redeploy.
--
-- The job only calls the backend when an order is actually due
-- (dispatch_due_orders), so idle ticks cost no HTTP request. Re-running this
-- file is safe: cron.schedule() with an existing name updates that job.
-- To stop it:  select cron.unschedule('wira-dispatch-tick');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
    'wira-dispatch-tick',
    '15 seconds',
    $cron$
    SELECT net.http_post(
        url := 'https://wira-backend-seven.vercel.app/api/dispatch/tick',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-dispatch-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                                  WHERE name = 'dispatch_cron_secret')
        ),
        body := '{}'::jsonb
    )
    WHERE EXISTS (SELECT 1 FROM public.dispatch_due_orders(1));
    $cron$
);
