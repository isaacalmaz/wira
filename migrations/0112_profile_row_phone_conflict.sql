-- =========================================
-- 0112: 0111's profile row, also when the phone number is already taken
--
-- public.users.phone is unique. 0111 used ON CONFLICT DO NOTHING, so an
-- account whose sign-up phone already belonged to another profile still
-- got no row (4 test accounts sharing one number; a real person
-- re-registering with their old number would hit the same). Now the row
-- is created without the phone in that case; they can add it in Profil.
-- Depends on 0111.
-- =========================================

CREATE OR REPLACE FUNCTION public.ensure_profile_row(p_id UUID, p_email TEXT, p_phone TEXT, p_meta JSONB)
RETURNS VOID AS $$
DECLARE
    v_name TEXT := COALESCE(NULLIF(btrim(p_meta ->> 'name'), ''), NULLIF(split_part(COALESCE(p_email, ''), '@', 1), ''), 'Pengguna');
    v_phone TEXT := NULLIF(btrim(COALESCE(p_meta ->> 'phone', p_phone, '')), '');
BEGIN
    IF EXISTS (SELECT 1 FROM public.users WHERE id = p_id) THEN
        RETURN;
    END IF;
    IF v_phone IS NOT NULL AND EXISTS (SELECT 1 FROM public.users WHERE phone = v_phone) THEN
        v_phone := NULL;
    END IF;
    IF p_email IS NOT NULL AND EXISTS (SELECT 1 FROM public.users WHERE lower(email) = lower(p_email)) THEN
        p_email := NULL;
    END IF;
    INSERT INTO public.users (id, name, email, phone, role, status)
    VALUES (p_id, v_name, p_email, v_phone, 'user', 'Aktif')
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.ensure_profile_row(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.ensure_profile_row(NEW.id, NEW.email, NEW.phone, NEW.raw_user_meta_data);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Never block a sign-up because of the profile row.
    RAISE WARNING 'handle_new_auth_user(%): %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

SELECT public.ensure_profile_row(a.id, a.email, a.phone, a.raw_user_meta_data)
FROM auth.users a
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id)
  AND COALESCE(a.email, '') NOT LIKE 'deleted-%@deleted.wira.invalid'
ORDER BY a.created_at;

-- Verify:
--   SELECT count(*) FROM auth.users a WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id);  -- 0
