"use client"

import React from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { TicketsDataTable, type TicketEmail } from '@/components/datatable/TicketsDataTable'
import { TicketPresenceProvider } from '@/components/TicketPresenceProvider'
import { BulkAssignDialog } from '@/components/datatable/BulkAssignDialog'
import { apiClient } from '@/utils/api'

interface PresenceUser {
  id: string
  name: string
  avatar_url: string | null
}

interface TicketsDataTableWithPresenceProps {
  data: TicketEmail[]
  showAssignedColumn?: boolean
  tableId?: string
  currentUser: PresenceUser
}

/**
 * TicketsDataTableWithPresence
 * 
 * Wraps the TicketsDataTable with presence tracking capabilities.
 * Shows avatars of users currently viewing each ticket in the table.
 * Handles bulk actions (status updates, assignments) internally.
 */
export function TicketsDataTableWithPresence({
  data,
  showAssignedColumn = false,
  tableId = 'default',
  currentUser
}: TicketsDataTableWithPresenceProps) {
  const { t } = useTranslation('dashboard')
  const [isUpdating, setIsUpdating] = React.useState(false)
  const [assignDialogOpen, setAssignDialogOpen] = React.useState(false)
  const [customerIdsToAssign, setCustomerIdsToAssign] = React.useState<number[]>([])

  // Extract unique customer IDs from the visible data
  const customerIds = React.useMemo(() => {
    const ids = data.map(ticket => String(ticket.customer_id))
    return [...new Set(ids)]
  }, [data])

  // Handle bulk actions
  const handleBulkAction = React.useCallback(async (action: string, selectedIds: number[]) => {
    if (isUpdating || selectedIds.length === 0) return

    // Map email IDs to customer IDs
    const customerIdsToUpdate = selectedIds
      .map(emailId => {
        const ticket = data.find(t => t.id === emailId)
        return ticket?.customer_id
      })
      .filter((id): id is number => id !== undefined)

    if (customerIdsToUpdate.length === 0) {
      toast.error(t('table.bulkActionError'), {
        description: 'No valid tickets selected'
      })
      return
    }

    // Handle status change actions
    if (action.startsWith('set_status_')) {
      const status = action.replace('set_status_', '')
      
      setIsUpdating(true)
      try {
        const result = await apiClient.post('/emails/bulkUpdateStatus', {
          customerIds: customerIdsToUpdate,
          status: status
        })

        if (!result.success) {
          throw new Error(result.error || 'Failed to update status')
        }

        toast.success(t('table.bulkActionSuccess', { count: result.updated }))

        // Reload the page to reflect changes
        window.location.reload()
      } catch (error) {
        console.error('[BulkAction] Status update failed:', error)
        toast.error(t('table.bulkActionError'), {
          description: error instanceof Error ? error.message : 'Unknown error'
        })
      } finally {
        setIsUpdating(false)
      }
    }

    // Handle assign action - open dialog
    if (action === 'assign') {
      setCustomerIdsToAssign(customerIdsToUpdate)
      setAssignDialogOpen(true)
    }
  }, [data, isUpdating, t])

  // Handle successful assignment
  const handleAssignSuccess = React.useCallback(() => {
    window.location.reload()
  }, [])

  return (
    <TicketPresenceProvider customerIds={customerIds} currentUser={currentUser}>
      <TicketsDataTable
        data={data}
        showAssignedColumn={showAssignedColumn}
        onBulkAction={handleBulkAction}
        tableId={tableId}
      />
      <BulkAssignDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        customerIds={customerIdsToAssign}
        onSuccess={handleAssignSuccess}
      />
    </TicketPresenceProvider>
  )
}
