/**
 * useTablePersistence Hook
 * 
 * A custom hook for persisting and restoring table state to/from localStorage.
 * Consolidates all localStorage operations into a single hook to reduce re-renders
 * and improve performance.
 * 
 * Features:
 * - Debounced saves to prevent excessive localStorage writes
 * - Type-safe state management
 * - SSR-safe (checks for window)
 * - Error handling for quota exceeded
 * - Automatic cleanup of stale data
 * 
 * @example
 * ```tsx
 * const { state, updateState, clearState } = useTablePersistence('my-table', {
 *   sorting: [{ id: 'date', desc: true }],
 *   pageSize: 20,
 * });
 * ```
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { SortingState, ColumnFiltersState, VisibilityState } from '@tanstack/react-table'

/**
 * Table state that gets persisted to localStorage
 */
export interface PersistedTableState {
  sorting: SortingState
  columnFilters: ColumnFiltersState
  columnVisibility: VisibilityState
  pageSize: number
  pageIndex: number
  // Custom filters
  statusFilter: string[]
  dateRange: DateRangeFilter | null
}

/**
 * Date range filter configuration
 */
export interface DateRangeFilter {
  from: string | null  // ISO date string
  to: string | null    // ISO date string
  preset?: 'today' | 'yesterday' | 'last7days' | 'last30days' | 'custom'
}

/**
 * Default state for a new table
 */
const DEFAULT_STATE: PersistedTableState = {
  sorting: [{ id: 'send_at', desc: true }],
  columnFilters: [],
  columnVisibility: {},
  pageSize: 20,
  pageIndex: 0,
  statusFilter: [],
  dateRange: null,
}

/**
 * Storage key prefix for table state
 */
const STORAGE_PREFIX = 'table_state_'

/**
 * Debounce delay for localStorage writes (ms)
 */
const SAVE_DEBOUNCE_MS = 300

/**
 * Check if we're in a browser environment
 */
const isBrowser = typeof window !== 'undefined'

/**
 * Safely read from localStorage with error handling
 */
function readFromStorage<T>(key: string, defaultValue: T): T {
  if (!isBrowser) return defaultValue
  
  try {
    const stored = localStorage.getItem(key)
    if (stored) {
      return JSON.parse(stored) as T
    }
  } catch (error) {
    console.warn(`[useTablePersistence] Failed to read ${key}:`, error)
  }
  
  return defaultValue
}

/**
 * Safely write to localStorage with error handling
 */
function writeToStorage<T>(key: string, value: T): boolean {
  if (!isBrowser) return false
  
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    // Handle quota exceeded
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('[useTablePersistence] localStorage quota exceeded, clearing old data')
      clearOldTableData()
      // Retry once
      try {
        localStorage.setItem(key, JSON.stringify(value))
        return true
      } catch {
        console.error('[useTablePersistence] Failed to save after cleanup')
      }
    } else {
      console.error('[useTablePersistence] Failed to save:', error)
    }
  }
  
  return false
}

/**
 * Clear old table data when quota is exceeded
 */
function clearOldTableData(): void {
  if (!isBrowser) return
  
  const keysToRemove: string[] = []
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(STORAGE_PREFIX) || key?.startsWith('table_')) {
      keysToRemove.push(key)
    }
  }
  
  // Keep only the 5 most recent tables (based on key name, not ideal but simple)
  keysToRemove.slice(5).forEach(key => localStorage.removeItem(key))
}

/**
 * Hook options
 */
export interface UseTablePersistenceOptions {
  /** Initial state overrides */
  initialState?: Partial<PersistedTableState>
  /** Whether to persist state (default: true) */
  enabled?: boolean
}

/**
 * Hook return type
 */
export interface UseTablePersistenceReturn {
  /** Current table state */
  state: PersistedTableState
  /** Update one or more state properties */
  updateState: (updates: Partial<PersistedTableState>) => void
  /** Update a single property */
  setState: <K extends keyof PersistedTableState>(
    key: K,
    value: PersistedTableState[K]
  ) => void
  /** Reset state to defaults */
  resetState: () => void
  /** Clear persisted state from storage */
  clearStorage: () => void
  /** Check if state has been modified from defaults */
  isModified: boolean
}

/**
 * Custom hook for table state persistence
 * 
 * @param tableId - Unique identifier for the table
 * @param options - Configuration options
 * @returns Table state and update functions
 */
export function useTablePersistence(
  tableId: string,
  options: UseTablePersistenceOptions = {}
): UseTablePersistenceReturn {
  const { initialState = {}, enabled = true } = options
  
  const storageKey = `${STORAGE_PREFIX}${tableId}`
  
  // Merge defaults with initial state overrides
  const defaultState: PersistedTableState = {
    ...DEFAULT_STATE,
    ...initialState,
  }
  
  // Initialize state from localStorage or defaults
  const [state, setStateInternal] = useState<PersistedTableState>(() => {
    if (!enabled) return defaultState
    return readFromStorage(storageKey, defaultState)
  })
  
  // Ref for debounced save
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const stateRef = useRef(state)
  
  // Keep ref in sync
  useEffect(() => {
    stateRef.current = state
  }, [state])
  
  // Debounced save to localStorage
  const saveToStorage = useCallback(() => {
    if (!enabled) return
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      writeToStorage(storageKey, stateRef.current)
    }, SAVE_DEBOUNCE_MS)
  }, [enabled, storageKey])
  
  // Update multiple state properties at once
  const updateState = useCallback((updates: Partial<PersistedTableState>) => {
    setStateInternal(prev => {
      const next = { ...prev, ...updates }
      return next
    })
    saveToStorage()
  }, [saveToStorage])
  
  // Update a single state property
  const setState = useCallback(<K extends keyof PersistedTableState>(
    key: K,
    value: PersistedTableState[K]
  ) => {
    updateState({ [key]: value } as Partial<PersistedTableState>)
  }, [updateState])
  
  // Reset to default state
  const resetState = useCallback(() => {
    setStateInternal(defaultState)
    saveToStorage()
  }, [defaultState, saveToStorage])
  
  // Clear from storage
  const clearStorage = useCallback(() => {
    if (isBrowser) {
      localStorage.removeItem(storageKey)
    }
  }, [storageKey])
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        // Final save on unmount
        if (enabled) {
          writeToStorage(storageKey, stateRef.current)
        }
      }
    }
  }, [enabled, storageKey])
  
  // Check if state differs from defaults
  const isModified = JSON.stringify(state) !== JSON.stringify(defaultState)
  
  return {
    state,
    updateState,
    setState,
    resetState,
    clearStorage,
    isModified,
  }
}

/**
 * Helper to save ticket navigation order
 * Used for next/previous ticket navigation within the ticket view
 */
export function saveTicketOrder(tableId: string, order: string[], currentId: string): void {
  const key = `${STORAGE_PREFIX}${tableId}_order`
  writeToStorage(key, { order, currentId, timestamp: Date.now() })
}

/**
 * Helper to get saved ticket order
 */
export function getTicketOrder(tableId: string): { order: string[]; currentId: string } | null {
  const key = `${STORAGE_PREFIX}${tableId}_order`
  const data = readFromStorage<{ order: string[]; currentId: string; timestamp: number } | null>(key, null)
  
  // Expire after 1 hour
  if (data && Date.now() - data.timestamp < 3600000) {
    return { order: data.order, currentId: data.currentId }
  }
  
  return null
}
