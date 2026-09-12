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
