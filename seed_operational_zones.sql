-- seed_operational_zones.sql

-- 1. Insert seed data for operational_zones
INSERT INTO feature_flags (region, is_active, features)
VALUES (
    'operational_zones',
    true,
    '[
        {
            "id": "mataram",
            "name": "Kota Mataram & Ampenan",
            "status_text": "Zona Inti",
            "services": { "ride": true, "food": true, "send": true, "villa": false, "service": true }
        },
        {
            "id": "senggigi",
            "name": "Senggigi",
            "status_text": "Zona Wisata",
            "services": { "ride": true, "food": true, "send": true, "villa": true, "service": true }
        },
        {
            "id": "kuta",
            "name": "Kuta Mandalika",
            "status_text": "Zona Wisata",
            "services": { "ride": true, "food": true, "send": true, "villa": true, "service": true }
        },
        {
            "id": "gili",
            "name": "Gili Trawangan, Meno, Air",
            "status_text": "Zona Bebas Kendaraan",
            "services": { "ride": false, "food": true, "send": true, "villa": true, "service": false }
        },
        {
            "id": "rinjani",
            "name": "Sembalun & Senaru (Rinjani)",
            "status_text": "Zona Pegunungan",
            "services": { "ride": false, "food": true, "send": false, "villa": true, "service": false }
        }
    ]'::jsonb
)
ON CONFLICT (region) 
DO UPDATE SET 
    is_active = EXCLUDED.is_active,
    features = EXCLUDED.features;


-- 2. Ensure RLS is enabled
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policy to allow UPDATE operations for Admins
-- Note: Assuming the dashboard uses the 'authenticated' role. You may want to restrict this further 
-- using a custom function like `is_admin(auth.uid())` depending on your specific auth setup.
DROP POLICY IF EXISTS "Allow updates on feature_flags" ON feature_flags;

CREATE POLICY "Allow updates on feature_flags"
ON feature_flags
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
