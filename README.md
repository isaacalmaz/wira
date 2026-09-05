# 🚀 Wira — Super App Lombok

Aplikasi super (super-app) untuk Mataram & Lombok, terinspirasi dari Gojek & Grab.

## 📁 Struktur Project

```
wira/
├── backend/          → API Server (Node.js + Express + Supabase)
├── frontend-user/    → Website untuk pengguna
├── frontend-admin/   → Dashboard admin
├── frontend-mitra/   → Dashboard mitra (driver, merchant, teknisi)
└── docs/             → Dokumentasi & panduan
```

## 🚀 Cara Menjalankan

### 1. Backend API
```bash
cd backend
npm install
cp .env.example .env
# Edit .env dengan data Supabase & WhatChimp Anda
npm run dev
```

### 2. Website User
```bash
cd frontend-user
npm install
npm run dev
```
Buka: http://localhost:5173

### 3. Dashboard Admin
```bash
cd frontend-admin
npm install
npm run dev
```
Buka: http://localhost:5174

### 4. Dashboard Mitra
```bash
cd frontend-mitra
npm install
npm run dev
```
Buka: http://localhost:5175

## 🎨 Warna Tema
- Primary (Turquoise Ocean): `#0891B2`
- Secondary (Sandy Gold): `#D97706`
- Accent (Coral Sunset): `#F97316`

## 💰 Mata Uang
- Indonesian Rupiah (IDR / Rp)

## 🌐 Bahasa
- 🇮🇩 Bahasa Indonesia (default)
- 🇬🇧 English

## 📱 Layanan
1. 🚗 WiraRide — Ojek & taksi online
2. 🍔 WiraFood — Pesan makanan
3. 📦 WiraSend — Kirim paket
4. 💰 WiraPay — Dompet digital
5. 📱 WiraPulsa — Pulsa & token listrik
6. 🏡 WiraVilla — Sewa villa
7. 🔧 WiraService — Jasa tukang & teknisi
8. 🏊 WiraPool — Maintenance kolam renang

## ⚙️ Cara Mengubah Pengaturan

### Mengubah Harga
Edit file: `backend/config/pricing.js`
Semua harga ada di satu file ini. Tinggal ubah angkanya.

### Mengubah Warna
Edit file: `frontend-user/tailwind.config.js` (dan frontend-admin, frontend-mitra)

### Mengubah Teks UI
Edit file: `frontend-user/src/i18n/id.json` (Bahasa Indonesia)
Edit file: `frontend-user/src/i18n/en.json` (English)

### Menghidupkan/Mematikan Fitur
Login ke Admin Dashboard → halaman Feature Flags → toggle ON/OFF

## 📞 Integrasi WhatsApp
Menggunakan WhatChimp API. Set API key di `.env` file backend.
