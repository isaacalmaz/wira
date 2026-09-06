DROP POLICY IF EXISTS "Allow public full access on merchants" ON public.merchants;
CREATE POLICY "Allow public full access on merchants" ON public.merchants FOR ALL USING (true) WITH CHECK (true);
