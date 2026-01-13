"use client"

import * as React from "react"
import { useTranslation } from 'react-i18next'
import {
  type Table,
} from "@tanstack/react-table"
import { 
  ChevronDown, 
  Filter, 
  X, 
} from "lucide-react"

import { Button } from "@/components/ui/button"
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
import { Badge } from "@/components/ui/badge"
import { type TicketEmail, type TicketStatus, STATUS_CONFIG, ALL_STATUSES } from "./TicketsDataTable"

interface TicketsTableToolbarProps {
  table: Table<TicketEmail>
  statusFilter: string[]
  onStatusFilterChange: (value: string[]) => void
  onBulkAction?: (action: string, selectedIds: number[]) => void
  onClearFilters: () => void
}

export function TicketsTableToolbar({
  table,
  statusFilter,
  onStatusFilterChange,
  onBulkAction,
  onClearFilters
}: TicketsTableToolbarProps) {
  const { t } = useTranslation('dashboard')
  
  const activeFilterCount = 
    (statusFilter.length > 0 ? 1 : 0) + 
    (table.getState().columnFilters.some(f => f.value) ? 1 : 0)

  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedIds = selectedRows.map(row => row.original.id)

  return (
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
            value={statusFilter}
            onChange={onStatusFilterChange}
          />

          {/* Clear all filters */}
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={onClearFilters}
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
  )
}

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
