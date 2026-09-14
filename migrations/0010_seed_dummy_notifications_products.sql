-- =============================================================================
-- Migration 0010: notifications + products tables (dummy-data variant) + seed
-- Source: seed_dummy_data.sql (repo root)
-- Original creation date (git history, first commit): 2026-09-11
-- =============================================================================
-- Depends on public.orders (0001) and public.merchants (0001).
--
-- WARNING — CONFLICTS WITH 0011 (seed_all_data.sql): this file and
-- seed_all_data.sql both `CREATE TABLE IF NOT EXISTS` a notifications table
-- and a products table, but with DIFFERENT column names:
--   notifications: this file uses (title, "desc", "read")
--                   0011 uses       (title, description, is_read)
--   products:       this file has no category_id column; 0011 adds one.
-- Because CREATE TABLE IF NOT EXISTS is a no-op when the table already
-- exists, whichever of these two files actually ran FIRST in production
-- silently "won" the column layout — the other file's own INSERT
-- statements (which reference its own intended column names) would then
-- fail against the real table. File mtimes put this file (12:22) BEFORE
-- seed_all_data.sql (12:37), so on the live database the notifications
-- table most likely has (desc, read), not (description, is_read); 0011's
-- notifications INSERT is therefore suspected to have errored out when it
-- was actually run. This must be verified against the live schema before
-- trusting either file's INSERT list. See migrations/README.md.
-- =============================================================================

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  desc TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications" ON public.notifications FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Public can insert notifications" ON public.notifications;
CREATE POLICY "Public can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);

-- Create products table (for restaurants menu items)
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID REFERENCES public.merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  image TEXT,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on products" ON public.products;
CREATE POLICY "Allow public read on products" ON public.products FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public can insert products" ON public.products;
CREATE POLICY "Public can insert products" ON public.products FOR INSERT WITH CHECK (true);

-- Insert dummy notifications
INSERT INTO public.notifications (title, desc, read) VALUES
('Selamat Datang!', 'Selamat datang di Wira. Nikmati layanan kami.', false),
('Promo WiraRide', 'Diskon 50% hingga Rp 10.000 dengan kode RIDE50', false)
ON CONFLICT DO NOTHING;

-- Insert mock orders (example)
INSERT INTO public.orders (service_type, title, details, status, total_price, payment_method, payment_status) VALUES
('ride', 'Perjalanan ke Pantai Senggigi', 'Dari Mataram Mall menuju Hotel Sheraton', 'pending', 28000, 'wallet', 'paid'),
('food', 'Ayam Taliwang Spesial Pedas', '2x Ayam Taliwang Bakar', 'in_progress', 65000, 'cash', 'unpaid')
ON CONFLICT DO NOTHING;
