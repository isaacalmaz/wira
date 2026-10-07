-- =========================================
-- 0111: every sign-in account has a public.users row
--
-- Found in the end-to-end test (2026-10-07): the profile row was only
-- ever inserted by the customer app right after signUp
-- (frontend-user AuthContext.register). When that insert did not happen
-- (old partner sign-ups from September, or no session yet because the
-- email still needed confirming), the account could sign in but every
-- order failed on orders_user_id_fkey and the WiraPay balance never
-- loaded. 6 of 28 accounts were affected.
--
--   * handle_new_auth_user(): AFTER INSERT ON auth.users creates the row
--     (role 'user', status 'Aktif', name/phone from the sign-up metadata).
--     The app's own insert still runs and now just finds the row there.
--   * Backfill: the same row for every existing account that lacks one
--     (deleted accounts excluded, see 0106).
-- =========================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, name, email, phone, role, status)
    VALUES (
        NEW.id,
        COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'name'), ''), split_part(COALESCE(NEW.email, ''), '@', 1), 'Pengguna'),
        NEW.email,
        NULLIF(btrim(COALESCE(NEW.raw_user_meta_data ->> 'phone', NEW.phone, '')), ''),
        'user',
        'Aktif'
    )
    ON CONFLICT DO NOTHING;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Never block a sign-up because of the profile row.
    RAISE WARNING 'handle_new_auth_user(%): %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_handle_new_auth_user ON auth.users;
CREATE TRIGGER trg_handle_new_auth_user AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

INSERT INTO public.users (id, name, email, phone, role, status)
SELECT a.id,
       COALESCE(NULLIF(btrim(a.raw_user_meta_data ->> 'name'), ''), split_part(COALESCE(a.email, ''), '@', 1), 'Pengguna'),
       a.email,
       NULLIF(btrim(COALESCE(a.raw_user_meta_data ->> 'phone', a.phone, '')), ''),
       'user',
       'Aktif'
FROM auth.users a
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id)
  AND COALESCE(a.email, '') NOT LIKE 'deleted-%@deleted.wira.invalid'
ON CONFLICT DO NOTHING;

-- Verify:
--   SELECT count(*) FROM auth.users a WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id);  -- 0
