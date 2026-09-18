---
name: Wira Architecture & Conventions
description: Core conventions, monorepo structure, and critical environment constraints for the Wira App.
trigger: always_on
---

# Wira Project Context & Rules

## 1. Arsitektur Repositori (Monorepo)
Proyek ini memiliki 4 pilar utama, jangan sampai salah masuk direktori:
- `frontend-user/`: PWA React untuk Pelanggan.
- `frontend-mitra/`: Aplikasi React untuk Driver (disiapkan untuk Capacitor/APK).
- `frontend-admin/`: Aplikasi React untuk Admin. Komponen utama ada di `src/components/layout/` (seperti `AdminSidebar.jsx`, `AdminLayout.jsx`).
- `backend/`: Node.js Express server.

## 2. Aturan Eksekusi Terminal (Sandbox Bypass)
- **NPM Install**: Setiap perintah `npm install` untuk menambahkan paket baru HARUS dijalankan dengan mode di luar sandbox (`BypassSandbox: true`), karena registry NPM terblokir dari dalam sandbox (menghasilkan error ENOTFOUND).
- **Git Push**: Selalu komit dan dorong perubahan (push) menggunakan `BypassSandbox: true`.

## 3. Aturan Database & Migrasi (Supabase)
- Jangan mencoba mem-push skema database langsung via `supabase db push` jika gagal karena masalah otentikasi/sandbox.
- Buat file `.sql` baru di dalam folder `migrations/` (berurutan, misal `0037_add_fcm_token.sql`).
- Berikan instruksi kepada USER untuk mengeksekusi script SQL tersebut secara manual di Supabase SQL Editor.
