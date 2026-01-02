"use client"

import React from 'react'
import { TicketsDataTable, type TicketEmail } from '@/components/datatable/TicketsDataTable'
import { TicketPresenceProvider } from '@/components/TicketPresenceProvider'

interface PresenceUser {
  id: string
  name: string
  avatar_url: string | null
}

interface TicketsDataTableWithPresenceProps {
  data: TicketEmail[]
  showAssignedColumn?: boolean
  onBulkAction?: (action: string, selectedIds: number[]) => void
  tableId?: string
  currentUser: PresenceUser
}

/**
 * TicketsDataTableWithPresence
 * 
 * Wraps the TicketsDataTable with presence tracking capabilities.
 * Shows avatars of users currently viewing each ticket in the table.
 */
export function TicketsDataTableWithPresence({
  data,
  showAssignedColumn = false,
  onBulkAction,
  tableId = 'default',
  currentUser
}: TicketsDataTableWithPresenceProps) {
  // Extract unique customer IDs from the visible data
  const customerIds = React.useMemo(() => {
    const ids = data.map(ticket => String(ticket.customer_id))
    return [...new Set(ids)]
  }, [data])

  return (
    <TicketPresenceProvider customerIds={customerIds} currentUser={currentUser}>
      <TicketsDataTable
        data={data}
        showAssignedColumn={showAssignedColumn}
        onBulkAction={onBulkAction}
        tableId={tableId}
      />
    </TicketPresenceProvider>
  )
}
