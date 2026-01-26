"use client"

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"
import { 
  ArrowUpDown, 
  MoreHorizontal, 
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { SimplePrivateAvatar } from "@/components/ui/private-avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useTicketViewers } from "@/components/TicketPresenceProvider"
import { formatRelativeTime } from "@/hooks/useRelativeTime"
import { type TicketEmail, type TicketStatus, STATUS_CONFIG } from "./TicketsDataTable"

// --- Helper Components ---

function ViewersCell({ customerId, t }: { customerId: string, t: any }) {
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

function RelativeTimeCell({ date, tick, t }: { date: string, tick: number, t: any }) {
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

// --- Columns Definition ---

export function getColumns(
  t: any, 
  navigateToTicket: (customerId: number) => void, 
  tick: number
): ColumnDef<TicketEmail>[] {
  return [
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
            <ViewersCell customerId={customerId} t={t} />
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
      cell: ({ row }) => <RelativeTimeCell date={row.getValue("send_at")} tick={tick} t={t} />,
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
  ]
}
