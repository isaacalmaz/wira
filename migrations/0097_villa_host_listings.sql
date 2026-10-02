-- Migration 0097: one villa host, many villas.
--
-- A villa was one `merchants` row (service_type 'villa') and the mitra
-- portal assumed exactly one row per owner. Now an approved villa host
-- adds more properties themselves, the way hosts work on Airbnb or
-- Booking.com: one account, many listings, one inbox and one balance.
--
--   * merchants.listing_status: 'pending' (new, waiting for an admin),
--     'approved' (live) or 'rejected' (with review_note; the host edits
--     and resubmits). Every existing row is 'approved'.
--   * Per-listing details: bedrooms, max_guests, amenities, photos
--     (gallery, up to 12, bucket "villa-photos"; the first photo becomes
--     the cover in merchants.image).
--   * is_open now doubles as "accepting bookings" for a villa; the host
--     can pause one property without touching the others.
--   * create_villa_listing / resubmit_villa_listing (host),
--     admin_review_villa_listing (admin). Admins are pushed when a listing
--     waits for them (0096 notify_admins); the host is told the decision.
--   * Customers (and anon) only see approved listings; the owner and
--     admins see everything. A booking for a villa that is not approved
--     or is paused is refused in the database.
--
-- Depends on 0024/0026 (merchants RLS), 0050 (column grants), 0096
-- (notify_admins, notifications.link). Re-runnable.

ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS listing_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS bedrooms INT;
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS max_guests INT;
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS amenities TEXT[];
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS photos TEXT[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'merchants_listing_status_check') THEN
        ALTER TABLE public.merchants ADD CONSTRAINT merchants_listing_status_check
            CHECK (listing_status IN ('pending', 'approved', 'rejected'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'merchants_villa_details_check') THEN
        ALTER TABLE public.merchants ADD CONSTRAINT merchants_villa_details_check
            CHECK ((bedrooms IS NULL OR bedrooms BETWEEN 0 AND 50)
               AND (max_guests IS NULL OR max_guests BETWEEN 1 AND 100)
               AND cardinality(photos) <= 12
               AND (amenities IS NULL OR cardinality(amenities) <= 20));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS merchants_owner_idx ON public.merchants (owner_id);

-- Owners may now also edit the new details and pause a property.
GRANT UPDATE (bedrooms, max_guests, amenities, photos, is_open) ON public.merchants TO authenticated;

-- Reads: live listings for everyone, everything for the owner and admins.
DROP POLICY IF EXISTS "Allow public read on merchants" ON public.merchants;
DROP POLICY IF EXISTS merchants_select_listed ON public.merchants;
CREATE POLICY merchants_select_listed ON public.merchants FOR SELECT
    USING (listing_status = 'approved' OR owner_id = auth.uid() OR public.is_admin());

-- A photo a host adds must be one they uploaded to villa-photos.
CREATE OR REPLACE FUNCTION public.villa_photo_owned(p_url TEXT, p_owner UUID)
RETURNS BOOLEAN AS $$
    SELECT p_url IS NOT NULL
       AND position('/storage/v1/object/public/villa-photos/' || p_owner::text || '/' IN p_url) > 0;
$$ LANGUAGE sql IMMUTABLE;

-- Cover follows the gallery; hosts editing directly can only use their
-- own uploads (admins and definer functions are trusted).
CREATE OR REPLACE FUNCTION public.merchants_villa_photos()
RETURNS TRIGGER AS $$
DECLARE
    u TEXT;
BEGIN
    NEW.photos := COALESCE(NEW.photos, '{}');
    IF current_user = 'authenticated' AND NOT public.is_admin()
       AND (TG_OP = 'INSERT' OR NEW.photos IS DISTINCT FROM OLD.photos) THEN
        FOREACH u IN ARRAY NEW.photos LOOP
            IF NOT public.villa_photo_owned(u, NEW.owner_id) THEN
                RAISE EXCEPTION 'Foto harus diunggah dari aplikasi Wira Mitra';
            END IF;
        END LOOP;
    END IF;
    IF cardinality(NEW.photos) > 0 AND (TG_OP = 'INSERT' OR NEW.photos IS DISTINCT FROM OLD.photos) THEN
        NEW.image := NEW.photos[1];
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
DROP TRIGGER IF EXISTS trg_merchants_villa_photos ON public.merchants;
CREATE TRIGGER trg_merchants_villa_photos BEFORE INSERT OR UPDATE ON public.merchants
    FOR EACH ROW EXECUTE FUNCTION public.merchants_villa_photos();

-- Gallery bucket: public read, owner writes into their own folder.
INSERT INTO storage.buckets (id, name, public)
VALUES ('villa-photos', 'villa-photos', true)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "villa_photos_public_read" ON storage.objects;
CREATE POLICY "villa_photos_public_read" ON storage.objects
FOR SELECT USING (bucket_id = 'villa-photos');
DROP POLICY IF EXISTS "villa_photos_owner_insert" ON storage.objects;
CREATE POLICY "villa_photos_owner_insert" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'villa-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "villa_photos_owner_delete" ON storage.objects;
CREATE POLICY "villa_photos_owner_delete" ON storage.objects
FOR DELETE USING (bucket_id = 'villa-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- True when the caller is an approved villa host.
CREATE OR REPLACE FUNCTION public.is_villa_host(p_user UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (SELECT 1 FROM public.users u
                   WHERE u.id = p_user AND jsonb_typeof(u.mitra_access) = 'array' AND u.mitra_access ? 'villa')
        OR EXISTS (SELECT 1 FROM public.merchants m
                   WHERE m.owner_id = p_user AND m.service_type IN ('villa', 'WiraVilla') AND m.listing_status = 'approved');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.is_villa_host(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_villa_host(UUID) TO authenticated;

-- Host adds a property. It waits for an admin before guests see it.
CREATE OR REPLACE FUNCTION public.create_villa_listing(
    p_name TEXT, p_address TEXT, p_price_per_night NUMERIC, p_description TEXT,
    p_bedrooms INT DEFAULT NULL, p_max_guests INT DEFAULT NULL,
    p_amenities TEXT[] DEFAULT NULL, p_photos TEXT[] DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_id UUID;
    v_host TEXT;
    u TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Anda harus login';
    END IF;
    IF NOT public.is_villa_host(v_uid) THEN
        RAISE EXCEPTION 'Hanya mitra villa yang sudah disetujui yang dapat menambah properti';
    END IF;
    IF length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 3 AND 80 THEN
        RAISE EXCEPTION 'Nama properti 3-80 karakter';
    END IF;
    IF length(btrim(COALESCE(p_address, ''))) < 5 THEN
        RAISE EXCEPTION 'Alamat properti wajib diisi';
    END IF;
    IF p_price_per_night IS NULL OR p_price_per_night NOT BETWEEN 50000 AND 100000000 THEN
        RAISE EXCEPTION 'Harga per malam Rp 50.000 - Rp 100.000.000';
    END IF;
    IF cardinality(COALESCE(p_photos, '{}')) = 0 THEN
        RAISE EXCEPTION 'Tambahkan minimal satu foto';
    END IF;
    FOREACH u IN ARRAY p_photos LOOP
        IF NOT public.villa_photo_owned(u, v_uid) THEN
            RAISE EXCEPTION 'Foto harus diunggah dari aplikasi Wira Mitra';
        END IF;
    END LOOP;
    IF (SELECT count(*) FROM public.merchants
        WHERE owner_id = v_uid AND service_type = 'villa' AND listing_status = 'pending') >= 3 THEN
        RAISE EXCEPTION 'Masih ada 3 properti menunggu peninjauan. Tunggu keputusan admin dulu.';
    END IF;

    INSERT INTO public.merchants (name, address, service_type, owner_id, is_open, price_per_night, description,
                                  bedrooms, max_guests, amenities, photos, listing_status, submitted_at)
    VALUES (btrim(p_name), btrim(p_address), 'villa', v_uid, true, p_price_per_night, NULLIF(btrim(COALESCE(p_description, '')), ''),
            p_bedrooms, p_max_guests, p_amenities, p_photos, 'pending', NOW())
    RETURNING id INTO v_id;

    SELECT name INTO v_host FROM public.users WHERE id = v_uid;
    PERFORM public.notify_admins(
        'Properti villa baru menunggu',
        COALESCE(v_host, 'Mitra villa') || ' menambahkan "' || btrim(p_name) || '". Tinjau sebelum tayang.',
        '/villas');
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.create_villa_listing(TEXT, TEXT, NUMERIC, TEXT, INT, INT, TEXT[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_villa_listing(TEXT, TEXT, NUMERIC, TEXT, INT, INT, TEXT[], TEXT[]) TO authenticated;

-- Host sends a rejected listing back after fixing it.
CREATE OR REPLACE FUNCTION public.resubmit_villa_listing(p_id UUID)
RETURNS VOID AS $$
DECLARE
    m RECORD;
    v_host TEXT;
BEGIN
    SELECT * INTO m FROM public.merchants WHERE id = p_id AND owner_id = auth.uid() AND service_type = 'villa' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Properti tidak ditemukan';
    END IF;
    IF m.listing_status <> 'rejected' THEN
        RAISE EXCEPTION 'Hanya properti yang ditolak yang bisa diajukan ulang';
    END IF;
    UPDATE public.merchants SET listing_status = 'pending', submitted_at = NOW() WHERE id = p_id;
    SELECT name INTO v_host FROM public.users WHERE id = auth.uid();
    PERFORM public.notify_admins(
        'Properti villa diajukan ulang',
        COALESCE(v_host, 'Mitra villa') || ' memperbaiki "' || m.name || '". Tinjau lagi.',
        '/villas');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.resubmit_villa_listing(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_villa_listing(UUID) TO authenticated;

-- Admin decision. A rejection needs a reason the host can act on.
CREATE OR REPLACE FUNCTION public.admin_review_villa_listing(p_id UUID, p_approve BOOLEAN, p_note TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
    m RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Khusus admin';
    END IF;
    IF NOT p_approve AND length(btrim(COALESCE(p_note, ''))) < 5 THEN
        RAISE EXCEPTION 'Tulis alasan penolakan agar mitra bisa memperbaiki';
    END IF;
    SELECT * INTO m FROM public.merchants WHERE id = p_id AND service_type IN ('villa', 'WiraVilla') FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Properti tidak ditemukan';
    END IF;
    UPDATE public.merchants
    SET listing_status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
        review_note = CASE WHEN p_approve THEN NULL ELSE btrim(p_note) END,
        reviewed_at = NOW()
    WHERE id = p_id;
    IF m.owner_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, description, is_read, link)
        VALUES (m.owner_id,
                CASE WHEN p_approve THEN 'Properti Anda sudah tayang' ELSE 'Properti perlu diperbaiki' END,
                CASE WHEN p_approve THEN '"' || m.name || '" kini bisa dipesan tamu di WiraVilla.'
                     ELSE '"' || m.name || '": ' || btrim(p_note) || '. Perbaiki lalu ajukan ulang.' END,
                false, '/villa/listing');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_review_villa_listing(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_villa_listing(UUID, BOOLEAN, TEXT) TO authenticated;

-- No bookings for a villa that is not live or is paused.
CREATE OR REPLACE FUNCTION public.guard_villa_booking()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.service_type IN ('villa', 'WiraVilla') AND NEW.merchant_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.merchants m
                       WHERE m.id = NEW.merchant_id AND m.listing_status = 'approved' AND COALESCE(m.is_open, true)) THEN
        RAISE EXCEPTION 'Villa ini sedang tidak menerima pemesanan';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_guard_villa_booking ON public.orders;
CREATE TRIGGER trg_guard_villa_booking BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_villa_booking();

-- Verify after applying:
--   SELECT listing_status, count(*) FROM merchants GROUP BY 1;   -> all 'approved'
--   SELECT id FROM storage.buckets WHERE id = 'villa-photos';     -> 1 row
--   SELECT polname FROM pg_policy WHERE polrelid = 'public.merchants'::regclass;
