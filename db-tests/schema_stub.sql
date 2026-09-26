-- =============================================================================
-- db-tests/schema_stub.sql
-- Minimal stand-in for the Supabase platform + the pre-0045 schema that the
-- tested migrations (see run.sh / README.md) build on. NOT a migration.
--
-- It recreates only what those migrations and the tests touch:
--   * Supabase roles, auth.uid(), default grants, a cron.schedule() stub;
--   * the tables users, merchants, drivers, reviews, vehicles, pricing_rules,
--     promos, orders, transactions, topup_requests - with the columns the
--     tested migrations need, and with the RLS policies they had in
--     production BEFORE 0074/0079/0080 (so those migrations are what closes
--     them, and the tests prove it);
--   * placeholder objects that a tested migration replaces or references
--     (the 0051 state-machine trigger, postgis-based 0014 objects).
-- Everything else in migrations/ is intentionally absent.
-- =============================================================================

-- --- Supabase roles (cluster-wide, so idempotent) ---------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --- auth schema: auth.uid() reads the JWT "sub" claim like Supabase -------
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- --- Supabase default grants on public --------------------------------------
-- Supabase grants every new table/function in public to all three API roles;
-- RLS and explicit REVOKEs are what actually restrict them. Mirror that so
-- the migrations' REVOKEs are meaningful.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- --- pg_cron stub (0078 calls cron.schedule) --------------------------------
CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (
    jobid bigserial PRIMARY KEY,
    jobname text UNIQUE,
    schedule text NOT NULL,
    command text NOT NULL
);
CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
RETURNS bigint LANGUAGE sql AS $$
    INSERT INTO cron.job (jobname, schedule, command) VALUES (job_name, schedule, command)
    ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
    RETURNING jobid
$$;

-- --- users (0001, 0015, 0026 policies) --------------------------------------
CREATE TABLE public.users (
    id UUID PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE,
    phone TEXT,
    role TEXT DEFAULT 'user',
    wallet_balance NUMERIC DEFAULT 0,
    payable_balance NUMERIC DEFAULT 0,
    fcm_token TEXT,
    mitra_access JSONB,
    vehicle_type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- is_admin() exactly as in 0026.
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role IN ('admin', 'Superadmin', 'superadmin', 'Admin Ops')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- --- merchants (0001) -------------------------------------------------------
CREATE TABLE public.merchants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT,
    service_type TEXT,
    price_per_night NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on merchants" ON public.merchants FOR SELECT USING (true);

-- --- drivers (0014 without postgis; its policies as of 0053) ---------------
CREATE TABLE public.drivers (
    id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    vehicle_type TEXT,
    vehicle_plate TEXT,
    is_online BOOLEAN DEFAULT false,
    status TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view online active drivers" ON public.drivers FOR SELECT USING (true);
CREATE POLICY "Drivers can update own record" ON public.drivers FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Drivers can insert own record" ON public.drivers FOR INSERT WITH CHECK (auth.uid() = id);

-- 0014's driver_locations view (minus the postgis `location` column).
CREATE VIEW public.driver_locations AS
SELECT d.id, d.id AS driver_id, COALESCE(u.name, 'Mitra Driver')::TEXT AS name,
       d.vehicle_type, d.vehicle_plate, d.lat, d.lng, d.is_online, d.status, d.updated_at
FROM public.drivers d LEFT JOIN public.users u ON u.id = d.id;
GRANT SELECT ON public.driver_locations TO anon, authenticated, service_role;

-- 0014's nearest-driver RPCs use postgis; 0080 only REVOKEs them, so stub
-- them with the same signatures and a trivial body.
CREATE FUNCTION public.get_nearest_drivers(
    user_lat DOUBLE PRECISION, user_lng DOUBLE PRECISION,
    target_vehicle_type TEXT DEFAULT NULL, only_online BOOLEAN DEFAULT true, max_results INT DEFAULT 10
) RETURNS TABLE (id UUID, name TEXT) LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT d.id, u.name FROM public.drivers d LEFT JOIN public.users u ON u.id = d.id LIMIT max_results
$$;
CREATE FUNCTION public.find_nearest_drivers(
    user_lat DOUBLE PRECISION, user_lng DOUBLE PRECISION,
    target_vehicle_type TEXT DEFAULT NULL, only_online BOOLEAN DEFAULT true, max_results INT DEFAULT 10
) RETURNS TABLE (id UUID, name TEXT) LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT d.id, u.name FROM public.drivers d LEFT JOIN public.users u ON u.id = d.id LIMIT max_results
$$;
GRANT EXECUTE ON FUNCTION public.get_nearest_drivers(DOUBLE PRECISION, DOUBLE PRECISION, TEXT, BOOLEAN, INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_nearest_drivers(DOUBLE PRECISION, DOUBLE PRECISION, TEXT, BOOLEAN, INT) TO anon, authenticated, service_role;

-- --- vehicles (0011 + per_km_rate) / pricing_rules (0057) -------------------
CREATE TABLE public.vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    type TEXT UNIQUE,
    service_type TEXT,
    price NUMERIC,
    per_km_rate NUMERIC DEFAULT 0,
    is_active BOOLEAN DEFAULT true
);
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on vehicles" ON public.vehicles FOR SELECT USING (true);

CREATE TABLE public.pricing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_type TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    base_price NUMERIC NOT NULL DEFAULT 0,
    per_km_rate NUMERIC NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (service_type, code)
);
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing_rules_select_public" ON public.pricing_rules FOR SELECT USING (true);

-- --- promos (0011 + 0036 columns; 0046/0076 add the rest) -------------------
CREATE TABLE public.promos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    code TEXT UNIQUE,
    service_type TEXT,
    type TEXT DEFAULT 'Percentage',
    discount NUMERIC DEFAULT 0,
    "validUntil" DATE,
    usage INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.promos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on promos" ON public.promos FOR SELECT USING (true);

-- --- orders (0001 + later columns; policies as of 0024/0028/0032) ----------
CREATE TABLE public.orders (
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
    pickup_lat DOUBLE PRECISION,
    pickup_lng DOUBLE PRECISION,
    dropoff_lat DOUBLE PRECISION,
    dropoff_lng DOUBLE PRECISION,
    delivery_fee NUMERIC DEFAULT 0,
    package_size TEXT,
    metadata JSONB,
    rate_code TEXT,
    distance_meters NUMERIC,
    nights INTEGER,
    promo_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 0032 (select), 0024 (insert, guest branch still present), 0028 (update).
CREATE POLICY "orders_select_own_or_relevant" ON public.orders
FOR SELECT USING (
    auth.uid() = user_id
    OR (auth.uid() IS NULL AND user_id IS NULL)
    OR driver_id = auth.uid()
    OR (status = 'pending' AND driver_id IS NULL)
    OR (status = 'ready' AND driver_id IS NULL AND merchant_id IS NOT NULL)
    OR merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
    OR is_admin()
);
CREATE POLICY "orders_insert_own" ON public.orders
FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR (auth.uid() IS NULL AND user_id IS NULL)
);
CREATE POLICY "orders_update_mitra_or_admin" ON public.orders
FOR UPDATE USING (
    (status = 'pending' AND driver_id IS NULL)
    OR (status = 'ready' AND driver_id IS NULL AND merchant_id IS NOT NULL)
    OR driver_id = auth.uid()
    OR merchant_id IN (SELECT id FROM public.merchants WHERE owner_id = auth.uid())
    OR is_admin()
);

-- 0051 attaches the state-machine trigger; 0070 (applied for real) replaces
-- the function body. Placeholder body here so the trigger can exist first.
CREATE OR REPLACE FUNCTION public.enforce_orders_state_machine()
RETURNS TRIGGER AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_enforce_orders_state_machine
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_orders_state_machine();

-- users policies as of 0026 (references orders, so created after it).
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select" ON public.users
FOR SELECT USING (
    auth.uid() = id
    OR is_admin()
    OR id IN (
        SELECT o.user_id FROM public.orders o
        WHERE o.user_id IS NOT NULL AND (
            o.driver_id = auth.uid()
            OR o.merchant_id IN (SELECT m.id FROM public.merchants m WHERE m.owner_id = auth.uid())
        )
    )
    OR id IN (
        SELECT o.driver_id FROM public.orders o
        WHERE o.driver_id IS NOT NULL AND o.user_id = auth.uid()
    )
    OR (auth.uid() IS NULL AND id IN (
        SELECT o.driver_id FROM public.orders o WHERE o.driver_id IS NOT NULL AND o.user_id IS NULL
    ))
);
CREATE POLICY "users_insert" ON public.users FOR INSERT WITH CHECK (auth.uid() = id OR is_admin());
CREATE POLICY "users_update" ON public.users FOR UPDATE USING (auth.uid() = id OR is_admin());

-- --- reviews (0039, referenced by 0080) -------------------------------------
CREATE TABLE public.reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id),
    driver_id UUID REFERENCES public.users(id),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read all reviews" ON public.reviews FOR SELECT USING (true);

-- --- transactions / topup_requests (0015; 0045 adds method/reference_id) ---
CREATE TABLE public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'success',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE public.topup_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    proof_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.topup_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own topups" ON public.topup_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own topups" ON public.topup_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anyone can check pending amounts" ON public.topup_requests FOR SELECT USING (status = 'pending');
CREATE POLICY "Users can cancel own pending topups" ON public.topup_requests
FOR UPDATE USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id AND status = 'cancelled');
CREATE POLICY "Admins can manage all topups" ON public.topup_requests
FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- --- auth.users (Supabase Auth; 0084 reads id/email/created_at) ------------
CREATE TABLE auth.users (
    id UUID PRIMARY KEY,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- --- feature_flags (0003) with 0055's policies ------------------------------
CREATE TABLE public.feature_flags (
    region TEXT PRIMARY KEY,
    features JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feature_flags_select_public" ON public.feature_flags FOR SELECT USING (true);
CREATE POLICY "feature_flags_insert" ON public.feature_flags
FOR INSERT WITH CHECK (region = 'mitra_registrations' OR is_admin());
CREATE POLICY "feature_flags_update" ON public.feature_flags
FOR UPDATE USING (region = 'mitra_registrations' OR is_admin())
WITH CHECK (region = 'mitra_registrations' OR is_admin());
CREATE POLICY "feature_flags_delete_admin" ON public.feature_flags FOR DELETE USING (is_admin());
-- Pre-0084 production shape: the application list 0085 copies. Two pending
-- entries for the same account/role (newest first, as the app wrote them)
-- and one without a usable auth_id.
INSERT INTO public.feature_flags (region, features) VALUES
  ('features_config', '{"ride": true}'),
  ('mitra_registrations', '[
    {"id": "MTR-000003", "auth_id": "07000000-0000-0000-0000-0000000000b1", "role": "driver", "name": "Legacy Driver", "phone": "0877", "plate": "DR 1 LG", "sim_photo": "data:image/jpeg;base64,AAA", "status": "Pending", "created_at": "2026-09-20T10:00:00.000Z"},
    {"id": "MTR-000002", "auth_id": "07000000-0000-0000-0000-0000000000b1", "role": "driver", "name": "Legacy Driver (old)", "status": "Pending", "created_at": "2026-09-19T10:00:00.000Z"},
    {"id": "MTR-000001", "auth_id": "not-a-uuid", "role": "technician", "name": "Legacy Tech", "specialization": "ac", "experience": "3", "status": "Active", "reviewed_at": "2026-09-18T10:00:00.000Z"}
  ]');
