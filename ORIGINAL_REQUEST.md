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

## 2026-09-13T04:12:13Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: [none — teamwork routes from the description]

Merombak alur Top-Up WiraPay menggunakan QRIS Statis DANA dengan sistem "Kode Unik". Sistem akan membuang opsi Virtual Account yang membingungkan, dan menggantinya dengan alur transfer QRIS di mana sistem menambahkan 3 digit angka unik secara otomatis pada nominal top-up untuk mempermudah verifikasi manual oleh admin.

This is a single self-contained fix; keep it small and focused.

Working directory: /Users/ishakalmaazi/.gemini/antigravity/scratch/wira
Integrity mode: demo

## Requirements

### R1. Sistem Nominal Unik
Modifikasi tabel `topup_requests` (atau alur pembuatannya) agar setiap permintaan Top-Up mendapatkan tambahan kode unik 1-3 digit (misal: Rp 50.000 menjadi Rp 50.123). Pastikan nominal unik ini yang disimpan ke dalam database dan ditampilkan tebal (bold) kepada pengguna di halaman pembayaran.

### R2. Perombakan Antarmuka (UI) Top-Up
Hapus daftar opsi bank/Virtual Account yang berantakan dari modal Top-Up di aplikasi pelanggan. Tampilkan hanya satu opsi utama: "Pembayaran via QRIS (Wajib Sesuai Nominal)". Berikan instruksi yang sangat jelas agar pelanggan mentransfer tepat hingga 3 digit terakhir.

## Acceptance Criteria

### Fungsionalitas Kode Unik
- [ ] Terdapat skrip tes otomatis (misal: `test_unique_code.js`) yang membuat request top-up bayangan ke Supabase dan memverifikasi secara matematis bahwa nominal yang masuk ke database tidak berakhiran 000 (modulo 1000 > 0).

### Antarmuka Pengguna
- [ ] Kode sumber UI Top-Up tidak lagi memiliki opsi *hard-coded* bank BCA VA, BRI VA, dll. Hanya menampilkan alur QRIS Statis tunggal.
- [ ] Nominal unik yang harus dibayar ditampilkan dengan *highlight* atau warna berbeda pada 3 digit terakhirnya di antarmuka pelanggan.
