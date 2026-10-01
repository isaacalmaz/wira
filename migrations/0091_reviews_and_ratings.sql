-- Migration 0091: ratings and reviews (technician rebuild phase 2).
--
-- What was broken:
--   * Reviews could never be saved for a finished order: submit_review_and_tip
--     marks orders.is_reviewed, and the state machine (0070/0090) refuses any
--     update to a completed order unless the caller is an admin. It also
--     accepted reviews (and tips) on orders that were not completed.
--   * reviews.merchant_id referenced users(id) while orders.merchant_id is a
--     merchants(id), so every food/villa review hit a foreign-key error.
--   * Ratings were never aggregated; the partner app showed a fixed 5.0.
--
-- New (from the research brief, owner-approved plan):
--   * Reviews: 1-5 stars, quick tags, optional text and up to 3 photos, only
--     on completed orders, within 14 days, one per order. Tags are a fixed
--     list (positive: tepat_waktu, rapi, ramah, harga_sesuai, ahli,
--     komunikatif; negative: terlambat, kurang_rapi, minta_biaya_tambahan,
--     tidak_tuntas, kurang_sopan).
--   * The partner may post one public reply. Admins may hide a review with a
--     reason (abuse, personal data, fake); hidden reviews stop counting.
--   * Ratings: average and count of visible reviews; a Bayesian score
--     (C = 5, prior = platform average) orders the technician list so a
--     single 5-star review does not outrank a steady 4.8. "Top Rated" =
--     average >= 4.8 with >= 10 reviews in the last 6 months.
--   * Technicians rate the customer privately (admins only), to spot
--     abusive or no-show customers.
--   * Storage bucket review-photos (public read, owner-folder write).
--
-- Depends on 0039, 0053, 0089, 0090. Re-runnable.

-- ---------------------------------------------------------------------------
-- 1. Review columns, FK fix, RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS photos TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS partner_reply TEXT;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES public.users(id);
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS reviews_driver_idx ON public.reviews (driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_merchant_idx ON public.reviews (merchant_id, created_at DESC);

DO $$
DECLARE c TEXT;
BEGIN
    FOR c IN
        SELECT con.conname FROM pg_constraint con
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
        WHERE con.conrelid = 'public.reviews'::regclass AND con.contype = 'f'
          AND att.attname = 'merchant_id' AND con.confrelid = 'public.users'::regclass
    LOOP
        EXECUTE format('ALTER TABLE public.reviews DROP CONSTRAINT %I', c);
    END LOOP;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint con
        WHERE con.conrelid = 'public.reviews'::regclass AND con.conname = 'reviews_merchant_id_merchants_fkey'
    ) THEN
        ALTER TABLE public.reviews ADD CONSTRAINT reviews_merchant_id_merchants_fkey
            FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Readable by logged-in users unless hidden (the reviewer and admins still
-- see hidden ones). Written only through the functions below.
DROP POLICY IF EXISTS "Users can read all reviews" ON public.reviews;
DROP POLICY IF EXISTS reviews_select ON public.reviews;
CREATE POLICY reviews_select ON public.reviews FOR SELECT USING (
    auth.uid() IS NOT NULL AND (NOT is_hidden OR user_id = auth.uid() OR is_admin())
);
DROP POLICY IF EXISTS "Users can insert their own reviews" ON public.reviews;
REVOKE ALL ON public.reviews FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.reviews FROM authenticated;
GRANT SELECT ON public.reviews TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Photos bucket
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('review-photos', 'review-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "review_photos_public_read" ON storage.objects;
CREATE POLICY "review_photos_public_read" ON storage.objects
FOR SELECT USING (bucket_id = 'review-photos');
DROP POLICY IF EXISTS "review_photos_owner_insert" ON storage.objects;
CREATE POLICY "review_photos_owner_insert" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'review-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "review_photos_owner_delete" ON storage.objects;
CREATE POLICY "review_photos_owner_delete" ON storage.objects
FOR DELETE USING (bucket_id = 'review-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 3. State machine (0090 body; finished orders can be marked reviewed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_orders_state_machine()
RETURNS TRIGGER AS $$
BEGIN
    IF current_user = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF current_user IN ('authenticated', 'anon') THEN
            IF NEW.status IS DISTINCT FROM 'pending' THEN
                RAISE EXCEPTION 'New orders must be created with status = pending (got %)', NEW.status;
            END IF;
            IF NEW.payment_status IS DISTINCT FROM 'unpaid' THEN
                RAISE EXCEPTION 'New orders must be created with payment_status = unpaid (got %). WiraPay orders are paid via create_order_and_pay().', NEW.payment_status;
            END IF;
            IF NEW.payment_method = 'wallet'
               AND current_setting('wira.wallet_checkout', true) IS DISTINCT FROM 'on' THEN
                RAISE EXCEPTION 'WiraPay orders must be created via create_order_and_pay()';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- TG_OP = 'UPDATE' from here on.

    -- 0091: submit_review_and_tip marks a finished order reviewed (and
    -- nothing else) under wira.review_mark, which clients cannot set.
    IF OLD.status IN ('cancelled', 'completed') AND NOT is_admin()
       AND current_setting('wira.review_mark', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Order is already finalized (%) and cannot be modified', OLD.status;
    END IF;

    -- 0090: approved extra charges and the check-only finish change the
    -- price inside their own functions (wira.price_adjustment, which
    -- PostgREST clients cannot set).
    IF NEW.total_price IS DISTINCT FROM OLD.total_price AND NOT is_admin()
       AND current_setting('wira.price_adjustment', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'total_price cannot be changed after an order is created (except by an admin)';
    END IF;

    IF current_user IN ('authenticated', 'anon') AND NOT is_admin() THEN
        IF NEW.user_id IS DISTINCT FROM OLD.user_id
           OR NEW.merchant_id IS DISTINCT FROM OLD.merchant_id
           OR NEW.service_type IS DISTINCT FROM OLD.service_type
           OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
           OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
           OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
           OR NEW.promo_code IS DISTINCT FROM OLD.promo_code
           OR NEW.rate_code IS DISTINCT FROM OLD.rate_code
           OR NEW.distance_meters IS DISTINCT FROM OLD.distance_meters
           OR NEW.nights IS DISTINCT FROM OLD.nights
           OR NEW.metadata IS DISTINCT FROM OLD.metadata
           OR NEW.pickup_lat IS DISTINCT FROM OLD.pickup_lat
           OR NEW.pickup_lng IS DISTINCT FROM OLD.pickup_lng
           OR NEW.dropoff_lat IS DISTINCT FROM OLD.dropoff_lat
           OR NEW.dropoff_lng IS DISTINCT FROM OLD.dropoff_lng
           OR NEW.material_amount IS DISTINCT FROM OLD.material_amount
           OR NEW.package_id IS DISTINCT FROM OLD.package_id
        THEN
            RAISE EXCEPTION 'Only status and driver assignment can be changed on an existing order';
        END IF;
    END IF;

    -- claiming an unassigned order
    IF OLD.driver_id IS NULL AND NEW.driver_id IS NOT NULL AND NOT is_admin() THEN
        IF NEW.driver_id != auth.uid() THEN
            RAISE EXCEPTION 'You can only assign an order to yourself';
        END IF;
        IF NEW.driver_id = OLD.user_id THEN
            RAISE EXCEPTION 'You cannot claim your own order as its driver';
        END IF;
        IF OLD.service_type IN ('service', 'pool') THEN
            IF NOT public.technician_can_take(NEW.driver_id, OLD.service_type, OLD.rate_code) THEN
                RAISE EXCEPTION 'Pekerjaan ini membutuhkan teknisi aktif dengan keahlian yang sesuai';
            END IF;
            IF OLD.preferred_partner_id IS NOT NULL AND OLD.preferred_partner_id <> NEW.driver_id
               AND OLD.status_changed_at >= NOW() - public.preferred_partner_window() THEN
                RAISE EXCEPTION 'Pekerjaan ini sedang ditawarkan ke teknisi pilihan pelanggan';
            END IF;
        ELSIF NOT public.is_active_partner(NEW.driver_id, 'driver') THEN
            RAISE EXCEPTION 'Only an active driver account can claim this order';
        END IF;
    END IF;

    -- Technician visits: work starts only with the customer's PIN
    -- (start_order_with_pin runs as its owner, not as a client role), and
    -- can only be finished after it started.
    IF OLD.service_type IN ('service', 'pool')
       AND current_user IN ('authenticated', 'anon') AND NOT is_admin() THEN
        IF NEW.status = 'working' AND OLD.status IS DISTINCT FROM 'working' THEN
            RAISE EXCEPTION 'Masukkan PIN dari pelanggan untuk mulai bekerja';
        END IF;
        IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'working' THEN
            RAISE EXCEPTION 'Pekerjaan harus dimulai dengan PIN pelanggan sebelum diselesaikan';
        END IF;
    END IF;

    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
        IF NOT (
            is_admin()
            OR auth.uid() = OLD.driver_id
            OR OLD.merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
        ) THEN
            RAISE EXCEPTION 'Only the assigned driver/technician, the owning merchant, or an admin can mark an order completed';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;



-- ---------------------------------------------------------------------------
-- 4. Submit a review (replaces 0053's version; same name, more inputs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_tag_list()
RETURNS TEXT[] AS $$
    SELECT ARRAY['tepat_waktu', 'rapi', 'ramah', 'harga_sesuai', 'ahli', 'komunikatif',
                 'terlambat', 'kurang_rapi', 'minta_biaya_tambahan', 'tidak_tuntas', 'kurang_sopan'];
$$ LANGUAGE sql IMMUTABLE;

DROP FUNCTION IF EXISTS public.submit_review_and_tip(UUID, INTEGER, TEXT, NUMERIC);
CREATE OR REPLACE FUNCTION public.submit_review_and_tip(
    p_order_id UUID,
    p_rating INTEGER,
    p_review_text TEXT,
    p_tip_amount NUMERIC,
    p_tags TEXT[] DEFAULT '{}',
    p_photos TEXT[] DEFAULT '{}'
) RETURNS BOOLEAN AS $$
DECLARE
    v_order RECORD;
    v_text TEXT := NULLIF(btrim(COALESCE(p_review_text, '')), '');
    v_tags TEXT[] := COALESCE(p_tags, '{}');
    v_photos TEXT[] := COALESCE(p_photos, '{}');
    v_lock_first UUID;
    v_lock_second UUID;
    v_owner UUID;
    v_photo TEXT;
BEGIN
    SELECT id, user_id, driver_id, merchant_id, is_reviewed, status, status_changed_at, title
    INTO v_order
    FROM public.orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pesanan tidak ditemukan';
    END IF;
    IF v_order.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Anda tidak berhak mengulas pesanan ini';
    END IF;
    IF v_order.status <> 'completed' THEN
        RAISE EXCEPTION 'Ulasan hanya bisa diberikan setelah pesanan selesai';
    END IF;
    IF v_order.status_changed_at < NOW() - INTERVAL '14 days' THEN
        RAISE EXCEPTION 'Batas waktu ulasan (14 hari setelah selesai) sudah lewat';
    END IF;
    IF COALESCE(v_order.is_reviewed, false) THEN
        RAISE EXCEPTION 'Pesanan ini sudah diulas';
    END IF;
    IF v_order.driver_id IS NULL AND v_order.merchant_id IS NULL THEN
        RAISE EXCEPTION 'Tidak ada mitra untuk diulas di pesanan ini';
    END IF;
    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION 'Pilih 1 sampai 5 bintang';
    END IF;
    IF v_text IS NOT NULL AND length(v_text) > 1000 THEN
        RAISE EXCEPTION 'Ulasan maksimal 1000 huruf';
    END IF;
    IF NOT (v_tags <@ public.review_tag_list()) OR cardinality(v_tags) > 6 THEN
        RAISE EXCEPTION 'Tag ulasan tidak valid';
    END IF;
    IF cardinality(v_photos) > 3 THEN
        RAISE EXCEPTION 'Maksimal 3 foto';
    END IF;
    FOREACH v_photo IN ARRAY v_photos LOOP
        IF position('/storage/v1/object/public/review-photos/' || auth.uid()::text || '/' IN v_photo) = 0 THEN
            RAISE EXCEPTION 'Foto ulasan tidak valid';
        END IF;
    END LOOP;
    IF p_tip_amount IS NULL OR p_tip_amount < 0 OR p_tip_amount > 1000000 THEN
        RAISE EXCEPTION 'Nominal tip tidak valid';
    END IF;

    -- Tip (unchanged from 0053): only to a driver/technician.
    IF p_tip_amount > 0 AND v_order.driver_id IS NOT NULL THEN
        v_lock_first := LEAST(v_order.user_id, v_order.driver_id);
        v_lock_second := GREATEST(v_order.user_id, v_order.driver_id);
        PERFORM 1 FROM public.users WHERE id = v_lock_first FOR UPDATE;
        PERFORM 1 FROM public.users WHERE id = v_lock_second FOR UPDATE;
        IF NOT wallet_pay(p_tip_amount, 'Tip untuk Mitra (Order ' || p_order_id || ')') THEN
            RAISE EXCEPTION 'Saldo WiraPay tidak mencukupi untuk memberikan tip';
        END IF;
        UPDATE public.users SET wallet_balance = COALESCE(wallet_balance, 0) + p_tip_amount
        WHERE id = v_order.driver_id;
        INSERT INTO public.transactions (user_id, amount, type, status, description)
        VALUES (v_order.driver_id, p_tip_amount, 'transfer_in', 'success',
                'Tip dari Pelanggan (Order ' || p_order_id || ')');
    END IF;

    INSERT INTO public.reviews (order_id, user_id, driver_id, merchant_id, rating, review_text, tip_amount, tags, photos)
    VALUES (p_order_id, v_order.user_id, v_order.driver_id, v_order.merchant_id, p_rating, v_text,
            p_tip_amount, v_tags, v_photos);

    PERFORM set_config('wira.review_mark', 'on', true);
    UPDATE public.orders SET is_reviewed = true WHERE id = p_order_id;
    PERFORM set_config('wira.review_mark', 'off', true);

    -- Tell the partner (the driver/technician, or the merchant owner).
    SELECT owner_id INTO v_owner FROM public.merchants WHERE id = v_order.merchant_id;
    INSERT INTO public.notifications (user_id, title, description, is_read)
    SELECT target, 'Ulasan baru: ' || repeat('★', p_rating),
           COALESCE(v_order.title, 'Pesanan') || COALESCE(' – "' || left(v_text, 120) || '"', ''), false
    FROM unnest(ARRAY[COALESCE(v_order.driver_id, v_owner)]) AS target
    WHERE target IS NOT NULL;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.submit_review_and_tip(UUID, INTEGER, TEXT, NUMERIC, TEXT[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_review_and_tip(UUID, INTEGER, TEXT, NUMERIC, TEXT[], TEXT[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Partner reply, admin moderation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reply_to_review(p_review_id UUID, p_reply TEXT)
RETURNS VOID AS $$
DECLARE
    v_rev RECORD;
    v_reply TEXT := NULLIF(btrim(COALESCE(p_reply, '')), '');
BEGIN
    SELECT r.id, r.driver_id, r.partner_reply, m.owner_id INTO v_rev
    FROM public.reviews r LEFT JOIN public.merchants m ON m.id = r.merchant_id
    WHERE r.id = p_review_id FOR UPDATE OF r;
    IF NOT FOUND OR auth.uid() IS DISTINCT FROM COALESCE(v_rev.driver_id, v_rev.owner_id) THEN
        RAISE EXCEPTION 'Anda tidak bisa membalas ulasan ini';
    END IF;
    IF v_rev.partner_reply IS NOT NULL THEN
        RAISE EXCEPTION 'Ulasan ini sudah Anda balas';
    END IF;
    IF v_reply IS NULL OR length(v_reply) > 500 THEN
        RAISE EXCEPTION 'Balasan 1 sampai 500 huruf';
    END IF;
    UPDATE public.reviews SET partner_reply = v_reply, replied_at = NOW() WHERE id = p_review_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.reply_to_review(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reply_to_review(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_review_hidden(p_review_id UUID, p_hidden BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()
                   AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops', 'CS')) THEN
        RAISE EXCEPTION 'Hanya admin yang bisa memoderasi ulasan' USING ERRCODE = '42501';
    END IF;
    IF p_hidden AND NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Tuliskan alasan menyembunyikan ulasan';
    END IF;
    UPDATE public.reviews
    SET is_hidden = p_hidden,
        hidden_reason = CASE WHEN p_hidden THEN btrim(p_reason) END,
        hidden_by = CASE WHEN p_hidden THEN auth.uid() END,
        hidden_at = CASE WHEN p_hidden THEN NOW() END
    WHERE id = p_review_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ulasan tidak ditemukan';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_set_review_hidden(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_review_hidden(UUID, BOOLEAN, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Rating figures
-- ---------------------------------------------------------------------------
-- Driver/technician rating (visible reviews where they are driver_id).
CREATE OR REPLACE FUNCTION public.partner_rating(p_user_id UUID)
RETURNS TABLE (rating_avg NUMERIC, rating_count INT, top_rated BOOLEAN) AS $$
    SELECT ROUND(AVG(r.rating)::NUMERIC, 2),
           COUNT(*)::INT,
           (SELECT COUNT(*) >= 10 AND AVG(x.rating) >= 4.8
            FROM public.reviews x
            WHERE x.driver_id = p_user_id AND NOT x.is_hidden AND x.created_at > NOW() - INTERVAL '6 months')
    FROM public.reviews r
    WHERE r.driver_id = p_user_id AND NOT r.is_hidden;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.partner_rating(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_rating(UUID) TO authenticated;

-- Visible reviews of one partner for profile pages, newest first. The
-- reviewer is shown by first name only.
CREATE OR REPLACE FUNCTION public.get_partner_reviews(p_partner_id UUID, p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS TABLE (
    id UUID, rating INT, tags TEXT[], review_text TEXT, photos TEXT[],
    partner_reply TEXT, replied_at TIMESTAMPTZ, created_at TIMESTAMPTZ,
    reviewer_name TEXT, order_title TEXT
) AS $$
    SELECT r.id, r.rating, r.tags, r.review_text, r.photos, r.partner_reply, r.replied_at, r.created_at,
           split_part(COALESCE(u.name, 'Pelanggan'), ' ', 1), o.title::text
    FROM public.reviews r
    LEFT JOIN public.users u ON u.id = r.user_id
    LEFT JOIN public.orders o ON o.id = r.order_id
    WHERE NOT r.is_hidden
      AND (r.driver_id = p_partner_id
           OR r.merchant_id IN (SELECT m.id FROM public.merchants m WHERE m.owner_id = p_partner_id))
    ORDER BY r.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 50) OFFSET GREATEST(p_offset, 0);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_partner_reviews(UUID, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_reviews(UUID, INT, INT) TO authenticated;

-- The customer app's technician list (0089) with ratings, ordered by a
-- Bayesian score: (5 * platform average + sum of stars) / (5 + reviews).
DROP FUNCTION IF EXISTS public.list_service_technicians(TEXT);
CREATE FUNCTION public.list_service_technicians(p_skill TEXT DEFAULT NULL)
RETURNS TABLE (
    id UUID, name TEXT, avatar_url TEXT, skills TEXT[],
    experience_years INT, jobs_completed INT,
    rating_avg NUMERIC, rating_count INT, top_rated BOOLEAN
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
               (SELECT COALESCE(SUM(r.rating), 0) FROM public.reviews r WHERE r.driver_id = u.id AND NOT r.is_hidden) AS star_sum
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
    )
    SELECT b.id, b.name, b.avatar_url, b.skills, b.experience_years, b.jobs_completed,
           b.rating_avg, b.rating_count, COALESCE(b.top_rated, false)
    FROM base b, prior p
    ORDER BY (5 * p.m + b.star_sum) / (5 + b.rating_count) DESC, b.jobs_completed DESC, b.name;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.list_service_technicians(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_service_technicians(TEXT) TO authenticated;

-- Admin overview per technician: rating, recent low ratings.
CREATE OR REPLACE FUNCTION public.admin_technician_ratings()
RETURNS TABLE (
    user_id UUID, rating_avg NUMERIC, rating_count INT,
    recent_avg NUMERIC, low_ratings_30d INT
) AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()
                   AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops', 'CS', 'Admin Keuangan')) THEN
        RAISE EXCEPTION 'Hanya admin' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT t.user_id,
           ROUND(AVG(r.rating)::NUMERIC, 2),
           COUNT(r.id)::INT,
           (SELECT ROUND(AVG(x.rating)::NUMERIC, 2) FROM (
                SELECT y.rating FROM public.reviews y
                WHERE y.driver_id = t.user_id AND NOT y.is_hidden
                ORDER BY y.created_at DESC LIMIT 20) x),
           COUNT(r.id) FILTER (WHERE r.rating <= 2 AND r.created_at > NOW() - INTERVAL '30 days')::INT
    FROM public.technician_profiles t
    LEFT JOIN public.reviews r ON r.driver_id = t.user_id AND NOT r.is_hidden
    GROUP BY t.user_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_technician_ratings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_technician_ratings() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Technicians/drivers rate the customer (admins only see it)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    rated_by UUID NOT NULL REFERENCES public.users(id),
    customer_id UUID NOT NULL REFERENCES public.users(id),
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.customer_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_ratings_select ON public.customer_ratings;
CREATE POLICY customer_ratings_select ON public.customer_ratings FOR SELECT
    USING (rated_by = auth.uid() OR is_admin());
REVOKE ALL ON public.customer_ratings FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.customer_ratings FROM authenticated;
GRANT SELECT ON public.customer_ratings TO authenticated;

CREATE OR REPLACE FUNCTION public.rate_customer(p_order_id UUID, p_rating INT, p_note TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT id, user_id, driver_id, status, status_changed_at INTO v_order
    FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND OR v_order.driver_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Anda tidak menangani pesanan ini';
    END IF;
    IF v_order.status <> 'completed' OR v_order.status_changed_at < NOW() - INTERVAL '14 days' THEN
        RAISE EXCEPTION 'Penilaian hanya untuk pesanan selesai, paling lama 14 hari';
    END IF;
    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION 'Pilih 1 sampai 5';
    END IF;
    INSERT INTO public.customer_ratings (order_id, rated_by, customer_id, rating, note)
    VALUES (p_order_id, auth.uid(), v_order.user_id, p_rating, left(NULLIF(btrim(COALESCE(p_note, '')), ''), 300))
    ON CONFLICT (order_id) DO NOTHING;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pelanggan di pesanan ini sudah Anda nilai';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.rate_customer(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rate_customer(UUID, INT, TEXT) TO authenticated;

-- Verify after applying:
--   SELECT id FROM storage.buckets WHERE id = 'review-photos';  -> 1 row
--   SELECT conname FROM pg_constraint WHERE conname = 'reviews_merchant_id_merchants_fkey';  -> 1 row
