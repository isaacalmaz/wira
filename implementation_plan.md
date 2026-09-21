# Evaluasi dan Revamp Sistem Keuangan (Finance)

Berdasarkan analisis terhadap tangkapan layar yang diberikan, sistem webhook Mutasiku **berhasil bekerja dengan sempurna**, namun terjadi *Human Error* (kesalahan manusia) dalam penggunaan kode unik.

## 🕵️‍♂️ Apa yang Sebenarnya Terjadi dengan Uang Baiq Erliana?
1. Pada 20 September pukul 19:02, ada uang masuk dari **Baiq Erliana** sebesar **Rp 10.584** ke Mutasiku.
2. Di detik yang sama (19:02), sistem Wira otomatis menyetujui (Approved) Top-up sebesar **Rp 10.584**.
3. **MASALAHNYA**: Permintaan Top-up Rp 10.584 tersebut dibuat oleh akun **cobakunuser2**, BUKAN dari akun Baiq Erliana.
4. Karena sistem QRIS Statis Mutasiku hanya mendeteksi "Nominal Transaksi" (10.584), sistem Wira langsung memasukkan saldo tersebut ke dompet **cobakunuser2**. Sistem tidak peduli siapa nama pengirim di bank (Baiq Erliana), sistem hanya peduli siapa yang *meminta* kode unik 584 di dalam aplikasi Wira.
5. **Kesimpulan:** Baiq Erliana membayarkan kode unik tagihan milik `cobakunuser2`.

## 🛠️ Solusi & Rencana Pengembangan Tab Keuangan Admin

Tab Keuangan saat ini hanya menampilkan "Permintaan Top-Up", sehingga Admin bingung jika terjadi kasus salah transfer seperti ini. Kita akan merombak tab Keuangan dan menambahkan fitur **Koreksi Saldo Manual**.

### 1. Fitur Injeksi/Koreksi Saldo Manual (Admin)
- Menambahkan tombol "Koreksi Saldo" (Balance Correction) di halaman Admin (bisa di tab `Finance` atau `Users`).
- Admin bisa mencari nama pengguna (misal: Baiq Erliana), memasukkan nominal (misal: +10.584), dan menuliskan catatan (misal: "Koreksi salah transfer QRIS dari cobakunuser2").
- Sistem akan langsung menambahkan saldo ke Baiq Erliana dan mencatatnya di riwayat transaksinya.
- Admin juga bisa menarik saldo (-10.584) dari `cobakunuser2` yang menerima saldo nyasar tersebut.

### 2. Peningkatan Halaman Keuangan (FinancePage.jsx)
- **Tab Baru "Semua Transaksi":** Menampilkan seluruh pergerakan uang yang ada di tabel `transactions` (Top-up, Pembayaran Pesanan, Payout, Koreksi Saldo) secara *real-time*. Admin tidak lagi hanya melihat "Permintaan Top-Up", tapi bisa melihat "Uang ini masuk ke dompet siapa dan keluar untuk apa".
- **Desain Ulang Tabel Top-Up:** Memperjelas tampilan "Kode Unik" dan "Nominal Asli" agar Admin tahu mana yang dibayar oleh sistem secara otomatis (Mutasiku) dan mana yang manual.

## Keputusan yang Dibutuhkan
Apakah Anda setuju dengan rencana penambahan fitur "Koreksi Saldo Manual" dan perombakan tampilan "Riwayat Transaksi" di halaman Admin ini?
