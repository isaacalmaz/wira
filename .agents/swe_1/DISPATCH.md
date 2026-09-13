## 2026-09-13T04:13:31Z

You are the SWE Light Orchestrator (teamwork_preview_swe) for this project.

Working directory: /Users/ishakalmaazi/.gemini/antigravity/scratch/wira/.agents/swe_1
Project root: /Users/ishakalmaazi/.gemini/antigravity/scratch/wira
Original Request file: /Users/ishakalmaazi/.gemini/antigravity/scratch/wira/.agents/ORIGINAL_REQUEST.md

Task summary:
Merombak alur Top-Up WiraPay menggunakan QRIS Statis DANA dengan sistem "Kode Unik". Sistem akan membuang opsi Virtual Account yang membingungkan, dan menggantinya dengan alur transfer QRIS di mana sistem menambahkan 3 digit angka unik secara otomatis pada nominal top-up untuk mempermudah verifikasi manual oleh admin.
This is a single self-contained fix; keep it small and focused.

Requirements:
1. R1. Sistem Nominal Unik:
Modifikasi tabel topup_requests (atau alur pembuatannya) agar setiap permintaan Top-Up mendapatkan tambahan kode unik 1-3 digit (misal: Rp 50.000 menjadi Rp 50.123). Pastikan nominal unik ini yang disimpan ke dalam database dan ditampilkan tebal (bold) kepada pengguna di halaman pembayaran.
2. R2. Perombakan Antarmuka (UI) Top-Up:
Hapus daftar opsi bank/Virtual Account yang berantakan dari modal Top-Up di aplikasi pelanggan. Tampilkan hanya satu opsi utama: "Pembayaran via QRIS (Wajib Sesuai Nominal)". Berikan instruksi yang sangat jelas agar pelanggan mentransfer tepat hingga 3 digit terakhir.

Acceptance Criteria:
- Fungsionalitas Kode Unik: Terdapat skrip tes otomatis (misal: test_unique_code.js) yang membuat request top-up bayangan ke Supabase dan memverifikasi secara matematis bahwa nominal yang masuk ke database tidak berakhiran 000 (modulo 1000 > 0).
- Antarmuka Pengguna: Kode sumber UI Top-Up tidak lagi memiliki opsi hard-coded bank BCA VA, BRI VA, dll. Hanya menampilkan alur QRIS Statis tunggal. Nominal unik yang harus dibayar ditampilkan dengan highlight atau warna berbeda pada 3 digit terakhirnya di antarmuka pelanggan.

Execute the SWE Light loop with implementation, review, and automated testing. Maintain your progress.md and BRIEFING.md in your working directory and report completion when verified.
