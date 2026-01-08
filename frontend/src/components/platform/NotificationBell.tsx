// src/components/platform/NotificationBell.tsx
"use client"

import * as React from "react"
import { useTranslation } from 'react-i18next'
import { Bell, AlertTriangle, XCircle, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface Notification {
  id: string
  type: string
  client_id: number | null
  title: string
  message: string | null
  metadata: Record<string, unknown> | null
  read: boolean
  created_at: string
  clients: {
    id: number
    name: string
  } | null
}

interface Props {
  initialUnreadCount?: number
}

export function NotificationBell({ initialUnreadCount = 0 }: Props) {
  const { t } = useTranslation('platform')
  const [notifications, setNotifications] = React.useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = React.useState(initialUnreadCount)
  const [isOpen, setIsOpen] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false)

  // Fetch notifications when popover opens
  const fetchNotifications = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/platform/notifications?limit=20', {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        setNotifications(data.data || [])
        setUnreadCount(data.unread_count || 0)
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch unread count on mount and periodically
  React.useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const response = await fetch('/api/platform/notifications/unread-count', {
          credentials: 'include'
        })
        if (response.ok) {
          const data = await response.json()
          setUnreadCount(data.count || 0)
        }
      } catch (err) {
        console.error('Failed to fetch unread count:', err)
      }
    }

    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 60000) // Poll every minute
    return () => clearInterval(interval)
  }, [])

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (open) {
      fetchNotifications()
    }
  }

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/platform/notifications/${id}/read`, {
        method: 'PUT',
        credentials: 'include'
      })
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (err) {
      console.error('Failed to mark as read:', err)
    }
  }

  const markAllAsRead = async () => {
    try {
      await fetch('/api/platform/notifications/mark-all-read', {
        method: 'PUT',
        credentials: 'include'
      })
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch (err) {
      console.error('Failed to mark all as read:', err)
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'subscription_cancelled':
      case 'subscription_pending_cancellation':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'payment_failed':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />
      default:
        return <Bell className="h-4 w-4 text-blue-500" />
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) {
      return t('notifications.minutesAgo', { count: diffMins })
    } else if (diffHours < 24) {
      return t('notifications.hoursAgo', { count: diffHours })
    } else if (diffDays < 7) {
      return t('notifications.daysAgo', { count: diffDays })
    } else {
      return date.toLocaleDateString()
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="font-semibold">{t('notifications.title')}</h4>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={markAllAsRead}
              className="text-xs"
            >
              <Check className="h-3 w-3 mr-1" />
              {t('notifications.markAllRead')}
            </Button>
          )}
        </div>
        <div className="h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">{t('notifications.noNotifications')}</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer",
                    !notification.read && "bg-primary/5"
                  )}
                  onClick={() => {
                    if (!notification.read) {
                      markAsRead(notification.id)
                    }
                    if (notification.client_id) {
                      window.location.href = `/platform/clients/${notification.client_id}`
                    }
                  }}
                >
                  <div className="mt-0.5">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn(
                        "text-sm",
                        !notification.read && "font-medium"
                      )}>
                        {notification.title}
                      </p>
                      {!notification.read && (
                        <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                      )}
                    </div>
                    {notification.message && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(notification.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {notifications.length > 0 && (
          <div className="border-t px-4 py-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full text-xs"
              onClick={() => window.location.href = '/platform/notifications'}
            >
              {t('notifications.viewAll')}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
