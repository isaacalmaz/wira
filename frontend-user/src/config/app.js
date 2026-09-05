// =========================================
// ⭐ KONFIGURASI APLIKASI WIRA
// Ubah pengaturan di sini tanpa perlu
// menyentuh file kode lainnya!
// =========================================

export const APP_CONFIG = {
  // Nama aplikasi
  name: 'Wira',
  tagline: 'Super App Lombok',
  version: '1.0.0',

  // Bahasa default ('id' = Indonesia, 'en' = English)
  defaultLang: 'id',

  // Mata uang
  currency: 'IDR',
  currencySymbol: 'Rp',

  // Lokasi default (Mataram, NTB)
  defaultLocation: {
    lat: -8.5833,
    lng: 116.1167,
    name: 'Mataram, NTB',
  },

  // Region yang didukung
  regions: ['mataram', 'lombok_timur', 'senggigi', 'praya'],
};

// =========================================
// 🎨 WARNA TEMA — Vibes Pantai Lombok
// =========================================
export const THEME = {
  colors: {
    primary: '#0891B2',     // Turquoise ocean
    primaryLight: '#22D3EE',
    primaryDark: '#0E7490',
    secondary: '#D97706',   // Sandy gold
    secondaryLight: '#FBBF24',
    accent: '#F97316',      // Coral sunset
    accentLight: '#FB923C',
    dark: '#0F172A',        // Dark mode background
    light: '#F8FAFC',       // Light mode background
  },
};

export default APP_CONFIG;
