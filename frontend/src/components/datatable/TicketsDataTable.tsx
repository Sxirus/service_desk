/**
 * TicketsDataTable Component
 * 
 * Refactored to use sub-components for cleaner structure.
 */

"use client"

import * as React from "react"
import { useTranslation } from 'react-i18next'
import {
  type ColumnFiltersState,
  type SortingState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  flexRender
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { 
  useTablePersistence, 
  saveTicketOrder,
} from "@/hooks/useTablePersistence"
import { useRelativeTimeUpdater } from "@/hooks/useRelativeTime"

// Sub-components
import { TicketsTableToolbar } from "./tickets-toolbar"
import { TicketsTablePagination } from "./tickets-pagination"
import { getColumns } from "./tickets-columns"

// ============================================================================
// Types & Constants
// ============================================================================

/**
 * Ticket status lifecycle states
 */
export type TicketStatus = 'new' | 'open' | 'waiting' | 'resolved'

/**
 * Type for ticket/email data
 */
export type TicketEmail = {
  /** Unique ticket ID */
  id: number
  /** Email subject line */
  subject: string
  /** Sender's email address */
  email_address: string
  /** Associated customer ID */
  customer_id: number
  /** Customer display name */
  customer_name: string
  /** Assigned employee or group name */
  assigned_to?: string
  /** Type of assignment */
  assigned_type?: 'employee' | 'group' | null
  /** Email send timestamp (ISO string) */
  send_at: string
  /** Current ticket status */
  status: TicketStatus
  /** @deprecated Use status instead. Kept for backwards compatibility */
  read?: boolean
}

/**
 * Status display configuration
 */
export const STATUS_CONFIG: Record<TicketStatus, { 
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  className?: string
  ariaLabel: string
}> = {
  new: { 
    label: 'New', 
    variant: 'default', 
    className: 'bg-green-500 hover:bg-green-600',
    ariaLabel: 'New ticket - requires attention'
  },
  open: { 
    label: 'Open', 
    variant: 'default', 
    className: 'bg-orange-500 hover:bg-orange-600',
    ariaLabel: 'Open ticket - in progress'
  },
  waiting: { 
    label: 'Waiting', 
    variant: 'default', 
    className: 'bg-blue-500 hover:bg-blue-600',
    ariaLabel: 'Waiting - awaiting customer response'
  },
  resolved: { 
    label: 'Resolved', 
    variant: 'secondary',
    ariaLabel: 'Resolved - ticket closed'
  }
}

/**
 * All available statuses for filtering
 */
export const ALL_STATUSES: TicketStatus[] = ['new', 'open', 'waiting', 'resolved']

// ============================================================================
// Props Interface
// ============================================================================

interface TicketsDataTableProps {
  /** Array of ticket data to display */
  data: TicketEmail[]
  /** Whether to show the assigned column (default: false) */
  showAssignedColumn?: boolean
  /** Callback for bulk actions on selected tickets */
  onBulkAction?: (action: string, selectedIds: number[]) => void
  /** Unique ID for this table instance (used for state persistence) */
  tableId?: string
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build URL for navigating to a ticket
 */
function buildTicketUrl(customerId: number | string, fromTableId: string): string {
  const from = encodeURIComponent(fromTableId)
  return `/tickets/${customerId}?from=${from}`
}

/**
 * Get comparable value for sorting
 */
type ComparableValue = string | number | boolean | null | undefined

function getComparableValue(ticket: TicketEmail, key: string): ComparableValue {
  switch (key) {
    case 'send_at':
      return new Date(ticket.send_at).getTime()
    case 'status':
      const statusOrder: Record<TicketStatus, number> = { new: 0, open: 1, waiting: 2, resolved: 3 }
      return statusOrder[ticket.status] ?? 4
    case 'subject':
      return ticket.subject?.toLowerCase() ?? ''
    case 'customer_name':
      return ticket.customer_name?.toLowerCase() ?? ''
    case 'email_address':
      return ticket.email_address?.toLowerCase() ?? ''
    case 'assigned_to':
      return ticket.assigned_to?.toLowerCase() ?? ''
    default:
      return (ticket as unknown as Record<string, ComparableValue>)[key]
  }
}

/**
 * Calculate ticket order for navigation persistence
 */
function calculateTicketOrder(
  data: TicketEmail[],
  sorting: SortingState,
  columnFilters: ColumnFiltersState,
  statusFilter: string[]
): string[] {
  let filtered = [...data]

  // Apply subject filter
  const subjectFilter = columnFilters.find((f) => f.id === 'subject')
  if (subjectFilter && typeof subjectFilter.value === 'string' && subjectFilter.value.trim()) {
    const needle = subjectFilter.value.toLowerCase()
    filtered = filtered.filter((t) => t.subject?.toLowerCase().includes(needle))
  }

  // Apply status filter
  if (statusFilter.length > 0) {
    filtered = filtered.filter((t) => statusFilter.includes(t.status))
  }

  // Apply sorting
  if (sorting.length > 0) {
    filtered.sort((a, b) => {
      for (const s of sorting) {
        const aVal = getComparableValue(a, s.id)
        const bVal = getComparableValue(b, s.id)

        if (aVal == null && bVal == null) continue
        if (aVal == null) return s.desc ? 1 : -1
        if (bVal == null) return s.desc ? -1 : 1

        if (aVal < bVal) return s.desc ? 1 : -1
        if (aVal > bVal) return s.desc ? -1 : 1
      }
      return 0
    })
  }

  return filtered.map((t) => String(t.customer_id))
}

// ============================================================================
// Main Component
// ============================================================================

export function TicketsDataTable({ 
  data, 
  showAssignedColumn = false,
  onBulkAction,
  tableId = 'default'
}: TicketsDataTableProps) {
  const { t } = useTranslation('dashboard')
  
  // Use custom persistence hook for state management
  const { state, updateState } = useTablePersistence(tableId, {
    initialState: {
      columnVisibility: { assigned_to: showAssignedColumn },
    },
  })

  // Local state that doesn't need persistence
  const [rowSelection, setRowSelection] = React.useState({})

  // Get dates for relative time updates
  const dates = React.useMemo(() => data.map(d => d.send_at), [data])
  const tick = useRelativeTimeUpdater(dates)

  // Persist ticket order before navigating (used by both left-click and middle-click)
  const persistOrderAndGetUrl = React.useCallback((customerId: number): string => {
    try {
      const order = calculateTicketOrder(
        data, 
        state.sorting, 
        state.columnFilters,
        state.statusFilter
      )
      saveTicketOrder(tableId, order, String(customerId))
    } catch (e) {
      console.warn('[TicketsDataTable] Failed to persist ticket order:', e)
    }
    return buildTicketUrl(customerId, tableId)
  }, [tableId, data, state.sorting, state.columnFilters, state.statusFilter])

  // Navigation handler — same-tab navigation
  const navigateToTicket = React.useCallback((customerId: number) => {
    window.location.href = persistOrderAndGetUrl(customerId)
  }, [persistOrderAndGetUrl])

  // Get columns from helper
  const columns = React.useMemo(
    () => getColumns(t, navigateToTicket, tick), 
    [t, navigateToTicket, tick]
  )

  // Custom filter function for status
  const filteredData = React.useMemo(() => {
    let result = data

    // Apply status filter
    if (state.statusFilter.length > 0) {
      result = result.filter(ticket => state.statusFilter.includes(ticket.status))
    }

    return result
  }, [data, state.statusFilter])

  // TanStack Table instance
  const table = useReactTable({
    data: filteredData,
    columns,
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' ? updater(state.sorting) : updater
      updateState({ sorting: newSorting })
    },
    onColumnFiltersChange: (updater) => {
      const newFilters = typeof updater === 'function' ? updater(state.columnFilters) : updater
      updateState({ columnFilters: newFilters })
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: (updater) => {
      const newVisibility = typeof updater === 'function' ? updater(state.columnVisibility) : updater
      updateState({ columnVisibility: newVisibility })
    },
    onRowSelectionChange: setRowSelection,
    state: {
      sorting: state.sorting,
      columnFilters: state.columnFilters,
      columnVisibility: state.columnVisibility,
      rowSelection,
      pagination: {
        pageIndex: state.pageIndex,
        pageSize: state.pageSize,
      },
    },
    onPaginationChange: (updater) => {
      const current = { pageIndex: state.pageIndex, pageSize: state.pageSize }
      const next = typeof updater === 'function' ? updater(current) : updater
      updateState({ pageIndex: next.pageIndex, pageSize: next.pageSize })
    },
  })

  // Handle row click navigation (left-click, supports Ctrl/Meta for new tab)
  const handleRowClick = React.useCallback((e: React.MouseEvent, customerId: number) => {
    const target = e.target as HTMLElement
    // Don't navigate if clicking on interactive elements
    if (target.closest('button') || target.closest('[role="checkbox"]') || target.closest('[role="menuitem"]')) {
      return
    }
    // Ctrl+Click or Meta+Click (⌘+Click on Mac) → open in new tab
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      window.open(persistOrderAndGetUrl(customerId), '_blank')
      return
    }
    navigateToTicket(customerId)
  }, [navigateToTicket, persistOrderAndGetUrl])

  // Handle middle-click (auxclick) → open in new tab
  const handleRowAuxClick = React.useCallback((e: React.MouseEvent, customerId: number) => {
    // button === 1 is middle mouse button
    if (e.button !== 1) return
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('[role="checkbox"]') || target.closest('[role="menuitem"]')) {
      return
    }
    e.preventDefault()
    window.open(persistOrderAndGetUrl(customerId), '_blank')
  }, [persistOrderAndGetUrl])

  return (
    <div className="w-full" role="region" aria-label={t('tickets.title')}>
      <TicketsTableToolbar 
        table={table}
        statusFilter={state.statusFilter}
        onStatusFilterChange={(value) => updateState({ statusFilter: value })}
        onBulkAction={onBulkAction}
        onClearFilters={() => {
          updateState({ 
            statusFilter: [], 
            columnFilters: []
          })
          table.getColumn("subject")?.setFilterValue("")
        }}
      />

      {/* Table */}
      <div className="rounded-md border" role="table" aria-label={t('tickets.title')}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} role="columnheader">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())
                    }
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="cursor-pointer"
                  onClick={(e) => handleRowClick(e, row.original.customer_id)}
                  onAuxClick={(e) => handleRowAuxClick(e, row.original.customer_id)}
                  role="row"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigateToTicket(row.original.customer_id)
                    }
                  }}
                  aria-label={`${row.original.subject || t('table.noSubject')} - ${row.original.customer_name} - ${STATUS_CONFIG[row.original.status]?.label}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} role="cell">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center py-8" role="status">
                    <svg 
                      className="h-12 w-12 text-gray-400 mb-4" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" 
                      />
                    </svg>
                    <h3 className="text-lg font-medium text-gray-900">{t('table.noEmailsFound')}</h3>
                    <p className="text-gray-500 mt-1">{t('table.noEmailsAvailable')}</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <TicketsTablePagination table={table} />
    </div>
  )
}