"use client"

import * as React from "react"
import { useTranslation } from 'react-i18next'
import {
  type Table,
} from "@tanstack/react-table"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { type TicketEmail } from "./TicketsDataTable"

interface TicketsTablePaginationProps {
  table: Table<TicketEmail>
}

export function TicketsTablePagination({ table }: TicketsTablePaginationProps) {
  const { t } = useTranslation('dashboard')
  const currentPage = table.getState().pagination.pageIndex + 1
  const totalPages = table.getPageCount() || 1

  const [isEditing, setIsEditing] = React.useState(false)
  const [editValue, setEditValue] = React.useState(String(currentPage))
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Sync edit value when page changes externally (e.g. via buttons)
  React.useEffect(() => {
    if (!isEditing) {
      setEditValue(String(currentPage))
    }
  }, [currentPage, isEditing])

  // Auto-focus and select input when entering edit mode
  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const commitPage = React.useCallback(() => {
    const parsed = parseInt(editValue, 10)
    if (!isNaN(parsed) && parsed >= 1 && parsed <= totalPages) {
      table.setPageIndex(parsed - 1)
    }
    // Reset to current page if invalid
    setEditValue(String(table.getState().pagination.pageIndex + 1))
    setIsEditing(false)
  }, [editValue, totalPages, table])

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitPage()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditValue(String(currentPage))
      setIsEditing(false)
    }
  }, [commitPage, currentPage])

  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex-1 text-sm text-muted-foreground" aria-live="polite">
        {t('table.rowsSelected', { 
          selected: table.getFilteredSelectedRowModel().rows.length, 
          total: table.getFilteredRowModel().rows.length 
        })}
      </div>
      <div className="flex items-center gap-1">
        {/* First page */}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
          aria-label={t('table.firstPage')}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        {/* Previous page */}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          aria-label={t('table.previous')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* Editable page indicator */}
        <div className="flex items-center gap-1.5 px-2 text-sm text-muted-foreground" aria-current="page">
          <span className="whitespace-nowrap">{t('table.page')}</span>
          {isEditing ? (
            <Input
              ref={inputRef}
              type="number"
              min={1}
              max={totalPages}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitPage}
              onKeyDown={handleKeyDown}
              className="h-7 w-12 text-center text-sm px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              aria-label={t('table.goToPage')}
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex h-7 min-w-[2rem] items-center justify-center rounded-md border border-input bg-transparent px-2 text-sm font-medium tabular-nums hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-text"
              title={t('table.goToPage')}
              aria-label={t('table.goToPage')}
            >
              {currentPage}
            </button>
          )}
          <span className="whitespace-nowrap">
            {t('table.ofPages', { total: totalPages })}
          </span>
        </div>

        {/* Next page */}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          aria-label={t('table.next')}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {/* Last page */}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => table.setPageIndex(totalPages - 1)}
          disabled={!table.getCanNextPage()}
          aria-label={t('table.lastPage')}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
