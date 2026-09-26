# Wira — Project Handoff & Continuation Guide

**Untuk**: agent AI (Antigravity atau lainnya) yang melanjutkan pekerjaan di project ini.
**Terakhir diperbarui**: 2026-09-26 (migration sampai 0085 + job CI `db-tests`; versi besar sebelumnya 2026-09-20 — baca ulang dari awal, jangan cuma diff mental dari versi lama).
**Repo**: `github.com/isaacalmaz/wira` (public), branch `main`.

---

## 0. Cara pakai dokumen ini (baca dulu sebelum bagian lain)

Dokumen ini ditulis supaya dua agent AI yang berbeda (Claude di sesi ini, dan agent lain seperti Antigravity di sesi lain) bisa **saling lempar pekerjaan** (ping-pong) tanpa kehilangan konteks, tanpa saling menimpa pekerjaan, dan tanpa mengulang kesalahan yang sudah pernah ditemukan dan diperbaiki.

Aturan main ping-pong:
1. **Sebelum mulai kerja apa pun**: baca dokumen ini penuh, lalu `git log --oneline -20` dan `ls migrations/ | tail -20` untuk konfirmasi keadaan nyata — dokumen ini bisa saja sudah sedikit basi dibanding commit terbaru.
2. **Setelah selesai kerja apa pun yang signifikan** (fitur baru, migration baru, perbaikan bug nyata): **update dokumen ini** — tambah baris di §3 (status), pindahkan item dari §5 (gap) ke §3 kalau sudah selesai, tambah pelajaran baru ke §6 kalau menemukan pola kegagalan baru. Jangan biarkan agent berikutnya menemukan ulang hal yang sudah kamu tahu.
3. **Jangan percaya status "✅ Berfungsi" di dokumen manapun tanpa verifikasi ulang ke kode/database asli** kalau kamu akan membangun sesuatu di atasnya — lihat §6.1, ini bukan teori, sudah beberapa kali terbukti status di dokumen tidak sama dengan kenyataan di database live.
4. **Migration yang sudah ditulis (file `.sql` ada di `migrations/`) belum tentu sudah dijalankan ke database production.** Selalu tanya user atau verifikasi langsung (lihat §2.4) sebelum berasumsi sebuah tabel/kolom/RPC/trigger benar-benar ada.

---

## 1. Apa itu project ini

Wira adalah super-app gaya Gojek/Grab untuk Lombok/Mataram, Indonesia — mencakup Ride (ojek), Send (kurir paket), Food (delivery makanan), Villa (penginapan), Service (jasa tukang/AC/dll), dan Pool (perawatan kolam renang). Live production dengan pengguna nyata dan uang sungguhan (WiraPay wallet).

**Struktur monorepo** (npm workspaces):
- `frontend-user/` — aplikasi pelanggan (React + Vite), deploy: `wira-user` di Vercel
- `frontend-mitra/` — aplikasi driver/merchant/teknisi (React + Vite), deploy: `wira-mitra`
- `frontend-admin/` — dashboard admin internal (React + Vite), deploy: `wira-admin`
- `backend/` — Express API (dipakai terbatas — sebagian besar frontend bicara LANGSUNG ke Supabase; backend hanya untuk hal yang butuh service-role/secret: Midtrans, Mutasiku webhook, FCM), deploy: `wira-backend` (juga di Vercel, sebagai serverless functions, BUKAN server terpisah)
- `migrations/` — SEMUA perubahan skema database, bernomor urut, **satu-satunya sumber kebenaran skema** (tapi baca §0 poin 4 — file ada ≠ sudah dijalankan)
- Database: Supabase Postgres (RLS, RPC/`SECURITY DEFINER` functions, Realtime, Storage)

Domain produksi backend saat ini: `https://wira-backend-seven.vercel.app` (bukan `wira-backend.vercel.app` — nama polos itu punya proyek Vercel orang lain, cek lewat MCP Vercel `list_deployments`/`get_deployment` kalau berubah lagi).

---

## 2. Aturan Keras — Jangan Dilanggar

### 2.1 Jangan pernah masukkan password ke form login siapapun
Untuk menguji alur yang butuh login, mint sesi asli tanpa password:
```js
const { data } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email });
const { data: session } = await supabaseAnon.auth.verifyOtp({
  email, token: data.properties.email_otp, type: 'email'
});
```
Session hasilnya bisa dipakai langsung di script Node (pasang sebagai header `Authorization: Bearer <access_token>` di client Supabase), atau di-inject ke `localStorage` browser dengan key `sb-<project-ref>-auth-token`.

### 2.2 Semua pergerakan uang lewat RPC terpusat — JANGAN buat jalur baru
- `create_order_and_pay(...)` — **SATU-SATUNYA jalan membuat order WiraPay** (migration 0070): insert order + debit `total_price` hasil hitung server + baris ledger + `payment_status='paid'` dalam satu transaksi. Sengaja `SECURITY INVOKER` (lihat §6.8). Trigger `enforce_orders_state_machine` menolak order `wallet`/`paid` dari jalur lain.
- `wallet_pay(p_amount, p_description)` — debit dompet (sekarang hanya untuk "Bayar Merchant" di WalletPage — JANGAN dipakai untuk order)
- `wallet_transfer(...)` — transfer antar user (by phone)
- `wallet_refund(p_order_id, p_description)` — refund order yang masih `pending`
- `wallet_refund_matched_ride(p_order_id, p_description)` — batalkan ride yang sudah dapat driver, refund penuh, bisa dipanggil pelanggan ATAU driver
- `submit_review_and_tip(p_order_id, p_rating, p_review_text, p_tip_amount)` — review + tip sekaligus
- `create_order_awaiting_qris(...)` — order yang dibayar langsung lewat QRIS statis (migration 0077; di app: Pool/Villa): parameter harga sama dengan `create_order_and_pay` (tanpa deskripsi), hanya pool/send/service/villa. Membuat order WiraPay (`wallet`, `unpaid`) berstatus **`awaiting_payment`** + satu `topup_requests` pending (`method='manual'`) sebesar `CEIL(total/1000)*1000`, yang lalu ditambah kode unik 101–999 oleh trigger 0045, ditautkan lewat kolom baru `topup_requests.order_id`. Mengembalikan `{order, qris_amount}`. Juga `SECURITY INVOKER` (§6.8).
- Pembayarannya **tidak** lewat RPC baru: begitu top-up tertaut di-approve (webhook via `approve_topup_and_credit`, atau admin via `approve_topup_request`), trigger DEFERRED `trg_pay_order_after_qris_topup` (0078) mendebit `total_price` dari saldo yang baru dikredit, menulis ledger `payment`, dan memindah order ke `pending`/`paid`. Tidak pernah raise: kalau order sudah batal/kedaluwarsa, uangnya tetap di saldo WiraPay.
- `cancel_awaiting_qris_order(p_order_id)` — pelanggan membatalkan order `awaiting_payment` miliknya sendiri (0078).
- `approve_topup_and_credit(p_request_id, p_expected_amount, p_expected_method, p_description, p_reference_id)` — **service_role-only**, dipakai webhook top-up Midtrans/Mutasiku (migration 0071): approve + kredit saldo + baris ledger dalam SATU transaksi. Mengembalikan `'approved'`/`'already_processed'`/`'not_found'`.
- `credit_wallet_balance_atomic(p_user_id, p_amount)` — **service_role-only**, tidak dipakai lagi oleh webhook sejak 0071 (dibiarkan ada); jangan panggil dari client manapun

Pemakaian promo juga bukan urusan client lagi (0076): dihitung trigger `trg_orders_promo_usage` di transaksi INSERT order itu sendiri; `increment_promo_usage` sudah di-REVOKE dari `anon`/`authenticated` (tinggal `service_role`).

Semua RPC saldo di atas (kecuali yang disebut INVOKER): `SECURITY DEFINER`, pakai `FOR UPDATE` row lock sebelum cek/ubah saldo, idempotent. Kalau butuh pola baru yang mirip (mis. "kredit saldo dari webhook baru"), **buat RPC baru yang sesempit mungkin scope-nya dan REVOKE dari `anon`/`authenticated`**, jangan reuse RPC lama dengan cara yang melonggarkan siapa yang boleh memanggilnya.

### 2.3 "RLS trap" — WAJIB dicek di SETIAP `.update()`/`.delete()`
Update/delete yang diblokir RLS mengembalikan `error: null` dengan **0 baris** — terlihat seperti berhasil kalau tidak dicek row count. Pola wajib:
```js
const { data, error } = await supabase.from('x').update({...}).eq('id', id).select();
if (error) throw error;
if (!data || data.length === 0) throw new Error('Akses ditolak atau data tidak ditemukan.');
```
**Perluasan penting dari sesi ini**: jebakan yang sama berlaku kalau KAMU sendiri yang menulis skrip verifikasi keamanan — pernah terjadi skrip audit sendiri melaporkan "FAIL" palsu (dan bisa juga sebaliknya, "PASS" palsu) karena cuma mengecek `!!error`, bukan benar-benar membandingkan state sebelum/sesudah di database. **Saat menguji apakah sesuatu terblokir, selalu baca ulang row-nya dari database (pakai service-role client) sebelum dan sesudah percobaan, jangan cuma percaya ada/tidaknya `error`.**

### 2.4 Migration = satu-satunya sumber kebenaran skema — TAPI file ada ≠ sudah jalan
- Format: `migrations/00XX_deskripsi.sql`, nomor urut, header comment berisi ALASAN (bukan cuma "apa").
- **Agent AI tidak punya akses eksekusi DDL langsung** — migration harus dijalankan MANUAL oleh user lewat Supabase SQL Editor.
- **Selalu cek nomor migration tertinggi yang ada SEBELUM menulis migration baru**: `ls migrations/ | grep -E '^00[0-9]{2}_' | sort | tail -5`.
- Update `migrations/README.md` dengan baris baru untuk setiap migration baru.
- **BARU, penting**: di sesi ini ditemukan berkali-kali bahwa migration yang sudah "dijalankan" ternyata sebagian statement-nya tidak benar-benar tereksekusi (lihat §6.2 dan §6.3) — dan bahwa `orders.metadata` (migration 0034, ditulis JAUH sebelum sesi ini) ternyata tidak pernah benar-benar diterapkan meski tercatat "applied" di README. **Jangan pernah anggap sebuah kolom/tabel/RPC/trigger pasti ada di database live hanya karena file migration-nya ada dan README bilang sudah jalan** — kalau kode baru bergantung padanya, verifikasi langsung dulu (`select()` kolom itu lewat service-role client, cek errornya) sebelum membangun di atasnya, atau minimal beri tahu user untuk konfirmasi.
- **Setelah migration dijalankan, JANGAN cuma percaya "sudah saya jalankan" dari user** — selalu jalankan skenario verifikasi nyata (buat data uji, coba eksploitasi/aksi yang seharusnya diblokir/berhasil, cek state sebelum-sesudah, bersihkan data uji). Ini sudah terbukti berkali-kali menemukan migration yang gagal sebagian tanpa ada yang sadar.

### 2.5 RLS policy bisa ada di luar riwayat migration — tidak bisa ditemukan lewat grep
Ditemukan di sesi ini: ada kebijakan RLS bernama `"Public feature_flags"` (`FOR ALL USING (true)`) di tabel `feature_flags` yang **tidak cocok dengan `CREATE POLICY` manapun di seluruh riwayat `migrations/`** — kemungkinan besar dibuat manual lewat Supabase Studio UI di masa lalu, di luar jalur migration sama sekali. Ini membuat semua perbaikan RLS yang ditulis lewat migration (walau secara logika benar) tetap tidak berefek, karena kebijakan permisif lama itu di-OR-kan dengan kebijakan baru.

**Pelajaran**: `pg_policies` tidak bisa di-query lewat PostgREST (hanya lewat SQL Editor langsung oleh user) — kalau curiga ada kebijakan siluman seperti ini (misal: perbaikan RLS sudah ditulis benar tapi tetap tidak berefek saat diverifikasi live), minta user menjalankan:
```sql
SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = '<nama_tabel>';
```
dan baca hasilnya baris demi baris — jangan asumsikan cuma kebijakan yang kamu tulis sendiri yang ada di tabel itu.

### 2.6 Vercel ada di plan Hobby — limit 100 deploy/hari
Setiap `git push` ke `main` men-deploy ke **4** project Vercel sekaligus sekarang (`wira-user`, `wira-mitra`, `wira-admin`, `wira-backend` — backend juga sudah pindah ke Vercel serverless, bukan lagi asumsi server terpisah). 1 push = 4 deploy. **Gabungkan perubahan jadi commit yang lebih sedikit dan besar**, jangan push setiap perbaikan kecil satu-satu.

### 2.7 Kerja paralel (kalau pakai banyak agent/subagent sekaligus)
- Batasi file yang boleh disentuh masing-masing agent dengan jelas dan eksplisit di prompt-nya.
- Kalau sebuah sub-agent gagal di tengah jalan karena rate limit sesi (bukan karena error di kodenya sendiri) — **lanjutkan agent yang sama** (kalau tool-nya mendukung, mis. `SendMessage` ke agent id-nya) alih-alih langsung membuat agent baru dari nol; itu menghemat context yang sudah dibangun DAN mengurangi risiko dua agent menyentuh file yang sama secara bersamaan. Sebelum melanjutkan, cek dulu apakah agent yang gagal itu sempat meninggalkan efek samping nyata yang belum dibereskan (misal: mengubah data akun asli untuk testing) — jangan asumsikan otomatis sudah di-revert.
- Kalau lingkungan menolak sebuah aksi dengan alasan seperti "Credential Materialization" (mencoba menulis secret/API key ke file baru) — **jangan cari cara untuk mengakalinya**. Itu pengaman yang disengaja. Cari cara verifikasi lain (misal: minta user menjalankan query/perintah tertentu sendiri dan kirim hasilnya balik) alih-alih memaksa jalan yang diblokir.

---

## 3. Status Saat Ini (2026-09-20, diperbarui 2026-09-25)

**Update 2026-09-25:** migration **0070** sudah dijalankan DAN diverifikasi live (skrip verifikasi rollback-only, 8/8 lulus, frontend sudah di-merge & deploy). Menutup celah "cetak saldo WiraPay": order `wallet`/`paid` bisa dibuat tanpa bayar lalu di-refund, termasuk lewat opsi "Transfer Bank" di Pool/Villa. **0071** (webhook top-up atomik) — cek `migrations/README.md` untuk status apply-nya.

**Update 2026-09-26:** migration **0071–0085 sudah ditulis** (0074–0085 dirangkum di tabel bawah). Per 2026-09-26 user mengonfirmasi **0071–0083 sudah dijalankan** di project Wira (0079/0080 juga dicek dari luar dengan anon key: `permission denied`); **0084–0085 belum tentu** — cek dulu (§2.4), dan ikuti urutan deploy yang tertulis di baris README masing-masing (mis. 0076 sebelum frontend, 0080 dan 0084 SETELAH frontend). 0078, 0079 dan 0080 diverifikasi di PostgreSQL 16 lokal saat ditulis, dan sejak 2026-09-26 **CI menjalankan migration uang/keamanan secara otomatis** (job `db-tests`, lihat §6.9).

Migration **0001–0060 sudah ditulis**; per pengecekan terakhir sesi ini, **0001–0060 sudah dikonfirmasi dijalankan dan sebagian besar sudah diverifikasi live** (lihat catatan khusus di baris masing-masing). Selalu cek `ls migrations/` untuk nomor real-time terbaru — dokumen ini bisa tertinggal.

| Area | Status |
|---|---|
| Ride, Food, Send, Villa, Service, Pool (order lifecycle dasar) | ✅ Berfungsi |
| **Harga order dihitung ulang di server** (bukan lagi dipercaya dari client) | ✅ Baru selesai sesi ini (migrations 0057–0060), diverifikasi live untuk 10 skenario per jenis layanan |
| **Admin bisa ubah harga APAPUN kapan saja** (Ride via `vehicles`, Send/Service/Pool/ongkir Food via `pricing_rules` baru) — satu halaman `/pricing` "Manajemen Harga" | ✅ Baru selesai sesi ini, diuji live edit-simpan-verifikasi |
| Wallet (top-up manual QRIS, pay, transfer, refund) | ✅ Berfungsi |
| **Order wajib login** (guest checkout ditutup) | 2026-09-25, migration 0074: `orders_insert_own` = `auth.uid() IS NOT NULL AND auth.uid() = user_id`, `REVOKE INSERT ON orders FROM anon`. Dulu anon key bisa INSERT order pending tanpa akun → muncul di job feed dan di-dispatch ke driver asli (spam). |
| **Utang komisi order tunai** | 2026-09-25, migration 0075: `credit_payout_on_order_completed` tetap mengkredit bagian 80%, lalu untuk order `cash` mendebit penagih (`driver_id`, kalau tidak ada: pemilik merchant) sebesar `total_price` penuh. `payable_balance` boleh **negatif** (CHECK `users_payable_balance_nonneg` dari 0028 di-drop); `request_payout` sudah menolak `amount > payable_balance`, jadi saldo negatif memblokir penarikan. `wallet`/`transfer` tidak berubah. |
| **Pemakaian promo dihitung di server** | 2026-09-25, migration 0076: trigger `trg_orders_promo_usage` → `consume_promo_for_order` (hanya bisa jalan dari trigger). Kolom baru `promos.per_user_limit` (NULL = tanpa batas). Kuota habis / batas per-user tercapai → order **gagal dengan error** (`Kuota promo ... sudah habis` / `... sudah Anda gunakan ...`), bukan diam-diam harga penuh. Kode tak dikenal/kedaluwarsa tetap diam-diam tanpa diskon (0059). Order batal tidak dihitung ke `per_user_limit`; sejak 0082 kuota global juga dikembalikan saat order batal (lihat baris 0082). |
| **Pool/Villa bayar langsung QRIS statis** (pengganti "Transfer Bank") | 2026-09-25, migrations 0077 + 0078 (terapkan bersamaan, sebelum frontend). Status order baru **`awaiting_payment`**: tidak terlihat mitra/dispatch (semuanya cuma melihat `pending`); client tidak bisa accept/klaim/memindah order itu selain membatalkan, dan tidak bisa memindah order apa pun KE `awaiting_payment` (`trg_guard_awaiting_payment_orders`). Kedaluwarsa via pg_cron **`wira-expire-qris-orders`** (tiap menit): belum dibayar 15 menit → `cancelled`; top-up tertaut yang pending > 2 jam (jendela pencocokan webhook) → `cancelled`. Alur RPC-nya di §2.2. |
| **Kebocoran data ke anon key ditutup** | 2026-09-25, migration 0079: `users_select` tanpa cabang guest (dulu anon bisa baca baris penuh driver order guest), `orders_select_own_or_relevant` / `orders_update_mitra_or_admin` mensyaratkan login di cabang job feed, policy "Anyone can check pending amounts" di `topup_requests` di-drop (kode unik tetap dicek lewat `get_pending_topup_codes`), dan REVOKE SELECT/INSERT/UPDATE/DELETE anon di `users`, `orders`, `topup_requests`. |
| **Profil lawan transaksi lewat RPC, lokasi driver tidak publik** | 2026-09-25, migration 0080: `users_select` = baris sendiri atau admin saja. Nama/telepon/kendaraan pihak lain lewat `get_counterparty_profiles(uuid[])` (DEFINER, authenticated saja, hanya `id, name, phone, vehicle_type`; aturan siapa-boleh-lihat-siapa sama dengan `users_select` lama + pelanggan yang me-review driver tsb). `drivers` SELECT = diri sendiri, admin, atau driver order milik pemanggil yang belum selesai. Anon di-REVOKE dari `drivers`, `driver_locations` (juga authenticated) dan `get_nearest_drivers`/`find_nearest_drivers`. **Frontend dulu, baru apply** (`services/profileService.js` fallback ke baca langsung selama RPC belum ada). |
| **Top-up manual kedaluwarsa** | 2026-09-26, migration 0081: `expire_awaiting_qris_orders()` (cron `wira-expire-qris-orders`, tiap menit) membatalkan `topup_requests` pending non-Midtrans: yang terkait order setelah **2 jam** (jendela webhook Mutasiku), top-up wallet biasa setelah **24 jam** (admin masih bisa approve manual pembayaran yang terlewat webhook). Wallet menyembunyikan request > 24 jam. |
| **Kuota promo kembali saat order batal** | 2026-09-26, migration 0082: kolom `orders.promo_usage_id` diisi trigger insert HANYA kalau 0076 benar-benar memakai kuota (klien tidak bisa memalsukan); trigger AFTER UPDATE ke `cancelled` mengembalikan tepat satu pemakaian (tidak pernah < 0, tidak dobel walau admin un-cancel/cancel lagi). `consume_promo_for_order` kini mengembalikan id promo (jangan jalankan ulang 0076 setelah 0082). Order sebelum 0082 tidak punya penanda → tidak dikembalikan. |
| **Jendela dispatch dari waktu bayar** | 2026-09-26, migration 0083: kolom `orders.paid_at` diisi trigger pembayaran QRIS (0078); `dispatch_due_orders` memakai `COALESCE(paid_at, created_at)` untuk jendela 30 menit; trigger kecil menolak klien mengisi/mengubah `paid_at`. |
| **Data pendaftaran mitra tidak lagi publik** | 2026-09-26, migrations 0084 + 0085: pendaftaran mitra (termasuk foto SIM/STNK) dulu satu daftar JSON di baris `feature_flags` `region='mitra_registrations'` yang bisa dibaca & ditimpa siapa saja (anon juga). Sekarang tabel `mitra_applications` (baca: pendaftar sendiri/admin; ubah: admin; kirim lewat RPC `submit_mitra_application`), data lama disalin lalu barisnya dihapus, tulis `feature_flags` kembali admin saja. Spesialisasi teknisi untuk ServicePage lewat `get_technician_profiles()`. Deploy frontend dulu, baru jalankan 0084+0085. |
| **CI menguji migration uang/keamanan** | 2026-09-26: job `db-tests` di `.github/workflows/ci.yml` (Postgres 16) menerapkan 0045, 0046, 0059, 0070, 0071, 0074, 0076–0080, 0072, 0081–0085 apa adanya di atas stub Supabase kecil lalu menjalankan asersi SQL. Lihat §6.9 dan `db-tests/README.md`. |
| **Dispatch driver di server** (ping 1 driver tiap 15 detik, tetap jalan walau app pelanggan ditutup) | 2026-09-25, migrations 0072 (fungsi) + 0073 (pg_cron). `backend/routes/dispatch.routes.js`. Butuh secret `dispatch_cron_secret` di Supabase Vault = env `DISPATCH_CRON_SECRET` di Vercel wira-backend. Order yang lebih tua dari 30 menit tidak di-dispatch lagi. |
| **Checkout WiraPay atomik** (order + debit harga server dalam satu transaksi, `create_order_and_pay`) | ✅ 2026-09-25, migration 0070, diverifikasi live. "Transfer" sekarang tersimpan sebagai `payment_method='transfer'`, `unpaid` |
| **Top-up QRIS terverifikasi OTOMATIS via webhook Mutasiku** (mutasi bank DANA) | ✅ Baru sesi ini — `backend/routes/mutasiku.js`, tidak perlu admin approve manual lagi untuk top-up manual |
| Midtrans (top-up alternatif) | ✅ Kode benar (signature verification, idempotent), **kredensial asli masih belum diisi** (lihat §4) — QRIS manual + Mutasiku sekarang jalur utama yang live |
| **Keamanan menyeluruh** (self-escalation admin, fabrikasi order/payout, RLS terbuka di beberapa tabel) | ✅ Diaudit penuh dan diperbaiki sesi ini (migrations 0050–0056) — lihat §6.2 untuk detail apa yang ditemukan dan kenapa itu penting dibaca sebelum menyentuh RLS/RPC manapun |
| Panel admin (`frontend-admin`) role-gating | ✅ Semua route sekarang butuh role admin (dulu cuma satu halaman yang dijaga), role dibaca dari `public.users` bukan dari JWT yang bisa diset user sendiri |
| Pembagian pendapatan mitra (komisi 20% platform) | ✅ Berfungsi, trigger di migration 0028, sekarang dilindungi dari fabrikasi (0051/0054) |
| Split portal Driver/Restoran/Villa/Teknisi | ✅ Berfungsi, order update sekarang di-scope ke kepemilikan asli (0053/security-fix frontend-mitra) |
| Rating & Tipping | ✅ Berfungsi, race condition disave (0053) |
| Refund order pending DAN order yang sudah dapat driver | ✅ Berfungsi |
| Sistem promo/kupon (Ride + Food + **sekarang juga Send/Service/Pool**) | ✅ Berfungsi, harga promo sekarang diverifikasi ulang di server juga (bukan cuma dipercaya dari client); pemakaian dihitung server sejak 0076 (lihat baris di atas) |
| Push notification (FCM) | ✅ Kode berfungsi untuk beberapa event order, **endpoint `/order-alert` sekarang dibatasi cuma pihak sah di order yang boleh saling kirim** (dulu siapa saja bisa kirim notif ke siapa saja) |
| PWA (user + mitra installable) | ✅ Berfungsi |
| Dashboard admin (analytics real) | ✅ Berfungsi |

---

## 4. Tindakan Manual yang Masih Ditunggu dari User (bukan kode)

1. **Rotasi Firebase Admin service-account key** — key lama sempat ter-commit ke repo public (masih di riwayat git lama, sudah di-untrack ke depan). Firebase Console → Project Settings → Service Accounts.
2. **Generate VAPID key** untuk web push — tanpa ini `getToken()` FCM gagal di browser standar.
3. **Isi kredensial asli Midtrans** kalau akun merchant-nya sudah disetujui — saat ini QRIS manual + Mutasiku adalah jalur top-up utama yang live, Midtrans masih placeholder/sandbox.
4. **(Opsional, disarankan)** Jalankan sekali audit `pg_policies` menyeluruh untuk tabel-tabel lain yang belum pernah dicek (lihat §2.5) — sesi ini sudah cek `users/orders/merchants/drivers/reviews/notifications/operational_zones/topup_requests` dan bersih, tapi belum semua tabel di skema.
5. ~~**`topup_requests`'s kebijakan "Anyone can check pending amounts"** sedikit longgar~~ — di-drop oleh migration 0079 (berlaku setelah 0079 dijalankan).
6. **Jalankan 0084+0085 di Supabase kalau belum** (setelah frontend-nya ter-deploy; 0071–0083 sudah dikonfirmasi jalan 2026-09-26) (cek dulu, §2.4), dengan urutan deploy di baris `migrations/README.md` masing-masing. 0078 butuh pg_cron (sama seperti 0073); setelah apply cek `SELECT jobname, schedule FROM cron.job;` memuat `wira-expire-qris-orders`.

---

## 5. Gap yang Sengaja Belum Dikerjakan (didokumentasikan, bukan lupa)

- **Send/Service/Pool masih flat-fee**, tidak berbasis jarak seperti Ride — keputusan produk kalau mau diubah jadi berbasis jarak, bukan bug.
- **Order yang dibatalkan driver** sudah di-requeue otomatis (sudah selesai, HAPUS dari daftar gap versi lama — ini FITUR yang SUDAH ADA, migration 0048).
- **Dispatch hanya untuk ride/send/pool/service** (bukan food — food menunggu merchant dulu). Kandidat ride/send diambil dari `get_nearest_drivers` (tanpa filter preferensi job driver dari 0033), sama seperti loop client lama.
- **Notifikasi push** belum menutupi semua event/semua service_type — masih ada celah cakupan (bukan celah keamanan, cuma belum lengkap).
- **`frontend-admin` sengaja tidak dibuat installable (PWA penuh)** — dianggap tooling internal staff.
- **`payment_method='transfer'` belum punya rekening tujuan** — 0075 sengaja tidak mengubahnya; butuh keputusan produk.
- **QRIS langsung** di level DB diizinkan untuk pool/send/service/villa (`create_order_awaiting_qris`), tapi yang dipasang di frontend baru Pool/Villa. Ride/Food ditolak RPC-nya.
- **`db-tests` belum mencakup** tick dispatch pg_cron → backend (0073; dari 0072 hanya `dispatch_due_orders` yang diuji), payout/utang komisi (0028/0075), PIN (0063–0069) dan guardrail klaim (0054) — objek-objek itu tidak ada di stub.
- **Villa `nights`/`guests` masih sebagian di `details` (teks bebas)** — sudah ada kolom `nights` terstruktur sekarang (migration 0058) dan dipakai untuk verifikasi harga, tapi `guests` belum punya kolom sendiri kalau suatu saat perlu diverifikasi juga.

---

## 6. Cara Kerja yang Terbukti Efektif — dan Kegagalan Nyata yang Sudah Ditemukan

### 6.1 Audit dulu, baru perbaiki — jangan percaya laporan/dokumentasi begitu saja
Selalu verifikasi ke kode dan database ASLI sebelum bertindak atau melapor selesai. Dokumen status (termasuk dokumen ini!) bisa basi.

### 6.2 Kerahkan agent paralel untuk audit besar, tapi review manual sebelum eksekusi
Sesi ini mengerahkan 5 agent paralel untuk audit keamanan menyeluruh (backend, RLS/RPC database, alur uang, frontend-user, frontend-mitra+admin), lalu 5 agent lagi untuk memperbaiki semua temuan. Pola ini efektif — TAPI migration SQL kritis (terutama yang menyangkut RLS/trigger/uang) tetap direview manual baris-per-baris sebelum diminta user menjalankannya, bukan langsung dipercaya dari laporan agent. Salah satu agent bahkan mengoreksi instruksi saya sendiri yang ternyata salah (`merchant_id` bukan user id) setelah dia baca kode asli — bukti kenapa agent perlu diberi kebebasan mengecek ulang, bukan cuma ikut instruksi buta.

### 6.3 Migration bisa "berhasil dijalankan" tapi sebagian tidak berefek
Ditemukan berkali-kali di sesi ini:
- `credit_wallet_balance_atomic` RPC sempat masih bisa dipanggil user biasa meski migration yang membatasinya sudah "dijalankan" — baru ketahuan setelah tes live dengan akun non-admin sungguhan.
- Kebijakan RLS `feature_flags` sempat masih longgar dua kali berturut-turut meski sudah ditambal dua migration berbeda — akar masalahnya kebijakan siluman (§2.5), bukan migration yang salah tulis.

**Jangan pernah anggap migration selesai hanya karena user bilang "sudah dijalankan" dan tidak ada pesan error yang dilaporkan.** Selalu jalankan uji skenario nyata sesudahnya.

### 6.4 Uji nyata untuk hal berisiko (uang, akses lintas-user, harga)
Buktikan dengan skenario konkret: kirim harga yang sengaja salah dari client, pastikan server yang menang; coba klaim order sebagai driver padahal bukan; coba akses data user lain; dst. Selalu bersihkan data uji setelahnya (hapus baris test, kembalikan saldo yang sempat berubah).

### 6.5 Build ketiga/keempat workspace setelah perubahan apapun, cek output PENUH
`npm run build --workspace=X` — **jangan pernah** cuma cek `| tail -N`. Sesi sebelumnya pernah error build nyata tersembunyi di tengah output dan luput semalaman karena cuma cek beberapa baris terakhir.

### 6.6 Commit dengan pesan yang menjelaskan KENAPA, bukan cuma APA
Keputusan kebijakan bisnis/keamanan didokumentasikan di header migration karena itu keputusan produk/keamanan, bukan cuma catatan teknis — agent berikutnya (atau manusia) butuh alasan itu untuk tidak mengulang kesalahan yang sama.

### 6.7 Jujur soal yang tidak sempat diuji
Kalau ada bagian yang tidak bisa diverifikasi (mis. kredensial sandbox tidak ada), katakan dengan jelas, jangan diam-diam diasumsikan berhasil.


### 6.8 SECURITY DEFINER melewati trigger harga — dan uang tidak boleh dua langkah
- Trigger harga 0059 dan pemeriksaan INSERT di `enforce_orders_state_machine` hanya jalan kalau `current_user` adalah `authenticated`/`anon`. Di dalam fungsi `SECURITY DEFINER`, `current_user` = pemilik fungsi, jadi harga dari client **dipercaya begitu saja**. Karena itu `create_order_and_pay` sengaja `SECURITY INVOKER` dan hanya bagian debit saldo (`charge_wallet_for_order`) yang DEFINER. Periksa ini setiap kali menulis RPC baru yang meng-INSERT ke `orders`.
- Setiap alur uang yang terdiri dari beberapa panggilan terpisah dari client/backend (bayar lalu insert; approve lalu kredit) pasti punya celah: langkah pertama berhasil, langkah kedua gagal atau dilewati. Gabungkan jadi satu fungsi Postgres (satu transaksi). 0070 dan 0071 dua-duanya memperbaiki pola ini.
- Cara verifikasi live tanpa service-role key dan tanpa jejak data: skrip `DO` di SQL Editor yang ganti identitas (`set_config('request.jwt.claims', ...)` + `SET LOCAL ROLE authenticated`), menjalankan skenario, lalu **selalu diakhiri `RAISE EXCEPTION` berisi ringkasan hasil** sehingga seluruh transaksi di-rollback. Selalu uji juga skrip itu terhadap kode LAMA untuk memastikan skripnya benar-benar bisa gagal.
- Hal yang sama berlaku untuk `create_order_awaiting_qris` (0077, INVOKER). Trigger `BEFORE INSERT` di `orders` jalan **urut nama**; untuk harga/pembayaran urutannya: harga (0059) → state machine (0051/0070) → promo (0076) → `trg_zz_orders_await_qris` (0077, sengaja `zz` supaya jalan setelah state machine yang hanya menerima `pending`). Menambah trigger baru di `orders` = perhatikan namanya.

### 6.9 Uji migration uang/keamanan di CI (`db-tests/`)
- `db-tests/run.sh` membuat database baru, memuat `schema_stub.sql` (role Supabase, `auth.uid()` dari `request.jwt.claim.sub`, default grant, stub `cron.schedule`, tabel minimal dengan policy **sebelum** 0074/0079/0080), menerapkan file migration ASLI yang terdaftar di `MIGRATION_FILES`, lalu menjalankan `db-tests/tests/*.sql`. Setiap asersi `RAISE` kalau gagal dan psql jalan dengan `ON_ERROR_STOP=1`, jadi job CI merah.
- Lokal: `PGHOST=... PGPORT=... PGUSER=postgres WIRA_TEST_DB=nama_db db-tests/run.sh` (database itu di-DROP lalu dibuat ulang; role dibuat hanya kalau belum ada).
- **Migration baru yang menyentuh uang/RLS**: tambahkan filenya ke `MIGRATION_FILES` (plus objek stub yang dibutuhkan — jangan salin isi fungsi migration lain ke stub) dan satu file test. Pastikan test-nya bisa gagal (ubah satu asersi, lihat merah, kembalikan).
- Ini melengkapi, **bukan menggantikan**, verifikasi live (§2.4, §6.3): stub bukan database produksi, dan kebijakan siluman (§2.5) tidak akan terlihat di sini.

---

## 7. File/Lokasi Penting untuk Orientasi Cepat

- `migrations/README.md` — riwayat lengkap semua migration dengan alasan masing-masing. **Baca entri 0050–0060 kalau mau paham keputusan keamanan & harga terbaru** — ditulis sangat detail termasuk kegagalan yang ditemukan di tengah jalan.
- `migrations/0059_orders_server_side_price_computation.sql` — jantung sistem harga baru, baca headernya kalau mau ubah rumus harga jenis layanan manapun.
- `frontend-mitra/src/services/orderService.js` — logika inti routing order antar driver/merchant/teknisi (`eligibleServiceTypesForDriver`), SATU-SATUNYA tempat aturan "motor vs mobil boleh terima order apa" — jangan duplikasi di tempat lain.
- `migrations/0028_mitra_payout_system.sql` — rumus pembagian komisi 20% platform, sekarang dilindungi trigger `enforce_orders_state_machine` (0051/0054) dari fabrikasi.
- `backend/routes/mutasiku.js` — webhook verifikasi top-up otomatis, baca komentarnya untuk paham skema signature Mutasiku.
- `frontend-admin/src/pages/VehiclesPricingPage.jsx` + `PricingRulesSection.jsx` — satu halaman admin untuk semua harga.
- `db-tests/` + job `db-tests` di `.github/workflows/ci.yml` — uji SQL otomatis migration uang/keamanan; `db-tests/README.md` mencatat migration mana yang diterapkan asli dan apa yang di-stub.
- `backend/.env`, `frontend-*/.env` — kredensial lokal (tidak di-commit).
