// =========================================
// 🌐 SISTEM MULTI-BAHASA (i18n)
// Hook untuk menggunakan terjemahan
// =========================================

import { useContext, createContext, useState, useCallback } from 'react';
import idTranslations from './id.json';
import enTranslations from './en.json';

const translations = { id: idTranslations, en: enTranslations };

export const SUPPORTED_LANGS = ['id', 'en'];

const LangContext = createContext();

// Provider bahasa — bungkus App dengan ini
export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const stored = localStorage.getItem('wira_lang');
    return SUPPORTED_LANGS.includes(stored) ? stored : 'id';
  });

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === 'id' ? 'en' : 'id';
      localStorage.setItem('wira_lang', next);
      return next;
    });
  }, []);

  const setLanguage = useCallback((newLang) => {
    if (!SUPPORTED_LANGS.includes(newLang)) return;
    localStorage.setItem('wira_lang', newLang);
    setLang(newLang);
  }, []);

  return (
    <LangContext.Provider value={{ lang, toggleLang, setLanguage }}>
      {children}
    </LangContext.Provider>
  );
}

// Hook untuk mengakses terjemahan
// Contoh: const { t } = useTranslation();
//         t('home.recent')                       → "Aktivitas Terakhir"
//         t('ride.book_now', { price: 'Rp 12.000' }) → "Pesan Sekarang • Rp 12.000"
export function useTranslation() {
  const context = useContext(LangContext);
  // Hooks must run unconditionally (same order every render), so compute
  // `t` before deciding whether we are inside a provider.
  const lang = context ? context.lang : 'id';

  const t = useCallback(
    (key, vars) => translate(lang, key, vars),
    [lang]
  );

  if (!context) {
    // Fallback jika digunakan di luar provider
    return {
      t: (key, vars) => translate('id', key, vars),
      lang: 'id',
      toggleLang: () => {},
      setLanguage: () => {},
    };
  }

  const { toggleLang, setLanguage } = context;

  return { t, lang, toggleLang, setLanguage };
}

/**
 * Terjemahan di luar React (class component seperti ErrorBoundary, yang
 * dirender sebelum LangProvider ada). Bahasa dibaca langsung dari
 * localStorage, sumber yang sama dipakai LangProvider.
 */
export function translateStatic(key, vars) {
  let lang = 'id';
  try {
    const stored = localStorage.getItem('wira_lang');
    if (SUPPORTED_LANGS.includes(stored)) lang = stored;
  } catch {
    // Akses localStorage diblokir (mode privat): pakai bahasa bawaan.
  }
  return translate(lang, key, vars);
}

// Ambil string terjemahan lalu isi placeholder {{nama}} dengan nilai `vars`.
// Kunci yang hilang dikembalikan apa adanya supaya cepat terlihat saat dites.
function translate(lang, key, vars) {
  const raw =
    getNestedValue(translations[lang], key) ??
    getNestedValue(translations.id, key) ??
    key;
  const value = typeof raw === 'string' ? raw : key;
  return vars ? interpolate(value, vars) : value;
}

function interpolate(template, vars) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, name) => {
    const replacement = vars[name];
    return replacement === undefined || replacement === null ? match : String(replacement);
  });
}

// Helper: ambil nilai dari object bersarang menggunakan dot notation
// Contoh: getNestedValue(obj, 'home.recent') → obj.home.recent
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
}

export { LangContext };
export default LangProvider;
