-- Migration 0093: projects and price quotes (technician rebuild phase 4).
--
-- Owner's decisions (2026-10-01): big jobs (renovation, terazzo, several AC
-- units, painting a villa) go through quotes instead of a fixed price;
-- payment is a down payment plus stages ("DP + termin"); Wira's commission
-- on projects is 10%.
--
-- Flow
--   1. The customer posts a project (create_project): skill, description,
--      up to 6 photos, area, address, preferred start, optional budget.
--      It is open for quotes for 7 days.
--   2. Active, VERIFIED technicians with that skill see it (without the
--      exact address) and send one quote each (submit_project_quote):
--      total, line items, timeline, warranty, materials included or not,
--      and 1-4 payment stages in percent (e.g. DP 30 / 40 / 30). At most 5
--      live quotes per project. Quotes are valid 7 days.
--   3. Customer and each quoting technician talk in a thread
--      (project_messages); phone numbers, emails and WhatsApp links are
--      masked until the project is awarded to that technician.
--   4. The customer accepts one quote (accept_project_quote): stages are
--      created from its percentages and the first stage (DP) is paid from
--      WiraPay right away. Wira holds the money.
--   5. Per stage: customer pays it (fund_project_milestone) -> technician
--      reports it done with photos (submit_project_milestone) -> customer
--      approves (approve_project_milestone) and the stage is released to
--      the technician's payable balance minus 10%. A stage left unanswered
--      for 72 hours is released automatically. The customer can object
--      instead (dispute_project_milestone); an admin then releases or
--      refunds it (admin_resolve_project_milestone).
--   6. All stages released -> project completed. The customer can cancel
--      while nothing is waiting for approval or disputed; paid stages not
--      yet released go back to WiraPay.
--   project_housekeeping() (pg_cron, every 15 minutes) expires old
--   projects and quotes and auto-releases stages.
--
-- NOTE (legal, flagged to the owner): holding customer money across stages
-- may need a payment licence or a licensed partner in Indonesia.
--
-- Depends on 0088 (format_rupiah), 0089, 0092. Needs pg_cron. Re-runnable.

-- ---------------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.project_commission_rate()
RETURNS NUMERIC AS $$ SELECT 0.10::NUMERIC; $$ LANGUAGE sql IMMUTABLE;

-- Active, verified technician with this skill.
CREATE OR REPLACE FUNCTION public.can_quote_skill(p_user_id UUID, p_skill TEXT)
RETURNS BOOLEAN AS $$
    SELECT public.is_active_partner(p_user_id, 'technician')
       AND EXISTS (
           SELECT 1 FROM public.technician_profiles t
           WHERE t.user_id = p_user_id AND t.verified_at IS NOT NULL AND p_skill = ANY (t.skills)
       );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Photo URLs must be the caller's own uploads in bucket project-photos.
CREATE OR REPLACE FUNCTION public.own_project_photos(p_photos TEXT[], p_max INT)
RETURNS BOOLEAN AS $$
    SELECT cardinality(COALESCE(p_photos, '{}')) <= p_max
       AND NOT EXISTS (
           SELECT 1 FROM unnest(COALESCE(p_photos, '{}')) u
           WHERE position('/storage/v1/object/public/project-photos/' || auth.uid()::text || '/' IN u) = 0
       );
$$ LANGUAGE sql STABLE;

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-photos', 'project-photos', true)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "project_photos_public_read" ON storage.objects;
CREATE POLICY "project_photos_public_read" ON storage.objects
FOR SELECT USING (bucket_id = 'project-photos');
DROP POLICY IF EXISTS "project_photos_owner_insert" ON storage.objects;
CREATE POLICY "project_photos_owner_insert" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'project-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "project_photos_owner_delete" ON storage.objects;
CREATE POLICY "project_photos_owner_delete" ON storage.objects
FOR DELETE USING (bucket_id = 'project-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.users(id),
    skill TEXT NOT NULL REFERENCES public.service_skills(code),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    photos TEXT[] NOT NULL DEFAULT '{}',
    area TEXT NOT NULL,
    address TEXT NOT NULL,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    preferred_start DATE,
    budget_min NUMERIC,
    budget_max NUMERIC,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'awarded', 'completed', 'cancelled', 'expired')),
    awarded_quote_id UUID,
    awarded_to UUID REFERENCES public.users(id),
    cancel_reason TEXT,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS projects_customer_idx ON public.projects (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS projects_open_idx ON public.projects (skill, status) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.project_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    technician_id UUID NOT NULL REFERENCES public.users(id),
    total NUMERIC NOT NULL CHECK (total > 0),
    line_items JSONB NOT NULL DEFAULT '[]',
    timeline_days INT NOT NULL CHECK (timeline_days BETWEEN 1 AND 365),
    start_date DATE,
    warranty_days INT NOT NULL DEFAULT 0 CHECK (warranty_days BETWEEN 0 AND 730),
    materials_included BOOLEAN NOT NULL DEFAULT true,
    message TEXT,
    milestones JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'withdrawn', 'accepted', 'rejected', 'expired')),
    valid_until TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, technician_id)
);

CREATE TABLE IF NOT EXISTS public.project_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    seq INT NOT NULL,
    label TEXT NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'funded', 'submitted', 'released', 'refunded', 'disputed')),
    proof_photos TEXT[] NOT NULL DEFAULT '{}',
    note TEXT,
    dispute_reason TEXT,
    resolution_note TEXT,
    funded_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    UNIQUE (project_id, seq)
);

CREATE TABLE IF NOT EXISTS public.project_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    technician_id UUID NOT NULL REFERENCES public.users(id), -- the thread
    sender_id UUID NOT NULL REFERENCES public.users(id),
    body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS project_messages_thread_idx ON public.project_messages (project_id, technician_id, created_at);

-- ---------------------------------------------------------------------------
-- 2. Row-level security (writes go through the functions below)
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;

-- Full rows (address included): the customer, the awarded technician,
-- admins. Technicians browse open projects through get_technician_projects.
DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select ON public.projects FOR SELECT
    USING (customer_id = auth.uid() OR awarded_to = auth.uid() OR is_admin());

DROP POLICY IF EXISTS project_quotes_select ON public.project_quotes;
CREATE POLICY project_quotes_select ON public.project_quotes FOR SELECT USING (
    technician_id = auth.uid() OR is_admin()
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.customer_id = auth.uid())
);

DROP POLICY IF EXISTS project_milestones_select ON public.project_milestones;
CREATE POLICY project_milestones_select ON public.project_milestones FOR SELECT USING (
    is_admin() OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND (p.customer_id = auth.uid() OR p.awarded_to = auth.uid())
    )
);

-- A thread is between the project's customer and one technician who quoted
-- (or may still quote while the project is open).
DROP POLICY IF EXISTS project_messages_select ON public.project_messages;
CREATE POLICY project_messages_select ON public.project_messages FOR SELECT USING (
    technician_id = auth.uid() OR is_admin()
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.customer_id = auth.uid())
);
-- (Checked in a definer function: technicians cannot read open project
-- rows directly, so a plain policy subquery would always fail for them.)
CREATE OR REPLACE FUNCTION public.can_message_project(p_project_id UUID, p_technician_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = p_project_id AND p.status IN ('open', 'awarded')
          AND (
              (p.customer_id = auth.uid()
               AND EXISTS (SELECT 1 FROM public.project_quotes q
                           WHERE q.project_id = p.id AND q.technician_id = p_technician_id))
              OR (p_technician_id = auth.uid()
                  AND (p.awarded_to = auth.uid()
                       OR (p.status = 'open' AND public.can_quote_skill(auth.uid(), p.skill))))
          )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS project_messages_insert ON public.project_messages;
CREATE POLICY project_messages_insert ON public.project_messages FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND public.can_message_project(project_id, technician_id)
);

REVOKE ALL ON public.projects, public.project_quotes, public.project_milestones, public.project_messages FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.projects, public.project_quotes, public.project_milestones FROM authenticated;
REVOKE UPDATE, DELETE ON public.project_messages FROM authenticated;
GRANT SELECT ON public.projects, public.project_quotes, public.project_milestones TO authenticated;
GRANT SELECT, INSERT ON public.project_messages TO authenticated;

-- Contact details stay hidden until the project is awarded to that
-- technician, so the deal stays on Wira.
CREATE OR REPLACE FUNCTION public.mask_project_message()
RETURNS TRIGGER AS $$
DECLARE
    v_awarded UUID;
BEGIN
    SELECT awarded_to INTO v_awarded FROM public.projects WHERE id = NEW.project_id;
    NEW.body := btrim(NEW.body);
    NEW.created_at := NOW();
    IF v_awarded IS DISTINCT FROM NEW.technician_id THEN
        NEW.body := regexp_replace(NEW.body, '(\+?\d[\d\s.\-]{7,}\d)', '[nomor disembunyikan]', 'g');
        NEW.body := regexp_replace(NEW.body, '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}', '[email disembunyikan]', 'g');
        NEW.body := regexp_replace(NEW.body, '(https?://)?(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|t\.me)/\S*', '[tautan disembunyikan]', 'gi');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_mask_project_message ON public.project_messages;
CREATE TRIGGER trg_mask_project_message BEFORE INSERT ON public.project_messages
    FOR EACH ROW EXECUTE FUNCTION public.mask_project_message();

-- ---------------------------------------------------------------------------
-- 3. Customer posts a project
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_project(
    p_skill TEXT, p_title TEXT, p_description TEXT, p_area TEXT, p_address TEXT,
    p_lat DOUBLE PRECISION DEFAULT NULL, p_lng DOUBLE PRECISION DEFAULT NULL,
    p_preferred_start DATE DEFAULT NULL, p_budget_min NUMERIC DEFAULT NULL, p_budget_max NUMERIC DEFAULT NULL,
    p_photos TEXT[] DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_title TEXT := btrim(COALESCE(p_title, ''));
    v_desc TEXT := btrim(COALESCE(p_description, ''));
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Anda harus login';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.service_skills WHERE code = p_skill AND is_active) THEN
        RAISE EXCEPTION 'Jenis pekerjaan tidak dikenal';
    END IF;
    IF length(v_title) < 5 OR length(v_title) > 120 THEN
        RAISE EXCEPTION 'Judul 5 sampai 120 huruf';
    END IF;
    IF length(v_desc) < 20 OR length(v_desc) > 3000 THEN
        RAISE EXCEPTION 'Ceritakan pekerjaannya minimal 20 huruf (maks. 3000)';
    END IF;
    IF NOT (p_area = ANY (public.service_area_list())) THEN
        RAISE EXCEPTION 'Wilayah tidak dikenal';
    END IF;
    IF length(btrim(COALESCE(p_address, ''))) < 5 THEN
        RAISE EXCEPTION 'Isi alamat lokasi pekerjaan';
    END IF;
    IF p_preferred_start IS NOT NULL AND (p_preferred_start < CURRENT_DATE OR p_preferred_start > CURRENT_DATE + 180) THEN
        RAISE EXCEPTION 'Tanggal mulai antara hari ini dan 6 bulan ke depan';
    END IF;
    IF (p_budget_min IS NOT NULL AND p_budget_min < 0) OR (p_budget_max IS NOT NULL AND p_budget_max < COALESCE(p_budget_min, 0)) THEN
        RAISE EXCEPTION 'Kisaran anggaran tidak valid';
    END IF;
    IF NOT public.own_project_photos(p_photos, 6) THEN
        RAISE EXCEPTION 'Maksimal 6 foto, hanya unggahan Anda sendiri';
    END IF;
    IF (SELECT COUNT(*) FROM public.projects WHERE customer_id = auth.uid() AND status = 'open') >= 5 THEN
        RAISE EXCEPTION 'Anda sudah punya 5 proyek yang menunggu penawaran';
    END IF;

    INSERT INTO public.projects (customer_id, skill, title, description, photos, area, address, lat, lng,
                                 preferred_start, budget_min, budget_max)
    VALUES (auth.uid(), p_skill, v_title, v_desc, COALESCE(p_photos, '{}'), p_area, btrim(p_address), p_lat, p_lng,
            p_preferred_start, p_budget_min, p_budget_max)
    RETURNING id INTO v_id;

    -- Tell every technician who can quote it.
    INSERT INTO public.notifications (user_id, title, description, is_read)
    SELECT t.user_id, 'Proyek baru: ' || v_title,
           p_area || '. Buka menu Pekerjaan > Proyek untuk melihat dan mengajukan penawaran.', false
    FROM public.technician_profiles t
    WHERE t.user_id <> auth.uid() AND public.can_quote_skill(t.user_id, p_skill);
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.create_project(TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DATE, NUMERIC, NUMERIC, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_project(TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DATE, NUMERIC, NUMERIC, TEXT[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Technician: browse and quote
-- ---------------------------------------------------------------------------
-- Open projects this technician can quote, plus projects they quoted on or
-- won. The exact address and coordinates only for the awarded technician.
CREATE OR REPLACE FUNCTION public.get_technician_projects()
RETURNS TABLE (
    id UUID, skill TEXT, title TEXT, description TEXT, photos TEXT[], area TEXT,
    address TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
    preferred_start DATE, budget_min NUMERIC, budget_max NUMERIC,
    status TEXT, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ,
    customer_name TEXT, quote_count INT,
    my_quote_id UUID, my_quote_status TEXT, my_quote_total NUMERIC, awarded_to_me BOOLEAN
) AS $$
    SELECT p.id, p.skill, p.title, p.description, p.photos, p.area,
           CASE WHEN p.awarded_to = auth.uid() THEN p.address END,
           CASE WHEN p.awarded_to = auth.uid() THEN p.lat END,
           CASE WHEN p.awarded_to = auth.uid() THEN p.lng END,
           p.preferred_start, p.budget_min, p.budget_max,
           p.status, p.expires_at, p.created_at,
           split_part(COALESCE(u.name, 'Pelanggan'), ' ', 1),
           (SELECT COUNT(*)::INT FROM public.project_quotes x WHERE x.project_id = p.id AND x.status IN ('submitted', 'accepted')),
           q.id, q.status, q.total, COALESCE(p.awarded_to = auth.uid(), false)
    FROM public.projects p
    LEFT JOIN public.users u ON u.id = p.customer_id
    LEFT JOIN public.project_quotes q ON q.project_id = p.id AND q.technician_id = auth.uid()
    WHERE p.customer_id <> auth.uid()
      AND (q.id IS NOT NULL
           OR (p.status = 'open' AND p.expires_at > NOW() AND public.can_quote_skill(auth.uid(), p.skill)))
    ORDER BY (p.awarded_to = auth.uid()) DESC NULLS LAST, (p.status = 'open') DESC, p.created_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_technician_projects() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_technician_projects() TO authenticated;

-- Stages: 1-4, labels, whole percents >= 10 summing to 100.
CREATE OR REPLACE FUNCTION public.valid_milestone_plan(p_plan JSONB)
RETURNS BOOLEAN AS $$
    SELECT jsonb_typeof(p_plan) = 'array'
       AND jsonb_array_length(p_plan) BETWEEN 1 AND 4
       AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(p_plan) e
           WHERE jsonb_typeof(e -> 'percent') <> 'number'
              OR (e ->> 'percent')::NUMERIC < 10
              OR (e ->> 'percent')::NUMERIC <> round((e ->> 'percent')::NUMERIC)
              OR length(btrim(COALESCE(e ->> 'label', ''))) NOT BETWEEN 2 AND 80
       )
       AND (SELECT SUM((e ->> 'percent')::NUMERIC) FROM jsonb_array_elements(p_plan) e) = 100;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.submit_project_quote(
    p_project_id UUID, p_total NUMERIC, p_timeline_days INT, p_milestones JSONB,
    p_line_items JSONB DEFAULT '[]', p_start_date DATE DEFAULT NULL, p_warranty_days INT DEFAULT 0,
    p_materials_included BOOLEAN DEFAULT true, p_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_project RECORD;
    v_existing RECORD;
    v_id UUID;
    v_items JSONB := COALESCE(p_line_items, '[]');
BEGIN
    SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
    IF NOT FOUND OR v_project.status <> 'open' OR v_project.expires_at <= NOW() THEN
        RAISE EXCEPTION 'Proyek ini tidak lagi menerima penawaran';
    END IF;
    IF v_project.customer_id = auth.uid() THEN
        RAISE EXCEPTION 'Tidak bisa menawar proyek sendiri';
    END IF;
    IF NOT public.can_quote_skill(auth.uid(), v_project.skill) THEN
        RAISE EXCEPTION 'Hanya teknisi terverifikasi dengan keahlian ini yang bisa mengajukan penawaran';
    END IF;
    IF p_total IS NULL OR p_total < 50000 OR p_total > 2000000000 OR p_total <> round(p_total) THEN
        RAISE EXCEPTION 'Total penawaran tidak valid';
    END IF;
    IF p_timeline_days IS NULL OR p_timeline_days < 1 OR p_timeline_days > 365 THEN
        RAISE EXCEPTION 'Lama pengerjaan 1 sampai 365 hari';
    END IF;
    IF p_warranty_days IS NULL OR p_warranty_days < 0 OR p_warranty_days > 730 THEN
        RAISE EXCEPTION 'Garansi 0 sampai 730 hari';
    END IF;
    IF p_start_date IS NOT NULL AND p_start_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'Tanggal mulai tidak boleh lewat';
    END IF;
    IF NOT public.valid_milestone_plan(p_milestones) THEN
        RAISE EXCEPTION 'Atur 1-4 termin, masing-masing minimal 10%%, total 100%%';
    END IF;
    IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) > 20 THEN
        RAISE EXCEPTION 'Rincian biaya tidak valid';
    END IF;
    IF jsonb_array_length(v_items) > 0 AND (
        EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) e
                WHERE length(btrim(COALESCE(e ->> 'label', ''))) NOT BETWEEN 2 AND 120
                   OR jsonb_typeof(e -> 'amount') <> 'number' OR (e ->> 'amount')::NUMERIC < 0)
        OR (SELECT SUM((e ->> 'amount')::NUMERIC) FROM jsonb_array_elements(v_items) e) <> p_total
    ) THEN
        RAISE EXCEPTION 'Jumlah rincian biaya harus sama dengan total penawaran';
    END IF;
    IF length(COALESCE(p_message, '')) > 1000 THEN
        RAISE EXCEPTION 'Pesan maksimal 1000 huruf';
    END IF;

    SELECT * INTO v_existing FROM public.project_quotes
    WHERE project_id = p_project_id AND technician_id = auth.uid();
    IF FOUND AND v_existing.status NOT IN ('submitted', 'withdrawn', 'expired') THEN
        RAISE EXCEPTION 'Penawaran ini sudah tidak bisa diubah';
    END IF;
    IF (NOT FOUND OR v_existing.status <> 'submitted')
       AND (SELECT COUNT(*) FROM public.project_quotes
            WHERE project_id = p_project_id AND status = 'submitted') >= 5 THEN
        RAISE EXCEPTION 'Proyek ini sudah menerima 5 penawaran';
    END IF;

    INSERT INTO public.project_quotes (project_id, technician_id, total, line_items, timeline_days, start_date,
                                       warranty_days, materials_included, message, milestones, status, valid_until)
    VALUES (p_project_id, auth.uid(), p_total, v_items, p_timeline_days, p_start_date,
            p_warranty_days, COALESCE(p_materials_included, true), NULLIF(btrim(COALESCE(p_message, '')), ''),
            p_milestones, 'submitted', NOW() + INTERVAL '7 days')
    ON CONFLICT (project_id, technician_id) DO UPDATE
    SET total = EXCLUDED.total, line_items = EXCLUDED.line_items, timeline_days = EXCLUDED.timeline_days,
        start_date = EXCLUDED.start_date, warranty_days = EXCLUDED.warranty_days,
        materials_included = EXCLUDED.materials_included, message = EXCLUDED.message,
        milestones = EXCLUDED.milestones, status = 'submitted', valid_until = EXCLUDED.valid_until,
        updated_at = NOW()
    RETURNING id INTO v_id;

    INSERT INTO public.notifications (user_id, title, description, is_read)
    VALUES (v_project.customer_id,
            CASE WHEN v_existing.id IS NULL THEN 'Penawaran baru untuk proyek Anda' ELSE 'Penawaran diperbarui' END,
            v_project.title || ': ' || public.format_rupiah(p_total) || ', ' || p_timeline_days || ' hari.', false);
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.submit_project_quote(UUID, NUMERIC, INT, JSONB, JSONB, DATE, INT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_project_quote(UUID, NUMERIC, INT, JSONB, JSONB, DATE, INT, BOOLEAN, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.withdraw_project_quote(p_quote_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.project_quotes SET status = 'withdrawn', updated_at = NOW()
    WHERE id = p_quote_id AND technician_id = auth.uid() AND status = 'submitted';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Penawaran tidak bisa ditarik';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.withdraw_project_quote(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_project_quote(UUID) TO authenticated;

-- Quotes on the customer's own project, with who sent them.
CREATE OR REPLACE FUNCTION public.get_project_quotes(p_project_id UUID)
RETURNS TABLE (
    id UUID, technician_id UUID, total NUMERIC, line_items JSONB, timeline_days INT, start_date DATE,
    warranty_days INT, materials_included BOOLEAN, message TEXT, milestones JSONB, status TEXT,
    valid_until TIMESTAMPTZ, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
    technician_name TEXT, avatar_url TEXT, verified BOOLEAN,
    rating_avg NUMERIC, rating_count INT, jobs_completed INT
) AS $$
    SELECT q.id, q.technician_id, q.total, q.line_items, q.timeline_days, q.start_date,
           q.warranty_days, q.materials_included, q.message, q.milestones, q.status,
           q.valid_until, q.created_at, q.updated_at,
           u.name::text, u.avatar_url::text, (t.verified_at IS NOT NULL),
           pr.rating_avg, COALESCE(pr.rating_count, 0),
           (SELECT COUNT(*)::INT FROM public.orders o
            WHERE o.driver_id = q.technician_id AND o.status = 'completed' AND o.service_type IN ('service', 'pool'))
           + (SELECT COUNT(*)::INT FROM public.projects px WHERE px.awarded_to = q.technician_id AND px.status = 'completed')
    FROM public.project_quotes q
    JOIN public.projects p ON p.id = q.project_id
    JOIN public.users u ON u.id = q.technician_id
    LEFT JOIN public.technician_profiles t ON t.user_id = q.technician_id
    LEFT JOIN LATERAL public.partner_rating(q.technician_id) pr ON true
    WHERE q.project_id = p_project_id
      AND (p.customer_id = auth.uid() OR is_admin())
      AND q.status IN ('submitted', 'accepted', 'rejected', 'expired')
    ORDER BY (q.status = 'accepted') DESC, (q.status = 'submitted') DESC, q.total;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_project_quotes(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_quotes(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Money: accept a quote, fund / submit / approve / dispute stages
-- ---------------------------------------------------------------------------
-- Debit the customer's WiraPay for one stage (inside the caller's
-- transaction; raises when the balance is short).
CREATE OR REPLACE FUNCTION public.charge_project_stage(p_customer UUID, p_amount NUMERIC, p_label TEXT, p_project UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.users SET wallet_balance = wallet_balance - p_amount
    WHERE id = p_customer AND wallet_balance >= p_amount;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Saldo WiraPay belum cukup untuk %. Isi saldo dulu.', public.format_rupiah(p_amount);
    END IF;
    INSERT INTO public.transactions (user_id, amount, type, status, description, reference_id)
    VALUES (p_customer, p_amount, 'payment', 'success', 'Proyek: ' || p_label, p_project::text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.charge_project_stage(UUID, NUMERIC, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- Pay a held stage out to the technician (minus commission) or back to the
-- customer. Internal.
CREATE OR REPLACE FUNCTION public.settle_project_stage(p_milestone_id UUID, p_to_technician BOOLEAN, p_note TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
    m RECORD;
    v_left INT;
BEGIN
    SELECT ms.*, p.customer_id, p.awarded_to, p.title INTO m
    FROM public.project_milestones ms JOIN public.projects p ON p.id = ms.project_id
    WHERE ms.id = p_milestone_id FOR UPDATE OF ms;
    IF NOT FOUND OR m.status NOT IN ('funded', 'submitted', 'disputed') THEN
        RAISE EXCEPTION 'Termin ini tidak sedang ditahan';
    END IF;

    IF p_to_technician THEN
        UPDATE public.users
        SET payable_balance = COALESCE(payable_balance, 0) + m.amount * (1 - public.project_commission_rate())
        WHERE id = m.awarded_to;
        UPDATE public.project_milestones
        SET status = 'released', released_at = NOW(), resolution_note = COALESCE(p_note, resolution_note)
        WHERE id = p_milestone_id;
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (m.awarded_to, 'Termin cair: ' || m.label,
                public.format_rupiah(m.amount * (1 - public.project_commission_rate())) || ' masuk ke saldo pendapatan Anda (' || m.title || ').', false);
    ELSE
        UPDATE public.users SET wallet_balance = wallet_balance + m.amount WHERE id = m.customer_id;
        INSERT INTO public.transactions (user_id, type, amount, status, description, created_at, reference_id)
        VALUES (m.customer_id, 'refund', m.amount, 'success', 'Pengembalian proyek: ' || m.label, NOW(), m.project_id::text);
        UPDATE public.project_milestones
        SET status = 'refunded', resolution_note = COALESCE(p_note, resolution_note)
        WHERE id = p_milestone_id;
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (m.customer_id, 'Dana proyek dikembalikan', public.format_rupiah(m.amount) || ' untuk ' || m.label || ' kembali ke saldo WiraPay Anda.', false);
    END IF;

    -- Every stage settled and at least one released: the project is done.
    SELECT COUNT(*) INTO v_left FROM public.project_milestones
    WHERE project_id = m.project_id AND status NOT IN ('released', 'refunded');
    IF v_left = 0 THEN
        UPDATE public.projects
        SET status = CASE WHEN EXISTS (SELECT 1 FROM public.project_milestones
                                       WHERE project_id = m.project_id AND status = 'released')
                          THEN 'completed' ELSE 'cancelled' END,
            updated_at = NOW()
        WHERE id = m.project_id AND status = 'awarded';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.settle_project_stage(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.accept_project_quote(p_quote_id UUID)
RETURNS UUID AS $$
DECLARE
    q RECORD;
    p RECORD;
    e JSONB;
    i INT := 0;
    n INT;
    v_amount NUMERIC;
    v_assigned NUMERIC := 0;
    v_first UUID;
BEGIN
    SELECT * INTO q FROM public.project_quotes WHERE id = p_quote_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Penawaran tidak ditemukan';
    END IF;
    SELECT * INTO p FROM public.projects WHERE id = q.project_id FOR UPDATE;
    IF p.customer_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Anda tidak berhak memilih penawaran ini';
    END IF;
    IF p.status <> 'open' THEN
        RAISE EXCEPTION 'Proyek ini sudah tidak menerima penawaran';
    END IF;
    IF q.status <> 'submitted' OR q.valid_until <= NOW() THEN
        RAISE EXCEPTION 'Penawaran ini sudah tidak berlaku';
    END IF;
    IF NOT public.can_quote_skill(q.technician_id, p.skill) THEN
        RAISE EXCEPTION 'Teknisi ini sedang tidak aktif';
    END IF;

    n := jsonb_array_length(q.milestones);
    FOR e IN SELECT * FROM jsonb_array_elements(q.milestones) LOOP
        i := i + 1;
        v_amount := CASE WHEN i = n THEN q.total - v_assigned
                         ELSE round(q.total * (e ->> 'percent')::NUMERIC / 100) END;
        v_assigned := v_assigned + v_amount;
        INSERT INTO public.project_milestones (project_id, seq, label, amount)
        VALUES (p.id, i, btrim(e ->> 'label'), v_amount)
        ON CONFLICT (project_id, seq) DO UPDATE SET label = EXCLUDED.label, amount = EXCLUDED.amount, status = 'pending'
        RETURNING CASE WHEN i = 1 THEN id END INTO v_first;
        IF i = 1 THEN
            -- The first stage (DP) is paid now and held by Wira.
            PERFORM public.charge_project_stage(auth.uid(), v_amount, btrim(e ->> 'label') || ' - ' || p.title, p.id);
            UPDATE public.project_milestones SET status = 'funded', funded_at = NOW()
            WHERE project_id = p.id AND seq = 1;
        END IF;
    END LOOP;

    UPDATE public.projects SET status = 'awarded', awarded_quote_id = q.id, awarded_to = q.technician_id, updated_at = NOW()
    WHERE id = p.id;
    UPDATE public.project_quotes SET status = 'accepted', updated_at = NOW() WHERE id = q.id;
    UPDATE public.project_quotes SET status = 'rejected', updated_at = NOW()
    WHERE project_id = p.id AND id <> q.id AND status = 'submitted';

    INSERT INTO public.notifications (user_id, title, description, is_read)
    SELECT x.technician_id,
           CASE WHEN x.id = q.id THEN 'Penawaran Anda dipilih!' ELSE 'Proyek diberikan ke teknisi lain' END,
           p.title || CASE WHEN x.id = q.id THEN '. DP sudah dibayar dan ditahan Wira; alamat lengkap kini terlihat. Mulai sesuai jadwal.' ELSE '. Terima kasih sudah mengajukan penawaran.' END,
           false
    FROM public.project_quotes x WHERE x.project_id = p.id AND x.status IN ('accepted', 'rejected');
    RETURN p.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.accept_project_quote(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_project_quote(UUID) TO authenticated;

-- Customer pays the next stage (after the previous one was released).
CREATE OR REPLACE FUNCTION public.fund_project_milestone(p_milestone_id UUID)
RETURNS VOID AS $$
DECLARE
    m RECORD;
BEGIN
    SELECT ms.*, p.customer_id, p.status AS project_status, p.title, p.awarded_to INTO m
    FROM public.project_milestones ms JOIN public.projects p ON p.id = ms.project_id
    WHERE ms.id = p_milestone_id FOR UPDATE OF ms;
    IF NOT FOUND OR m.customer_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Termin tidak ditemukan';
    END IF;
    IF m.project_status <> 'awarded' OR m.status <> 'pending' THEN
        RAISE EXCEPTION 'Termin ini tidak menunggu pembayaran';
    END IF;
    IF EXISTS (SELECT 1 FROM public.project_milestones
               WHERE project_id = m.project_id AND seq < m.seq AND status NOT IN ('released', 'refunded')) THEN
        RAISE EXCEPTION 'Selesaikan termin sebelumnya dulu';
    END IF;
    PERFORM public.charge_project_stage(auth.uid(), m.amount, m.label || ' - ' || m.title, m.project_id);
    UPDATE public.project_milestones SET status = 'funded', funded_at = NOW() WHERE id = p_milestone_id;
    INSERT INTO public.notifications (user_id, title, description, is_read)
    VALUES (m.awarded_to, 'Termin dibayar: ' || m.label, m.title || '. Dana ditahan Wira dan cair setelah pelanggan menyetujui hasilnya.', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.fund_project_milestone(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fund_project_milestone(UUID) TO authenticated;

-- Technician reports a paid stage done, with photos.
CREATE OR REPLACE FUNCTION public.submit_project_milestone(p_milestone_id UUID, p_note TEXT DEFAULT NULL, p_photos TEXT[] DEFAULT '{}')
RETURNS VOID AS $$
DECLARE
    m RECORD;
BEGIN
    SELECT ms.*, p.customer_id, p.awarded_to, p.title INTO m
    FROM public.project_milestones ms JOIN public.projects p ON p.id = ms.project_id
    WHERE ms.id = p_milestone_id FOR UPDATE OF ms;
    IF NOT FOUND OR m.awarded_to IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Termin tidak ditemukan';
    END IF;
    IF m.status <> 'funded' THEN
        RAISE EXCEPTION 'Termin ini belum dibayar pelanggan atau sudah dilaporkan';
    END IF;
    IF NOT public.own_project_photos(p_photos, 6) THEN
        RAISE EXCEPTION 'Maksimal 6 foto, hanya unggahan Anda sendiri';
    END IF;
    UPDATE public.project_milestones
    SET status = 'submitted', submitted_at = NOW(), note = NULLIF(btrim(COALESCE(p_note, '')), ''),
        proof_photos = COALESCE(p_photos, '{}')
    WHERE id = p_milestone_id;
    INSERT INTO public.notifications (user_id, title, description, is_read)
    VALUES (m.customer_id, 'Tahap selesai: ' || m.label,
            m.title || '. Periksa hasilnya lalu setujui untuk mencairkan dana. Tanpa jawaban dalam 72 jam, dana cair otomatis.', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.submit_project_milestone(UUID, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_project_milestone(UUID, TEXT, TEXT[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_project_milestone(p_milestone_id UUID)
RETURNS VOID AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.project_milestones ms JOIN public.projects p ON p.id = ms.project_id
        WHERE ms.id = p_milestone_id AND p.customer_id = auth.uid() AND ms.status = 'submitted'
    ) THEN
        RAISE EXCEPTION 'Termin ini tidak menunggu persetujuan Anda';
    END IF;
    PERFORM public.settle_project_stage(p_milestone_id, true, 'Disetujui pelanggan');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.approve_project_milestone(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_project_milestone(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.dispute_project_milestone(p_milestone_id UUID, p_reason TEXT)
RETURNS VOID AS $$
DECLARE
    m RECORD;
BEGIN
    SELECT ms.*, p.customer_id, p.awarded_to, p.title INTO m
    FROM public.project_milestones ms JOIN public.projects p ON p.id = ms.project_id
    WHERE ms.id = p_milestone_id FOR UPDATE OF ms;
    IF NOT FOUND OR m.customer_id IS DISTINCT FROM auth.uid() OR m.status <> 'submitted' THEN
        RAISE EXCEPTION 'Termin ini tidak bisa diajukan keberatan';
    END IF;
    IF length(btrim(COALESCE(p_reason, ''))) < 10 THEN
        RAISE EXCEPTION 'Jelaskan keberatan Anda (minimal 10 huruf)';
    END IF;
    UPDATE public.project_milestones SET status = 'disputed', dispute_reason = left(btrim(p_reason), 1000)
    WHERE id = p_milestone_id;
    INSERT INTO public.notifications (user_id, title, description, is_read)
    VALUES (m.awarded_to, 'Pelanggan mengajukan keberatan: ' || m.label,
            m.title || '. Dana tetap ditahan; tim Wira akan menghubungi Anda dan pelanggan.', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.dispute_project_milestone(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispute_project_milestone(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolve_project_milestone(p_milestone_id UUID, p_action TEXT, p_note TEXT)
RETURNS VOID AS $$
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Hanya admin' USING ERRCODE = '42501';
    END IF;
    IF p_action NOT IN ('release', 'refund') THEN
        RAISE EXCEPTION 'Pilihan tidak valid';
    END IF;
    IF length(btrim(COALESCE(p_note, ''))) < 5 THEN
        RAISE EXCEPTION 'Tuliskan catatan keputusan';
    END IF;
    PERFORM public.settle_project_stage(p_milestone_id, p_action = 'release', 'Admin: ' || btrim(p_note));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_resolve_project_milestone(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_project_milestone(UUID, TEXT, TEXT) TO authenticated;

-- Customer cancels: anything still paid-and-held goes back; not possible
-- while a stage waits for approval or is disputed.
CREATE OR REPLACE FUNCTION public.cancel_project(p_project_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
    p RECORD;
    ms RECORD;
BEGIN
    SELECT * INTO p FROM public.projects WHERE id = p_project_id FOR UPDATE;
    IF NOT FOUND OR p.customer_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Proyek tidak ditemukan';
    END IF;
    IF p.status NOT IN ('open', 'awarded') THEN
        RAISE EXCEPTION 'Proyek ini sudah selesai atau dibatalkan';
    END IF;
    IF EXISTS (SELECT 1 FROM public.project_milestones
               WHERE project_id = p.id AND status IN ('submitted', 'disputed')) THEN
        RAISE EXCEPTION 'Ada tahap yang menunggu persetujuan atau keberatan. Selesaikan dulu atau hubungi CS.';
    END IF;
    FOR ms IN SELECT id FROM public.project_milestones WHERE project_id = p.id AND status = 'funded' LOOP
        PERFORM public.settle_project_stage(ms.id, false, 'Proyek dibatalkan pelanggan');
    END LOOP;
    UPDATE public.project_milestones SET status = 'refunded' WHERE project_id = p.id AND status = 'pending';
    UPDATE public.projects SET status = 'cancelled', cancel_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''), updated_at = NOW()
    WHERE id = p.id;
    UPDATE public.project_quotes SET status = 'rejected', updated_at = NOW()
    WHERE project_id = p.id AND status = 'submitted';
    IF p.awarded_to IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (p.awarded_to, 'Proyek dibatalkan pelanggan', p.title || COALESCE('. Alasan: ' || NULLIF(btrim(COALESCE(p_reason, '')), ''), '.'), false);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.cancel_project(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_project(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Housekeeping (pg_cron every 15 minutes)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.project_housekeeping()
RETURNS INT AS $$
DECLARE
    r RECORD;
    n INT := 0;
BEGIN
    -- Stages reported done and left unanswered for 72 hours are released.
    FOR r IN SELECT id FROM public.project_milestones
             WHERE status = 'submitted' AND submitted_at < NOW() - INTERVAL '72 hours'
             FOR UPDATE SKIP LOCKED LOOP
        PERFORM public.settle_project_stage(r.id, true, 'Cair otomatis: 72 jam tanpa jawaban pelanggan');
        n := n + 1;
    END LOOP;

    UPDATE public.project_quotes SET status = 'expired', updated_at = NOW()
    WHERE status = 'submitted' AND valid_until <= NOW();

    FOR r IN SELECT id, customer_id, title FROM public.projects
             WHERE status = 'open' AND expires_at <= NOW() FOR UPDATE SKIP LOCKED LOOP
        UPDATE public.projects SET status = 'expired', updated_at = NOW() WHERE id = r.id;
        UPDATE public.project_quotes SET status = 'expired', updated_at = NOW()
        WHERE project_id = r.id AND status = 'submitted';
        INSERT INTO public.notifications (user_id, title, description, is_read)
        VALUES (r.customer_id, 'Proyek ditutup', r.title || ' sudah 7 hari tanpa penawaran yang dipilih. Anda bisa memposting ulang kapan saja.', false);
        n := n + 1;
    END LOOP;
    RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.project_housekeeping() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule('wira-project-housekeeping', '*/15 * * * *', 'SELECT public.project_housekeeping()');
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Admin overview
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_projects()
RETURNS TABLE (
    id UUID, title TEXT, skill TEXT, area TEXT, status TEXT, created_at TIMESTAMPTZ,
    customer_name TEXT, technician_name TEXT, quote_count INT,
    total NUMERIC, held NUMERIC, released NUMERIC, disputed_count INT
) AS $$
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Hanya admin' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT p.id, p.title, p.skill, p.area, p.status, p.created_at,
           cu.name::text, tu.name::text,
           (SELECT COUNT(*)::INT FROM public.project_quotes q WHERE q.project_id = p.id AND q.status IN ('submitted', 'accepted')),
           (SELECT q.total FROM public.project_quotes q WHERE q.id = p.awarded_quote_id),
           COALESCE((SELECT SUM(m.amount) FROM public.project_milestones m WHERE m.project_id = p.id AND m.status IN ('funded', 'submitted', 'disputed')), 0),
           COALESCE((SELECT SUM(m.amount) FROM public.project_milestones m WHERE m.project_id = p.id AND m.status = 'released'), 0),
           (SELECT COUNT(*)::INT FROM public.project_milestones m WHERE m.project_id = p.id AND m.status = 'disputed')
    FROM public.projects p
    LEFT JOIN public.users cu ON cu.id = p.customer_id
    LEFT JOIN public.users tu ON tu.id = p.awarded_to
    ORDER BY (SELECT COUNT(*) FROM public.project_milestones m WHERE m.project_id = p.id AND m.status = 'disputed') DESC,
             p.created_at DESC
    LIMIT 300;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_projects() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_projects() TO authenticated;

-- Verify after applying:
--   SELECT jobname FROM cron.job WHERE jobname = 'wira-project-housekeeping';  -> 1 row
--   SELECT id FROM storage.buckets WHERE id = 'project-photos';  -> 1 row
