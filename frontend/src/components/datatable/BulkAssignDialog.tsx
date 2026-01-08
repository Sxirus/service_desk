"use client"

import * as React from "react"
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Users, User, Loader2, Search } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiClient } from '@/utils/api'

interface Employee {
  id: number
  name: string
}

interface Group {
  id: number
  name: string
}

interface BulkAssignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerIds: number[]
  onSuccess?: () => void
}

/**
 * BulkAssignDialog
 * 
 * Dialog for bulk assigning multiple tickets/customers to an employee or group.
 * Fetches available employees and groups from the API.
 */
export function BulkAssignDialog({
  open,
  onOpenChange,
  customerIds,
  onSuccess
}: BulkAssignDialogProps) {
  const { t } = useTranslation('dashboard')
  const { t: tc } = useTranslation('common')
  const [employees, setEmployees] = React.useState<Employee[]>([])
  const [groups, setGroups] = React.useState<Group[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [isAssigning, setIsAssigning] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')

  // Fetch employees and groups when dialog opens
  React.useEffect(() => {
    if (!open) return

    const fetchData = async () => {
      setIsLoading(true)
      try {
        // Fetch employees - API returns { success: true, data: [...] }
        const empResult = await apiClient.get('/client/getEmployees')
        console.log('[BulkAssignDialog] Employees response:', empResult)
        if (empResult.data && Array.isArray(empResult.data)) {
          setEmployees(empResult.data.map((e: any) => ({
            id: e.id,
            name: e.name
          })))
        }

        // Fetch groups - API returns { success: true, data: [...] }
        const grpResult = await apiClient.get('/groups/getGroups')
        console.log('[BulkAssignDialog] Groups response:', grpResult)
        if (grpResult.data && Array.isArray(grpResult.data)) {
          setGroups(grpResult.data.map((g: any) => ({
            id: g.id,
            name: g.name
          })))
        }
      } catch (error) {
        console.error('[BulkAssignDialog] Failed to fetch data:', error)
        toast.error(tc('error'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [open, tc])

  // Filter employees and groups based on search
  const filteredEmployees = React.useMemo(() => {
    if (!searchQuery.trim()) return employees
    const query = searchQuery.toLowerCase()
    return employees.filter(e => e.name.toLowerCase().includes(query))
  }, [employees, searchQuery])

  const filteredGroups = React.useMemo(() => {
    if (!searchQuery.trim()) return groups
    const query = searchQuery.toLowerCase()
    return groups.filter(g => g.name.toLowerCase().includes(query))
  }, [groups, searchQuery])

  // Handle assignment
  const handleAssign = async (type: 'employee' | 'group', id: number) => {
    if (isAssigning) return

    setIsAssigning(true)
    try {
      const payload = type === 'employee' 
        ? { customerIds, employeeId: id }
        : { customerIds, groupId: id }

      const result = await apiClient.post('/client/bulkAssign', payload)

      if (!result.success) {
        throw new Error(result.error || 'Assignment failed')
      }

      toast.success(t('table.bulkActionSuccess', { count: result.updated }))
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error('[BulkAssignDialog] Assignment failed:', error)
      toast.error(t('table.bulkActionError'), {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsAssigning(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('table.assignTo')}</DialogTitle>
          <DialogDescription>
            {t('table.confirmBulkAction', { count: customerIds.length })}
          </DialogDescription>
        </DialogHeader>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('tickets.searchEmployeeOrGroup')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            disabled={isLoading}
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto pr-2">
            {/* Groups section */}
            {filteredGroups.length > 0 && (
              <div className="mb-4">
                <h4 className="mb-2 text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {tc('groups')}
                </h4>
                <div className="space-y-1">
                  {filteredGroups.map((group) => (
                    <Button
                      key={`group-${group.id}`}
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => handleAssign('group', group.id)}
                      disabled={isAssigning}
                    >
                      <Users className="mr-2 h-4 w-4 text-blue-500" />
                      {group.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Employees section */}
            {filteredEmployees.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {tc('employees')}
                </h4>
                <div className="space-y-1">
                  {filteredEmployees.map((employee) => (
                    <Button
                      key={`employee-${employee.id}`}
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => handleAssign('employee', employee.id)}
                      disabled={isAssigning}
                    >
                      <User className="mr-2 h-4 w-4 text-green-500" />
                      {employee.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {filteredGroups.length === 0 && filteredEmployees.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">
                {searchQuery ? tc('noResults') : tc('noData')}
              </div>
            )}
          </div>
        )}

        {/* Footer with cancel button */}
        <div className="flex justify-end pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isAssigning}
          >
            {tc('cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
