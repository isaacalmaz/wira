-- ============================================================================
-- 0145_wira_bersih_schema.sql
-- Wira Bersih (Sampun Bersih Integration) - Waste Management & Villa Housekeeping
--
-- Tables:
--   1. waste_subscriptions: Recurring villa/homestay/business waste collection.
--   2. waste_pickups: Daily operational pickup logs/checklists for tossa armadas.
--   3. waste_invoices: Monthly recurring digital invoices (QRIS / Transfer / Cash).
--   4. housekeeping_orders: Villa turnover and deep cleaning services.
--   5. waste_quotes: Ad-hoc bulk waste pickup requests (Angkut Borongan).
--
-- Security & Integrity:
--   - Row Level Security (RLS) enabled on all tables.
--   - Users can manage their own subscriptions and orders.
--   - Core Admins & Ops can review, price, assign, and verify cash reconciliations.
--   - Cash reconciliation workflow: Driver collection -> Admin Cashier verification.
--   - Automated invoice generation RPC: generate_waste_monthly_invoices(target_month).
-- ============================================================================

-- 1. waste_subscriptions
CREATE TABLE IF NOT EXISTS public.waste_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    property_name TEXT NOT NULL,
    property_type TEXT NOT NULL DEFAULT 'villa',
    contact_name TEXT,
    contact_phone TEXT,
    contact_whatsapp TEXT,
    address TEXT NOT NULL,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    frequency TEXT NOT NULL DEFAULT '3x' CHECK (frequency IN ('1x', '2x', '3x')),
    pickup_days TEXT[] NOT NULL DEFAULT ARRAY['Sunday', 'Tuesday', 'Friday'],
    monthly_price NUMERIC NOT NULL DEFAULT 0,
    billing_timing TEXT NOT NULL DEFAULT 'postpaid' CHECK (billing_timing IN ('prepaid', 'postpaid')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'cancelled')),
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waste_subscriptions_user_id ON public.waste_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_waste_subscriptions_status ON public.waste_subscriptions(status);

-- 2. waste_pickups
CREATE TABLE IF NOT EXISTS public.waste_pickups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES public.waste_subscriptions(id) ON DELETE CASCADE,
    pickup_date DATE NOT NULL,
    driver_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    driver_name TEXT,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    notes TEXT DEFAULT '',
    photo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_waste_pickup_sub_date UNIQUE (subscription_id, pickup_date)
);

CREATE INDEX IF NOT EXISTS idx_waste_pickups_date ON public.waste_pickups(pickup_date);
CREATE INDEX IF NOT EXISTS idx_waste_pickups_sub ON public.waste_pickups(subscription_id);

-- 3. waste_invoices
CREATE TABLE IF NOT EXISTS public.waste_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_no TEXT NOT NULL UNIQUE,
    subscription_id UUID REFERENCES public.waste_subscriptions(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    month TEXT NOT NULL, -- e.g. '2026-11'
    amount NUMERIC NOT NULL DEFAULT 0,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'collected_by_driver', 'paid', 'overdue', 'cancelled')),
    payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('qris', 'bank_transfer', 'cash')),
    collected_by_driver_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    collected_by_driver_name TEXT,
    collected_at TIMESTAMPTZ,
    verified_by_admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    qris_payload TEXT,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waste_invoices_user_id ON public.waste_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_waste_invoices_status ON public.waste_invoices(status);
CREATE INDEX IF NOT EXISTS idx_waste_invoices_sub_month ON public.waste_invoices(subscription_id, month);

-- 4. housekeeping_orders
CREATE TABLE IF NOT EXISTS public.housekeeping_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_no TEXT NOT NULL UNIQUE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    property_name TEXT NOT NULL,
    service_type TEXT NOT NULL CHECK (service_type IN ('turnover', 'deep_clean')),
    bedrooms INTEGER NOT NULL DEFAULT 1,
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    address TEXT NOT NULL,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    notes TEXT DEFAULT '',
    price NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),
    assigned_type TEXT NOT NULL DEFAULT 'internal' CHECK (assigned_type IN ('internal', 'partner')),
    assigned_to TEXT,
    assigned_partner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),
    payment_method TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_housekeeping_orders_user_id ON public.housekeeping_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_orders_date ON public.housekeeping_orders(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_housekeeping_orders_status ON public.housekeeping_orders(status);

-- 5. waste_quotes (Angkut Borongan)
CREATE TABLE IF NOT EXISTS public.waste_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_no TEXT NOT NULL UNIQUE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    contact_name TEXT,
    contact_phone TEXT,
    address TEXT NOT NULL,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    requested_date DATE NOT NULL,
    notes TEXT DEFAULT '',
    photo_url TEXT,
    quoted_price NUMERIC NOT NULL DEFAULT 0,
    vehicle_type TEXT DEFAULT 'tossa',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'quoted', 'accepted', 'completed', 'cancelled')),
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
    payment_method TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waste_quotes_user_id ON public.waste_quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_waste_quotes_status ON public.waste_quotes(status);

-- ---------- ROW LEVEL SECURITY (RLS) ----------

ALTER TABLE public.waste_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_pickups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.housekeeping_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_quotes ENABLE ROW LEVEL SECURITY;

-- Subscriptions RLS
DROP POLICY IF EXISTS "waste_subs_select" ON public.waste_subscriptions;
CREATE POLICY "waste_subs_select" ON public.waste_subscriptions
FOR SELECT USING (
    auth.uid() = user_id OR is_admin()
);

DROP POLICY IF EXISTS "waste_subs_insert" ON public.waste_subscriptions;
CREATE POLICY "waste_subs_insert" ON public.waste_subscriptions
FOR INSERT WITH CHECK (
    auth.uid() = user_id OR is_admin()
);

DROP POLICY IF EXISTS "waste_subs_update" ON public.waste_subscriptions;
CREATE POLICY "waste_subs_update" ON public.waste_subscriptions
FOR UPDATE USING (
    auth.uid() = user_id OR is_admin()
) WITH CHECK (
    auth.uid() = user_id OR is_admin()
);

-- Pickups RLS
DROP POLICY IF EXISTS "waste_pickups_select" ON public.waste_pickups;
CREATE POLICY "waste_pickups_select" ON public.waste_pickups
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.waste_subscriptions s
        WHERE s.id = waste_pickups.subscription_id AND (s.user_id = auth.uid() OR is_admin())
    ) OR is_admin()
);

DROP POLICY IF EXISTS "waste_pickups_all_admin" ON public.waste_pickups;
CREATE POLICY "waste_pickups_all_admin" ON public.waste_pickups
FOR ALL USING (
    is_admin()
);

-- Invoices RLS
DROP POLICY IF EXISTS "waste_invoices_select" ON public.waste_invoices;
CREATE POLICY "waste_invoices_select" ON public.waste_invoices
FOR SELECT USING (
    auth.uid() = user_id OR is_admin()
);

DROP POLICY IF EXISTS "waste_invoices_update" ON public.waste_invoices;
CREATE POLICY "waste_invoices_update" ON public.waste_invoices
FOR UPDATE USING (
    auth.uid() = user_id OR is_admin()
) WITH CHECK (
    auth.uid() = user_id OR is_admin()
);

DROP POLICY IF EXISTS "waste_invoices_insert_admin" ON public.waste_invoices;
CREATE POLICY "waste_invoices_insert_admin" ON public.waste_invoices
FOR INSERT WITH CHECK (
    is_admin()
);

-- Housekeeping Orders RLS
DROP POLICY IF EXISTS "housekeeping_select" ON public.housekeeping_orders;
CREATE POLICY "housekeeping_select" ON public.housekeeping_orders
FOR SELECT USING (
    auth.uid() = user_id OR is_admin() OR auth.uid() = assigned_partner_id
);

DROP POLICY IF EXISTS "housekeeping_insert" ON public.housekeeping_orders;
CREATE POLICY "housekeeping_insert" ON public.housekeeping_orders
FOR INSERT WITH CHECK (
    auth.uid() = user_id OR is_admin()
);

DROP POLICY IF EXISTS "housekeeping_update" ON public.housekeeping_orders;
CREATE POLICY "housekeeping_update" ON public.housekeeping_orders
FOR UPDATE USING (
    auth.uid() = user_id OR is_admin() OR auth.uid() = assigned_partner_id
) WITH CHECK (
    auth.uid() = user_id OR is_admin() OR auth.uid() = assigned_partner_id
);

-- Waste Quotes RLS
DROP POLICY IF EXISTS "waste_quotes_select" ON public.waste_quotes;
CREATE POLICY "waste_quotes_select" ON public.waste_quotes
FOR SELECT USING (
    auth.uid() = user_id OR is_admin()
);

DROP POLICY IF EXISTS "waste_quotes_insert" ON public.waste_quotes;
CREATE POLICY "waste_quotes_insert" ON public.waste_quotes
FOR INSERT WITH CHECK (
    auth.uid() = user_id OR is_admin()
);

DROP POLICY IF EXISTS "waste_quotes_update" ON public.waste_quotes;
CREATE POLICY "waste_quotes_update" ON public.waste_quotes
FOR UPDATE USING (
    auth.uid() = user_id OR is_admin()
) WITH CHECK (
    auth.uid() = user_id OR is_admin()
);

-- ---------- STORED PROCEDURES / RPCS ----------

-- 1. Automated Monthly Invoice Generator
CREATE OR REPLACE FUNCTION generate_waste_monthly_invoices(target_month TEXT)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_sub RECORD;
    v_seq INTEGER := 1;
    v_inv_no TEXT;
    v_due DATE;
BEGIN
    -- target_month expected in 'YYYY-MM' format, e.g. '2026-11'
    -- Due date is 10th of the month
    v_due := (target_month || '-10')::DATE;

    FOR v_sub IN
        SELECT * FROM public.waste_subscriptions
        WHERE status = 'active'
    LOOP
        -- Check if invoice for this subscription and month already exists
        IF NOT EXISTS (
            SELECT 1 FROM public.waste_invoices
            WHERE subscription_id = v_sub.id AND month = target_month
        ) THEN
            -- Generate invoice sequence number
            SELECT COALESCE(COUNT(*), 0) + 1 INTO v_seq
            FROM public.waste_invoices
            WHERE month = target_month;

            v_inv_no := 'SB-' || REPLACE(SUBSTRING(target_month FROM 3 FOR 5), '-', '') || '-' || LPAD(v_seq::TEXT, 4, '0');

            INSERT INTO public.waste_invoices (
                invoice_no,
                subscription_id,
                user_id,
                client_name,
                month,
                amount,
                issue_date,
                due_date,
                status
            ) VALUES (
                v_inv_no,
                v_sub.id,
                v_sub.user_id,
                v_sub.property_name,
                target_month,
                v_sub.monthly_price,
                CURRENT_DATE,
                v_due,
                'pending'
            );

            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Driver Cash Collection Log RPC
CREATE OR REPLACE FUNCTION record_driver_cash_collection(
    p_invoice_id UUID,
    p_driver_name TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.waste_invoices
    SET
        status = 'collected_by_driver',
        payment_method = 'cash',
        collected_by_driver_id = auth.uid(),
        collected_by_driver_name = p_driver_name,
        collected_at = NOW(),
        updated_at = NOW()
    WHERE id = p_invoice_id
      AND status = 'pending';

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Admin Cash Verification RPC
CREATE OR REPLACE FUNCTION verify_cash_collection(
    p_invoice_id UUID,
    p_admin_note TEXT DEFAULT ''
)
RETURNS BOOLEAN AS $$
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya admin yang dapat memverifikasi setoran kas.';
    END IF;

    UPDATE public.waste_invoices
    SET
        status = 'paid',
        verified_by_admin_id = auth.uid(),
        verified_at = NOW(),
        paid_at = NOW(),
        notes = CASE WHEN p_admin_note <> '' THEN notes || ' | Kasir: ' || p_admin_note ELSE notes END,
        updated_at = NOW()
    WHERE id = p_invoice_id
      AND status = 'collected_by_driver';

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add to realtime publication safely
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.waste_subscriptions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.waste_pickups;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.waste_invoices;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.housekeeping_orders;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.waste_quotes;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
