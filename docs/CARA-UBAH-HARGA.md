# 📖 Cara Mengubah Harga Layanan Wira

Harga layanan **tidak lagi disimpan di file kode**. Semua harga ada di database
Supabase dan diubah lewat Admin Dashboard.

## 📍 Lokasi

Login ke **Admin Dashboard** → menu **Manajemen Harga** (`/pricing`,
role Superadmin atau Admin Ops).

| Layanan | Tabel database | Yang diatur |
|---|---|---|
| 🚗 WiraRide | `vehicles` | harga dasar + tarif per km tiap jenis kendaraan |
| 📦 WiraSend | `pricing_rules` (`service_type = 'send'`) | harga tiap tingkat paket |
| 🔧 WiraService | `pricing_rules` (`service_type = 'service'`) | harga dasar tiap kategori jasa |
| 🏊 WiraPool | `pricing_rules` (`service_type = 'pool'`) | harga dasar tiap layanan kolam |
| 🍔 WiraFood (ongkir) | `pricing_rules` (`service_type = 'food_delivery'`) | harga dasar + tarif per km |
| 🍔 WiraFood (menu) | `products` | harga tiap menu, diatur oleh merchant |
| 🏡 WiraVilla | `merchants.price_per_night` | harga per malam, diatur oleh merchant |

## ⚠️ Penting!

- Perubahan berlaku **langsung**, tanpa deploy atau restart.
- Harga akhir order selalu **dihitung ulang di server** (trigger database,
  lihat `migrations/0059_orders_server_side_price_computation.sql`), jadi
  angka yang dikirim aplikasi pelanggan tidak menentukan harga.
- Semua harga dalam satuan **Rupiah (tanpa titik atau koma)**, dan harus
  lebih dari 0. Contoh: Rp 25.000 ditulis sebagai `25000`.
