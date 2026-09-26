-- Migration 0085: copy the legacy mitra application list into
-- mitra_applications (0084), delete it from feature_flags, and make every
-- feature_flags write admin-only again (0053/0055 had opened
-- region='mitra_registrations' to everyone, anon included).
-- Apply right after 0084, in the same session.

INSERT INTO public.mitra_applications (auth_id, role, status, name, phone, email, vehicle,
    plate, vehicle_type, job_type_preferences, sim_photo, restaurant_name, address,
    service_type, specialization, experience, admin_notes, reviewed_at, legacy_id, created_at)
SELECT
    CASE WHEN e->>'auth_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN (e->>'auth_id')::uuid END,
    COALESCE(e->>'role', 'driver'), COALESCE(e->>'status', 'Pending'),
    e->>'name', e->>'phone', e->>'email', e->>'vehicle', e->>'plate', e->>'vehicle_type',
    NULLIF(e->'job_type_preferences', 'null'::jsonb), e->>'sim_photo', e->>'restaurant_name',
    e->>'address', e->>'service_type', e->>'specialization', e->>'experience', e->>'admin_notes',
    CASE WHEN e->>'reviewed_at' ~ '^\d{4}-\d{2}-\d{2}' THEN (e->>'reviewed_at')::timestamptz END,
    e->>'id',
    CASE WHEN e->>'created_at' ~ '^\d{4}-\d{2}-\d{2}' THEN (e->>'created_at')::timestamptz ELSE NOW() END
FROM public.feature_flags f,
     jsonb_array_elements(CASE WHEN jsonb_typeof(f.features) = 'array' THEN f.features ELSE '[]'::jsonb END)
         WITH ORDINALITY AS x(e, n)
WHERE f.region = 'mitra_registrations'
  AND jsonb_typeof(e) = 'object'
  AND NOT EXISTS (SELECT 1 FROM public.mitra_applications a WHERE a.legacy_id = e->>'id')
-- The list is newest first: inserting in list order keeps the newest pending
-- entry per account/role and skips older duplicates (one-pending index).
ORDER BY n
ON CONFLICT DO NOTHING;

DELETE FROM public.feature_flags WHERE region = 'mitra_registrations';

DROP POLICY IF EXISTS "feature_flags_insert" ON public.feature_flags;
CREATE POLICY "feature_flags_insert" ON public.feature_flags
FOR INSERT WITH CHECK (is_admin());
DROP POLICY IF EXISTS "feature_flags_update" ON public.feature_flags;
CREATE POLICY "feature_flags_update" ON public.feature_flags
FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.feature_flags FROM anon;

-- Admin sidebar/layout badge listens for new applications via realtime.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
                       AND schemaname = 'public' AND tablename = 'mitra_applications') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.mitra_applications;
    END IF;
END $$;

-- Verify after applying:
--   SELECT count(*) FROM mitra_applications;            -- legacy entries copied
--   SELECT * FROM feature_flags WHERE region = 'mitra_registrations';  -- 0 rows
-- With the anon key: GET /rest/v1/mitra_applications?select=id -> permission denied.
