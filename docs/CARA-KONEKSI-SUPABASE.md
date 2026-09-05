# 📖 Panduan Lengkap Menghubungkan Supabase ke Wira

Supabase adalah database PostgreSQL online yang gratis dan sangat cepat. Panduan ini dirancang langkah demi langkah agar mudah diikuti.

---

## 1. Buat Akun & Project di Supabase

1. Buka website: [https://supabase.com](https://supabase.com)
2. Klik tombol **Start your project** (bisa login menggunakan akun Google atau GitHub).
3. Klik tombol **New Project** (atau **Create Project**).
4. Isi data project:
   - **Name**: `Wira`
   - **Database Password**: Buat password yang aman (dan catat baik-baik).
   - **Region**: Pilih **Singapore (ap-southeast-1)** (paling dekat dan cepat untuk Indonesia / Lombok).
   - **Pricing Plan**: Pilih **Free Plan**.
5. Klik **Create new project** dan tunggu sekitar 1-2 menit sampai status database siap (*ready*).

---

## 2. Ambil Kunci API (URL & Keys)

Setelah project siap:
1. Di sidebar sebelah kiri, klik ikon **Project Settings** (gambar roda gigi di bagian paling bawah) -> pilih **API**.
2. Anda akan melihat bagian **Project URL** dan **Project API Keys**:
   - **Project URL**: contohnya `https://abcdefghijklm.supabase.co`
   - **anon / public key**: teks panjang yang diawali `eyJ...`
   - **service_role / secret key**: klik tombol **Reveal** untuk melihatnya (juga teks panjang `eyJ...`).

---

## 3. Jalankan Database Schema (Membuat Tabel)

Supabase menyediakan SQL Editor untuk membuat semua tabel Wira secara otomatis:

1. Di menu sidebar kiri Supabase, klik **SQL Editor** (ikon `>_` atau kertas SQL).
2. Klik **New query**.
3. Buka file `backend/database/schema.sql` di project Wira Anda, copy seluruh isinya, lalu paste ke dalam SQL Editor Supabase.
4. Klik tombol **Run** (tombol hijau). Jika muncul pesan *"Success. No rows returned"*, artinya semua tabel (users, orders, restaurants, feature_flags, dll) sudah berhasil dibuat!
5. (Opsional) Ulangi untuk file `backend/database/seed.sql` untuk memasukkan data awal.

---

## 4. Pasang ke Backend Wira

Di folder `backend`, buat file bernama `.env` (atau salin dari `.env.example`):

```env
SUPABASE_URL=https://project-kamu.supabase.co
SUPABASE_ANON_KEY=eyJh...anon-key-kamu...
SUPABASE_SERVICE_KEY=eyJh...service-role-key-kamu...
JWT_SECRET=kunci_rahasia_bebas_diisi_apa_saja_12345
PORT=5000
```

---

## 5. Jalankan Backend

Buka Terminal baru, lalu jalankan:

```bash
cd ~/.gemini/antigravity/scratch/wira/backend
npm run dev
```

Backend Wira sekarang sudah terhubung langsung ke Supabase!
