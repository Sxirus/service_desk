// src/components/platform/PlatformAnalytics.tsx
"use client"

import * as React from "react"
import { useTranslation } from 'react-i18next'
import {
  Building2,
  Users,
  Mail,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Activity,
  Calendar,
  Shield,
  UserCog,
  Settings,
  CreditCard,
  UserPlus,
  UserMinus,
  Edit,
  Trash2,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface Analytics {
  overview: {
    totalClients: number
    paidClients: number
    freeClients: number
    totalEmployees: number
    totalCustomers: number
  }
  activity: {
    emailsSentThisMonth: number
    emailsSentLastMonth: number
    newClientsThisMonth: number
    newClientsLastMonth: number
  }
  growth: Record<string, number>
  recentActivity: Array<{
    id: string
    action: string
    target_type: string
    target_id: string | null
    details: Record<string, any> | null
    created_at: string
    platform_admins: { email: string }
  }>
}

interface Props {
  analytics: Analytics
}

export default function PlatformAnalytics({ analytics }: Props) {
  const { t } = useTranslation('platform')
  const { overview, activity, growth, recentActivity } = analytics

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const calculateGrowth = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0
    return Math.round(((current - previous) / previous) * 100)
  }

  const emailGrowth = calculateGrowth(activity.emailsSentThisMonth, activity.emailsSentLastMonth)
  const clientGrowth = calculateGrowth(activity.newClientsThisMonth, activity.newClientsLastMonth)

  // Get last 6 months of growth data
  const sortedMonths = Object.keys(growth).sort().slice(-6)
  const growthData = sortedMonths.map(month => ({
    month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short' }),
    count: growth[month]
  }))

  const formatAction = (action: string) => {
    return action.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }

  const getActivityIcon = (action: string) => {
    const lowerAction = action.toLowerCase()
    if (lowerAction.includes('delete') || lowerAction.includes('remove')) {
      return <Trash2 className="h-4 w-4" />
    }
    if (lowerAction.includes('create') || lowerAction.includes('add')) {
      return <UserPlus className="h-4 w-4" />
    }
    if (lowerAction.includes('update') || lowerAction.includes('edit')) {
      return <Edit className="h-4 w-4" />
    }
    if (lowerAction.includes('disable') || lowerAction.includes('suspend')) {
      return <UserMinus className="h-4 w-4" />
    }
    if (lowerAction.includes('enable') || lowerAction.includes('activate')) {
      return <UserCog className="h-4 w-4" />
    }
    if (lowerAction.includes('billing') || lowerAction.includes('subscription')) {
      return <CreditCard className="h-4 w-4" />
    }
    if (lowerAction.includes('admin')) {
      return <Shield className="h-4 w-4" />
    }
    if (lowerAction.includes('settings') || lowerAction.includes('config')) {
      return <Settings className="h-4 w-4" />
    }
    return <Activity className="h-4 w-4" />
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('analytics.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('analytics.description')}
          </p>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('analytics.totalClients')}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.totalClients}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('analytics.proClients')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.paidClients}</div>
            <p className="text-xs text-muted-foreground">
              {overview.totalClients > 0 
                ? t('analytics.conversionRate', { percent: Math.round((overview.paidClients / overview.totalClients) * 100) })
                : t('analytics.conversionRate', { percent: 0 })
              }
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('analytics.totalUsers')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.totalEmployees}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('analytics.contacts')}</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.totalCustomers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('analytics.avgUsersPerClient')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {overview.totalClients > 0 
                ? (overview.totalEmployees / overview.totalClients).toFixed(1)
                : '0'
              }
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity This Month */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              {t('analytics.emailActivity')}
            </CardTitle>
            <CardDescription>{t('analytics.emailActivityDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold">{activity.emailsSentThisMonth.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">{t('analytics.emailsThisMonth')}</p>
                </div>
                <div className={`flex items-center gap-1 ${emailGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {emailGrowth >= 0 ? (
                    <TrendingUp className="h-5 w-5" />
                  ) : (
                    <TrendingDown className="h-5 w-5" />
                  )}
                  <span className="text-lg font-semibold">{emailGrowth}%</span>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {t('analytics.lastMonth')}: {activity.emailsSentLastMonth.toLocaleString()} {t('analytics.emails')}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {t('analytics.newClients')}
            </CardTitle>
            <CardDescription>{t('analytics.newClientsDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold">{activity.newClientsThisMonth}</p>
                  <p className="text-sm text-muted-foreground">{t('analytics.newClientsThisMonth')}</p>
                </div>
                <div className={`flex items-center gap-1 ${clientGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {clientGrowth >= 0 ? (
                    <TrendingUp className="h-5 w-5" />
                  ) : (
                    <TrendingDown className="h-5 w-5" />
                  )}
                  <span className="text-lg font-semibold">{clientGrowth}%</span>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {t('analytics.lastMonth')}: {activity.newClientsLastMonth} {t('analytics.newClientsLower')}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Growth Chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t('analytics.clientGrowth')}</CardTitle>
          <CardDescription>{t('analytics.clientGrowthDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {growthData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t('analytics.noGrowthData')}
            </p>
          ) : (
            <div className="space-y-4">
              {/* Simple bar chart */}
              <div className="flex items-end gap-2 h-40">
                {growthData.map((item, index) => {
                  const maxCount = Math.max(...growthData.map(d => d.count))
                  const height = maxCount > 0 ? (item.count / maxCount) * 100 : 0
                  return (
                    <div key={index} className="flex-1 flex flex-col items-center gap-2">
                      <div 
                        className="w-full bg-primary rounded-t-md transition-all"
                        style={{ height: `${height}%`, minHeight: height > 0 ? '8px' : '0' }}
                      />
                      <div className="text-xs text-muted-foreground">{item.month}</div>
                      <div className="text-xs font-medium">{item.count}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Platform Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {t('analytics.recentActivity')}
          </CardTitle>
          <CardDescription>{t('analytics.recentActivityDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t('analytics.noRecentActivity')}
            </p>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((activity) => {
                // Parse details if it's a string (from JSON column)
                const details = typeof activity.details === 'string' 
                  ? JSON.parse(activity.details) 
                  : activity.details;
                
                return (
                <div
                  key={activity.id}
                  className="flex items-start justify-between p-4 rounded-lg border gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full ${
                      activity.action.includes('delete') || activity.action.includes('remove') ? 'bg-destructive/10 text-destructive' :
                      activity.action.includes('create') || activity.action.includes('add') ? 'bg-green-500/10 text-green-600' :
                      activity.action.includes('update') || activity.action.includes('edit') || activity.action.includes('enable') || activity.action.includes('disable') ? 'bg-blue-500/10 text-blue-600' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {getActivityIcon(activity.action)}
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{formatAction(activity.action)}</p>
                      <p className="text-xs text-muted-foreground">
                        by <span className="font-medium text-foreground">{activity.platform_admins?.email || 'Unknown'}</span>
                      </p>
                      {details && (
                        <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                          {details.client_name && (
                            <p>Client: <span className="font-medium text-foreground">{details.client_name}</span></p>
                          )}
                          {details.employee_name && (
                            <p>Employee: <span className="font-medium text-foreground">{details.employee_name}</span></p>
                          )}
                          {details.email && !details.employee_name && !details.client_name && (
                            <p>Email: <span className="font-medium text-foreground">{details.email}</span></p>
                          )}
                          {details.old_value !== undefined && details.new_value !== undefined && (
                            <p>
                              {details.field ? `${details.field}: ` : ''}
                              <span className="font-medium text-foreground">{String(details.old_value)}</span>
                              {' → '}
                              <span className="font-medium text-foreground">{String(details.new_value)}</span>
                            </p>
                          )}
                          {details.updated_fields && Array.isArray(details.updated_fields) && details.updated_fields.length > 0 && !details.old_value && (
                            <p>Updated: <span className="font-medium text-foreground">{details.updated_fields.join(', ')}</span></p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="secondary" className="text-xs">
                      {activity.target_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(activity.created_at)}
                    </span>
                  </div>
                </div>
              )})}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
