import fs from 'fs';

// Helper to escape SQL strings
const esc = (str) => typeof str === 'string' ? `'${str.replace(/'/g, "''")}'` : (str === null || str === undefined ? 'NULL' : str);

const sql = [];

sql.push(`-- Wira Ecosystem: Complete Schema & Data Seeding Script
-- Generated to overhaul static data files into Supabase
`);

// 1. Locations Table
sql.push(`
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
`);

// 2. Promos Table
sql.push(`
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
`);

// 3. Vehicles Table
sql.push(`
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
`);

// 4. Notifications Table (from prior attempt, kept to avoid regressions)
sql.push(`
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  desc TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications" ON public.notifications FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Public can insert notifications" ON public.notifications;
CREATE POLICY "Public can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);

INSERT INTO public.notifications (title, desc, read) VALUES
('Selamat Datang!', 'Selamat datang di Wira. Nikmati layanan kami.', false),
('Promo WiraRide', 'Diskon 50% hingga Rp 10.000 dengan kode RIDE50', false)
ON CONFLICT DO NOTHING;
`);

// 5. Products Table
sql.push(`
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
`);

// 6. Seed Merchants (Restaurants & Villas) and Products
sql.push(`
-- We need to ensure there is a fallback owner_id for merchants, so we create a dummy user
INSERT INTO auth.users (id) VALUES ('00000000-0000-0000-0000-000000000000') ON CONFLICT DO NOTHING;
INSERT INTO public.users (id, name, email, role) VALUES ('00000000-0000-0000-0000-000000000000', 'Admin Wira', 'admin@wira.com', 'admin') ON CONFLICT DO NOTHING;

-- Seed Restaurants
INSERT INTO public.merchants (id, owner_id, name, service_type, address, rating, image) VALUES
('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'Warung Ayam Taliwang Mas Bos', 'food', 'Jl. Pejanggik No. 10, Mataram', 4.8, 'https://via.placeholder.com/150'),
('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'Sate Rembiga Pak Haji', 'food', 'Jl. Rembiga, Mataram', 4.7, 'https://via.placeholder.com/150')
ON CONFLICT DO NOTHING;

-- Seed Products for Restaurants
INSERT INTO public.products (merchant_id, name, description, price, is_available) VALUES
('11111111-1111-1111-1111-111111111111', 'Ayam Taliwang Bakar', 'Ayam bakar khas Lombok pedas manis', 45000, true),
('11111111-1111-1111-1111-111111111111', 'Plecing Kangkung', 'Kangkung rebus dengan sambal tomat pedas', 15000, true),
('22222222-2222-2222-2222-222222222222', 'Sate Rembiga Sapi', 'Sate sapi bumbu pedas manis porsi 10 tusuk', 30000, true),
('22222222-2222-2222-2222-222222222222', 'Nasi Putih', 'Nasi putih hangat', 5000, true)
ON CONFLICT DO NOTHING;

-- Additional Products from menuItems.js
INSERT INTO public.merchants (id, owner_id, name, service_type, address, rating) VALUES
('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'Restoran Khas Lombok', 'food', 'Mataram', 4.5)
ON CONFLICT DO NOTHING;

INSERT INTO public.products (merchant_id, name, description, price, image, is_available) VALUES
('33333333-3333-3333-3333-333333333333', 'Ayam Taliwang Pedas', 'Ayam kampung bakar khas Taliwang dengan bumbu pedas manis, disajikan dengan plecing kangkung.', 45000, 'https://images.unsplash.com/photo-1627042633145-b780d842ba45?auto=format&fit=crop&q=80&w=200&h=200', true),
('33333333-3333-3333-3333-333333333333', 'Sate Bulayak', 'Sate daging sapi bumbu khas Lombok disajikan dengan lontong bulayak (dibungkus daun aren).', 35000, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&q=80&w=200&h=200', true),
('33333333-3333-3333-3333-333333333333', 'Nasi Balap Puyung', 'Nasi putih dengan ayam suwir pedas, kedelai goreng, dan kelapa parut.', 25000, 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&q=80&w=200&h=200', false),
('33333333-3333-3333-3333-333333333333', 'Es Jeruk Nipis Peras', 'Es jeruk nipis segar pelepas dahaga.', 10000, 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=200&h=200', true),
('33333333-3333-3333-3333-333333333333', 'Es Kelapa Muda', 'Es kelapa muda asli dengan gula merah cair.', 15000, 'https://images.unsplash.com/photo-1516044734143-690a2a5370d0?auto=format&fit=crop&q=80&w=200&h=200', true)
ON CONFLICT DO NOTHING;

-- Seed Villas as Merchants
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS price_per_night NUMERIC;
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS description TEXT;

INSERT INTO public.merchants (owner_id, name, service_type, address, price_per_night, rating, image) VALUES
('00000000-0000-0000-0000-000000000000', 'Sunset Villa Senggigi', 'villa', 'Senggigi', 1200000, 4.8, 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=400&q=80'),
('00000000-0000-0000-0000-000000000000', 'Kuta Lombok Beach House', 'villa', 'Kuta', 850000, 4.9, 'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=400&q=80'),
('00000000-0000-0000-0000-000000000000', 'Sembalun Mountain Lodge', 'villa', 'Sembalun', 550000, 4.6, 'https://images.unsplash.com/photo-1542314831-c6a4d14eff40?auto=format&fit=crop&w=400&q=80'),
('00000000-0000-0000-0000-000000000000', 'Tetebatu Rice Terrace Villa', 'villa', 'Tetebatu', 400000, 4.7, 'https://images.unsplash.com/photo-1505843513577-22bb7d21e455?auto=format&fit=crop&w=400&q=80')
ON CONFLICT DO NOTHING;
`);

// 7. Seed Technicians as Users
sql.push(`
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mitra_access JSONB;
INSERT INTO auth.users (id) VALUES 
('11111111-1111-1111-1111-111111111111'), 
('22222222-2222-2222-2222-222222222222'), 
('33333333-3333-3333-3333-333333333333'), 
('44444444-4444-4444-4444-444444444444') ON CONFLICT DO NOTHING;

INSERT INTO public.users (id, name, role, mitra_access) VALUES
('11111111-1111-1111-1111-111111111111', 'Pak Yanto', 'mitra', '["technician"]'),
('22222222-2222-2222-2222-222222222222', 'Mas Budi', 'mitra', '["technician"]'),
('33333333-3333-3333-3333-333333333333', 'Kang Dedi', 'mitra', '["technician"]'),
('44444444-4444-4444-4444-444444444444', 'Pak Slamet', 'mitra', '["technician"]')
ON CONFLICT DO NOTHING;

-- Seed Feature Flags for technician specialization
INSERT INTO public.feature_flags (region, is_active, features) VALUES
('mitra_registrations', true, '[
  {"auth_id": "11111111-1111-1111-1111-111111111111", "specialization": "AC", "experience": 8, "price": 75000},
  {"auth_id": "22222222-2222-2222-2222-222222222222", "specialization": "Listrik", "experience": 5, "price": 50000},
  {"auth_id": "33333333-3333-3333-3333-333333333333", "specialization": "Plumbing", "experience": 10, "price": 60000},
  {"auth_id": "44444444-4444-4444-4444-444444444444", "specialization": "Tukang", "experience": 15, "price": 100000}
]') ON CONFLICT DO NOTHING;
`);

// 8. Delete all frontend data files
sql.push(`
-- Finally, insert mock orders as requested by earlier audit
INSERT INTO public.orders (service_type, title, details, status, total_price, payment_method, payment_status) VALUES
('ride', 'Perjalanan ke Pantai Senggigi', 'Dari Mataram Mall menuju Hotel Sheraton', 'pending', 28000, 'wallet', 'paid'),
('food', 'Ayam Taliwang Spesial Pedas', '2x Ayam Taliwang Bakar', 'in_progress', 65000, 'cash', 'unpaid'),
('send', 'Dokumen', 'Cakranegara menuju Selagalas', 'completed', 12000, 'cash', 'paid')
ON CONFLICT DO NOTHING;
`);

fs.writeFileSync('seed_all_data.sql', sql.join('\n'));
console.log('SQL generated to seed_all_data.sql');
