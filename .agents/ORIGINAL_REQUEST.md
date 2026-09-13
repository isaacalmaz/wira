# Original User Request

## 2026-09-12T13:04:19Z

Ubah sistem aplikasi Wira dari pemblokiran lokasi ketat (Strict Geofencing) menjadi sistem pencocokan berbasis kedekatan (Proximity-based Matching) menggunakan PostGIS.

Working directory: /Users/ishakalmaazi/.gemini/antigravity/scratch/wira
Integrity mode: development

## Requirements

### R1. Hapus Pemblokiran Lokasi (Lazy GPS Load)
Ubah `HomePage.jsx` di `frontend-user` agar TIDAK LAGI meminta izin lokasi secara otomatis saat aplikasi dibuka, dan hapus sistem yang memblokir/mengubah menu menjadi abu-abu jika di luar wilayah. GPS hanya boleh diminta nanti di dalam halaman pesanan masing-masing (seperti WiraRide).

### R2. Sistem Pencocokan Driver Terdekat (PostGIS Nearest Neighbor)
Buat skrip SQL untuk menambahkan fungsi pencarian/RPC di Supabase yang mengurutkan dan mencari mitra (driver) terdekat ke koordinat pengguna menggunakan operator jarak PostGIS (`ST_Distance` atau `<->`). Sistem ini harus mencari tanpa batasan radius mutlak (terus diurutkan dari yang paling dekat).

### R3. Bukti Verifikasi (Test Script)
Tim agen harus menyertakan skrip simulasi (misal: `test_proximity.js`) di *root folder* yang secara otomatis memasukkan beberapa koordinat driver palsu dan menguji apakah RPC benar-benar mereturn daftar driver dengan urutan jarak yang tepat secara matematis.

## Acceptance Criteria

### Pengalaman Pengguna (UX)
- [ ] Aplikasi `frontend-user` bisa dibuka, dan menu layanan tetap penuh warna dan bisa diakses tanpa peringatan "Izin lokasi ditolak".
- [ ] Pemanggilan fungsi `fetchLocationAndZones` saat aplikasi pertama kali dimuat (*init*) harus dihapus sepenuhnya.

### Backend & Akurasi
- [ ] Ada fungsi RPC baru di Supabase untuk mencari *Nearest Driver*.
- [ ] Skrip `test_proximity.js` berjalan sukses tanpa *error* dan membuktikan algoritma jarak bekerja.
