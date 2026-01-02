import i18n from './config';

/**
 * Get the current locale for Intl APIs
 */
export function getCurrentLocale(): string {
  const lang = i18n.language;
  const localeMap: Record<string, string> = {
    en: 'en-US',
    de: 'de-DE',
    zh: 'zh-CN',
  };
  return localeMap[lang] || 'en-US';
}

/**
 * Format a date according to the current locale
 */
export function formatDate(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  const locale = getCurrentLocale();
  const dateObj = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date;
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };
  
  return new Intl.DateTimeFormat(locale, options || defaultOptions).format(dateObj);
}

/**
 * Format a date with time according to the current locale
 */
export function formatDateTime(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  const locale = getCurrentLocale();
  const dateObj = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date;
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  
  return new Intl.DateTimeFormat(locale, options || defaultOptions).format(dateObj);
}

/**
 * Format a number according to the current locale
 */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  const locale = getCurrentLocale();
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Format currency according to the current locale
 */
export function formatCurrency(
  value: number,
  currency: string = 'EUR',
  options?: Intl.NumberFormatOptions
): string {
  const locale = getCurrentLocale();
  const defaultOptions: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
  };
  return new Intl.NumberFormat(locale, { ...defaultOptions, ...options }).format(value);
}

/**
 * Format relative time (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelativeTime(
  date: Date | string | number,
  options?: Intl.RelativeTimeFormatOptions
): string {
  const locale = getCurrentLocale();
  const dateObj = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date;
  
  const now = new Date();
  const diffInSeconds = Math.floor((dateObj.getTime() - now.getTime()) / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);
  const diffInWeeks = Math.floor(diffInDays / 7);
  const diffInMonths = Math.floor(diffInDays / 30);
  const diffInYears = Math.floor(diffInDays / 365);

  const rtf = new Intl.RelativeTimeFormat(locale, {
    numeric: 'auto',
    ...options,
  });

  if (Math.abs(diffInYears) >= 1) {
    return rtf.format(diffInYears, 'year');
  } else if (Math.abs(diffInMonths) >= 1) {
    return rtf.format(diffInMonths, 'month');
  } else if (Math.abs(diffInWeeks) >= 1) {
    return rtf.format(diffInWeeks, 'week');
  } else if (Math.abs(diffInDays) >= 1) {
    return rtf.format(diffInDays, 'day');
  } else if (Math.abs(diffInHours) >= 1) {
    return rtf.format(diffInHours, 'hour');
  } else if (Math.abs(diffInMinutes) >= 1) {
    return rtf.format(diffInMinutes, 'minute');
  } else {
    return rtf.format(diffInSeconds, 'second');
  }
}

/**
 * Format a percentage according to the current locale
 */
export function formatPercent(
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  const locale = getCurrentLocale();
  const defaultOptions: Intl.NumberFormatOptions = {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  };
  return new Intl.NumberFormat(locale, { ...defaultOptions, ...options }).format(value);
}

/**
 * Get time-only format
 */
export function formatTime(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  const locale = getCurrentLocale();
  const dateObj = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date;
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
  };
  
  return new Intl.DateTimeFormat(locale, options || defaultOptions).format(dateObj);
}
