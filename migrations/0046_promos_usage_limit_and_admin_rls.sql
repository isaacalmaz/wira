-- =============================================================================
-- Migration 0046: Promo usage caps, admin CRUD RLS, atomic usage tracking
-- =============================================================================
-- Context: public.promos (0011, extended in 0036) has a `usage` column that
-- no app code ever increments, and no `usage_limit`/`max_usage` column at
-- all - so no promo usage cap has ever been enforceable. It also only ever
-- had a public SELECT policy (0011) - no INSERT/UPDATE/DELETE policy exists,
-- so frontend-admin/src/pages/PromosPage.jsx's create/edit/delete/toggle
-- actions (now wired to real supabase calls instead of the undefined
-- savePromosToCloud/handleOpenAdd/handleOpenEdit stubs they used to call)
-- would otherwise silently do nothing under RLS.
-- =============================================================================

-- 1. Usage cap column - nullable means "unlimited" (matches every existing
--    promo, which had no cap before this).
ALTER TABLE public.promos ADD COLUMN IF NOT EXISTS usage_limit INTEGER;

-- 2. Admin write access, mirroring the is_admin() pattern already used for
--    every other admin-managed table since 0026 (users/orders/products/etc).
--    The existing "Allow public read on promos" SELECT policy from 0011 is
--    untouched - customers still need to read promos to validate a code at
--    checkout.
DROP POLICY IF EXISTS "Admins can manage promos" ON public.promos;
CREATE POLICY "Admins can manage promos" ON public.promos
FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 3. Atomic, cap-respecting usage increment. Called from RidePage.jsx /
--    RestaurantPage.jsx ONLY after a promo-discounted order has actually
--    been created (not merely when a user types a valid code), so a promo
--    can't be "reserved" by someone who abandons checkout. The UPDATE's own
--    WHERE clause (status = 'Active' AND (usage_limit IS NULL OR
--    usage < usage_limit)) is the single source of truth for whether a slot
--    was actually available - checking the affected row count is what tells
--    the caller whether the increment "took", the same discipline this
--    codebase already uses to guard topup/payout approval RPCs against
--    double-processing, applied here to prevent a promo being oversold by a
--    race between two concurrent checkouts.
CREATE OR REPLACE FUNCTION increment_promo_usage(promo_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    affected INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE public.promos
    SET usage = COALESCE(usage, 0) + 1
    WHERE id = promo_id
      AND status = 'Active'
      AND (usage_limit IS NULL OR usage < usage_limit);

    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_promo_usage(UUID) TO authenticated;

-- 4. Preserve WIRALOMBOK/DISKON10 as real, DB-backed promo codes. They were
--    previously a hardcoded stub in RestaurantPage.jsx's handleApplyPromo
--    (flat Rp 10.000 off, string-matched client-side, bypassing this table
--    entirely) - kept working here since they may already be circulating as
--    marketing material, now going through the same validated, capped,
--    tracked path as every other promo.
INSERT INTO public.promos (title, description, code, service_type, type, discount, status, "validUntil")
VALUES (
  'Voucher WiraLombok', 'Diskon langsung Rp 10.000 untuk pengguna WiraFood',
  'WIRALOMBOK', 'food', 'Fixed', 10000, 'Active', '2027-12-31'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.promos (title, description, code, service_type, type, discount, status, "validUntil")
VALUES (
  'Diskon 10 Ribu', 'Diskon langsung Rp 10.000 untuk pengguna WiraFood',
  'DISKON10', 'food', 'Fixed', 10000, 'Active', '2027-12-31'
)
ON CONFLICT (code) DO NOTHING;
