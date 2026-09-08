-- 1. MENYIAPKAN TABEL USERS & KEAMANANNYA
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'Aktif',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Aktif';

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public insert on users" ON public.users;
CREATE POLICY "Allow public insert on users" ON public.users FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow users to read users" ON public.users;
CREATE POLICY "Allow users to read users" ON public.users FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow users to update own profile" ON public.users;
CREATE POLICY "Allow users to update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);


-- 2. MENYIAPKAN TABEL MERCHANTS
CREATE TABLE IF NOT EXISTS public.merchants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  address TEXT,
  rating NUMERIC DEFAULT 5.0,
  image TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on merchants" ON public.merchants;
CREATE POLICY "Allow public read on merchants" ON public.merchants FOR SELECT USING (true);


-- 3. MENYIAPKAN TABEL ORDERS (TRANSAKSI INTI)
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL,
  service_type TEXT NOT NULL,
  title TEXT,
  details TEXT,
  status TEXT DEFAULT 'pending',
  total_price NUMERIC DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  payment_status TEXT DEFAULT 'unpaid',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS details TEXT;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public full access on orders" ON public.orders;
CREATE POLICY "Allow public full access on orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);


-- 4. MENGAKTIFKAN SOKET REAL-TIME
ALTER PUBLICATION supabase_realtime ADD TABLE orders;


-- 5. SINKRONISASI AKUN YANG TERTINGGAL (SAFETY NET)
INSERT INTO public.users (id, name, email, phone, role, status)
SELECT 
  id, 
  COALESCE(raw_user_meta_data->>'name', 'Pengguna Wira'), 
  email, 
  COALESCE(raw_user_meta_data->>'phone', '080000000000'),
  'user', 
  'Aktif'
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.users);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS vehicle_type TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plate_number TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS specialization TEXT;

-- 4. TABEL CHAT (MESSAGES)
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages DISABLE ROW LEVEL SECURITY;

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
