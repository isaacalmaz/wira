-- Migrasi 0034: Tabel Ulasan (Rating & Review) Driver

CREATE TABLE IF NOT EXISTS public.driver_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Aturan Keamanan (Row Level Security)
ALTER TABLE public.driver_reviews ENABLE ROW LEVEL SECURITY;

-- 1. Pelanggan (Customer) bisa membuat review untuk dirinya sendiri
CREATE POLICY "Customers can insert their own reviews"
ON public.driver_reviews
FOR INSERT
WITH CHECK (auth.uid() = customer_id);

-- 2. Siapa pun (termasuk driver) bisa membaca ulasan (Read-Only)
CREATE POLICY "Anyone can read reviews"
ON public.driver_reviews
FOR SELECT
USING (true);

-- Index untuk mempercepat pencarian ulasan berdasarkan driver_id
CREATE INDEX IF NOT EXISTS idx_driver_reviews_driver_id ON public.driver_reviews(driver_id);
