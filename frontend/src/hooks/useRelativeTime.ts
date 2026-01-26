/**
 * useRelativeTime Hook
 * 
 * A hook for displaying relative time strings (e.g., "2 hours ago", "yesterday").
 * Automatically updates the displayed time at appropriate intervals.
 * 
 * For times within 24 hours: Shows relative time ("2 hours ago", "5 minutes ago")
 * For times older than 24 hours: Shows absolute date/time
 * 
 * @example
 * ```tsx
 * const timeString = useRelativeTime(email.send_at);
 * // Returns: "2 hours ago" or "Jan 5, 2026, 10:30 AM"
 * ```
 */

import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Time thresholds in milliseconds
 */
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Update intervals based on how old the time is
 */
const UPDATE_INTERVALS = {
  UNDER_MINUTE: 10 * 1000,    // Update every 10 seconds
  UNDER_HOUR: MINUTE,          // Update every minute
  UNDER_DAY: 5 * MINUTE,       // Update every 5 minutes
  OLDER: 0,                    // No updates needed
} as const

/**
 * Format options for absolute dates
 */
const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}

/**
 * Format a date as relative time if within 24 hours, otherwise absolute
 */
export function formatRelativeTime(
  date: Date | string | number,
  t: (key: string, options?: Record<string, unknown>) => string,
  locale: string = 'de-DE'
): { text: string; isRelative: boolean; updateInterval: number } {
  const now = Date.now()
  const timestamp = date instanceof Date ? date.getTime() : new Date(date).getTime()
  const diff = now - timestamp
  
  // Future dates (shouldn't happen often, but handle gracefully)
  if (diff < 0) {
    return {
      text: new Date(timestamp).toLocaleString(locale, DATE_FORMAT_OPTIONS),
      isRelative: false,
      updateInterval: UPDATE_INTERVALS.OLDER,
    }
  }
  
  // Less than a minute ago
  if (diff < MINUTE) {
    return {
      text: t('time.justNow'),
      isRelative: true,
      updateInterval: UPDATE_INTERVALS.UNDER_MINUTE,
    }
  }
  
  // Less than an hour ago
  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE)
    return {
      text: t('time.minutesAgo', { count: minutes }),
      isRelative: true,
      updateInterval: UPDATE_INTERVALS.UNDER_HOUR,
    }
  }
  
  // Less than 24 hours ago
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR)
    return {
      text: t('time.hoursAgo', { count: hours }),
      isRelative: true,
      updateInterval: UPDATE_INTERVALS.UNDER_DAY,
    }
  }
  
  // Older than 24 hours - show absolute date
  return {
    text: new Date(timestamp).toLocaleString(locale, DATE_FORMAT_OPTIONS),
    isRelative: false,
    updateInterval: UPDATE_INTERVALS.OLDER,
  }
}

/**
 * Hook for displaying relative time with automatic updates
 * 
 * @param date - The date to format
 * @param options - Configuration options
 * @returns Formatted time string
 */
export function useRelativeTime(
  date: Date | string | number | null | undefined,
  options: {
    /** Force absolute time display */
    forceAbsolute?: boolean
    /** Custom locale */
    locale?: string
  } = {}
): string {
  const { t, i18n } = useTranslation('dashboard')
  const { forceAbsolute = false, locale = i18n.language || 'de-DE' } = options
  
  const [, forceUpdate] = useState(0)
  
  const result = useMemo(() => {
    if (!date) return { text: '-', isRelative: false, updateInterval: 0 }
    if (forceAbsolute) {
      return {
        text: new Date(date).toLocaleString(locale, DATE_FORMAT_OPTIONS),
        isRelative: false,
        updateInterval: 0,
      }
    }
    return formatRelativeTime(date, t, locale)
  }, [date, forceAbsolute, locale, t])
  
  // Set up automatic updates for relative times
  useEffect(() => {
    if (!result.updateInterval || result.updateInterval === 0) {
      return
    }
    
    const intervalId = setInterval(() => {
      forceUpdate(n => n + 1)
    }, result.updateInterval)
    
    return () => clearInterval(intervalId)
  }, [result.updateInterval])
  
  return result.text
}

/**
 * Batch format multiple dates for better performance
 * Use this when rendering many dates in a list
 * 
 * @param dates - Array of dates to format
 * @param t - Translation function
 * @param locale - Locale string
 * @returns Map of ISO string to formatted time
 */
export function batchFormatRelativeTime(
  dates: (Date | string | number)[],
  t: (key: string, options?: Record<string, unknown>) => string,
  locale: string = 'de-DE'
): Map<string, string> {
  const result = new Map<string, string>()
  
  for (const date of dates) {
    const key = date instanceof Date ? date.toISOString() : String(date)
    const { text } = formatRelativeTime(date, t, locale)
    result.set(key, text)
  }
  
  return result
}

/**
 * Get the minimum update interval needed for a list of dates
 * Use this to set up a single interval for updating all dates
 * 
 * @param dates - Array of dates
 * @param t - Translation function
 * @returns Minimum interval in ms, or 0 if no updates needed
 */
export function getMinUpdateInterval(
  dates: (Date | string | number)[],
  t: (key: string, options?: Record<string, unknown>) => string
): number {
  let minInterval = Infinity
  
  for (const date of dates) {
    const { updateInterval } = formatRelativeTime(date, t)
    if (updateInterval > 0 && updateInterval < minInterval) {
      minInterval = updateInterval
    }
  }
  
  return minInterval === Infinity ? 0 : minInterval
}

/**
 * Hook for updating a list of relative times efficiently
 * Instead of one interval per date, uses a single interval
 * 
 * @param dates - Array of dates to track
 * @returns Current timestamp (changes trigger re-render)
 */
export function useRelativeTimeUpdater(
  dates: (Date | string | number)[]
): number {
  const { t } = useTranslation('dashboard')
  const [tick, setTick] = useState(Date.now())
  
  const minInterval = useMemo(() => {
    return getMinUpdateInterval(dates, t)
  }, [dates, t])
  
  useEffect(() => {
    if (minInterval === 0) return
    
    const intervalId = setInterval(() => {
      setTick(Date.now())
    }, minInterval)
    
    return () => clearInterval(intervalId)
  }, [minInterval])
  
  return tick
}
