"use client"

import * as React from "react"
import { useTranslation } from 'react-i18next'
import { Loader2, Users, UserMinus } from "lucide-react"
import { toast } from "sonner"
import { actions } from "astro:actions"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"

interface Employee {
  id: number
  name: string
}

interface ReassignTicketsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: {
    id: string
    name: string
  }
  mode: "reassign" | "unassign"
}

export function ReassignTicketsDialog({
  open,
  onOpenChange,
  user,
  mode,
}: ReassignTicketsDialogProps) {
  const { t } = useTranslation('manage')
  const [employees, setEmployees] = React.useState<Employee[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = React.useState<string>("")
  const [isLoading, setIsLoading] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Fetch employees when dialog opens (for reassign mode)
  React.useEffect(() => {
    if (open && mode === "reassign") {
      setIsLoading(true)
      actions.getEmployeesForReassignment({})
        .then((result) => {
          if (result?.data?.success && result.data.employees) {
            // Filter out the current user
            const filtered = result.data.employees.filter(
              (emp: Employee) => String(emp.id) !== user.id
            )
            setEmployees(filtered)
          }
        })
        .catch((err) => {
          console.error("Failed to load employees:", err)
          toast.error(t('users.loadEmployeesFailed'))
        })
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [open, mode, user.id])

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      setSelectedEmployeeId("")
      setEmployees([])
    }
  }, [open])

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      if (mode === "unassign") {
        const result = await actions.unassignAllTickets({
          employeeId: parseInt(user.id),
        })

        if (!result?.data?.success) {
          toast.error(result?.data?.message || t('users.failedToUnassign'))
          return
        }

        toast.success(result.data.message)
        onOpenChange(false)
        // Reload to reflect changes
        window.location.reload()
      } else {
        if (!selectedEmployeeId) {
          toast.error(t('users.selectEmployeeToReassign'))
          return
        }

        const result = await actions.reassignAllTickets({
          fromEmployeeId: parseInt(user.id),
          toEmployeeId: parseInt(selectedEmployeeId),
        })

        if (!result?.data?.success) {
          toast.error(result?.data?.message || t('users.failedToReassign'))
          return
        }

        toast.success(result.data.message)
        onOpenChange(false)
        // Reload to reflect changes
        window.location.reload()
      }
    } catch (err: any) {
      console.error("Error:", err)
      toast.error(t('common.unexpectedError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "unassign" ? (
              <>
                <UserMinus className="h-5 w-5" />
                {t('users.unassignAllTickets')}
              </>
            ) : (
              <>
                <Users className="h-5 w-5" />
                {t('users.reassignAllTickets')}
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {mode === "unassign" ? (
              <>
                {t('users.unassignDescription', { name: user.name })}
              </>
            ) : (
              <>
                {t('users.reassignDescription', { name: user.name })}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {mode === "reassign" && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="target-employee">{t('users.reassignTo')}</Label>
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('users.loadingEmployees')}
                </div>
              ) : (
                <Select
                  value={selectedEmployeeId}
                  onValueChange={setSelectedEmployeeId}
                >
                  <SelectTrigger id="target-employee">
                    <SelectValue placeholder={t('users.selectEmployee')} />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.length === 0 ? (
                      <SelectItem value="none" disabled>
                        {t('users.noOtherEmployees')}
                      </SelectItem>
                    ) : (
                      employees.map((emp) => (
                        <SelectItem key={emp.id} value={String(emp.id)}>
                          {emp.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant={mode === "unassign" ? "destructive" : "default"}
            onClick={handleSubmit}
            disabled={isSubmitting || (mode === "reassign" && !selectedEmployeeId)}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {mode === "unassign" ? t('users.unassigning') : t('users.reassigning')}
              </>
            ) : mode === "unassign" ? (
              t('users.unassignAllTickets')
            ) : (
              t('users.reassignAllTickets')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
