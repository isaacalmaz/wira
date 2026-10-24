-- ============================================================================
-- 0146_wiraservice_alat_berat.sql
-- Add "Excavator & Alat Berat" (Heavy Equipment Rental) category to WiraService
--
-- Features:
--   1. Registers 'AlatBerat' skill in public.service_skills.
--   2. Seeds 'AlatBerat' category and items in public.pricing_rules:
--      - ALATBERAT_PC50: Mini Excavator (PC 50 / PC 75) - galian vila & saluran
--      - ALATBERAT_PC200: Excavator Standar (PC 200) - cut & fill skala besar
--      - ALATBERAT_BREAKER: Excavator + Breaker - pemecah batu & bukit cadas
--      - ALATBERAT_LAIN: Survei lokasi & penawaran kustom (is_custom = true)
-- ============================================================================

-- 1. Register skill in service_skills
INSERT INTO public.service_skills (code, name, skill_group, sort_order)
VALUES ('AlatBerat', 'Excavator & Alat Berat', 'servis', 10)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    skill_group = EXCLUDED.skill_group,
    sort_order = EXCLUDED.sort_order;

-- 2. Category row in pricing_rules
INSERT INTO public.pricing_rules (
    service_type,
    code,
    name,
    base_price,
    item_of,
    unit_label,
    max_qty,
    sort_order,
    description,
    is_custom
) VALUES (
    'service',
    'AlatBerat',
    'Excavator & Alat Berat',
    100000,
    NULL,
    NULL,
    1,
    10,
    'Sewa excavator mini, standar, breaker & perataan lahan',
    false
)
ON CONFLICT (service_type, code) DO UPDATE
SET name = EXCLUDED.name,
    base_price = EXCLUDED.base_price,
    description = EXCLUDED.description;

-- 3. Item rows under AlatBerat
INSERT INTO public.pricing_rules (
    service_type,
    code,
    name,
    base_price,
    item_of,
    unit_label,
    max_qty,
    sort_order,
    description,
    is_custom
) VALUES
(
    'service',
    'ALATBERAT_PC50',
    'Mini Excavator (PC 50 / PC 75)',
    1850000,
    'AlatBerat',
    'shift',
    5,
    1,
    'Cocok untuk galian kolam renang villa, saluran air, dan perataan lahan sempit',
    false
),
(
    'service',
    'ALATBERAT_PC200',
    'Excavator Standar (PC 200)',
    2800000,
    'AlatBerat',
    'shift',
    5,
    2,
    'Pekerjaan tanah skala besar, cut & fill bukit, galian fondasi besar',
    false
),
(
    'service',
    'ALATBERAT_BREAKER',
    'Excavator + Hydraulic Breaker',
    3200000,
    'AlatBerat',
    'shift',
    5,
    3,
    'Pemecah batu keras, bukit cadas, dan pembongkaran struktur beton',
    false
),
(
    'service',
    'ALATBERAT_LAIN',
    'Survei Lokasi & Penawaran Kustom',
    100000,
    'AlatBerat',
    'kunjungan',
    1,
    999,
    'Survei akses jalan tronton, hitung volume galian/timbunan, dan penawaran total',
    true
)
ON CONFLICT (service_type, code) DO UPDATE
SET name = EXCLUDED.name,
    base_price = EXCLUDED.base_price,
    item_of = EXCLUDED.item_of,
    unit_label = EXCLUDED.unit_label,
    description = EXCLUDED.description,
    is_custom = EXCLUDED.is_custom;
