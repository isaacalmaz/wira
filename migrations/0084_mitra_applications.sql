-- Migration 0084: move mitra applications out of public feature_flags (security fix).
-- Every mitra application (name, phone, email, address, plate, SIM/STNK photo)
-- lived in ONE JSON list in feature_flags.region='mitra_registrations', and
-- 0055 lets anyone - anon included - SELECT every feature_flags row and
-- INSERT/UPDATE that one: all applicants' PII was public, and anyone could
-- rewrite or wipe the queue. Its read-modify-write also lost applications
-- sent at the same moment.
-- Now: one row per application in mitra_applications, readable only by the
-- applicant and admins, writable only by admins; applicants submit through
-- submit_mitra_application(). The legacy list is copied over and deleted.
-- ORDER: deploy the frontend first (it falls back to the old list while this
-- function is missing), THEN apply this.

CREATE TABLE IF NOT EXISTS public.mitra_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id UUID, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pending',
    name TEXT, phone TEXT, email TEXT, vehicle TEXT, plate TEXT, vehicle_type TEXT,
    job_type_preferences JSONB, sim_photo TEXT, restaurant_name TEXT, address TEXT,
    service_type TEXT, specialization TEXT, experience TEXT,
    admin_notes TEXT, reviewed_at TIMESTAMPTZ, legacy_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS mitra_applications_one_pending
    ON public.mitra_applications (auth_id, role) WHERE status = 'Pending';
ALTER TABLE public.mitra_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mitra_applications FROM anon;
REVOKE INSERT ON public.mitra_applications FROM authenticated;
DROP POLICY IF EXISTS "mitra_applications_select" ON public.mitra_applications;
CREATE POLICY "mitra_applications_select" ON public.mitra_applications
FOR SELECT USING (auth_id = auth.uid() OR is_admin());
DROP POLICY IF EXISTS "mitra_applications_admin_update" ON public.mitra_applications;
CREATE POLICY "mitra_applications_admin_update" ON public.mitra_applications
FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "mitra_applications_admin_delete" ON public.mitra_applications;
CREATE POLICY "mitra_applications_admin_delete" ON public.mitra_applications
FOR DELETE USING (is_admin());

-- Submits (or replaces the applicant's own pending) application for a role.
-- p_auth_id is only used without a session, i.e. right after signUp when
-- email confirmation is on: accepted for an account created < 1 hour ago
-- that has no application yet.
CREATE OR REPLACE FUNCTION public.submit_mitra_application(p_application JSONB, p_auth_id UUID DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_role TEXT := p_application->>'role';
    v_id UUID;
BEGIN
    IF v_uid IS NULL THEN
        SELECT u.id INTO v_uid FROM auth.users u
        WHERE u.id = p_auth_id AND u.created_at > NOW() - INTERVAL '1 hour'
          AND NOT EXISTS (SELECT 1 FROM public.mitra_applications a WHERE a.auth_id = u.id);
        IF v_uid IS NULL THEN RAISE EXCEPTION 'Silakan login terlebih dahulu.'; END IF;
    END IF;
    IF v_role IS NULL OR v_role NOT IN ('driver', 'merchant', 'villa', 'technician') THEN
        RAISE EXCEPTION 'Jenis mitra tidak valid: %', v_role;
    END IF;
    IF length(COALESCE(p_application->>'sim_photo', '')) > 3000000 THEN
        RAISE EXCEPTION 'Foto dokumen terlalu besar.';
    END IF;
    DELETE FROM public.mitra_applications WHERE auth_id = v_uid AND role = v_role AND status = 'Pending';
    INSERT INTO public.mitra_applications (auth_id, role, name, phone, email, vehicle, plate,
        vehicle_type, job_type_preferences, sim_photo, restaurant_name, address, service_type,
        specialization, experience)
    SELECT v_uid, v_role, a->>'name', a->>'phone', (SELECT u.email FROM auth.users u WHERE u.id = v_uid),
        a->>'vehicle', a->>'plate', a->>'vehicle_type', NULLIF(a->'job_type_preferences', 'null'::jsonb),
        a->>'sim_photo', a->>'restaurant_name', a->>'address', a->>'service_type',
        a->>'specialization', a->>'experience'
    FROM (SELECT p_application AS a) s
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.submit_mitra_application(JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_mitra_application(JSONB, UUID) TO anon, authenticated;

-- Technician specialization/experience shown to customers (ServicePage).
CREATE OR REPLACE FUNCTION public.get_technician_profiles()
RETURNS TABLE (id UUID, specialization TEXT, experience TEXT) AS $$
    SELECT DISTINCT ON (a.auth_id) a.auth_id, a.specialization, a.experience
    FROM public.mitra_applications a
    WHERE a.role = 'technician' AND a.auth_id IS NOT NULL AND a.status <> 'Rejected'
    ORDER BY a.auth_id, a.created_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_technician_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_technician_profiles() TO anon, authenticated;
