"use client"

import * as React from "react"
import { useTranslation } from 'react-i18next'
import {
  type Table,
} from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import { type TicketEmail } from "./TicketsDataTable"

interface TicketsTablePaginationProps {
  table: Table<TicketEmail>
}

export function TicketsTablePagination({ table }: TicketsTablePaginationProps) {
  const { t } = useTranslation('dashboard')

  return (
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
  )
}
