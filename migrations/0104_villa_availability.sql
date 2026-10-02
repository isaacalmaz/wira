-- Migration 0104: villa availability calendar.
--
-- A villa could be booked twice for the same night: the check-in date only
-- lived in the order's free-text details. Now:
--   * orders.check_in / check_out (check-out = check-in + nights) are set
--     on insert from metadata.check_in (the app sends it; older app builds
--     only wrote "(YYYY-MM-DD)" into details, which is read as a fallback)
--     and cannot be changed afterwards.
--   * A villa booking is refused when any of its nights is taken by
--     another booking that is not cancelled or expired (a QRIS booking
--     waiting for payment holds its dates until it expires), or closed by
--     the host. The villa row is locked while checking, so two guests
--     paying at the same moment cannot both get the same night.
--   * Check-in from today (WITA) up to a year ahead; 1-30 nights.
--   * villa_blocks: dates a host closes (own use, renovation, booked
--     elsewhere), check-out style ranges [date_from, date_to). Hosts and
--     admins manage them; a block may not cover an existing booking.
--   * get_villa_unavailable(villa, from, to): taken and closed ranges for
--     the customer calendar (no guest details), for live villas.
--
-- Depends on 0059/0090 (villa price from nights), 0097, 0101. Re-runnable.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS check_in DATE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS check_out DATE;
CREATE INDEX IF NOT EXISTS orders_villa_stay_idx ON public.orders (merchant_id, check_in, check_out)
    WHERE check_in IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.villa_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    note TEXT,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (date_to > date_from AND date_to <= date_from + 366)
);
CREATE INDEX IF NOT EXISTS villa_blocks_merchant_idx ON public.villa_blocks (merchant_id, date_from);

-- Host (owner of the villa) or core admin.
CREATE OR REPLACE FUNCTION public.can_manage_villa(p_merchant_id UUID)
RETURNS BOOLEAN AS $$
    SELECT public.is_admin() OR EXISTS (
        SELECT 1 FROM public.merchants m
        WHERE m.id = p_merchant_id AND m.owner_id = auth.uid() AND m.service_type IN ('villa', 'WiraVilla'));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.can_manage_villa(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_villa(UUID) TO authenticated;

ALTER TABLE public.villa_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS villa_blocks_read ON public.villa_blocks;
CREATE POLICY villa_blocks_read ON public.villa_blocks FOR SELECT USING (public.can_manage_villa(merchant_id) OR public.admin_can('panel'));
DROP POLICY IF EXISTS villa_blocks_insert ON public.villa_blocks;
CREATE POLICY villa_blocks_insert ON public.villa_blocks FOR INSERT WITH CHECK (public.can_manage_villa(merchant_id));
DROP POLICY IF EXISTS villa_blocks_delete ON public.villa_blocks;
CREATE POLICY villa_blocks_delete ON public.villa_blocks FOR DELETE USING (public.can_manage_villa(merchant_id));
REVOKE ALL ON public.villa_blocks FROM anon;
REVOKE UPDATE ON public.villa_blocks FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.villa_blocks TO authenticated;

-- Nights [p_from, p_to) of a villa already taken by a live booking.
CREATE OR REPLACE FUNCTION public.villa_booking_overlaps(p_merchant_id UUID, p_from DATE, p_to DATE, p_except UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.merchant_id = p_merchant_id
          AND o.check_in IS NOT NULL
          AND o.status NOT IN ('cancelled', 'expired')
          AND o.check_in < p_to AND o.check_out > p_from
          AND (p_except IS NULL OR o.id <> p_except));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.villa_booking_overlaps(UUID, DATE, DATE, UUID) FROM PUBLIC, anon, authenticated;

-- Blocks set by the creator; never over an existing booking.
CREATE OR REPLACE FUNCTION public.villa_blocks_guard()
RETURNS TRIGGER AS $$
BEGIN
    NEW.created_by := auth.uid();
    IF NEW.date_from < (NOW() AT TIME ZONE 'Asia/Makassar')::date THEN
        RAISE EXCEPTION 'Tanggal yang sudah lewat tidak bisa ditutup';
    END IF;
    PERFORM 1 FROM public.merchants WHERE id = NEW.merchant_id FOR UPDATE;
    IF public.villa_booking_overlaps(NEW.merchant_id, NEW.date_from, NEW.date_to) THEN
        RAISE EXCEPTION 'Ada tamu yang sudah memesan di tanggal itu. Batalkan pesanannya dulu dari halaman Pesanan bila memang perlu.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_villa_blocks_guard ON public.villa_blocks;
CREATE TRIGGER trg_villa_blocks_guard BEFORE INSERT ON public.villa_blocks
    FOR EACH ROW EXECUTE FUNCTION public.villa_blocks_guard();

-- Stay dates on villa orders, and no double booking.
CREATE OR REPLACE FUNCTION public.villa_stay_guard()
RETURNS TRIGGER AS $$
DECLARE
    v_in DATE;
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Makassar')::date;
    v_raw TEXT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Server-owned once set.
        NEW.check_in := OLD.check_in;
        NEW.check_out := OLD.check_out;
        RETURN NEW;
    END IF;
    IF NEW.service_type NOT IN ('villa', 'WiraVilla') OR NEW.merchant_id IS NULL THEN
        NEW.check_in := NULL;
        NEW.check_out := NULL;
        RETURN NEW;
    END IF;

    v_raw := COALESCE(NEW.metadata ->> 'check_in', substring(COALESCE(NEW.details, '') FROM '\((\d{4}-\d{2}-\d{2})\)'));
    IF v_raw IS NULL OR v_raw !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'Pilih tanggal check-in';
    END IF;
    v_in := v_raw::date;
    IF NEW.nights IS NULL OR NEW.nights NOT BETWEEN 1 AND 30 THEN
        RAISE EXCEPTION 'Lama menginap 1-30 malam';
    END IF;
    IF v_in < v_today THEN
        RAISE EXCEPTION 'Tanggal check-in sudah lewat';
    END IF;
    IF v_in > v_today + 365 THEN
        RAISE EXCEPTION 'Pemesanan paling jauh satu tahun ke depan';
    END IF;
    NEW.check_in := v_in;
    NEW.check_out := v_in + NEW.nights;

    -- One booking at a time per villa.
    PERFORM 1 FROM public.merchants WHERE id = NEW.merchant_id FOR UPDATE;
    IF public.villa_booking_overlaps(NEW.merchant_id, NEW.check_in, NEW.check_out)
       OR EXISTS (SELECT 1 FROM public.villa_blocks b
                  WHERE b.merchant_id = NEW.merchant_id AND b.date_from < NEW.check_out AND b.date_to > NEW.check_in) THEN
        RAISE EXCEPTION 'Tanggal yang dipilih sudah tidak tersedia. Pilih tanggal lain.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP TRIGGER IF EXISTS trg_villa_stay_guard ON public.orders;
CREATE TRIGGER trg_villa_stay_guard BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.villa_stay_guard();

-- Calendar for guests: what is not available, nothing about who booked.
CREATE OR REPLACE FUNCTION public.get_villa_unavailable(p_merchant_id UUID, p_from DATE, p_to DATE)
RETURNS TABLE (date_from DATE, date_to DATE, kind TEXT) AS $$
    SELECT o.check_in, o.check_out, 'booked'::text
    FROM public.orders o
    WHERE o.merchant_id = p_merchant_id AND o.check_in IS NOT NULL
      AND o.status NOT IN ('cancelled', 'expired')
      AND o.check_in < p_to AND o.check_out > p_from
      AND EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = p_merchant_id
                  AND (m.listing_status = 'approved' OR public.can_manage_villa(m.id)))
    UNION ALL
    SELECT b.date_from, b.date_to, 'closed'::text
    FROM public.villa_blocks b
    WHERE b.merchant_id = p_merchant_id AND b.date_from < p_to AND b.date_to > p_from
      AND EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = p_merchant_id
                  AND (m.listing_status = 'approved' OR public.can_manage_villa(m.id)))
    ORDER BY 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION public.get_villa_unavailable(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_villa_unavailable(UUID, DATE, DATE) TO anon, authenticated;

-- Verify after applying:
--   SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_villa_stay_guard', 'trg_villa_blocks_guard');  -> 2 rows
