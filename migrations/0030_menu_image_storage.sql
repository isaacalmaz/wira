-- Adds real image upload for WiraFood menu items. Until now every image
-- field in the app (merchants.image, products.image) was a plain URL text
-- box - there was no Supabase Storage bucket anywhere in this project.
-- Requested live: after using MerchantMenuPage.jsx's "Tambah Menu Baru"
-- form, the merchant wants to upload a photo directly instead of pasting a
-- URL.
--
-- Bucket is public-read (menu photos need to be visible to any customer
-- browsing a restaurant, same as the existing unsplash-URL convention),
-- but scoped so a merchant can only write into their own folder
-- (path = "<their auth uid>/<filename>").

INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-images', 'menu-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "menu_images_public_read" ON storage.objects;
CREATE POLICY "menu_images_public_read" ON storage.objects
FOR SELECT USING (bucket_id = 'menu-images');

DROP POLICY IF EXISTS "menu_images_owner_insert" ON storage.objects;
CREATE POLICY "menu_images_owner_insert" ON storage.objects
FOR INSERT WITH CHECK (
    bucket_id = 'menu-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "menu_images_owner_update" ON storage.objects;
CREATE POLICY "menu_images_owner_update" ON storage.objects
FOR UPDATE USING (
    bucket_id = 'menu-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "menu_images_owner_delete" ON storage.objects;
CREATE POLICY "menu_images_owner_delete" ON storage.objects
FOR DELETE USING (
    bucket_id = 'menu-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- 1. As a real merchant, upload a menu photo from MerchantMenuPage.jsx -
--    should succeed and the file should land under <their-uid>/... in the
--    menu-images bucket (Storage tab in Supabase Dashboard).
-- 2. As the anon key, try uploading into ANOTHER user's folder path -
--    should be rejected.
-- 3. Confirm the uploaded image's public URL loads with no auth (public
--    bucket) - paste it in a browser tab directly.
