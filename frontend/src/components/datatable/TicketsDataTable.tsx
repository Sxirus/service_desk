"use client"

import * as React from "react"
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
import { ArrowUpDown, ChevronDown, MoreHorizontal } from "lucide-react"

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
import { SimplePrivateAvatar, getInitials } from "@/components/ui/private-avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useTicketViewers } from "@/components/TicketPresenceProvider"

// Type for ticket/email data
export type TicketEmail = {
  id: number
  subject: string
  email_address: string
  customer_id: number
  customer_name: string
  assigned_to?: string
  assigned_type?: 'employee' | 'group' | null
  send_at: string
  read: boolean
}

interface TicketsDataTableProps {
  data: TicketEmail[]
  showAssignedColumn?: boolean
  onBulkAction?: (action: string, selectedIds: number[]) => void
  tableId?: string // Unique ID to persist state per table instance
}

type ComparableValue = string | number | boolean | null | undefined

function buildTicketUrl(customerId: number | string, fromTableId: string) {
  const from = encodeURIComponent(fromTableId)
  return `/tickets/${customerId}?from=${from}`
}

function getComparableValue(ticket: TicketEmail, key: string): ComparableValue {
  switch (key) {
    case 'send_at':
      return new Date(ticket.send_at).getTime()
    case 'read':
      return ticket.read
    case 'subject':
      return ticket.subject
    case 'customer_name':
      return ticket.customer_name
    case 'email_address':
      return ticket.email_address
    case 'assigned_to':
      return ticket.assigned_to ?? ''
    default:
      return (ticket as unknown as Record<string, ComparableValue>)[key]
  }
}

function getTicketOrder(
  data: TicketEmail[],
  sorting: SortingState,
  columnFilters: ColumnFiltersState
): string[] {
  let filtered = data

  // Minimal filter support: subject text filter (matches the table UI).
  const subjectFilter = columnFilters.find((f) => f.id === 'subject')
  if (subjectFilter && typeof subjectFilter.value === 'string' && subjectFilter.value.trim() !== '') {
    const needle = subjectFilter.value.toLowerCase()
    filtered = filtered.filter((t) => (t.subject || '').toLowerCase().includes(needle))
  }

  if (!sorting || sorting.length === 0) {
    return filtered.map((t) => String(t.customer_id))
  }

  const sorted = [...filtered].sort((a, b) => {
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

  return sorted.map((t) => String(t.customer_id))
}

// Helper to get saved state from localStorage
function getSavedState<T>(tableId: string, key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue
  try {
    const saved = localStorage.getItem(`table_${tableId}_${key}`)
    if (saved) {
      return JSON.parse(saved) as T
    }
  } catch (e) {
    console.error('Error reading table state from localStorage:', e)
  }
  return defaultValue
}

// Helper to save state to localStorage
function saveState<T>(tableId: string, key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`table_${tableId}_${key}`, JSON.stringify(value))
  } catch (e) {
    console.error('Error saving table state to localStorage:', e)
  }
}

/**
 * ViewersCell - Shows avatars of users currently viewing this ticket
 */
function ViewersCell({ customerId }: { customerId: string }) {
  const viewers = useTicketViewers(customerId)
  
  if (viewers.length === 0) {
    return null
  }

  return (
    <TooltipProvider>
      <div className="flex -space-x-1.5">
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
              {viewer.name} is viewing
            </TooltipContent>
          </Tooltip>
        ))}
        {viewers.length > 3 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium cursor-default">
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

export function TicketsDataTable({ 
  data, 
  showAssignedColumn = false,
  onBulkAction,
  tableId = 'default'
}: TicketsDataTableProps) {
  // Initialize state from localStorage or defaults
  const [sorting, setSorting] = React.useState<SortingState>(() => 
    getSavedState(tableId, 'sorting', [{ id: "send_at", desc: true }])
  )
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(() =>
    getSavedState(tableId, 'columnFilters', [])
  )
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() =>
    getSavedState(tableId, 'columnVisibility', { assigned_to: showAssignedColumn })
  )
  const [rowSelection, setRowSelection] = React.useState({})
  const [pageSize, setPageSize] = React.useState<number>(() =>
    getSavedState(tableId, 'pageSize', 20)
  )

  const navigateToTicket = React.useCallback((customerId: number) => {
    try {
      const order = getTicketOrder(data, sorting, columnFilters)
      saveState(tableId, 'ticketOrder', order)
      saveState(tableId, 'lastOpenedCustomerId', String(customerId))
    } catch (e) {
      console.warn('[TicketsDataTable] Failed to persist ticket order:', e)
    }
    window.location.href = buildTicketUrl(customerId, tableId)
  }, [tableId, data, sorting, columnFilters])

  // Save state to localStorage when it changes
  React.useEffect(() => {
    saveState(tableId, 'sorting', sorting)
  }, [tableId, sorting])

  React.useEffect(() => {
    saveState(tableId, 'columnFilters', columnFilters)
  }, [tableId, columnFilters])

  React.useEffect(() => {
    saveState(tableId, 'columnVisibility', columnVisibility)
  }, [tableId, columnVisibility])

  React.useEffect(() => {
    saveState(tableId, 'pageSize', pageSize)
  }, [tableId, pageSize])

  const columns: ColumnDef<TicketEmail>[] = React.useMemo(() => [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "subject",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-4"
          >
            Subject
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const subject = row.getValue("subject") as string
        const read = row.original.read
        const customerId = String(row.original.customer_id)
        return (
          <div className="flex items-center justify-between gap-3">
            <div className={`max-w-md truncate ${!read ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
              {subject || "(No Subject)"}
            </div>
            <ViewersCell customerId={customerId} />
          </div>
        )
      },
    },
    {
      accessorKey: "email_address",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-4"
          >
            From
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => <div className="text-gray-600">{row.getValue("email_address")}</div>,
    },
    {
      accessorKey: "customer_name",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-4"
          >
            Customer
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => <div className="text-gray-600">{row.getValue("customer_name") || "Unknown"}</div>,
    },
    {
      accessorKey: "assigned_to",
      header: "Assigned To",
      cell: ({ row }) => {
        const assignedTo = row.original.assigned_to
        const assignedType = row.original.assigned_type
        
        if (!assignedTo) {
          return <span className="text-gray-400">Unassigned</span>
        }
        
        return (
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span>{assignedType === 'employee' ? '👤' : '👥'}</span>
            <span>{assignedTo}</span>
          </span>
        )
      },
    },
    {
      accessorKey: "send_at",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-4"
          >
            Date
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const date = new Date(row.getValue("send_at"))
        return <div className="text-gray-600 whitespace-nowrap">{date.toLocaleString()}</div>
      },
    },
    {
      accessorKey: "read",
      header: "Status",
      cell: ({ row }) => {
        const read = row.getValue("read") as boolean
        return (
          <Badge variant={read ? "secondary" : "default"}>
            {read ? 'Read' : 'Unread'}
          </Badge>
        )
      },
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const ticket = row.original

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => navigateToTicket(ticket.customer_id)}
              >
                View Ticket
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => navigator.clipboard.writeText(ticket.email_address)}
              >
                Copy Email Address
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [])

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination: {
        pageIndex: 0,
        pageSize,
      },
    },
  })

  // Sync pageSize when table page size changes
  React.useEffect(() => {
    const currentPageSize = table.getState().pagination.pageSize
    if (currentPageSize !== pageSize) {
      setPageSize(currentPageSize)
    }
  }, [table.getState().pagination.pageSize])

  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedIds = selectedRows.map(row => row.original.id)

  return (
    <div className="w-full">
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter by subject..."
            value={(table.getColumn("subject")?.getFilterValue() as string) ?? ""}
            onChange={(event) =>
              table.getColumn("subject")?.setFilterValue(event.target.value)
            }
            className="max-w-sm"
          />
          {selectedRows.length > 0 && onBulkAction && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  Actions ({selectedRows.length} selected)
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => onBulkAction('mark_read', selectedIds)}>
                  Mark as Read
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onBulkAction('mark_unread', selectedIds)}>
                  Mark as Unread
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onBulkAction('assign', selectedIds)}>
                  Assign To...
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              Columns <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id === 'email_address' ? 'From' : 
                     column.id === 'customer_name' ? 'Customer' :
                     column.id === 'assigned_to' ? 'Assigned To' :
                     column.id === 'send_at' ? 'Date' :
                     column.id}
                  </DropdownMenuCheckboxItem>
                )
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
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
                  onClick={(e) => {
                    // Don't navigate if clicking on checkbox or actions
                    const target = e.target as HTMLElement
                    if (target.closest('button') || target.closest('[role="checkbox"]')) {
                      return
                    }
                    navigateToTicket(row.original.customer_id)
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  <div className="flex flex-col items-center justify-center py-8">
                    <svg className="h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <h3 className="text-lg font-medium text-gray-900">No emails found</h3>
                    <p className="text-gray-500 mt-1">There are currently no emails available.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <div className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
