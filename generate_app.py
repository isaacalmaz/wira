import os

base_dir = '/Users/ishakalmaazi/.gemini/antigravity/scratch/wira/frontend-user'

files = {
    'src/config/app.js': '''// =========================================
// ⭐ KONFIGURASI APLIKASI WIRA
// Ubah pengaturan di sini tanpa perlu
// menyentuh file kode lainnya!
// =========================================
export const APP_CONFIG = {
  name: 'Wira',
  tagline: 'Super App Lombok',
  version: '1.0.0',
  defaultLang: 'id',
  currency: 'IDR',
  currencySymbol: 'Rp',
  defaultLocation: { lat: -8.5833, lng: 116.1167, name: 'Mataram, NTB' },
};

export const THEME = {
  colors: {
    primary: '#0891B2',
    secondary: '#D97706',
    accent: '#F97316',
  },
};
''',
    'src/config/services.js': '''// Konfigurasi semua layanan Wira
export const SERVICES = [
  { id: 1, key: 'wira_ride', name_id: 'WiraRide', name_en: 'WiraRide', icon: 'Car', path: '/ride', color: 'bg-cyan-500', description_id: 'Transportasi cepat & aman', description_en: 'Fast & safe transport' },
  { id: 2, key: 'wira_food', name_id: 'WiraFood', name_en: 'WiraFood', icon: 'Utensils', path: '/food', color: 'bg-orange-500', description_id: 'Pesan makanan favorit', description_en: 'Order favorite food' },
  { id: 3, key: 'wira_send', name_id: 'WiraSend', name_en: 'WiraSend', icon: 'Package', path: '/send', color: 'bg-blue-500', description_id: 'Kirim barang aman', description_en: 'Safe package delivery' },
  { id: 4, key: 'wira_pay', name_id: 'WiraPay', name_en: 'WiraPay', icon: 'Wallet', path: '/wallet', color: 'bg-green-500', description_id: 'Dompet digital', description_en: 'Digital wallet' },
  { id: 5, key: 'wira_pulsa', name_id: 'WiraPulsa', name_en: 'WiraPulsa', icon: 'Smartphone', path: '/pulsa', color: 'bg-indigo-500', description_id: 'Isi pulsa & data', description_en: 'Top up & data' },
  { id: 6, key: 'wira_villa', name_id: 'WiraVilla', name_en: 'WiraVilla', icon: 'Home', path: '/villa', color: 'bg-teal-500', description_id: 'Pesan villa nyaman', description_en: 'Book cozy villas' },
  { id: 7, key: 'wira_service', name_id: 'WiraService', name_en: 'WiraService', icon: 'Wrench', path: '/service', color: 'bg-yellow-500', description_id: 'Jasa perbaikan', description_en: 'Repair services' },
  { id: 8, key: 'wira_pool', name_id: 'WiraPool', name_en: 'WiraPool', icon: 'Droplet', path: '/pool', color: 'bg-cyan-600', description_id: 'Perawatan kolam', description_en: 'Pool maintenance' },
];
''',
    'src/config/api.js': '''export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
''',
    'src/i18n/index.js': '''import { useContext, createContext, useState, useEffect } from 'react';
import id from './id.json';
import en from './en.json';

const translations = { id, en };
export const LangContext = createContext();

export const LangProvider = ({ children }) => {
  const [lang, setLang] = useState(localStorage.getItem('wira_lang') || 'id');

  useEffect(() => {
    localStorage.setItem('wira_lang', lang);
  }, [lang]);

  const t = (key) => {
    const keys = key.split('.');
    let value = translations[lang];
    for (let k of keys) {
      if (value === undefined) return key;
      value = value[k];
    }
    return value || key;
  };

  const toggleLang = () => setLang(lang === 'id' ? 'en' : 'id');

  return (
    <LangContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </LangContext.Provider>
  );
};

export const useTranslation = () => useContext(LangContext);
''',
    'src/i18n/id.json': '''{
  "greeting": "Selamat datang di Wira",
  "home": "Beranda",
  "activity": "Aktivitas",
  "wallet": "WiraPay",
  "profile": "Profil",
  "topup": "Isi Saldo",
  "transfer": "Transfer",
  "pay": "Bayar",
  "balance": "Saldo",
  "recent_activity": "Aktivitas Terakhir"
}''',
    'src/i18n/en.json': '''{
  "greeting": "Welcome to Wira",
  "home": "Home",
  "activity": "Activity",
  "wallet": "WiraPay",
  "profile": "Profile",
  "topup": "Top Up",
  "transfer": "Transfer",
  "pay": "Pay",
  "balance": "Balance",
  "recent_activity": "Recent Activity"
}''',
    'src/utils/formatRupiah.js': '''// Format angka ke format Rupiah
export const formatRupiah = (number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(number);
};
''',
    'src/App.jsx': '''import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LangProvider } from './i18n';
import HomePage from './pages/HomePage';

function App() {
  return (
    <LangProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </BrowserRouter>
    </LangProvider>
  );
}

export default App;
''',
    'src/main.jsx': '''import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
''',
    'src/pages/HomePage.jsx': '''import { useTranslation } from '../i18n';
import { SERVICES } from '../config/services';
import { APP_CONFIG } from '../config/app';
import { formatRupiah } from '../utils/formatRupiah';

export default function HomePage() {
  const { t, lang, toggleLang } = useTranslation();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary dark:text-primary-light">{APP_CONFIG.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('greeting')}!</p>
        </div>
        <button onClick={toggleLang} className="px-3 py-1 bg-white dark:bg-slate-800 rounded shadow text-sm">
          {lang === 'id' ? '🇮🇩 ID' : '🇬🇧 EN'}
        </button>
      </header>
      
      <div className="bg-primary text-white p-4 rounded-xl shadow-lg mb-6 flex justify-between items-center">
        <div>
          <p className="text-sm opacity-80">{t('balance')}</p>
          <p className="text-2xl font-bold">{formatRupiah(150000)}</p>
        </div>
        <div className="flex gap-2">
          <button className="bg-white/20 p-2 rounded-lg text-xs">{t('topup')}</button>
          <button className="bg-white/20 p-2 rounded-lg text-xs">{t('transfer')}</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {SERVICES.map(service => (
          <div key={service.id} className="flex flex-col items-center gap-2 cursor-pointer">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white ${service.color}`}>
              {/* Icon placeholder */}
              <span>{service.icon.substring(0, 1)}</span>
            </div>
            <span className="text-xs text-center dark:text-slate-300">{lang === 'id' ? service.name_id : service.name_en}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
'''
}

for path, content in files.items():
    full_path = os.path.join(base_dir, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Files generated successfully.")
