// src/components/platform/PlatformDashboard.tsx
"use client"

import * as React from "react"
import { useTranslation } from 'react-i18next'
import {
  Building2,
  CreditCard,
  Users,
  Mail,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RecentCancellationsCard } from "./RecentCancellationsCard"

interface RecentClient {
  id: number
  name: string
  subscription_tier: string
  created_at: string
}

interface PlatformStats {
  totalClients: number
  paidClients: number
  freeClients: number
  totalEmployees: number
  totalCustomers: number
  totalEmails: number
  recentClients: RecentClient[]
}

interface Props {
  stats: PlatformStats
}

export default function PlatformDashboard({ stats }: Props) {
  const { t } = useTranslation('platform')

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('dashboard.description')}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.totalClients')}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalClients}</div>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.paidFreeBreakdown', { paid: stats.paidClients, free: stats.freeClients })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.paidSubscriptions')}</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.paidClients}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalClients > 0 
                ? t('dashboard.conversionRate', { rate: Math.round((stats.paidClients / stats.totalClients) * 100) })
                : t('dashboard.conversionRate', { rate: 0 })
              }
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.totalEmployees')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEmployees}</div>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.acrossAllClients')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.totalCustomers')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCustomers}</div>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.emailContactsManaged')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.totalEmails')}</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEmails?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.incomingEmailsProcessed')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section - Cancellations, Payment Failures */}
      <RecentCancellationsCard />

      {/* Recent Clients */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t('dashboard.recentClients')}</CardTitle>
              <CardDescription>
                {t('dashboard.recentClientsDescription')}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href="/platform/clients">
                {t('dashboard.viewAll')}
                <ArrowUpRight className="ml-1 h-4 w-4" />
              </a>
            </Button>
          </CardHeader>
          <CardContent>
            {stats.recentClients.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {t('dashboard.noClientsYet')}
              </p>
            ) : (
              <div className="space-y-4">
                {stats.recentClients.map((client) => (
                  <a
                    key={client.id}
                    href={`/platform/clients/${client.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium hover:underline">{client.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {t('dashboard.joined', { date: formatDate(client.created_at) })}
                        </p>
                      </div>
                    </div>
                    <Badge variant={client.subscription_tier === 'paid' ? 'default' : 'secondary'}>
                      {client.subscription_tier === 'paid' ? t('dashboard.pro') : t('dashboard.free')}
                    </Badge>
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => window.location.href = '/platform/clients'}>
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
              <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base">{t('dashboard.manageClients')}</CardTitle>
              <CardDescription>{t('dashboard.manageClientsDescription')}</CardDescription>
            </div>
          </CardHeader>
        </Card>

        <Card className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => window.location.href = '/platform/billing'}>
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900">
              <CreditCard className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <CardTitle className="text-base">{t('dashboard.billingOverview')}</CardTitle>
              <CardDescription>{t('dashboard.billingOverviewDescription')}</CardDescription>
            </div>
          </CardHeader>
        </Card>

        <Card className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => window.location.href = '/platform/analytics'}>
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900">
              <TrendingUp className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-base">{t('analytics.title')}</CardTitle>
              <CardDescription>{t('dashboard.analyticsDescription')}</CardDescription>
            </div>
          </CardHeader>
        </Card>
      </div>
    </div>
  )
}
