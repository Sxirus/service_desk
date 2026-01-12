// src/components/platform/ClientsManagement.tsx
"use client"

import * as React from "react"
import { useTranslation } from 'react-i18next'
import {
  Building2,
  Search,
  ExternalLink,
  Users,
  CreditCard,
  ShoppingBag,
  MoreHorizontal,
  Eye,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SimpleDataTable, type SimpleColumnDef } from "@/components/datatable/SimpleDataTable"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Client {
  id: number
  name: string
  website: string | null
  subscription_tier: string
  stripe_customer_id: string | null
  shopify_connected: boolean
  created_at: string
  employee_count: number
}

interface Props {
  initialClients: Client[]
}

export default function ClientsManagement({ initialClients }: Props) {
  const { t, i18n } = useTranslation('platform')
  const [clients, setClients] = React.useState<Client[]>(initialClients)
  const [search, setSearch] = React.useState("")
  const [tierFilter, setTierFilter] = React.useState<string>("all")

  const filteredClients = React.useMemo(() => {
    return clients.filter(client => {
      const matchesSearch = 
        client.name.toLowerCase().includes(search.toLowerCase()) ||
        (client.website?.toLowerCase().includes(search.toLowerCase()) ?? false)
      
      const matchesTier = tierFilter === "all" || client.subscription_tier === tierFilter

      return matchesSearch && matchesTier
    })
  }, [clients, search, tierFilter])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(i18n.language, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const stats = {
    total: clients.length,
    paid: clients.filter(c => c.subscription_tier === 'paid').length,
    free: clients.filter(c => c.subscription_tier === 'free').length,
    withShopify: clients.filter(c => c.shopify_connected).length,
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('clients.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('clients.description')}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('clients.totalClients')}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('clients.proPlan')}</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.paid}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('clients.freePlan')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.free}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('clients.shopifyConnected')}</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.withShopify}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t('clients.clientDirectory')}</CardTitle>
          <CardDescription>
            {t('clients.searchAndFilter')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('clients.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('clients.filterByPlan')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('clients.allPlans')}</SelectItem>
                <SelectItem value="paid">{t('clients.proPlan')}</SelectItem>
                <SelectItem value="free">{t('clients.freePlan')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Clients Table */}
          <SimpleDataTable
            data={filteredClients}
            getRowKey={(client) => client.id}
            emptyMessage={t('clients.noClientsFound')}
            columns={[
              {
                id: 'client',
                header: t('clients.client'),
                cell: (client) => (
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <a 
                        href={`/platform/clients/${client.id}`}
                        className="font-medium hover:underline hover:text-primary"
                      >
                        {client.name}
                      </a>
                      {client.website && (
                        <a 
                          href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                        >
                          {client.website}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                id: 'plan',
                header: t('clients.plan'),
                cell: (client) => (
                  <Badge variant={client.subscription_tier === 'paid' ? 'default' : 'secondary'}>
                    {client.subscription_tier === 'paid' ? t('clients.pro') : t('clients.free')}
                  </Badge>
                ),
              },
              {
                id: 'employees',
                header: t('clients.employees'),
                cell: (client) => (
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{client.employee_count}</span>
                  </div>
                ),
              },
              {
                id: 'integrations',
                header: t('clients.integrations'),
                cell: (client) => (
                  <div className="flex items-center gap-2">
                    {client.stripe_customer_id && (
                      <Badge variant="outline" className="text-xs">
                        <CreditCard className="h-3 w-3 mr-1" />
                        Stripe
                      </Badge>
                    )}
                    {client.shopify_connected && (
                      <Badge variant="outline" className="text-xs">
                        <ShoppingBag className="h-3 w-3 mr-1" />
                        Shopify
                      </Badge>
                    )}
                    {!client.stripe_customer_id && !client.shopify_connected && (
                      <span className="text-muted-foreground text-sm">{t('clients.none')}</span>
                    )}
                  </div>
                ),
              },
              {
                id: 'created',
                header: t('clients.created'),
                cellClassName: 'text-muted-foreground',
                cell: (client) => formatDate(client.created_at),
              },
              {
                id: 'actions',
                header: '',
                headerClassName: 'w-[50px]',
                cell: (client) => (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => window.location.href = `/platform/clients/${client.id}`}>
                        <Eye className="h-4 w-4 mr-2" />
                        {t('clients.viewDetails')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ),
              },
            ]}
            footer={
              <div className="mt-4 text-sm text-muted-foreground">
                {t('clients.showingClients', { showing: filteredClients.length, total: clients.length })}
              </div>
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
