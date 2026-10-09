-- Migration 0118: Android tester sign-ups from the wira.one landing page.
--
-- The Android apps are in Google Play closed testing, so a visitor who taps
-- "Unduh aplikasi" > Android leaves their Gmail; an admin adds it to the
-- Play Console tester list ("tim wira") and ticks it off in admin > Rilis
-- aplikasi.
--   * tester_signups: email (unique, lower-case), apps wanted, added flag.
--   * request_tester_access(p_email, p_apps): anyone (anon included); checks
--     the address, ignores a repeat. Visitors cannot read the list.
--   * Core admins read and tick rows (RLS on admin_can('core')).
--
-- Depends on 0102 (admin_can). Re-runnable.

CREATE TABLE IF NOT EXISTS public.tester_signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    apps TEXT NOT NULL DEFAULT 'both' CHECK (apps IN ('user', 'mitra', 'both')),
    added BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS tester_signups_email_key ON public.tester_signups (lower(email));

ALTER TABLE public.tester_signups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tester_signups FROM anon, authenticated;
GRANT SELECT, UPDATE (added) ON public.tester_signups TO authenticated;
DROP POLICY IF EXISTS tester_signups_admin_read ON public.tester_signups;
CREATE POLICY tester_signups_admin_read ON public.tester_signups FOR SELECT USING (public.admin_can('core'));
DROP POLICY IF EXISTS tester_signups_admin_update ON public.tester_signups;
CREATE POLICY tester_signups_admin_update ON public.tester_signups FOR UPDATE
    USING (public.admin_can('core')) WITH CHECK (public.admin_can('core'));

CREATE OR REPLACE FUNCTION public.request_tester_access(p_email TEXT, p_apps TEXT DEFAULT 'both')
RETURNS BOOLEAN AS $$
DECLARE
    v_email TEXT := lower(trim(COALESCE(p_email, '')));
BEGIN
    IF length(v_email) > 200 OR v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN
        RAISE EXCEPTION 'Alamat email tidak valid' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.tester_signups (email, apps)
    VALUES (v_email, CASE WHEN p_apps IN ('user', 'mitra', 'both') THEN p_apps ELSE 'both' END)
    ON CONFLICT ((lower(email))) DO NOTHING;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.request_tester_access(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_tester_access(TEXT, TEXT) TO anon, authenticated;
