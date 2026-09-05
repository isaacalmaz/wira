-- Data Awal (Seeding) untuk Wira App (Area Lombok/Mataram)

-- Tambahkan Feature Flags untuk Mataram
INSERT INTO feature_flags (region, features)
VALUES (
  'mataram',
  '{"WiraRide": true, "WiraSend": true, "WiraFood": true, "WiraVilla": true, "WiraService": true, "WiraPool": true, "WiraPulsa": true, "Wallet": true}'
);

-- Simulasi Restoran di Mataram
-- (Catatan: UUID digenerate otomatis atau diisi manual saat integrasi dengan Supabase Auth)
-- Contoh data restoran kuliner khas Lombok:
-- 1. Ayam Taliwang H. Moerad
-- 2. Sate Rembiga Ibu Sinnaseh
-- 3. Nasi Balap Puyung Inaq Esun
-- 4. Warung Beberuk
-- 5. Plecing Kangkung Khas Lombok

-- Simulasi Villa
-- 1. Villa Senggigi Sunset (Senggigi)
-- 2. Kuta Hills Retreat (Kuta Mandalika)
-- 3. Rinjani View (Sembalun)

-- Simulasi Driver
-- Budi, Agus, Komang, Wayan (Kendaraan bermotor/mobil)
