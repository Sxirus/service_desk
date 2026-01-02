// src/components/platform/BillingOverview.tsx
"use client"

import * as React from "react"
import {
  CreditCard,
  Building2,
  Users,
  TrendingUp,
  CheckCircle,
  XCircle,
  ExternalLink,
  DollarSign,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface BillingClient {
  id: number
  name: string
  tier: string
  has_stripe: boolean
  has_subscription: boolean
  created_at: string
  employee_count?: number
}

interface Summary {
  totalClients: number
  paidClients: number
  freeClients: number
  withStripe: number
  totalSeats: number
  mrr: number
  totalRevenue: number
}

interface Props {
  billingData: BillingClient[]
  summary: Summary
}

export default function BillingOverview({ billingData, summary }: Props) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  // Separate paid and free clients
  const paidClients = billingData.filter(c => c.tier === 'paid')
  const freeClients = billingData.filter(c => c.tier === 'free')

  // Calculate paid seats
  const paidSeats = paidClients.reduce((sum, c) => sum + (c.employee_count || 0), 0)

  return (
    <div className="space-y-6 pt-4">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Billing Overview</h1>
          <p className="text-sm text-muted-foreground">
            Subscription and revenue metrics across all clients
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.mrr || 0)}</div>
            <p className="text-xs text-muted-foreground">
              MRR from {summary.paidClients} clients
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.totalRevenue || 0)}</div>
            <p className="text-xs text-muted-foreground">
              All time
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid Subscriptions</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.paidClients}</div>
            <p className="text-xs text-muted-foreground">
              {summary.totalClients > 0 
                ? `${Math.round((summary.paidClients / summary.totalClients) * 100)}% of clients`
                : '0% of clients'
              }
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid Seats</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{paidSeats}</div>
            <p className="text-xs text-muted-foreground">
              Billable employees
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Free Clients</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.freeClients}</div>
            <p className="text-xs text-muted-foreground">
              Potential conversions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Paid Clients */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Pro Plan Clients
          </CardTitle>
          <CardDescription>
            {paidClients.length} clients with active subscriptions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {paidClients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No paid subscriptions yet
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Seats</TableHead>
                    <TableHead>Stripe</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paidClients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <a 
                            href={`/platform/clients/${client.id}`}
                            className="font-medium hover:underline"
                          >
                            {client.name}
                          </a>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          {client.employee_count}
                        </div>
                      </TableCell>
                      <TableCell>
                        {client.has_subscription ? (
                          <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Active
                          </Badge>
                        ) : client.has_stripe ? (
                          <Badge variant="secondary">
                            Customer Only
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            Not Connected
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(client.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => window.location.href = `/platform/clients/${client.id}`}
                        >
                          View
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Free Clients */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-muted-foreground" />
            Free Plan Clients
          </CardTitle>
          <CardDescription>
            {freeClients.length} clients on free plan - potential conversions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {freeClients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No free clients
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Employees</TableHead>
                    <TableHead>Stripe Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {freeClients.slice(0, 10).map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <a 
                            href={`/platform/clients/${client.id}`}
                            className="font-medium hover:underline"
                          >
                            {client.name}
                          </a>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          {client.employee_count}
                        </div>
                      </TableCell>
                      <TableCell>
                        {client.has_stripe ? (
                          <Badge variant="secondary">
                            Has Customer ID
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            Not Connected
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(client.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => window.location.href = `/platform/clients/${client.id}`}
                        >
                          View
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {freeClients.length > 10 && (
                <div className="p-3 text-center text-sm text-muted-foreground border-t">
                  Showing 10 of {freeClients.length} free clients.{" "}
                  <a href="/platform/clients" className="text-primary hover:underline">
                    View all
                  </a>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
