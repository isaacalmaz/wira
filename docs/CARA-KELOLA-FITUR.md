# 📖 Cara Menghidupkan/Mematikan Fitur

Panduan ini menjelaskan cara mengontrol fitur-fitur di aplikasi Wira.

## 🎛️ Melalui Admin Dashboard (Cara Termudah)

1. Buka Admin Dashboard di browser
2. Login sebagai **Superadmin** atau **Admin Operasional**
3. Klik menu **Feature Flags** di sidebar
4. Anda akan melihat daftar semua fitur:

| Fitur | Toggle |
|-------|--------|
| 🚗 WiraRide | 🟢 ON / ⚪ OFF |
| 🍔 WiraFood | 🟢 ON / ⚪ OFF |
| 📦 WiraSend | 🟢 ON / ⚪ OFF |
| 💰 WiraPay | 🟢 ON / ⚪ OFF |
| 📱 WiraPulsa | 🟢 ON / ⚪ OFF |
| 🏡 WiraVilla | 🟢 ON / ⚪ OFF |
| 🔧 WiraService | 🟢 ON / ⚪ OFF |
| 🏊 WiraPool | 🟢 ON / ⚪ OFF |

5. Klik toggle untuk menghidupkan (ON) atau mematikan (OFF) fitur
6. Pilih **region** di mana fitur aktif (Mataram, Lombok Timur, Senggigi, Praya, atau Semua)
7. Klik **Simpan**

## 🔍 Apa yang Terjadi Saat Fitur di-OFF-kan?

- Fitur akan **hilang** dari halaman utama pengguna (tidak terlihat sama sekali)
- Pengguna tidak bisa mengakses URL fitur tersebut
- Data yang sudah ada (pesanan lama, dll) tetap aman di database

## 🌍 Pengaturan Per Region

Anda bisa mengaktifkan fitur hanya untuk daerah tertentu:

- **Contoh**: WiraRide aktif hanya di Mataram, belum aktif di Lombok Timur
- Pilih checkbox region yang diinginkan pada setiap fitur
- Pilih "Semua" untuk mengaktifkan di seluruh region

## ⚠️ Catatan Penting

- **WiraPay** sebaiknya selalu aktif karena digunakan untuk pembayaran semua layanan
- Perubahan feature flag berlaku **langsung** (real-time) tanpa perlu restart
- Hanya **Superadmin** dan **Admin Operasional** yang bisa mengubah feature flags
