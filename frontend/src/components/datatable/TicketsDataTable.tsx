/**
 * TicketsDataTable Component
 * 
 * Advanced, feature-rich data table for displaying tickets/emails with full TanStack Table integration.
 * For simpler use cases without sorting/filtering/pagination, use SimpleDataTable instead.
 * 
 * ## Features
 * 
 * ### Core Functionality
 * - TanStack Table integration with full type safety
 * - Sorting on all relevant columns (subject, email, customer, date, status)
 * - Multi-column filtering (subject text, status, date range)
 * - Pagination with customizable page size
 * - Column visibility toggle
 * 
 * ### User Experience
 * - Row selection with bulk actions
 * - Click-to-navigate rows (with proper event handling for interactive elements)
 * - Real-time presence indicators (who is viewing which ticket)
 * - Relative time display for recent emails (< 24 hours)
 * - Status badges with color coding
 * 
 * ### Performance
 * - Memoized columns and callbacks
 * - Debounced localStorage persistence via useTablePersistence hook
 * - Efficient re-render management
 * 
 * ### Accessibility
 * - ARIA labels on all interactive elements
 * - Keyboard navigation support
 * - Screen reader friendly status announcements
 * 
 * ### Persistence
 * - Sorting preferences saved to localStorage
 * - Column visibility saved to localStorage
 * - Filter states saved to localStorage
 * - Pagination settings saved to localStorage
 * 
 * ## Usage
 * 
 * ```tsx
 * <TicketsDataTable
 *   data={tickets}
 *   showAssignedColumn={true}
 *   onBulkAction={handleBulkAction}
 *   tableId="inbox-123"
 * />
 * ```
 * 
 * ## Props
 * 
 * @prop {TicketEmail[]} data - Array of ticket/email data to display
 * @prop {boolean} showAssignedColumn - Whether to show the "Assigned To" column
 * @prop {function} onBulkAction - Callback for bulk actions (status changes, assignments)
 * @prop {string} tableId - Unique identifier for persisting table state
 */

"use client"

import * as React from "react"
import { useTranslation } from 'react-i18next'
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { 
  ArrowUpDown, 
  ChevronDown, 
  MoreHorizontal, 
  Filter, 
  X, 
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { SimplePrivateAvatar } from "@/components/ui/private-avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useTicketViewers } from "@/components/TicketPresenceProvider"
import { 
  useTablePersistence, 
  saveTicketOrder,
} from "@/hooks/useTablePersistence"
import { formatRelativeTime, useRelativeTimeUpdater } from "@/hooks/useRelativeTime"

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
const STATUS_CONFIG: Record<TicketStatus, { 
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
const ALL_STATUSES: TicketStatus[] = ['new', 'open', 'waiting', 'resolved']

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
// Sub-Components
// ============================================================================

/**
 * ViewersCell - Shows avatars of users currently viewing this ticket
 */
function ViewersCell({ customerId }: { customerId: string }) {
  const { t } = useTranslation('dashboard')
  const viewers = useTicketViewers(customerId)
  
  if (viewers.length === 0) return null

  return (
    <TooltipProvider>
      <div 
        className="flex -space-x-1.5"
        role="group"
        aria-label={t('presence.usersViewing', { count: viewers.length })}
      >
        {viewers.slice(0, 3).map((viewer) => (
          <Tooltip key={viewer.id}>
            <TooltipTrigger asChild>
              <div>
                <SimplePrivateAvatar
                  src={viewer.avatar_url}
                  name={viewer.name}
                  className="h-6 w-6 border-2 border-background ring-0 cursor-default"
                  fallbackClassName="text-[10px] bg-primary text-primary-foreground"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {t('table.isViewing', { name: viewer.name })}
            </TooltipContent>
          </Tooltip>
        ))}
        {viewers.length > 3 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div 
                className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium cursor-default"
                aria-label={`+${viewers.length - 3} more viewers`}
              >
                +{viewers.length - 3}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {viewers.slice(3).map(v => v.name).join(', ')}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}

/**
 * StatusFilterDropdown - Multi-select dropdown for status filtering
 */
function StatusFilterDropdown({ 
  value, 
  onChange 
}: { 
  value: string[]
  onChange: (value: string[]) => void 
}) {
  const { t } = useTranslation('dashboard')
  
  const toggleStatus = (status: string) => {
    if (value.includes(status)) {
      onChange(value.filter(s => s !== status))
    } else {
      onChange([...value, status])
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="h-8"
          aria-label={t('table.filterByStatus')}
        >
          <Filter className="h-4 w-4 mr-1" />
          Status
          {value.length > 0 && (
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
              {value.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{t('table.filterByStatus')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ALL_STATUSES.map(status => {
          const config = STATUS_CONFIG[status]
          return (
            <DropdownMenuCheckboxItem
              key={status}
              checked={value.includes(status)}
              onCheckedChange={() => toggleStatus(status)}
            >
              <span className="flex items-center gap-2">
                <span 
                  className={`w-2 h-2 rounded-full ${
                    status === 'new' ? 'bg-green-500' :
                    status === 'open' ? 'bg-orange-500' :
                    status === 'waiting' ? 'bg-blue-500' :
                    'bg-gray-400'
                  }`} 
                />
                {config.label}
              </span>
            </DropdownMenuCheckboxItem>
          )
        })}
        {value.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChange([])}>
              <X className="h-4 w-4 mr-2" />
              {t('table.clearFilters')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * RelativeTimeCell - Displays time with relative format for recent items
 */
function RelativeTimeCell({ 
  date, 
  tick 
}: { 
  date: string
  tick: number  // Forces re-render when tick changes
}) {
  const { t } = useTranslation('dashboard')
  const { text } = React.useMemo(
    () => formatRelativeTime(date, t),
    [date, t, tick]
  )

  return (
    <div 
      className="text-gray-600 whitespace-nowrap"
      title={new Date(date).toLocaleString()}
    >
      {text}
    </div>
  )
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

  // Navigation handler with order persistence
  const navigateToTicket = React.useCallback((customerId: number) => {
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
    window.location.href = buildTicketUrl(customerId, tableId)
  }, [tableId, data, state.sorting, state.columnFilters, state.statusFilter])

  // Column definitions with proper memoization
  const columns: ColumnDef<TicketEmail>[] = React.useMemo(() => [
    // Selection column
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label={t('table.selectAll', { defaultValue: 'Select all rows' })}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={t('table.selectRow', { 
            defaultValue: 'Select row',
            subject: row.original.subject 
          })}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    // Subject column
    {
      accessorKey: "subject",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4"
          aria-label={t('table.sortBySubject', { defaultValue: 'Sort by subject' })}
        >
          {t('tickets.subject')}
          <ArrowUpDown className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
      ),
      cell: ({ row }) => {
        const subject = row.getValue("subject") as string
        const status = row.original.status
        const customerId = String(row.original.customer_id)
        const isBold = status === 'new' || status === 'open'
        
        return (
          <div className="flex items-center justify-between gap-3">
            <div 
              className={`max-w-md truncate ${isBold ? 'font-bold text-gray-900' : 'text-gray-700'}`}
              title={subject}
            >
              {subject || t('table.noSubject')}
            </div>
            <ViewersCell customerId={customerId} />
          </div>
        )
      },
    },
    // Email column
    {
      accessorKey: "email_address",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4"
          aria-label={t('table.sortByEmail', { defaultValue: 'Sort by email' })}
        >
          {t('table.from')}
          <ArrowUpDown className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-gray-600" title={row.getValue("email_address")}>
          {row.getValue("email_address")}
        </div>
      ),
    },
    // Customer column
    {
      accessorKey: "customer_name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4"
          aria-label={t('table.sortByCustomer', { defaultValue: 'Sort by customer' })}
        >
          {t('tickets.customer')}
          <ArrowUpDown className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-gray-600">
          {row.getValue("customer_name") || t('table.unknown')}
        </div>
      ),
    },
    // Assigned column
    {
      accessorKey: "assigned_to",
      header: t('tickets.assignedTo'),
      cell: ({ row }) => {
        const assignedTo = row.original.assigned_to
        const assignedType = row.original.assigned_type
        
        if (!assignedTo) {
          return (
            <span className="text-gray-400" aria-label={t('tickets.unassigned')}>
              {t('tickets.unassigned')}
            </span>
          )
        }
        
        return (
          <span 
            className="inline-flex items-center gap-1 whitespace-nowrap"
            aria-label={`${t('tickets.assignedTo')} ${assignedTo}`}
          >
            <span aria-hidden="true">{assignedType === 'employee' ? '👤' : '👥'}</span>
            <span>{assignedTo}</span>
          </span>
        )
      },
    },
    // Date column with relative time
    {
      accessorKey: "send_at",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4"
          aria-label={t('table.sortByDate', { defaultValue: 'Sort by date' })}
        >
          {t('table.date')}
          <ArrowUpDown className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
      ),
      cell: ({ row }) => <RelativeTimeCell date={row.getValue("send_at")} tick={tick} />,
    },
    // Status column
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status as TicketStatus
        const config = STATUS_CONFIG[status] || STATUS_CONFIG.new
        return (
          <Badge 
            variant={config.variant} 
            className={config.className}
            aria-label={config.ariaLabel}
          >
            {config.label}
          </Badge>
        )
      },
    },
    // Actions column
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const ticket = row.original

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                className="h-8 w-8 p-0"
                aria-label={t('table.openMenu')}
              >
                <span className="sr-only">{t('table.openMenu')}</span>
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t('table.actions')}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigateToTicket(ticket.customer_id)}>
                {t('table.viewTicket')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => navigator.clipboard.writeText(ticket.email_address)}
              >
                {t('table.copyEmailAddress')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [t, navigateToTicket, tick])

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

  // Selected rows for bulk actions
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedIds = selectedRows.map(row => row.original.id)

  // Count active filters
  const activeFilterCount = 
    (state.statusFilter.length > 0 ? 1 : 0) + 
    (state.columnFilters.some(f => f.value) ? 1 : 0)

  // Handle row click navigation
  const handleRowClick = React.useCallback((e: React.MouseEvent, customerId: number) => {
    const target = e.target as HTMLElement
    // Don't navigate if clicking on interactive elements
    if (target.closest('button') || target.closest('[role="checkbox"]') || target.closest('[role="menuitem"]')) {
      return
    }
    navigateToTicket(customerId)
  }, [navigateToTicket])

  return (
    <div className="w-full" role="region" aria-label={t('tickets.title')}>
      {/* Toolbar */}
      <div className="flex flex-col gap-4 py-4">
        {/* Row 1: Search, Filters, and Column visibility */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          {/* Left side: Search and Filters */}
          <div className="flex items-center gap-2">
            {/* Subject search */}
            <Input
              placeholder={t('table.filterBySubject')}
              value={(table.getColumn("subject")?.getFilterValue() as string) ?? ""}
              onChange={(event) =>
                table.getColumn("subject")?.setFilterValue(event.target.value)
              }
              className="w-[200px] sm:w-[250px] h-8"
              aria-label={t('table.filterBySubject')}
            />
            
            {/* Status filter */}
            <StatusFilterDropdown
              value={state.statusFilter}
              onChange={(value) => updateState({ statusFilter: value })}
            />

            {/* Clear all filters */}
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => {
                  updateState({ 
                    statusFilter: [], 
                    columnFilters: []
                  })
                  table.getColumn("subject")?.setFilterValue("")
                }}
                aria-label={t('table.clearFilters')}
              >
                <X className="h-4 w-4 mr-1" />
                {t('table.clearFilters')}
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                  {activeFilterCount}
                </Badge>
              </Button>
            )}
          </div>

          {/* Right side: Column visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                {t('table.columns')} <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  const label = 
                    column.id === 'email_address' ? t('table.from') : 
                    column.id === 'customer_name' ? t('tickets.customer') :
                    column.id === 'assigned_to' ? t('tickets.assignedTo') :
                    column.id === 'send_at' ? t('table.date') :
                    column.id === 'subject' ? t('tickets.subject') :
                    column.id
                  
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {label}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Row 2: Bulk actions (only shown when rows are selected) */}
        {selectedRows.length > 0 && (
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
            <span className="text-sm text-muted-foreground">
              {t('table.rowsSelected', { selected: selectedRows.length, total: table.getFilteredRowModel().rows.length })}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  {t('table.setStatus')}
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>{t('table.setStatus')}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onBulkAction?.('set_status_new', selectedIds)}>
                  <span className="w-2 h-2 rounded-full bg-green-500 mr-2" aria-hidden="true" />
                  New
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onBulkAction?.('set_status_open', selectedIds)}>
                  <span className="w-2 h-2 rounded-full bg-orange-500 mr-2" aria-hidden="true" />
                  Open
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onBulkAction?.('set_status_waiting', selectedIds)}>
                  <span className="w-2 h-2 rounded-full bg-blue-500 mr-2" aria-hidden="true" />
                  Waiting
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onBulkAction?.('set_status_resolved', selectedIds)}>
                  <span className="w-2 h-2 rounded-full bg-gray-400 mr-2" aria-hidden="true" />
                  Resolved
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => onBulkAction?.('assign', selectedIds)}
            >
              {t('table.assignTo')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => table.resetRowSelection()}
            >
              {t('table.clearSelection')}
            </Button>
          </div>
        )}
      </div>

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

      {/* Pagination */}
      <div className="flex items-center justify-between space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground" aria-live="polite">
          {t('table.rowsSelected', { 
            selected: table.getFilteredSelectedRowModel().rows.length, 
            total: table.getFilteredRowModel().rows.length 
          })}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label={t('table.previous')}
          >
            {t('table.previous')}
          </Button>
          <div className="text-sm text-muted-foreground" aria-current="page">
            {t('table.pageOf', { 
              current: table.getState().pagination.pageIndex + 1, 
              total: table.getPageCount() || 1
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label={t('table.next')}
          >
            {t('table.next')}
          </Button>
        </div>
      </div>
    </div>
  )
}
