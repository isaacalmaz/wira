-- Migration 0103: announcements to a whole group, by push (stage 4 of the
-- admin overhaul).
--
-- The admin "WhatsApp" page could only open wa.me one person at a time,
-- and kept its history in that admin's browser. Now an admin writes one
-- announcement for a segment and every account in it gets an in-app
-- notification, pushed to their phone through the 0094 pipeline:
--   customers  every customer account
--   partners   every partner (driver, restaurant, villa, technician)
--   driver / merchant / villa / technician   one kind of partner
--   everyone   customers and partners
-- Staff and suspended accounts are left out. History lives in
-- announcements; each send is in admin_audit_log. To keep this from
-- turning into spam: at most 5 announcements per hour across all admins.
--
-- Core admins and CS may send (admin_can('support'), 0102). Depends on
-- 0094, 0096, 0101, 0102. Re-runnable.

CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    recipients INT NOT NULL DEFAULT 0,
    sent_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS announcements_created_idx ON public.announcements (created_at DESC);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS announcements_read ON public.announcements;
CREATE POLICY announcements_read ON public.announcements FOR SELECT USING (public.admin_can('panel'));
REVOKE ALL ON public.announcements FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.announcements FROM authenticated;
GRANT SELECT ON public.announcements TO authenticated;

-- Who is in a segment (internal).
CREATE OR REPLACE FUNCTION public.announcement_recipients(p_segment TEXT)
RETURNS TABLE (user_id UUID, is_partner BOOLEAN) AS $$
    SELECT u.id,
           jsonb_typeof(u.mitra_access) = 'array' AND jsonb_array_length(u.mitra_access) > 0
    FROM public.users u
    WHERE COALESCE(u.status, 'Aktif') <> 'Diblokir'
      AND COALESCE(u.role, 'user') NOT IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops', 'Admin Keuangan', 'CS')
      AND CASE p_segment
            WHEN 'customers' THEN COALESCE(u.role, 'user') = 'user'
            WHEN 'partners' THEN jsonb_typeof(u.mitra_access) = 'array' AND jsonb_array_length(u.mitra_access) > 0
            WHEN 'everyone' THEN true
            WHEN 'driver' THEN COALESCE(u.mitra_access, '[]'::jsonb) ? 'driver'
            WHEN 'merchant' THEN COALESCE(u.mitra_access, '[]'::jsonb) ? 'merchant'
            WHEN 'villa' THEN COALESCE(u.mitra_access, '[]'::jsonb) ? 'villa'
            WHEN 'technician' THEN COALESCE(u.mitra_access, '[]'::jsonb) ? 'technician'
            ELSE false
          END;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.announcement_recipients(TEXT) FROM PUBLIC, anon, authenticated;

-- Size of every segment, and how many can get a push (have a phone token).
CREATE OR REPLACE FUNCTION public.admin_announcement_audience()
RETURNS JSONB AS $$
DECLARE
    v JSONB := '{}'::jsonb;
    s TEXT;
BEGIN
    IF NOT public.admin_can('support') THEN
        RAISE EXCEPTION 'Khusus admin' USING ERRCODE = '42501';
    END IF;
    FOREACH s IN ARRAY ARRAY['everyone', 'customers', 'partners', 'driver', 'merchant', 'villa', 'technician'] LOOP
        v := v || jsonb_build_object(s, (
            SELECT jsonb_build_object('count', COUNT(*),
                                      'push', COUNT(*) FILTER (WHERE u.fcm_token IS NOT NULL AND u.fcm_token <> ''))
            FROM public.announcement_recipients(s) r JOIN public.users u ON u.id = r.user_id));
    END LOOP;
    RETURN v;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_announcement_audience() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_announcement_audience() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_send_announcement(p_segment TEXT, p_title TEXT, p_body TEXT)
RETURNS JSONB AS $$
DECLARE
    v_title TEXT := btrim(COALESCE(p_title, ''));
    v_body TEXT := btrim(COALESCE(p_body, ''));
    v_id UUID;
    v_n INT;
BEGIN
    IF NOT public.admin_can('support') THEN
        RAISE EXCEPTION 'Khusus admin' USING ERRCODE = '42501';
    END IF;
    IF p_segment NOT IN ('everyone', 'customers', 'partners', 'driver', 'merchant', 'villa', 'technician') THEN
        RAISE EXCEPTION 'Segmen tidak dikenal: %', p_segment;
    END IF;
    IF length(v_title) NOT BETWEEN 3 AND 80 THEN
        RAISE EXCEPTION 'Judul 3-80 karakter';
    END IF;
    IF length(v_body) NOT BETWEEN 5 AND 300 THEN
        RAISE EXCEPTION 'Isi 5-300 karakter';
    END IF;
    IF (SELECT COUNT(*) FROM public.announcements WHERE created_at > NOW() - INTERVAL '1 hour') >= 5 THEN
        RAISE EXCEPTION 'Sudah 5 pengumuman dalam satu jam terakhir. Tunggu sebentar agar pengguna tidak merasa di-spam.';
    END IF;

    INSERT INTO public.announcements (segment, title, body, sent_by)
    VALUES (p_segment, v_title, v_body, auth.uid()) RETURNING id INTO v_id;

    INSERT INTO public.notifications (user_id, title, description, is_read, link)
    SELECT r.user_id, v_title, v_body, false, CASE WHEN r.is_partner AND p_segment <> 'customers' THEN '/' ELSE '/notifications' END
    FROM public.announcement_recipients(p_segment) r;
    GET DIAGNOSTICS v_n = ROW_COUNT;

    UPDATE public.announcements SET recipients = v_n WHERE id = v_id;
    PERFORM public.log_admin_action('announcement_sent', 'announcement', v_id::text, NULL, v_title,
                                    jsonb_build_object('segment', p_segment, 'recipients', v_n, 'body', v_body));
    RETURN jsonb_build_object('id', v_id, 'recipients', v_n);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_send_announcement(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_send_announcement(TEXT, TEXT, TEXT) TO authenticated;

-- Verify after applying (as an admin, from the app): admin_announcement_audience()
