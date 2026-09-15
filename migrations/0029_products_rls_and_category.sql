-- Fixes a real, live-broken feature: frontend-mitra/src/pages/merchant/
-- MerchantMenuPage.jsx (add/edit/delete/toggle-availability for a
-- merchant's food menu) already exists and is fully routed/linked in nav,
-- but public.products has only ever had SELECT and INSERT RLS policies
-- since 0010/0011 - there is NO UPDATE or DELETE policy at all, and the
-- INSERT policy is `WITH CHECK (true)`, wide open to anyone. Net effect,
-- confirmed by reading the live policy set (not assumed): every merchant's
-- edit/delete action fails today with "Akses ditolak" (the page's own
-- error handling for zero rows affected), while literally anyone -
-- including an anonymous visitor - can insert a product row into ANY
-- merchant's menu.
--
-- Also adds a real `category` column - MerchantMenuPage.jsx already has a
-- category dropdown in its add/edit form, but it was purely decorative:
-- the selected value was captured into React state and never sent to the
-- database, because the column never existed (category_id from 0011 lost
-- the 0010/0011 table-creation race - see migrations/README.md's Known
-- issue #2).

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'makanan';

DROP POLICY IF EXISTS "Public can insert products" ON public.products;
CREATE POLICY "products_insert_own_merchant" ON public.products
FOR INSERT WITH CHECK (
    merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
    OR is_admin()
);

DROP POLICY IF EXISTS "products_update_own_merchant" ON public.products;
CREATE POLICY "products_update_own_merchant" ON public.products
FOR UPDATE USING (
    merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
    OR is_admin()
);

DROP POLICY IF EXISTS "products_delete_own_merchant" ON public.products;
CREATE POLICY "products_delete_own_merchant" ON public.products
FOR DELETE USING (
    merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
    OR is_admin()
);
-- "Allow public read on products" (SELECT, USING(true)) is untouched -
-- customers browsing a restaurant's menu still needs to work with no login.

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- 1. As a real merchant owner, edit one of your own products - should
--    succeed (previously failed with "Akses ditolak").
-- 2. As a real merchant owner, delete one of your own products - should
--    succeed.
-- 3. As the anon key (no login), try inserting a product for a merchant
--    you don't own - should now be rejected (previously succeeded).
-- 4. As a different merchant, try updating a product you don't own -
--    should be rejected.
