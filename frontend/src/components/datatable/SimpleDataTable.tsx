/**
 * SimpleDataTable Component
 * 
 * A reusable, lightweight table component for displaying data in a simple format.
 * For complex use cases with sorting, filtering, pagination, use TicketsDataTable instead.
 * 
 * Features:
 * - Configurable columns with custom render functions
 * - Optional Card wrapper with title/description
 * - Empty state handling
 * - TypeScript generics for type-safe data
 * - Optional footer content
 */

"use client"

import * as React from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

/**
 * Column definition for SimpleDataTable
 */
export interface SimpleColumnDef<T> {
  /** Unique identifier for the column */
  id: string
  /** Header text or render function */
  header: React.ReactNode | (() => React.ReactNode)
  /** Cell render function - receives the row data */
  cell: (row: T, index: number) => React.ReactNode
  /** Optional className for the header cell */
  headerClassName?: string
  /** Optional className for body cells */
  cellClassName?: string
}

/**
 * Card wrapper configuration
 */
export interface CardWrapperConfig {
  /** Card title */
  title: React.ReactNode
  /** Card description (optional) */
  description?: React.ReactNode
  /** Icon to show next to title (optional) */
  icon?: React.ReactNode
}

export interface SimpleDataTableProps<T> {
  /** Data array to display */
  data: T[]
  /** Column definitions */
  columns: SimpleColumnDef<T>[]
  /** Unique key extractor for each row */
  getRowKey: (row: T, index: number) => string | number
  /** Optional Card wrapper configuration - if not provided, renders table without card */
  cardConfig?: CardWrapperConfig
  /** Message to show when data is empty */
  emptyMessage?: React.ReactNode
  /** Optional className for the table container */
  className?: string
  /** Optional className for the table */
  tableClassName?: string
  /** Optional footer content (shown below the table, inside card if cardConfig provided) */
  footer?: React.ReactNode
  /** Optional click handler for rows */
  onRowClick?: (row: T, index: number) => void
  /** Optional row className function */
  getRowClassName?: (row: T, index: number) => string
}

/**
 * SimpleDataTable - A lightweight, reusable table component
 */
export function SimpleDataTable<T>({
  data,
  columns,
  getRowKey,
  cardConfig,
  emptyMessage = "No data available",
  className,
  tableClassName,
  footer,
  onRowClick,
  getRowClassName,
}: SimpleDataTableProps<T>) {
  const renderHeader = (column: SimpleColumnDef<T>) => {
    if (typeof column.header === 'function') {
      return column.header()
    }
    return column.header
  }

  const tableContent = (
    <>
      <div className={cn("rounded-md border", className)}>
        <Table className={tableClassName}>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.id} className={column.headerClassName}>
                  {renderHeader(column)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell 
                  colSpan={columns.length} 
                  className="text-center py-8 text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, index) => (
                <TableRow 
                  key={getRowKey(row, index)}
                  className={cn(
                    onRowClick && "cursor-pointer hover:bg-muted/50",
                    getRowClassName?.(row, index)
                  )}
                  onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                >
                  {columns.map((column) => (
                    <TableCell key={column.id} className={column.cellClassName}>
                      {column.cell(row, index)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {footer}
    </>
  )

  // If no card config, render table directly
  if (!cardConfig) {
    return tableContent
  }

  // Render with Card wrapper
  return (
    <Card>
      <CardHeader>
        <CardTitle className={cardConfig.icon ? "flex items-center gap-2" : undefined}>
          {cardConfig.icon}
          {cardConfig.title}
        </CardTitle>
        {cardConfig.description && (
          <CardDescription>{cardConfig.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {tableContent}
      </CardContent>
    </Card>
  )
}

/**
 * Helper to create a simple text column
 */
export function createTextColumn<T>(
  id: string,
  header: string,
  accessor: (row: T) => React.ReactNode,
  options?: {
    headerClassName?: string
    cellClassName?: string
  }
): SimpleColumnDef<T> {
  return {
    id,
    header,
    cell: (row) => accessor(row),
    ...options,
  }
}
