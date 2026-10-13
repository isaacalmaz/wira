-- =========================================
-- 0127: keep pg_cron's run history small
--
-- Found in the launch check (2026-10-13): cron.job_run_details had 201,694
-- rows since 2026-09-25 (137 MB of the 164 MB database), growing ~13,000
-- rows (~9 MB) a day because the dispatch and push ticks run every 15-20
-- seconds. The Supabase free plan allows 500 MB; at this rate the database
-- would hit it in about five weeks and turn read-only (no orders, no logins).
--
-- Only pg_cron's own log is touched; no app data. A daily job keeps three
-- days of history (enough to debug a failed job), and the first run below
-- clears the backlog now. Space is reused by Postgres afterwards; the file
-- size itself shrinks after Supabase's autovacuum or a VACUUM FULL.
-- =========================================

DELETE FROM cron.job_run_details WHERE end_time < NOW() - INTERVAL '3 days';

SELECT cron.unschedule('wira-cron-history-cleanup')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wira-cron-history-cleanup');

SELECT cron.schedule(
    'wira-cron-history-cleanup',
    '30 3 * * *',
    $$DELETE FROM cron.job_run_details WHERE end_time < NOW() - INTERVAL '3 days'$$
);

-- Verify: SELECT count(*), min(start_time) FROM cron.job_run_details;  -> oldest within 3 days
--         SELECT jobname, schedule FROM cron.job WHERE jobname = 'wira-cron-history-cleanup';
