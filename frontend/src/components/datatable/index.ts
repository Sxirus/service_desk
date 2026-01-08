/**
 * DataTable Components - Central Export
 * 
 * This module provides table components for different use cases:
 * 
 * 1. SimpleDataTable - Lightweight table for basic data display
 *    - Configurable columns with custom cell renderers
 *    - Optional Card wrapper
 *    - Empty state handling
 *    - Row click handlers
 *    - Best for: Analytics tables, simple lists, read-only data display
 * 
 * 2. DataTable - Generic TanStack Table wrapper
 *    - TanStack Table column definitions
 *    - Basic rendering without sorting/filtering
 *    - Best for: Tables needing custom column definitions
 * 
 * 3. TicketsDataTable - Feature-rich ticket/email table
 *    - Full sorting, filtering, pagination
 *    - Column visibility toggle
 *    - Row selection & bulk actions
 *    - LocalStorage persistence
 *    - Real-time presence indicators
 *    - Best for: Main ticket/email views
 * 
 * 4. TicketsDataTableWithPresence - TicketsDataTable with presence tracking
 *    - Wraps TicketsDataTable with TablePresenceProvider
 *    - Shows who is currently viewing tickets
 */

// Simple table for basic use cases
export { 
  SimpleDataTable, 
  createTextColumn,
  type SimpleColumnDef, 
  type SimpleDataTableProps,
  type CardWrapperConfig,
} from './SimpleDataTable'

// Generic TanStack Table wrapper
export { DataTable } from './data-table'

// Advanced ticket table with full features
export { 
  TicketsDataTable, 
  type TicketEmail, 
  type TicketStatus 
} from './TicketsDataTable'

// Ticket table with presence tracking wrapper
export { 
  TicketsDataTableWithPresence 
} from './TicketsDataTableWithPresence'

// Column definitions for user management
export { createColumns, type User } from './columns'
