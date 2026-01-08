// src/components/platform/RecentCancellationsCard.tsx
"use client"

import * as React from "react"
import { useTranslation } from 'react-i18next'
import { XCircle, AlertTriangle, ArrowUpRight, Building2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  className?: string
}

export function RecentCancellationsCard({ className }: Props) {
  const { t } = useTranslation('platform')
  const [notifications, setNotifications] = React.useState<Notification[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    const fetchCancellations = async () => {
      try {
        const response = await fetch(
          '/api/platform/notifications?limit=5&type=subscription_cancelled,subscription_pending_cancellation,payment_failed',
          { credentials: 'include' }
        )
        if (response.ok) {
          const data = await response.json()
          setNotifications(data.data || [])
        }
      } catch (err) {
        console.error('Failed to fetch cancellations:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchCancellations()
  }, [])

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'subscription_cancelled':
      case 'subscription_pending_cancellation':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'payment_failed':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />
      default:
        return <XCircle className="h-4 w-4 text-muted-foreground" />
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
        return null
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {t('dashboard.recentAlerts')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (notifications.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {t('dashboard.recentAlerts')}
          </CardTitle>
          <CardDescription>
            {t('dashboard.recentAlertsDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900 mb-3">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium">{t('dashboard.noAlerts')}</p>
            <p className="text-xs text-muted-foreground">{t('dashboard.allGood')}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("border-amber-200 dark:border-amber-900", className)}>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {t('dashboard.recentAlerts')}
          </CardTitle>
          <CardDescription>
            {t('dashboard.recentAlertsDescription')}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href="/platform/notifications">
            {t('dashboard.viewAll')}
            <ArrowUpRight className="ml-1 h-4 w-4" />
          </a>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {notifications.map((notification) => (
            <a
              key={notification.id}
              href={notification.client_id ? `/platform/clients/${notification.client_id}` : '#'}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors",
                !notification.read && "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  {getNotificationIcon(notification.type)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">
                      {notification.clients?.name || t('dashboard.unknownClient')}
                    </p>
                    {getNotificationBadge(notification.type)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {notification.message || notification.title}
                  </p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatDate(notification.created_at)}
              </span>
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
