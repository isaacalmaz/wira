-- Migration 0092: technician profiles, partner directory and identity
-- checks (technician rebuild phase 3).
--
--   * KYC: a technician application must carry a KTP photo and a selfie
--     (mitra_applications.ktp_photo / selfie_photo, readable only by the
--     applicant and admins, like the drivers' SIM photo). An admin marks the
--     technician verified (technician_profiles.verified_at/by); only then
--     does the "Terverifikasi" badge show.
--   * Profile: the technician writes a bio (<= 500), picks service areas
--     and languages, and keeps a portfolio of up to 12 photos with captions
--     (technician_portfolio, bucket "portfolio", public read, owner write).
--     Skills and verification stay admin-only.
--   * Directory: list_service_technicians gains an area filter and the
--     profile fields; get_technician_profile returns one technician.
--
-- Depends on 0089, 0091. Re-runnable.

-- ---------------------------------------------------------------------------
-- 1. Profile fields
-- ---------------------------------------------------------------------------
ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS service_areas TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS languages TEXT[] NOT NULL DEFAULT '{id}';
ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE public.technician_profiles ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.users(id);

-- Lombok areas a technician can serve, and the languages they speak.
CREATE OR REPLACE FUNCTION public.service_area_list()
RETURNS TEXT[] AS $$
    SELECT ARRAY['Mataram', 'Lombok Barat', 'Senggigi', 'Lombok Utara', 'Gili', 'Lombok Tengah', 'Kuta Mandalika', 'Lombok Timur'];
$$ LANGUAGE sql IMMUTABLE;
CREATE OR REPLACE FUNCTION public.language_list()
RETURNS TEXT[] AS $$ SELECT ARRAY['id', 'sasak', 'en']; $$ LANGUAGE sql IMMUTABLE;

GRANT UPDATE (bio, service_areas, languages) ON public.technician_profiles TO authenticated;

-- 0089's guard plus: skills and verification are admin-only; areas,
-- languages and bio are validated.
CREATE OR REPLACE FUNCTION public.guard_technician_profile_update()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND current_user IN ('authenticated', 'anon') AND NOT is_admin() AND (
        NEW.skills IS DISTINCT FROM OLD.skills
        OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
        OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
    ) THEN
        RAISE EXCEPTION 'Keahlian dan verifikasi teknisi hanya bisa diubah oleh admin';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(NEW.skills) c
               WHERE NOT EXISTS (SELECT 1 FROM public.service_skills s WHERE s.code = c)) THEN
        RAISE EXCEPTION 'Kode keahlian tidak dikenal';
    END IF;
    IF NOT (COALESCE(NEW.service_areas, '{}') <@ public.service_area_list()) THEN
        RAISE EXCEPTION 'Wilayah layanan tidak dikenal';
    END IF;
    IF NOT (COALESCE(NEW.languages, '{}') <@ public.language_list()) THEN
        RAISE EXCEPTION 'Bahasa tidak dikenal';
    END IF;
    NEW.bio := NULLIF(btrim(COALESCE(NEW.bio, '')), '');
    IF length(NEW.bio) > 500 THEN
        RAISE EXCEPTION 'Bio maksimal 500 huruf';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_set_technician_verified(p_user_id UUID, p_verified BOOLEAN)
RETURNS VOID AS $$
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Hanya admin yang bisa memverifikasi teknisi' USING ERRCODE = '42501';
    END IF;
    UPDATE public.technician_profiles
    SET verified_at = CASE WHEN p_verified THEN NOW() END,
        verified_by = CASE WHEN p_verified THEN auth.uid() END
    WHERE user_id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profil teknisi tidak ditemukan';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_set_technician_verified(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_technician_verified(UUID, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Portfolio
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('portfolio', 'portfolio', true)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "portfolio_public_read" ON storage.objects;
CREATE POLICY "portfolio_public_read" ON storage.objects
FOR SELECT USING (bucket_id = 'portfolio');
DROP POLICY IF EXISTS "portfolio_owner_insert" ON storage.objects;
CREATE POLICY "portfolio_owner_insert" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'portfolio' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "portfolio_owner_delete" ON storage.objects;
CREATE POLICY "portfolio_owner_delete" ON storage.objects
FOR DELETE USING (bucket_id = 'portfolio' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE TABLE IF NOT EXISTS public.technician_portfolio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    caption TEXT CHECK (caption IS NULL OR length(caption) <= 120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS technician_portfolio_user_idx ON public.technician_portfolio (user_id, created_at);
ALTER TABLE public.technician_portfolio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS technician_portfolio_select ON public.technician_portfolio;
CREATE POLICY technician_portfolio_select ON public.technician_portfolio
    FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS technician_portfolio_insert ON public.technician_portfolio;
CREATE POLICY technician_portfolio_insert ON public.technician_portfolio
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND public.is_active_partner(auth.uid(), 'technician')
        AND position('/storage/v1/object/public/portfolio/' || auth.uid()::text || '/' IN image_url) > 0
    );
DROP POLICY IF EXISTS technician_portfolio_update ON public.technician_portfolio;
CREATE POLICY technician_portfolio_update ON public.technician_portfolio
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS technician_portfolio_delete ON public.technician_portfolio;
CREATE POLICY technician_portfolio_delete ON public.technician_portfolio
    FOR DELETE USING (user_id = auth.uid() OR is_admin());
REVOKE ALL ON public.technician_portfolio FROM anon;
REVOKE UPDATE ON public.technician_portfolio FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.technician_portfolio TO authenticated;
GRANT UPDATE (caption) ON public.technician_portfolio TO authenticated;

CREATE OR REPLACE FUNCTION public.limit_technician_portfolio()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM public.technician_portfolio WHERE user_id = NEW.user_id) >= 12 THEN
        RAISE EXCEPTION 'Portofolio maksimal 12 foto';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_limit_technician_portfolio ON public.technician_portfolio;
CREATE TRIGGER trg_limit_technician_portfolio BEFORE INSERT ON public.technician_portfolio
    FOR EACH ROW EXECUTE FUNCTION public.limit_technician_portfolio();

-- ---------------------------------------------------------------------------
-- 3. KYC on the application
-- ---------------------------------------------------------------------------
ALTER TABLE public.mitra_applications ADD COLUMN IF NOT EXISTS ktp_photo TEXT;
ALTER TABLE public.mitra_applications ADD COLUMN IF NOT EXISTS selfie_photo TEXT;

-- 0089 body plus the KTP and selfie photos (required for technicians).
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
    IF length(COALESCE(p_application->>'sim_photo', '')) > 3000000
       OR length(COALESCE(p_application->>'ktp_photo', '')) > 3000000
       OR length(COALESCE(p_application->>'selfie_photo', '')) > 3000000 THEN
        RAISE EXCEPTION 'Foto dokumen terlalu besar.';
    END IF;
    -- 0092: technicians verify identity with a KTP photo and a selfie.
    IF v_role = 'technician' AND (
        COALESCE(p_application->>'ktp_photo', '') NOT LIKE 'data:image/%'
        OR COALESCE(p_application->>'selfie_photo', '') NOT LIKE 'data:image/%'
    ) THEN
        RAISE EXCEPTION 'Lampirkan foto KTP dan foto selfie Anda.';
    END IF;
    DELETE FROM public.mitra_applications WHERE auth_id = v_uid AND role = v_role AND status = 'Pending';
    INSERT INTO public.mitra_applications (auth_id, role, name, phone, email, vehicle, plate,
        vehicle_type, job_type_preferences, sim_photo, restaurant_name, address, service_type,
        specialization, experience, skills, ktp_photo, selfie_photo)
    SELECT v_uid, v_role, a->>'name', a->>'phone', (SELECT u.email FROM auth.users u WHERE u.id = v_uid),
        a->>'vehicle', a->>'plate', a->>'vehicle_type', NULLIF(a->'job_type_preferences', 'null'::jsonb),
        a->>'sim_photo', a->>'restaurant_name', a->>'address', a->>'service_type',
        a->>'specialization', a->>'experience',
        CASE WHEN v_role = 'technician' AND jsonb_typeof(a->'skills') = 'array'
             THEN public.clean_skill_codes(ARRAY(SELECT jsonb_array_elements_text(a->'skills'))) END,
        CASE WHEN v_role = 'technician' THEN a->>'ktp_photo' END,
        CASE WHEN v_role = 'technician' THEN a->>'selfie_photo' END
    FROM (SELECT p_application AS a) s
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.submit_mitra_application(JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_mitra_application(JSONB, UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Directory
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_service_technicians(TEXT);
DROP FUNCTION IF EXISTS public.list_service_technicians(TEXT, TEXT);
CREATE FUNCTION public.list_service_technicians(p_skill TEXT DEFAULT NULL, p_area TEXT DEFAULT NULL)
RETURNS TABLE (
    id UUID, name TEXT, avatar_url TEXT, skills TEXT[],
    experience_years INT, jobs_completed INT,
    rating_avg NUMERIC, rating_count INT, top_rated BOOLEAN,
    service_areas TEXT[], languages TEXT[], verified BOOLEAN, bio TEXT, member_since TIMESTAMPTZ
) AS $$
    WITH prior AS (
        SELECT COALESCE(AVG(r.rating), 4.5) AS m
        FROM public.reviews r
        JOIN public.technician_profiles tp ON tp.user_id = r.driver_id
        WHERE NOT r.is_hidden
    ), base AS (
        SELECT u.id, u.name::text AS name, u.avatar_url::text AS avatar_url, t.skills,
               NULLIF(substring(regexp_replace(COALESCE(app.experience, ''), '\D', '', 'g') FROM 1 FOR 2), '')::INT AS experience_years,
               (SELECT COUNT(*)::INT FROM public.orders o
                WHERE o.driver_id = u.id AND o.status = 'completed' AND o.service_type IN ('service', 'pool')) AS jobs_completed,
               pr.rating_avg, pr.rating_count, pr.top_rated,
               (SELECT COALESCE(SUM(r.rating), 0) FROM public.reviews r WHERE r.driver_id = u.id AND NOT r.is_hidden) AS star_sum,
               t.service_areas, t.languages, (t.verified_at IS NOT NULL) AS verified, t.bio, t.created_at AS member_since
        FROM public.technician_profiles t
        JOIN public.users u ON u.id = t.user_id
        LEFT JOIN LATERAL public.partner_rating(u.id) pr ON true
        LEFT JOIN LATERAL (
            SELECT a.experience FROM public.mitra_applications a
            WHERE a.auth_id = u.id AND a.role = 'technician'
            ORDER BY a.created_at DESC LIMIT 1
        ) app ON true
        WHERE public.is_active_partner(u.id, 'technician')
          AND cardinality(t.skills) > 0
          AND (p_skill IS NULL OR p_skill = ANY (t.skills))
          AND (p_area IS NULL OR p_area = ANY (t.service_areas))
    )
    SELECT b.id, b.name, b.avatar_url, b.skills, b.experience_years, b.jobs_completed,
           b.rating_avg, b.rating_count, COALESCE(b.top_rated, false),
           b.service_areas, b.languages, b.verified, b.bio, b.member_since
    FROM base b, prior p
    ORDER BY b.verified DESC, (5 * p.m + b.star_sum) / (5 + b.rating_count) DESC, b.jobs_completed DESC, b.name;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.list_service_technicians(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_service_technicians(TEXT, TEXT) TO authenticated;


-- One technician for the profile page (same fields; empty when the
-- technician is not active).
DROP FUNCTION IF EXISTS public.get_technician_profile(UUID);
CREATE FUNCTION public.get_technician_profile(p_user_id UUID)
RETURNS TABLE (
    id UUID, name TEXT, avatar_url TEXT, skills TEXT[],
    experience_years INT, jobs_completed INT,
    rating_avg NUMERIC, rating_count INT, top_rated BOOLEAN,
    service_areas TEXT[], languages TEXT[], verified BOOLEAN, bio TEXT, member_since TIMESTAMPTZ
) AS $$
    SELECT * FROM public.list_service_technicians(NULL, NULL) l WHERE l.id = p_user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_technician_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_technician_profile(UUID) TO authenticated;

-- Verify after applying:
--   SELECT id FROM storage.buckets WHERE id = 'portfolio';  -> 1 row
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'mitra_applications' AND column_name IN ('ktp_photo', 'selfie_photo');  -> 2 rows
