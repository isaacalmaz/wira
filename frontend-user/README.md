# Wira - Super App Lombok (Frontend)

Ini adalah frontend user-facing untuk aplikasi Wira, Super App pertama di Lombok.
Proyek ini dibangun menggunakan:
- **React 18** dengan Vite
- **Tailwind CSS** untuk styling (termasuk Dark Mode)
- **React Router v6** untuk navigasi
- **Context API** untuk state management (Language, Theme, Auth, Cart)
- **Leaflet & React-Leaflet** untuk peta
- **Lucide React** untuk ikon

## 📂 Struktur Proyek
- `src/config/`: Konfigurasi terpusat (`app.js`, `services.js`, `api.js`) agar mudah diubah tanpa menyentuh kode kompleks.
- `src/i18n/`: Dukungan dua bahasa (ID & EN).
- `src/data/`: Data mock untuk MVP (restoran, driver, lokasi, dll).
- `src/pages/`: Halaman-halaman utama (Home, Auth, Service Pages).
- `src/components/`: Komponen UI yang dapat digunakan kembali (Tombol, Input, Modal, dll).
- `src/context/`: State global aplikasi.

## 🚀 Cara Menjalankan

Karena Node.js mungkin tidak tersedia di lingkungan saat ini, Anda bisa menyalin folder proyek ini ke mesin lokal Anda atau menginstal Node.js.

1. **Install dependensi:**
   ```bash
   npm install
   ```

2. **Jalankan server pengembangan:**
   ```bash
   npm run dev
   ```

3. **Build untuk produksi:**
   ```bash
   npm run build
   ```

## 🎨 Fitur Utama
- **Multi-bahasa**: Tombol toggle bahasa di pojok kanan atas layar Home.
- **Dark Mode**: Didukung secara native dengan Tailwind (`dark:` classes).
- **Desain Modular**: Setiap fitur berada dalam domain komponennya masing-masing.
- **Data Mock**: Aplikasi ini berfungsi menggunakan data tersimulasi (seperti restoran, driver, dan lokasi).

Terima kasih telah berkontribusi pada pengembangan Super App Wira!
