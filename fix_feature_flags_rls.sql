CREATE TABLE IF NOT EXISTS public.feature_flags (
  region TEXT PRIMARY KEY,
  features JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public full access on feature_flags" ON public.feature_flags;
CREATE POLICY "Allow public full access on feature_flags" ON public.feature_flags FOR ALL USING (true) WITH CHECK (true);
