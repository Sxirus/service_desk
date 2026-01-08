// src/components/platform/NotificationsManagement.tsx
"use client"

import * as React from "react"
import { useTranslation } from 'react-i18next'
import { 
  Bell, 
  XCircle, 
  AlertTriangle, 
  Check, 
  Filter,
  Building2,
  RefreshCw 
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  initialNotifications: Notification[]
  initialUnreadCount: number
}

export default function NotificationsManagement({ 
  initialNotifications,
  initialUnreadCount 
}: Props) {
  const { t } = useTranslation('platform')
  const [notifications, setNotifications] = React.useState<Notification[]>(initialNotifications)
  const [unreadCount, setUnreadCount] = React.useState(initialUnreadCount)
  const [filter, setFilter] = React.useState<string>('all')
  const [isLoading, setIsLoading] = React.useState(false)

  const fetchNotifications = async () => {
    setIsLoading(true)
    try {
      let url = '/api/platform/notifications?limit=100'
      if (filter === 'unread') {
        url += '&unread_only=true'
      } else if (filter !== 'all') {
        url += `&type=${filter}`
      }
      
      const response = await fetch(url, { credentials: 'include' })
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
  }

  React.useEffect(() => {
    fetchNotifications()
  }, [filter])

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
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'payment_failed':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />
      default:
        return <Bell className="h-5 w-5 text-blue-500" />
    }
  }

  const getNotificationBadge = (type: string) => {
    switch (type) {
      case 'subscription_cancelled':
        return <Badge variant="destructive">{t('notifications.cancelled')}</Badge>
      case 'subscription_pending_cancellation':
        return <Badge variant="outline" className="border-amber-500 text-amber-600">{t('notifications.pending')}</Badge>
      case 'payment_failed':
        return <Badge variant="outline" className="border-red-500 text-red-600">{t('notifications.paymentFailed')}</Badge>
      default:
        return <Badge variant="secondary">{t('notifications.info')}</Badge>
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('notifications.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('notifications.description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={fetchNotifications}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            {t('notifications.refresh')}
          </Button>
          {unreadCount > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={markAllAsRead}
            >
              <Check className="h-4 w-4 mr-2" />
              {t('notifications.markAllRead')}
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('notifications.filter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('notifications.filterAll')}</SelectItem>
              <SelectItem value="unread">{t('notifications.filterUnread')}</SelectItem>
              <SelectItem value="subscription_cancelled">{t('notifications.filterCancelled')}</SelectItem>
              <SelectItem value="payment_failed">{t('notifications.filterPaymentFailed')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {unreadCount > 0 && (
          <Badge variant="secondary">
            {t('notifications.unreadCount', { count: unreadCount })}
          </Badge>
        )}
      </div>

      {/* Notifications List */}
      <Card>
        <CardHeader>
          <CardTitle>{t('notifications.allNotifications')}</CardTitle>
          <CardDescription>
            {t('notifications.allNotificationsDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">{t('notifications.noNotifications')}</p>
              <p className="text-sm">{t('notifications.noNotificationsDescription')}</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "flex items-start gap-4 py-4 px-2 hover:bg-muted/50 transition-colors rounded-lg cursor-pointer",
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
                  <div className="mt-1">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className={cn(
                            "font-medium",
                            !notification.read && "font-semibold"
                          )}>
                            {notification.title}
                          </p>
                          {getNotificationBadge(notification.type)}
                          {!notification.read && (
                            <div className="h-2 w-2 rounded-full bg-primary" />
                          )}
                        </div>
                        {notification.message && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {notification.message}
                          </p>
                        )}
                        {notification.clients && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            <span>{notification.clients.name}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-muted-foreground">
                          {formatDate(notification.created_at)}
                        </p>
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs mt-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              markAsRead(notification.id)
                            }}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            {t('notifications.markRead')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
