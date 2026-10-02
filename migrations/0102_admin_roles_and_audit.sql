-- Migration 0102: who may do what, enforced in the database, and every
-- admin decision on record (stage 3 of the admin overhaul).
--
-- Roles (users.role) and what each may do:
--   Superadmin      everything, and the only role that manages staff
--   admin, Admin Ops everything except managing staff (= is_admin(), 0026)
--   Admin Keuangan  money: payouts, top-ups, wallet corrections; reads
--                   orders, users and the dashboard
--   CS              customers: reads orders (with chat), users, reviews;
--                   answers support tickets; adds order notes (0100)
--
-- Until now the database only knew the first two rows: Admin Keuangan saw
-- the Finance page but every approve/reject silently returned false, and
-- CS saw empty Orders, Users and Support pages. Fixed with admin_can(perm)
-- and read policies for those roles.
--
-- Staff are managed for real: admin_list_staff / admin_set_staff_role
-- (Superadmin only; never yourself; at least one Superadmin stays). The
-- old list in feature_flags was display only.
--
-- Audit (admin_audit_log, 0101) now also records: payouts, top-ups and
-- wallet corrections (inside those functions), staff role changes, and by
-- trigger: hidden/unhidden reviews, project dispute decisions, villa
-- listing reviews, technician verification, support ticket status, order
-- actions (0100), commission changes (0099) and any admin change to prices,
-- vehicles, promos and app settings (with the changed fields).
--
-- Depends on 0015/0022 (top-ups), 0028 (payouts), 0062, 0091, 0093, 0097,
-- 0099, 0100, 0101. Re-runnable.

-- ---------------------------------------------------------------------------
-- 1. Permission check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_can(p_perm TEXT)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
          AND role = ANY (CASE p_perm
              WHEN 'core'    THEN ARRAY['admin', 'Superadmin', 'superadmin', 'Admin Ops']
              WHEN 'finance' THEN ARRAY['admin', 'Superadmin', 'superadmin', 'Admin Ops', 'Admin Keuangan']
              WHEN 'support' THEN ARRAY['admin', 'Superadmin', 'superadmin', 'Admin Ops', 'CS']
              WHEN 'staff'   THEN ARRAY['Superadmin', 'superadmin']
              WHEN 'panel'   THEN ARRAY['admin', 'Superadmin', 'superadmin', 'Admin Ops', 'Admin Keuangan', 'CS']
              ELSE ARRAY[]::TEXT[] END)
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_can(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_can(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Read access for Admin Keuangan and CS (added next to the existing
--    policies, which stay as they are)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS users_select_admin_panel ON public.users;
CREATE POLICY users_select_admin_panel ON public.users FOR SELECT USING (public.admin_can('panel'));

DROP POLICY IF EXISTS orders_select_admin_panel ON public.orders;
CREATE POLICY orders_select_admin_panel ON public.orders FOR SELECT USING (public.admin_can('panel'));

DROP POLICY IF EXISTS messages_select_support ON public.messages;
CREATE POLICY messages_select_support ON public.messages FOR SELECT USING (public.admin_can('support'));

DROP POLICY IF EXISTS transactions_select_finance ON public.transactions;
CREATE POLICY transactions_select_finance ON public.transactions FOR SELECT USING (public.admin_can('finance'));

DROP POLICY IF EXISTS topup_requests_select_finance ON public.topup_requests;
CREATE POLICY topup_requests_select_finance ON public.topup_requests FOR SELECT USING (public.admin_can('finance'));

DROP POLICY IF EXISTS payout_requests_select_finance ON public.payout_requests;
CREATE POLICY payout_requests_select_finance ON public.payout_requests FOR SELECT USING (public.admin_can('finance'));

DROP POLICY IF EXISTS support_tickets_select_support ON public.support_tickets;
CREATE POLICY support_tickets_select_support ON public.support_tickets FOR SELECT USING (public.admin_can('support'));
DROP POLICY IF EXISTS support_tickets_update_support ON public.support_tickets;
CREATE POLICY support_tickets_update_support ON public.support_tickets FOR UPDATE
    USING (public.admin_can('support')) WITH CHECK (public.admin_can('support'));

DROP POLICY IF EXISTS customer_ratings_select_panel ON public.customer_ratings;
CREATE POLICY customer_ratings_select_panel ON public.customer_ratings FOR SELECT USING (public.admin_can('support'));

-- ---------------------------------------------------------------------------
-- 3. Money actions: finance roles, logged, partner/customer told
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_payout_request(request_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    r RECORD;
BEGIN
    IF NOT public.admin_can('finance') THEN
        RAISE EXCEPTION 'Khusus admin keuangan' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO r FROM public.payout_requests WHERE id = request_id FOR UPDATE;
    IF NOT FOUND OR r.status <> 'pending' THEN
        RETURN FALSE;
    END IF;
    -- Money was reserved out of payable_balance at request time (0028);
    -- this confirms the transfer was sent.
    UPDATE public.payout_requests SET status = 'approved', updated_at = NOW() WHERE id = request_id;
    INSERT INTO public.notifications (user_id, title, description, is_read, link)
    VALUES (r.user_id, 'Pencairan dikirim',
            public.format_rupiah(r.amount) || ' sudah ditransfer ke ' || COALESCE(r.payout_method, 'rekening Anda') || '.', false, '/');
    PERFORM public.log_admin_action('payout_approved', 'payout', request_id::text, r.user_id, NULL,
                                    jsonb_build_object('amount', r.amount, 'method', r.payout_method));
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.reject_payout_request(request_id UUID, p_admin_note TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
    r RECORD;
BEGIN
    IF NOT public.admin_can('finance') THEN
        RAISE EXCEPTION 'Khusus admin keuangan' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO r FROM public.payout_requests WHERE id = request_id FOR UPDATE;
    IF NOT FOUND OR r.status <> 'pending' THEN
        RETURN FALSE;
    END IF;
    UPDATE public.payout_requests SET status = 'rejected', admin_note = p_admin_note, updated_at = NOW() WHERE id = request_id;
    UPDATE public.users SET payable_balance = COALESCE(payable_balance, 0) + r.amount WHERE id = r.user_id;
    INSERT INTO public.notifications (user_id, title, description, is_read, link)
    VALUES (r.user_id, 'Pencairan ditolak',
            public.format_rupiah(r.amount) || ' kembali ke saldo pendapatan Anda.'
            || COALESCE(' Alasan: ' || NULLIF(btrim(p_admin_note), ''), ''), false, '/');
    PERFORM public.log_admin_action('payout_rejected', 'payout', request_id::text, r.user_id, p_admin_note,
                                    jsonb_build_object('amount', r.amount, 'method', r.payout_method));
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.approve_topup_request(request_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    r RECORD;
BEGIN
    IF NOT public.admin_can('finance') THEN
        RAISE EXCEPTION 'Khusus admin keuangan' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO r FROM public.topup_requests WHERE id = request_id FOR UPDATE;
    IF NOT FOUND OR r.status <> 'pending' THEN
        RETURN FALSE;
    END IF;
    UPDATE public.topup_requests SET status = 'approved', updated_at = NOW() WHERE id = request_id;
    UPDATE public.users SET wallet_balance = COALESCE(wallet_balance, 0) + r.amount WHERE id = r.user_id;
    INSERT INTO public.transactions (user_id, amount, type, status, description)
    VALUES (r.user_id, r.amount, 'topup', 'success', 'Top Up QRIS Statis');
    PERFORM public.log_admin_action('topup_approved', 'topup', request_id::text, r.user_id, NULL,
                                    jsonb_build_object('amount', r.amount));
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.reject_topup_request(request_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    r RECORD;
BEGIN
    IF NOT public.admin_can('finance') THEN
        RAISE EXCEPTION 'Khusus admin keuangan' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO r FROM public.topup_requests WHERE id = request_id FOR UPDATE;
    IF NOT FOUND OR r.status <> 'pending' THEN
        RETURN FALSE;
    END IF;
    UPDATE public.topup_requests SET status = 'rejected', updated_at = NOW() WHERE id = request_id;
    PERFORM public.log_admin_action('topup_rejected', 'topup', request_id::text, r.user_id, NULL,
                                    jsonb_build_object('amount', r.amount));
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_correction_wallet_balance(p_user_id UUID, p_amount NUMERIC, p_description TEXT DEFAULT NULL)
RETURNS NUMERIC AS $$
DECLARE
    v_new_balance NUMERIC;
BEGIN
    IF NOT public.admin_can('finance') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can perform manual wallet corrections.';
    END IF;
    IF p_amount IS NULL OR p_amount = 0 THEN
        RAISE EXCEPTION 'Correction amount cannot be zero';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'User % not found', p_user_id;
    END IF;
    UPDATE public.users SET wallet_balance = COALESCE(wallet_balance, 0) + p_amount
    WHERE id = p_user_id RETURNING wallet_balance INTO v_new_balance;
    IF v_new_balance < 0 THEN
        RAISE EXCEPTION 'Insufficient balance: correction would result in a negative wallet balance (%).', v_new_balance;
    END IF;
    INSERT INTO public.transactions (user_id, amount, type, status, description, reference_id)
    VALUES (p_user_id, ABS(p_amount),
            CASE WHEN p_amount > 0 THEN 'correction_in' ELSE 'correction_out' END,
            'success', 'KOREKSI ADMIN: ' || COALESCE(NULLIF(TRIM(p_description), ''), '(tanpa catatan)'),
            'admin_correction_' || gen_random_uuid());
    PERFORM public.log_admin_action('wallet_corrected', 'user', p_user_id::text, p_user_id, p_description,
                                    jsonb_build_object('amount', p_amount, 'balance', v_new_balance));
    RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 4. Staff
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_staff()
RETURNS TABLE (id UUID, name TEXT, email TEXT, role TEXT, status TEXT, last_sign_in_at TIMESTAMPTZ, created_at TIMESTAMPTZ) AS $$
BEGIN
    IF NOT public.admin_can('core') THEN
        RAISE EXCEPTION 'Khusus admin inti' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT u.id, u.name::text, u.email::text, u.role::text, COALESCE(u.status, 'Aktif')::text, au.last_sign_in_at, u.created_at
    FROM public.users u
    LEFT JOIN auth.users au ON au.id = u.id
    WHERE u.role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops', 'Admin Keuangan', 'CS')
    ORDER BY CASE u.role WHEN 'Superadmin' THEN 0 WHEN 'superadmin' THEN 0 WHEN 'admin' THEN 1 WHEN 'Admin Ops' THEN 2
                         WHEN 'Admin Keuangan' THEN 3 ELSE 4 END, u.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_list_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_staff() TO authenticated;

-- p_role: a staff role, or 'none' to take staff access away (the account
-- goes back to 'mitra' if it has partner access, else 'user').
CREATE OR REPLACE FUNCTION public.admin_set_staff_role(p_email TEXT, p_role TEXT, p_note TEXT DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
    u RECORD;
    v_role TEXT;
BEGIN
    IF NOT public.admin_can('staff') THEN
        RAISE EXCEPTION 'Hanya Superadmin yang bisa mengatur staf' USING ERRCODE = '42501';
    END IF;
    IF p_role NOT IN ('Superadmin', 'admin', 'Admin Ops', 'Admin Keuangan', 'CS', 'none') THEN
        RAISE EXCEPTION 'Peran tidak dikenal: %', p_role;
    END IF;
    SELECT * INTO u FROM public.users WHERE lower(email) = lower(btrim(p_email)) FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Belum ada akun dengan email %. Minta orangnya mendaftar di aplikasi Wira dulu.', btrim(p_email);
    END IF;
    IF u.id = auth.uid() THEN
        RAISE EXCEPTION 'Tidak bisa mengubah peran akun sendiri';
    END IF;
    v_role := CASE WHEN p_role <> 'none' THEN p_role
                   WHEN jsonb_typeof(u.mitra_access) = 'array' AND jsonb_array_length(u.mitra_access) > 0 THEN 'mitra'
                   ELSE 'user' END;
    IF u.role IN ('Superadmin', 'superadmin') AND v_role <> 'Superadmin'
       AND NOT EXISTS (SELECT 1 FROM public.users WHERE role IN ('Superadmin', 'superadmin') AND id <> u.id) THEN
        RAISE EXCEPTION 'Harus ada minimal satu Superadmin';
    END IF;
    IF u.role = v_role THEN
        RETURN v_role;
    END IF;
    UPDATE public.users SET role = v_role, status = CASE WHEN status = 'Diblokir' THEN status ELSE 'Aktif' END WHERE id = u.id;
    INSERT INTO public.notifications (user_id, title, description, is_read, link)
    VALUES (u.id,
            CASE WHEN p_role = 'none' THEN 'Akses admin dicabut' ELSE 'Akses admin: ' || p_role END,
            CASE WHEN p_role = 'none' THEN 'Akun Anda tidak lagi bisa masuk ke Wira Admin.'
                 ELSE 'Masuk ke admin.wira.one dengan akun ini.' END, false, '/');
    PERFORM public.log_admin_action('staff_role_changed', 'user', u.id::text, u.id, p_note,
                                    jsonb_build_object('from', u.role, 'to', v_role, 'email', u.email));
    RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_set_staff_role(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_staff_role(TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Audit triggers (only writes made by an admin-panel account)
-- ---------------------------------------------------------------------------

-- Prices, vehicles, promos, app settings: what changed, field by field.
CREATE OR REPLACE FUNCTION public.audit_admin_config_change()
RETURNS TRIGGER AS $$
DECLARE
    v_old JSONB := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
    v_new JSONB := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
    v_row JSONB := COALESCE(v_new, v_old);
    v_changes JSONB;
BEGIN
    IF NOT public.admin_can('panel') THEN
        RETURN NULL;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        SELECT jsonb_object_agg(n.key, jsonb_build_array(v_old -> n.key, n.value)) INTO v_changes
        FROM jsonb_each(v_new) n
        WHERE n.key NOT IN ('updated_at', 'created_at') AND (v_old -> n.key) IS DISTINCT FROM n.value;
        IF v_changes IS NULL THEN
            RETURN NULL;
        END IF;
    END IF;
    PERFORM public.log_admin_action(
        TG_TABLE_NAME || '_' || lower(TG_OP), TG_TABLE_NAME,
        COALESCE(v_row ->> 'id', v_row ->> 'region', v_row ->> 'code', '?'), NULL, NULL,
        jsonb_build_object('label', COALESCE(v_row ->> 'name', v_row ->> 'code', v_row ->> 'region'),
                           'changes', COALESCE(v_changes, CASE WHEN TG_OP = 'INSERT' THEN v_new ELSE v_old END)));
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['pricing_rules', 'vehicles', 'promos', 'feature_flags'] LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_admin_config ON public.%I', t);
            EXECUTE format('CREATE TRIGGER trg_audit_admin_config AFTER INSERT OR UPDATE OR DELETE ON public.%I
                            FOR EACH ROW EXECUTE FUNCTION public.audit_admin_config_change()', t);
        END IF;
    END LOOP;
END $$;

-- Reviews hidden or shown again (0091).
CREATE OR REPLACE FUNCTION public.audit_review_visibility()
RETURNS TRIGGER AS $$
DECLARE
    v_subject UUID := NEW.driver_id;
BEGIN
    IF NEW.is_hidden IS DISTINCT FROM OLD.is_hidden AND public.admin_can('panel') THEN
        IF v_subject IS NULL AND NEW.merchant_id IS NOT NULL THEN
            SELECT owner_id INTO v_subject FROM public.merchants WHERE id = NEW.merchant_id;
        END IF;
        PERFORM public.log_admin_action(CASE WHEN NEW.is_hidden THEN 'review_hidden' ELSE 'review_shown' END,
                                        'review', NEW.id::text, v_subject, NEW.hidden_reason,
                                        jsonb_build_object('rating', NEW.rating, 'order_id', NEW.order_id));
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_audit_review_visibility ON public.reviews;
CREATE TRIGGER trg_audit_review_visibility AFTER UPDATE OF is_hidden ON public.reviews
    FOR EACH ROW EXECUTE FUNCTION public.audit_review_visibility();

-- Project dispute decided by an admin (0093).
CREATE OR REPLACE FUNCTION public.audit_project_dispute()
RETURNS TRIGGER AS $$
DECLARE
    p RECORD;
BEGIN
    IF OLD.status = 'disputed' AND NEW.status IN ('released', 'refunded') AND public.admin_can('panel') THEN
        SELECT title, awarded_to INTO p FROM public.projects WHERE id = NEW.project_id;
        PERFORM public.log_admin_action(CASE WHEN NEW.status = 'released' THEN 'dispute_paid_partner' ELSE 'dispute_refunded_customer' END,
                                        'project', NEW.project_id::text, p.awarded_to, NEW.resolution_note,
                                        jsonb_build_object('stage', NEW.label, 'amount', NEW.amount, 'name', p.title));
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_audit_project_dispute ON public.project_milestones;
CREATE TRIGGER trg_audit_project_dispute AFTER UPDATE OF status ON public.project_milestones
    FOR EACH ROW EXECUTE FUNCTION public.audit_project_dispute();

-- Villa listing reviewed (0097); suspensions are logged by 0101 itself.
CREATE OR REPLACE FUNCTION public.audit_listing_review()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.listing_status = 'pending' AND NEW.listing_status IN ('approved', 'rejected') AND public.admin_can('panel') THEN
        PERFORM public.log_admin_action(CASE WHEN NEW.listing_status = 'approved' THEN 'listing_approved' ELSE 'listing_rejected' END,
                                        'merchant', NEW.id::text, NEW.owner_id, NEW.review_note,
                                        jsonb_build_object('name', NEW.name, 'service_type', NEW.service_type));
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_audit_listing_review ON public.merchants;
CREATE TRIGGER trg_audit_listing_review AFTER UPDATE OF listing_status ON public.merchants
    FOR EACH ROW EXECUTE FUNCTION public.audit_listing_review();

-- Technician verified or unverified (0092).
CREATE OR REPLACE FUNCTION public.audit_technician_verification()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.verified_at IS NULL) IS DISTINCT FROM (OLD.verified_at IS NULL) AND public.admin_can('panel') THEN
        PERFORM public.log_admin_action(CASE WHEN NEW.verified_at IS NOT NULL THEN 'technician_verified' ELSE 'technician_unverified' END,
                                        'user', NEW.user_id::text, NEW.user_id, NULL, NULL);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_audit_technician_verification ON public.technician_profiles;
CREATE TRIGGER trg_audit_technician_verification AFTER UPDATE OF verified_at ON public.technician_profiles
    FOR EACH ROW EXECUTE FUNCTION public.audit_technician_verification();

-- Support ticket status changed by staff.
CREATE OR REPLACE FUNCTION public.audit_ticket_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status AND public.admin_can('panel') THEN
        PERFORM public.log_admin_action('ticket_' || NEW.status, 'ticket', NEW.id::text, NEW.user_id, NEW.admin_response,
                                        jsonb_build_object('subject', NEW.subject, 'from', OLD.status));
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_audit_ticket_status ON public.support_tickets;
CREATE TRIGGER trg_audit_ticket_status AFTER UPDATE OF status ON public.support_tickets
    FOR EACH ROW EXECUTE FUNCTION public.audit_ticket_status();

-- Order actions (0100) and commission changes (0099) appear in the same log.
CREATE OR REPLACE FUNCTION public.audit_order_event()
RETURNS TRIGGER AS $$
DECLARE
    v_customer UUID;
BEGIN
    IF NEW.kind <> 'status' THEN
        SELECT user_id INTO v_customer FROM public.orders WHERE id = NEW.order_id;
        INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, subject_user_id, note, data, created_at)
        VALUES (NEW.actor_id, 'order_' || NEW.kind, 'order', NEW.order_id::text, v_customer, NEW.note,
                jsonb_strip_nulls(jsonb_build_object('amount', NEW.amount, 'from', NEW.from_status, 'to', NEW.to_status)), NEW.created_at);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_audit_order_event ON public.order_events;
CREATE TRIGGER trg_audit_order_event AFTER INSERT ON public.order_events
    FOR EACH ROW EXECUTE FUNCTION public.audit_order_event();

CREATE OR REPLACE FUNCTION public.audit_commission_change()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, note, data, created_at)
    VALUES (NEW.changed_by, 'commission_changed', 'commission', NEW.service_type, NEW.note,
            jsonb_build_object('from', NEW.old_rate, 'to', NEW.new_rate), NEW.changed_at);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_audit_commission_change ON public.commission_rate_changes;
CREATE TRIGGER trg_audit_commission_change AFTER INSERT ON public.commission_rate_changes
    FOR EACH ROW EXECUTE FUNCTION public.audit_commission_change();

-- Verify after applying:
--   SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_audit%';   -> 10+ rows
--   (as Admin Keuangan) approve a payout from Keuangan -> works
