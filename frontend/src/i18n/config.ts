import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translations
import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enDashboard from './locales/en/dashboard.json';
import enManage from './locales/en/manage.json';
import enPlatform from './locales/en/platform.json';
import enValidation from './locales/en/validation.json';

import deCommon from './locales/de/common.json';
import deAuth from './locales/de/auth.json';
import deDashboard from './locales/de/dashboard.json';
import deManage from './locales/de/manage.json';
import dePlatform from './locales/de/platform.json';
import deValidation from './locales/de/validation.json';

export const defaultNS = 'common';
export const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    dashboard: enDashboard,
    manage: enManage,
    platform: enPlatform,
    validation: enValidation,
  },
  de: {
    common: deCommon,
    auth: deAuth,
    dashboard: deDashboard,
    manage: deManage,
    platform: dePlatform,
    validation: deValidation,
  },
} as const;

export const supportedLanguages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
] as const;

export type SupportedLanguage = 'en' | 'de';

// Helper to get cookie value
const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
};

// Helper to set cookie
export const setLanguageCookie = (lang: string) => {
  if (typeof document !== 'undefined') {
    // Set cookie with 1 year expiry, accessible across the site
    document.cookie = `i18nextLng=${lang};path=/;max-age=31536000;SameSite=Lax`;
  }
};

// Get initial language - always return 'en' for SSR consistency
// The client will sync to the correct language after hydration
const getInitialLanguage = (): SupportedLanguage => {
  // Always start with 'en' to ensure server/client consistency
  // Client will update to correct language after hydration
  return 'en';
};

const initialLang = getInitialLanguage();

i18n
  .use(initReactI18next)
  .init({
    resources,
    defaultNS,
    lng: initialLang,
    fallbackLng: 'en',
    supportedLngs: ['en', 'de'],
    interpolation: {
      escapeValue: false,
    },
  });

// Save to localStorage and cookie when language changes
i18n.on('languageChanged', (lng) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('i18nextLng', lng);
    setLanguageCookie(lng);
  }
});

export default i18n;
