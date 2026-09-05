// =========================================
// 🌐 SISTEM MULTI-BAHASA (i18n)
// Hook untuk menggunakan terjemahan
// =========================================

import { useContext, createContext, useState, useCallback } from 'react';
import idTranslations from './id.json';
import enTranslations from './en.json';

const translations = { id: idTranslations, en: enTranslations };

const LangContext = createContext();

// Provider bahasa — bungkus App dengan ini
export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    return localStorage.getItem('wira_lang') || 'id';
  });

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === 'id' ? 'en' : 'id';
      localStorage.setItem('wira_lang', next);
      return next;
    });
  }, []);

  const setLanguage = useCallback((newLang) => {
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
//         t('home.greeting_morning') → "Selamat pagi"
export function useTranslation() {
  const context = useContext(LangContext);
  if (!context) {
    // Fallback jika digunakan di luar provider
    return {
      t: (key) => { const v = getNestedValue(translations.id, key); return (typeof v === 'string') ? v : key; },
      lang: 'id',
      toggleLang: () => {},
      setLanguage: () => {},
    };
  }

  const { lang, toggleLang, setLanguage } = context;

  const t = useCallback(
    (key) => {
      const val = getNestedValue(translations[lang], key) || getNestedValue(translations.id, key) || key;
      // Safety: jika hasilnya object (bukan string), kembalikan key saja
      return (typeof val === 'string') ? val : key;
    },
    [lang]
  );

  return { t, lang, toggleLang, setLanguage };
}

// Helper: ambil nilai dari object bersarang menggunakan dot notation
// Contoh: getNestedValue(obj, 'home.greeting') → obj.home.greeting
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
}

export { LangContext };
export default LangProvider;
