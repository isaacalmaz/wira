-- Skema Database PostgreSQL (Supabase) untuk Wira Super-App
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users & Roles
CREATE TABLE users (
  id UUID PRIMARY KEY, -- Menggunakan ID dari Supabase Auth
  phone VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE,
  role VARCHAR(50) DEFAULT 'user', -- user, driver, merchant, technician, admin, superadmin
  region VARCHAR(50) DEFAULT 'mataram',
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Wallets & Transactions
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  balance DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID REFERENCES wallets(id),
  amount DECIMAL(15,2) NOT NULL,
  type VARCHAR(50), -- topup, payment, transfer, refund
  status VARCHAR(50) DEFAULT 'pending', -- pending, success, failed
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Layanan Wira (Orders)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  service_type VARCHAR(50), -- ride, send, food, villa, service, pool, pulsa
  status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, in_progress, completed, cancelled
  total_price DECIMAL(15,2),
  payment_method VARCHAR(50) DEFAULT 'wallet', -- wallet, cash, qris
  payment_status VARCHAR(50) DEFAULT 'unpaid',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Mitra (Driver/Teknisi)
CREATE TABLE drivers (
  id UUID PRIMARY KEY REFERENCES users(id),
  vehicle_type VARCHAR(50),
  vehicle_plate VARCHAR(20),
  is_online BOOLEAN DEFAULT false,
  rating DECIMAL(3,2) DEFAULT 5.0,
  status VARCHAR(50) DEFAULT 'active'
);

-- 5. WiraFood (Restaurants & Menus)
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES users(id),
  name VARCHAR(100) NOT NULL,
  address TEXT,
  region VARCHAR(50),
  category VARCHAR(50),
  rating DECIMAL(3,2) DEFAULT 0.0,
  is_open BOOLEAN DEFAULT true,
  image_url TEXT
);

CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price DECIMAL(15,2) NOT NULL,
  image_url TEXT,
  is_available BOOLEAN DEFAULT true
);

-- 6. Feature Flags
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  region VARCHAR(50) UNIQUE NOT NULL,
  features JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_restaurants_region ON restaurants(region);
