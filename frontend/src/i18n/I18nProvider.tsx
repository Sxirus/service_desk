import React, { useEffect, useRef } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from './config';
import { setLanguageCookie } from './config';

interface I18nProviderProps {
  children: React.ReactNode;
  initialLanguage?: string;
}

// Helper to get cookie value
const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
};

export function I18nProvider({ children, initialLanguage = 'en' }: I18nProviderProps) {
  const hasInitialized = useRef(false);

  // Set the initial language synchronously before first render
  // This runs during the component's initial execution, before React renders
  if (!hasInitialized.current) {
    hasInitialized.current = true;
    const supportedLangs = ['en', 'de'];
    
    // On client, also check localStorage as fallback
    let targetLang = initialLanguage;
    if (typeof window !== 'undefined') {
      const cookieLang = getCookie('i18nextLng');
      const storedLang = localStorage.getItem('i18nextLng');
      
      if (cookieLang && supportedLangs.includes(cookieLang)) {
        targetLang = cookieLang;
      } else if (storedLang && supportedLangs.includes(storedLang)) {
        targetLang = storedLang;
        // Sync to cookie for future SSR
        setLanguageCookie(storedLang);
      }
    }
    
    if (i18n.language !== targetLang && supportedLangs.includes(targetLang)) {
      // Change language synchronously
      i18n.changeLanguage(targetLang);
    }
  }

  return (
    <I18nextProvider i18n={i18n}>
      {children}
    </I18nextProvider>
  );
}

export default I18nProvider;
