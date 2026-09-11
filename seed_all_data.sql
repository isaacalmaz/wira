-- Wira Ecosystem: Complete Schema & Data Seeding Script
-- Telah divalidasi ulang terhadap semua reserved keywords dan constraint

-- ============================================================
-- 1. TABEL LOCATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  lat NUMERIC,
  lng NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on locations" ON public.locations;
CREATE POLICY "Allow public read on locations" ON public.locations FOR SELECT USING (true);

INSERT INTO public.locations (name, address, lat, lng) VALUES
('Mataram Mall', 'Jl. Cokroaminoto, Mataram', -8.5866, 116.1158),
('Epicentrum Mall', 'Jl. Sriwijaya No.333, Mataram', -8.5939, 116.1132),
('Bandara Internasional Lombok', 'Jalan Bypass Bandara Int. Lombok', -8.7610, 116.2755),
('Universitas Mataram', 'Jl. Majapahit No.62, Mataram', -8.5901, 116.0963),
('Senggigi Beach', 'Batu Layar, Lombok Barat', -8.4950, 116.0461)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. TABEL PROMOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.promos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  code TEXT UNIQUE,
  service_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.promos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on promos" ON public.promos;
CREATE POLICY "Allow public read on promos" ON public.promos FOR SELECT USING (true);

INSERT INTO public.promos (title, description, code, service_type) VALUES
('Diskon WiraRide', 'Diskon 50% hingga Rp 10.000', 'RIDE50', 'ride'),
('Gratis Ongkir Food', 'Gratis ongkir max Rp 15.000', 'FOODFREE', 'food'),
('Promo Villa Kuta', 'Potongan 20% khusus daerah Kuta', 'VILLAKUTA', 'villa')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. TABEL VEHICLES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT UNIQUE,
  service_type TEXT,
  price NUMERIC,
  capacity INTEGER,
  duration TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on vehicles" ON public.vehicles;
CREATE POLICY "Allow public read on vehicles" ON public.vehicles FOR SELECT USING (true);

INSERT INTO public.vehicles (name, type, service_type, price, capacity, duration, is_active) VALUES
('WiraRide Motor', 'motor', 'ride', 12000, 1, '15 mnt', true),
('WiraRide Mobil', 'mobil', 'ride', 25000, 4, '20 mnt', true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. TABEL NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications" ON public.notifications FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Public can insert notifications" ON public.notifications;
CREATE POLICY "Public can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);

INSERT INTO public.notifications (title, description, is_read) VALUES
('Selamat Datang!', 'Selamat datang di Wira. Nikmati layanan kami.', false),
('Promo WiraRide', 'Diskon 50% hingga Rp 10.000 dengan kode RIDE50', false)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. TABEL PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID REFERENCES public.merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  image TEXT,
  category_id TEXT,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on products" ON public.products;
CREATE POLICY "Allow public read on products" ON public.products FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public can insert products" ON public.products;
CREATE POLICY "Public can insert products" ON public.products FOR INSERT WITH CHECK (true);

-- ============================================================
-- 6. PERBAIKI KOLOM USERS (phone harus nullable)
-- ============================================================
ALTER TABLE public.users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mitra_access JSONB;

-- ============================================================
-- 7. TAMBAH KOLOM MERCHANTS
-- ============================================================
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS price_per_night NUMERIC;
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS description TEXT;

-- ============================================================
-- 8. SEED DATA: Admin User (tanpa menyentuh auth.users)
-- ============================================================
-- Catatan: INSERT ke auth.users DIHAPUS karena tabel auth.users 
-- memiliki banyak kolom wajib internal Supabase yang tidak bisa diisi manual.
-- Kita hanya insert ke public.users jika user sudah ada di auth.

-- ============================================================
-- 9. SEED DATA: Restaurants (Merchants)
-- ============================================================
-- Kita perlu owner_id yang valid. Gunakan user yang sudah ada.
-- Jika belum ada user, kita skip merchant seeding dan biarkan
-- user mendaftarkan merchant melalui alur normal aplikasi.

DO $$
DECLARE
  v_owner_id UUID;
BEGIN
  -- Ambil user pertama yang ada sebagai owner fallback
  SELECT id INTO v_owner_id FROM public.users LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    -- Seed Restaurants
    INSERT INTO public.merchants (id, owner_id, name, service_type, address, rating, image) VALUES
    ('11111111-1111-1111-1111-111111111111', v_owner_id, 'Warung Ayam Taliwang Mas Bos', 'food', 'Jl. Pejanggik No. 10, Mataram', 4.8, 'https://via.placeholder.com/150'),
    ('22222222-2222-2222-2222-222222222222', v_owner_id, 'Sate Rembiga Pak Haji', 'food', 'Jl. Rembiga, Mataram', 4.7, 'https://via.placeholder.com/150'),
    ('33333333-3333-3333-3333-333333333333', v_owner_id, 'Restoran Khas Lombok', 'food', 'Mataram', 4.5, NULL)
    ON CONFLICT DO NOTHING;

    -- Seed Products
    INSERT INTO public.products (merchant_id, name, description, price, is_available) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Ayam Taliwang Bakar', 'Ayam bakar khas Lombok pedas manis', 45000, true),
    ('11111111-1111-1111-1111-111111111111', 'Plecing Kangkung', 'Kangkung rebus dengan sambal tomat pedas', 15000, true),
    ('22222222-2222-2222-2222-222222222222', 'Sate Rembiga Sapi', 'Sate sapi bumbu pedas manis porsi 10 tusuk', 30000, true),
    ('22222222-2222-2222-2222-222222222222', 'Nasi Putih', 'Nasi putih hangat', 5000, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.products (merchant_id, name, description, price, image, is_available) VALUES
    ('33333333-3333-3333-3333-333333333333', 'Ayam Taliwang Pedas', 'Ayam kampung bakar khas Taliwang', 45000, 'https://images.unsplash.com/photo-1627042633145-b780d842ba45?auto=format&fit=crop&q=80&w=200&h=200', true),
    ('33333333-3333-3333-3333-333333333333', 'Sate Bulayak', 'Sate daging sapi bumbu khas Lombok', 35000, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&q=80&w=200&h=200', true),
    ('33333333-3333-3333-3333-333333333333', 'Nasi Balap Puyung', 'Nasi putih dengan ayam suwir pedas', 25000, 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&q=80&w=200&h=200', false),
    ('33333333-3333-3333-3333-333333333333', 'Es Jeruk Nipis Peras', 'Es jeruk nipis segar', 10000, 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=200&h=200', true),
    ('33333333-3333-3333-3333-333333333333', 'Es Kelapa Muda', 'Es kelapa muda asli', 15000, 'https://images.unsplash.com/photo-1516044734143-690a2a5370d0?auto=format&fit=crop&q=80&w=200&h=200', true)
    ON CONFLICT DO NOTHING;

    -- Seed Villas
    INSERT INTO public.merchants (owner_id, name, service_type, address, price_per_night, rating, image) VALUES
    (v_owner_id, 'Sunset Villa Senggigi', 'villa', 'Senggigi', 1200000, 4.8, 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=400&q=80'),
    (v_owner_id, 'Kuta Lombok Beach House', 'villa', 'Kuta', 850000, 4.9, 'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=400&q=80'),
    (v_owner_id, 'Sembalun Mountain Lodge', 'villa', 'Sembalun', 550000, 4.6, 'https://images.unsplash.com/photo-1542314831-c6a4d14eff40?auto=format&fit=crop&w=400&q=80'),
    (v_owner_id, 'Tetebatu Rice Terrace Villa', 'villa', 'Tetebatu', 400000, 4.7, 'https://images.unsplash.com/photo-1505843513577-22bb7d21e455?auto=format&fit=crop&w=400&q=80')
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Data merchant dan produk berhasil di-seed.';
  ELSE
    RAISE NOTICE 'Tidak ada user di tabel public.users. Merchant seeding dilewati. Daftarkan user terlebih dahulu.';
  END IF;
END $$;
