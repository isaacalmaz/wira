-- Migration 0105: Android app releases and update prompts.
--
-- The APKs are installed from the Wira website, not Google Play, so the
-- apps have to learn about new versions themselves:
--   * app_releases: one row per published APK (app 'user' | 'mitra' |
--     'admin', versionName, versionCode, download URL, notes, mandatory).
--     Public read: the apps check it on launch and show "Versi baru
--     tersedia" (mandatory = must update), and wira.one/unduh lists the
--     latest download for each app.
--   * Storage bucket "apk" (public read, core admins upload) holds the
--     files; the admin "Rilis Aplikasi" page uploads there.
--   * admin_publish_release(...): core admins; versionCode must go up;
--     optionally announces the release to the app's users (0103 rules,
--     5 per hour); logged in admin_audit_log.
-- Screen-only changes no longer need an APK at all (live update bundles,
-- frontend-*/scripts/live-bundle.mjs); this is for native changes.
--
-- Depends on 0101 (log_admin_action), 0102 (admin_can), 0103. Re-runnable.

CREATE TABLE IF NOT EXISTS public.app_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app TEXT NOT NULL CHECK (app IN ('user', 'mitra', 'admin')),
    version_name TEXT NOT NULL,
    version_code INT NOT NULL CHECK (version_code > 0),
    download_url TEXT NOT NULL,
    file_size BIGINT,
    notes TEXT,
    mandatory BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (app, version_code)
);
ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_releases_read ON public.app_releases;
CREATE POLICY app_releases_read ON public.app_releases FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.app_releases FROM anon, authenticated;
GRANT SELECT ON public.app_releases TO anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('apk', 'apk', true, 104857600)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 104857600;
DROP POLICY IF EXISTS "apk_public_read" ON storage.objects;
CREATE POLICY "apk_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'apk');
DROP POLICY IF EXISTS "apk_admin_insert" ON storage.objects;
CREATE POLICY "apk_admin_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'apk' AND public.admin_can('core'));
DROP POLICY IF EXISTS "apk_admin_delete" ON storage.objects;
CREATE POLICY "apk_admin_delete" ON storage.objects FOR DELETE USING (bucket_id = 'apk' AND public.admin_can('core'));

CREATE OR REPLACE FUNCTION public.admin_publish_release(
    p_app TEXT, p_version_name TEXT, p_version_code INT, p_download_url TEXT,
    p_notes TEXT DEFAULT NULL, p_mandatory BOOLEAN DEFAULT false, p_file_size BIGINT DEFAULT NULL,
    p_announce BOOLEAN DEFAULT false
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_last INT;
    v_name TEXT := CASE p_app WHEN 'user' THEN 'Wira' WHEN 'mitra' THEN 'Wira Mitra' ELSE 'Wira Admin' END;
BEGIN
    IF NOT public.admin_can('core') THEN
        RAISE EXCEPTION 'Khusus admin inti' USING ERRCODE = '42501';
    END IF;
    IF p_app NOT IN ('user', 'mitra', 'admin') THEN
        RAISE EXCEPTION 'Aplikasi tidak dikenal: %', p_app;
    END IF;
    IF length(btrim(COALESCE(p_version_name, ''))) = 0 OR p_version_code IS NULL OR p_version_code < 1 THEN
        RAISE EXCEPTION 'Isi nama versi dan nomor build';
    END IF;
    IF COALESCE(p_download_url, '') !~ '^https://' THEN
        RAISE EXCEPTION 'Tautan unduhan harus https://';
    END IF;
    SELECT MAX(version_code) INTO v_last FROM public.app_releases WHERE app = p_app;
    IF v_last IS NOT NULL AND p_version_code <= v_last THEN
        RAISE EXCEPTION 'Nomor build harus lebih besar dari rilis terakhir (%)', v_last;
    END IF;
    INSERT INTO public.app_releases (app, version_name, version_code, download_url, file_size, notes, mandatory, created_by)
    VALUES (p_app, btrim(p_version_name), p_version_code, p_download_url, p_file_size,
            NULLIF(btrim(COALESCE(p_notes, '')), ''), COALESCE(p_mandatory, false), auth.uid())
    RETURNING id INTO v_id;
    PERFORM public.log_admin_action('release_published', 'app_release', v_id::text, NULL, p_notes,
                                    jsonb_build_object('app', p_app, 'version', p_version_name, 'code', p_version_code, 'mandatory', p_mandatory));
    IF p_announce AND p_app IN ('user', 'mitra') THEN
        PERFORM public.admin_send_announcement(
            CASE p_app WHEN 'user' THEN 'customers' ELSE 'partners' END,
            'Versi baru ' || v_name || ' tersedia',
            'Versi ' || btrim(p_version_name) || CASE WHEN p_mandatory THEN ' wajib dipasang' ELSE '' END
            || '. Unduh di wira.one/unduh.' || COALESCE(' ' || left(NULLIF(btrim(p_notes), ''), 180), ''));
    END IF;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_publish_release(TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, BIGINT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_release(TEXT, TEXT, INT, TEXT, TEXT, BOOLEAN, BIGINT, BOOLEAN) TO authenticated;

-- Verify after applying:
--   SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'apk';  -> public, 100 MB
