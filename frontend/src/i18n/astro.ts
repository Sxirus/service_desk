import type { SupportedLanguage } from './config';
import { resources } from './config';
import type { AstroCookies } from 'astro';

/**
 * Get translation function for Astro components (server-side)
 * @param language - The language code (en, de)
 * @param namespace - The translation namespace (auth, common, dashboard, manage, platform, validation)
 */
export function getTranslations(
  language: SupportedLanguage,
  namespace: keyof typeof resources['en']
) {
  const translations = resources[language]?.[namespace] || resources['en'][namespace];
  
  return {
    t: (key: string, params?: Record<string, any>): string => {
      const keys = key.split('.');
      let value: any = translations;
      
      for (const k of keys) {
        value = value?.[k];
        if (value === undefined) {
          console.warn(`Translation key not found: ${namespace}.${key} for language ${language}`);
          return key;
        }
      }
      
      // Simple interpolation for {{variable}} syntax
      if (typeof value === 'string' && params) {
        return value.replace(/\{\{(\w+)\}\}/g, (_, key) => params[key]?.toString() || '');
      }
      
      return typeof value === 'string' ? value : key;
    },
    
    // Get the current language
    lang: language,
  };
}

/**
 * Get current language from Astro cookies
 * @param cookies - Astro cookies object
 * @returns The current language code (en or de), defaults to 'en'
 */
export function getLanguageFromCookies(cookies: AstroCookies): SupportedLanguage {
  const supportedLangs: SupportedLanguage[] = ['en', 'de'];
  const langCookie = cookies.get('i18nextLng')?.value;
  return (langCookie && supportedLangs.includes(langCookie as SupportedLanguage)) 
    ? (langCookie as SupportedLanguage)
    : 'en';
}
