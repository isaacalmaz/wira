-- ============================================================================
-- 0143: Flexible commission deposits and notification system fixes
-- ============================================================================
-- 1. Commission deposits (submit_commission_deposit):
--    Lowers minimum deposit amount from Rp 10.000 to Rp 1 (allows any amount >= 1
--    and <= Rp 100.000.000) so partners can top up or deposit any amount.
-- 2. Realtime publication:
--    Ensures public.notifications, public.project_messages, and public.mitra_applications
--    are added to the supabase_realtime publication.
-- 3. Push notifications queue worker (claim_notification_pushes):
--    Fixes the premature burning of push notifications: only marks pushed_at for
--    notifications whose recipient actually has an FCM token, while expiring
--    unpushed notifications older than 48 hours.
-- 4. Chat notification triggers:
--    - trg_notify_on_chat_message on public.messages (notifies the order counterparty)
--    - trg_notify_on_project_message on public.project_messages (notifies customer/technician)
-- ============================================================================

-- 1. Allow commission deposit of any positive amount >= 1
CREATE OR REPLACE FUNCTION public.submit_commission_deposit(p_amount NUMERIC, p_proof_path TEXT, p_note TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_id UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Silakan masuk terlebih dahulu' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_uid
                   AND jsonb_typeof(mitra_access) = 'array' AND jsonb_array_length(mitra_access) > 0) THEN
        RAISE EXCEPTION 'Khusus akun mitra' USING ERRCODE = '42501';
    END IF;
    IF p_amount IS NULL OR p_amount < 1 OR p_amount > 100000000 THEN
        RAISE EXCEPTION 'Jumlah setoran Rp 1 sampai Rp 100.000.000';
    END IF;
    IF p_proof_path IS NULL OR split_part(p_proof_path, '/', 1) <> v_uid::text THEN
        RAISE EXCEPTION 'Lampirkan foto bukti transfer';
    END IF;
    IF (SELECT count(*) FROM public.commission_deposits WHERE user_id = v_uid AND status = 'pending') >= 3 THEN
        RAISE EXCEPTION 'Masih ada 3 setoran menunggu dicek admin. Tunggu sebentar, lalu coba lagi.';
    END IF;

    INSERT INTO public.commission_deposits (user_id, amount, proof_path, note)
    VALUES (v_uid, ROUND(p_amount), p_proof_path, NULLIF(btrim(COALESCE(p_note, '')), ''))
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.submit_commission_deposit(NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_commission_deposit(NUMERIC, TEXT, TEXT) TO authenticated;

-- 2. Add public.notifications, public.project_messages, and public.mitra_applications to realtime
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'project_messages') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.project_messages;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'mitra_applications') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.mitra_applications;
    END IF;
END $$;

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.mitra_applications REPLICA IDENTITY FULL;

-- 3. Fix claim_notification_pushes queue worker
DROP FUNCTION IF EXISTS public.claim_notification_pushes(INT);
CREATE OR REPLACE FUNCTION public.claim_notification_pushes(p_limit INT DEFAULT 50)
RETURNS TABLE (id UUID, user_id UUID, title TEXT, description TEXT, fcm_token TEXT, is_partner BOOLEAN, link TEXT) AS $$
BEGIN
    -- Expire notifications older than 48 hours that remained unpushed
    UPDATE public.notifications
    SET pushed_at = NOW()
    WHERE pushed_at IS NULL
      AND created_at < NOW() - INTERVAL '48 hours';

    RETURN QUERY
    WITH picked AS (
        SELECT n.id
        FROM public.notifications n
        JOIN public.users u ON u.id = n.user_id
        WHERE n.pushed_at IS NULL
          AND u.fcm_token IS NOT NULL
          AND u.fcm_token <> ''
          AND n.created_at >= NOW() - INTERVAL '48 hours'
        ORDER BY n.created_at
        LIMIT LEAST(GREATEST(p_limit, 1), 200)
        FOR UPDATE OF n SKIP LOCKED
    ), marked AS (
        UPDATE public.notifications n
        SET pushed_at = NOW()
        FROM picked
        WHERE n.id = picked.id
        RETURNING n.id, n.user_id, n.title, n.description, n.created_at, n.link
    )
    SELECT m.id,
           m.user_id,
           m.title::text,
           m.description::text,
           u.fcm_token::text,
           COALESCE((jsonb_typeof(u.mitra_access) = 'array' AND jsonb_array_length(u.mitra_access) > 0), false) AS is_partner,
           m.link::text
    FROM marked m
    JOIN public.users u ON u.id = m.user_id
    WHERE u.fcm_token IS NOT NULL AND u.fcm_token <> '';
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.claim_notification_pushes(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_pushes(INT) TO service_role;

-- 4. Database triggers for chat notifications

-- 4a. trg_notify_on_chat_message on public.messages
CREATE OR REPLACE FUNCTION public.notify_on_chat_message()
RETURNS TRIGGER AS $$
DECLARE
    v_order public.orders%ROWTYPE;
    v_target_user UUID;
    v_sender_name TEXT;
    v_snippet TEXT;
    v_merchant_owner UUID;
    v_trimmed_text TEXT;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF v_order.merchant_id IS NOT NULL THEN
        SELECT owner_id INTO v_merchant_owner FROM public.merchants WHERE id = v_order.merchant_id;
    END IF;

    SELECT COALESCE(NULLIF(btrim(name), ''), 'Pengguna') INTO v_sender_name
    FROM public.users WHERE id = NEW.sender_id;
    IF v_sender_name IS NULL THEN
        v_sender_name := 'Pengguna';
    END IF;

    v_trimmed_text := btrim(COALESCE(NEW.text, ''));
    IF v_trimmed_text LIKE 'data:image/%' OR v_trimmed_text LIKE 'https://%chat-images%' OR v_trimmed_text LIKE 'chat-images/%' THEN
        v_snippet := '[Foto]';
    ELSE
        v_snippet := COALESCE(NULLIF(left(v_trimmed_text, 100), ''), '[Pesan]');
    END IF;

    -- Notify all distinct counterparties on this order other than the sender
    FOR v_target_user IN
        SELECT DISTINCT u_id FROM unnest(ARRAY[v_order.user_id, v_order.driver_id, v_merchant_owner]) AS u_id
        WHERE u_id IS NOT NULL AND u_id <> NEW.sender_id
    LOOP
        INSERT INTO public.notifications (user_id, title, description, is_read, link)
        VALUES (
            v_target_user,
            'Pesan dari ' || v_sender_name,
            v_snippet,
            false,
            '/active-order/' || NEW.order_id::text
        );
    END LOOP;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_chat_message failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_on_chat_message ON public.messages;
CREATE TRIGGER trg_notify_on_chat_message
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_on_chat_message();

-- 4b. trg_notify_on_project_message on public.project_messages
CREATE OR REPLACE FUNCTION public.notify_on_project_message()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_id UUID;
    v_project_title TEXT;
    v_target_user UUID;
    v_sender_name TEXT;
    v_snippet TEXT;
    v_trimmed_body TEXT;
BEGIN
    SELECT customer_id, title INTO v_customer_id, v_project_title
    FROM public.projects WHERE id = NEW.project_id;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(NULLIF(btrim(name), ''), 'Pengguna') INTO v_sender_name
    FROM public.users WHERE id = NEW.sender_id;
    IF v_sender_name IS NULL THEN
        v_sender_name := 'Pengguna';
    END IF;

    v_trimmed_body := btrim(COALESCE(NEW.body, ''));
    v_snippet := COALESCE(NULLIF(left(v_trimmed_body, 100), ''), '[Pesan]');

    -- Notify counterparty on the project thread
    FOR v_target_user IN
        SELECT DISTINCT u_id FROM unnest(ARRAY[v_customer_id, NEW.technician_id]) AS u_id
        WHERE u_id IS NOT NULL AND u_id <> NEW.sender_id
    LOOP
        INSERT INTO public.notifications (user_id, title, description, is_read, link)
        VALUES (
            v_target_user,
            'Pesan proyek dari ' || v_sender_name,
            v_snippet,
            false,
            '/projects/' || NEW.project_id::text
        );
    END LOOP;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_on_project_message failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_on_project_message ON public.project_messages;
CREATE TRIGGER trg_notify_on_project_message
    AFTER INSERT ON public.project_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_on_project_message();
