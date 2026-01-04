// src/components/platform/ClientDetail.tsx
"use client"

import * as React from "react"
import { useTranslation } from 'react-i18next'
import {
  Building2,
  Users,
  Mail,
  Globe,
  CreditCard,
  ShoppingBag,
  Calendar,
  ArrowLeft,
  Save,
  MapPin,
  ExternalLink,
  DollarSign,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserX,
  UserCheck,
  Plus,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { apiClient } from "@/utils/api"

interface Employee {
  id: number
  name: string
  email: string
  avatar_url: string | null
  created_at: string
  disabled?: boolean
}

interface ClientData {
  id: number
  name: string
  website: string | null
  address_street: string | null
  address_city: string | null
  address_zip: string | null
  address_country: string | null
  vat: string | null
  subscription_tier: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  shopify_connected: boolean
  shopify_store_url: string | null
  created_at: string
  employees: Employee[]
  stats: {
    employee_count: number
    customer_count: number
    emails_sent: number
    monthly_revenue: number
    total_revenue: number
  }
}

interface Props {
  clientData: ClientData
}

export default function ClientDetail({ clientData }: Props) {
  const { t } = useTranslation('platform')
  const [client, setClient] = React.useState(clientData)
  const [isEditing, setIsEditing] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [editForm, setEditForm] = React.useState({
    name: client.name,
    website: client.website || "",
    subscription_tier: client.subscription_tier,
    address_street: client.address_street || "",
    address_city: client.address_city || "",
    address_zip: client.address_zip || "",
    address_country: client.address_country || "",
    vat: client.vat || "",
  })

  // Employee management state
  const [editingEmployee, setEditingEmployee] = React.useState<Employee | null>(null)
  const [editEmployeeForm, setEditEmployeeForm] = React.useState({ name: "" })
  const [deletingEmployee, setDeletingEmployee] = React.useState<Employee | null>(null)
  const [isEmployeeActionLoading, setIsEmployeeActionLoading] = React.useState(false)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getInitials = (name: string) => {
    if (!name) return "?"
    const parts = name.trim().split(/\s+/)
    const first = parts[0]?.[0] ?? ""
    const last = parts.length > 1 ? parts[parts.length - 1][0] : ""
    return (first + last).toUpperCase()
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const response = await apiClient.patch(`/platform/clients/${client.id}`, editForm)
      if (response.success) {
        setClient({
          ...client,
          ...editForm
        })
        setIsEditing(false)
        toast.success(t('clientDetail.updateSuccess'))
      } else {
        throw new Error(response.error || t('clientDetail.updateFailed'))
      }
    } catch (error) {
      console.error("Failed to update client:", error)
      toast.error(t('clientDetail.updateFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setEditForm({
      name: client.name,
      website: client.website || "",
      subscription_tier: client.subscription_tier,
      address_street: client.address_street || "",
      address_city: client.address_city || "",
      address_zip: client.address_zip || "",
      address_country: client.address_country || "",
      vat: client.vat || "",
    })
    setIsEditing(false)
  }

  // Employee management handlers
  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee)
    setEditEmployeeForm({ name: employee.name || "" })
  }

  const handleSaveEmployee = async () => {
    if (!editingEmployee) return
    setIsEmployeeActionLoading(true)
    try {
      const response = await apiClient.patch(
        `/platform/clients/${client.id}/employees/${editingEmployee.id}`,
        editEmployeeForm
      )
      if (response.success) {
        setClient({
          ...client,
          employees: client.employees.map(e => 
            e.id === editingEmployee.id ? { ...e, ...editEmployeeForm } : e
          )
        })
        setEditingEmployee(null)
        toast.success(t('clientDetail.employeeUpdated'))
      } else {
        throw new Error(response.error || t('clientDetail.employeeUpdateFailed'))
      }
    } catch (error) {
      console.error("Failed to update employee:", error)
      toast.error(t('clientDetail.employeeUpdateFailed'))
    } finally {
      setIsEmployeeActionLoading(false)
    }
  }

  const handleToggleEmployee = async (employee: Employee) => {
    setIsEmployeeActionLoading(true)
    try {
      const newDisabled = !employee.disabled
      const response = await apiClient.patch(
        `/platform/clients/${client.id}/employees/${employee.id}`,
        { disabled: newDisabled }
      )
      if (response.success) {
        setClient({
          ...client,
          employees: client.employees.map(e => 
            e.id === employee.id ? { ...e, disabled: newDisabled } : e
          )
        })
        toast.success(newDisabled ? t('clientDetail.employeeDisabled') : t('clientDetail.employeeEnabled'))
      } else {
        throw new Error(response.error || t('clientDetail.employeeStatusFailed'))
      }
    } catch (error) {
      console.error("Failed to toggle employee:", error)
      toast.error(t('clientDetail.employeeStatusFailed'))
    } finally {
      setIsEmployeeActionLoading(false)
    }
  }

  const handleDeleteEmployee = async () => {
    if (!deletingEmployee) return
    setIsEmployeeActionLoading(true)
    try {
      const response = await apiClient.delete(
        `/platform/clients/${client.id}/employees/${deletingEmployee.id}`
      )
      if (response.success) {
        setClient({
          ...client,
          employees: client.employees.filter(e => e.id !== deletingEmployee.id),
          stats: {
            ...client.stats,
            employee_count: client.stats.employee_count - 1
          }
        })
        setDeletingEmployee(null)
        toast.success(t('clientDetail.employeeRemoved'))
      } else {
        throw new Error(response.error || t('clientDetail.employeeRemoveFailed'))
      }
    } catch (error) {
      console.error("Failed to delete employee:", error)
      toast.error(t('clientDetail.employeeRemoveFailed'))
    } finally {
      setIsEmployeeActionLoading(false)
    }
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => window.location.href = '/platform/clients'}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
              <p className="text-sm text-muted-foreground">
                {t('clientDetail.clientId', { id: client.id })}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                {t('clientDetail.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? t('clientDetail.saving') : t('clientDetail.saveChanges')}
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)}>
              {t('clientDetail.editClient')}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('clientDetail.employees')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{client.stats.employee_count}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('clientDetail.customers')}</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{client.stats.customer_count}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('clientDetail.emailsSent')}</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{client.stats.emails_sent}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('clientDetail.plan')}</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={client.subscription_tier === 'paid' ? 'default' : 'secondary'} className="text-sm">
              {client.subscription_tier === 'paid' ? 'Pro' : 'Free'}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('clientDetail.monthlyRevenue')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(client.stats.monthly_revenue || 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('clientDetail.totalRevenue')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(client.stats.total_revenue || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Client Information */}
        <Card>
          <CardHeader>
            <CardTitle>{t('clientDetail.clientInformation')}</CardTitle>
            <CardDescription>{t('clientDetail.basicDetails')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditing ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">{t('clientDetail.companyName')}</Label>
                  <Input
                    id="name"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">{t('clientDetail.website')}</Label>
                  <Input
                    id="website"
                    value={editForm.website}
                    onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tier">{t('clientDetail.subscriptionTier')}</Label>
                  <Select
                    value={editForm.subscription_tier}
                    onValueChange={(value) => setEditForm({ ...editForm, subscription_tier: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">{t('clients.free')}</SelectItem>
                      <SelectItem value="paid">{t('clients.pro')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="street">{t('clientDetail.streetAddress')}</Label>
                  <Input
                    id="street"
                    value={editForm.address_street}
                    onChange={(e) => setEditForm({ ...editForm, address_street: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">{t('clientDetail.city')}</Label>
                    <Input
                      id="city"
                      value={editForm.address_city}
                      onChange={(e) => setEditForm({ ...editForm, address_city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zip">{t('clientDetail.zipCode')}</Label>
                    <Input
                      id="zip"
                      value={editForm.address_zip}
                      onChange={(e) => setEditForm({ ...editForm, address_zip: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">{t('clientDetail.country')}</Label>
                  <Input
                    id="country"
                    value={editForm.address_country}
                    onChange={(e) => setEditForm({ ...editForm, address_country: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vat">{t('clientDetail.vatNumber')}</Label>
                  <Input
                    id="vat"
                    value={editForm.vat}
                    onChange={(e) => setEditForm({ ...editForm, vat: e.target.value })}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{t('clientDetail.website')}</p>
                    <p className="text-sm text-muted-foreground">
                      {client.website || t('clientDetail.notSet')}
                    </p>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{t('clientDetail.address')}</p>
                    <p className="text-sm text-muted-foreground">
                      {client.address_street || client.address_city || client.address_country
                        ? `${client.address_street || ""} ${client.address_zip || ""} ${client.address_city || ""} ${client.address_country || ""}`.trim()
                        : t('clientDetail.notSet')}
                    </p>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{t('clients.created')}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(client.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Integrations */}
        <Card>
          <CardHeader>
            <CardTitle>{t('clientDetail.integrationsTitle')}</CardTitle>
            <CardDescription>{t('clientDetail.connectedServices')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900">
                  <CreditCard className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="font-medium">Stripe</p>
                  <p className="text-sm text-muted-foreground">
                    {client.stripe_customer_id ? `Customer: ${client.stripe_customer_id.substring(0, 18)}...` : t('clientDetail.notConnected')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {client.stripe_customer_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`https://dashboard.stripe.com/customers/${client.stripe_customer_id}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    {t('clientDetail.view')}
                  </Button>
                )}
                <Badge variant={client.stripe_customer_id ? "default" : "secondary"}>
                  {client.stripe_customer_id ? t('clientDetail.connected') : t('clientDetail.notConnected')}
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900">
                  <ShoppingBag className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-medium">Shopify</p>
                  <p className="text-sm text-muted-foreground">
                    {client.shopify_store_url || t('clientDetail.notConnected')}
                  </p>
                </div>
              </div>
              <Badge variant={client.shopify_connected ? "default" : "secondary"}>
                {client.shopify_connected ? t('clientDetail.connected') : t('clientDetail.notConnected')}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employees */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t('clientDetail.employeesTitle')}</CardTitle>
            <CardDescription>
              {t('clientDetail.teamMembers')}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {client.employees.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t('clientDetail.noEmployeesFound')}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {client.employees.map((employee) => (
                <div
                  key={employee.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${employee.disabled ? 'opacity-50 bg-muted' : ''}`}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={employee.avatar_url || undefined} />
                    <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{employee.name || t('clientDetail.unnamed')}</p>
                      {employee.disabled && (
                        <Badge variant="secondary" className="text-xs">{t('clientDetail.disabled')}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{employee.email}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditEmployee(employee)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        {t('clientDetail.editName')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleEmployee(employee)}>
                        {employee.disabled ? (
                          <>
                            <UserCheck className="h-4 w-4 mr-2" />
                            {t('clientDetail.enable')}
                          </>
                        ) : (
                          <>
                            <UserX className="h-4 w-4 mr-2" />
                            {t('clientDetail.disable')}
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => setDeletingEmployee(employee)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('clientDetail.remove')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Employee Dialog */}
      <Dialog open={!!editingEmployee} onOpenChange={(open) => !open && setEditingEmployee(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('clientDetail.editEmployee')}</DialogTitle>
            <DialogDescription>
              {t('clientDetail.updateEmployeeName')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="employee-name">{t('clientDetail.name')}</Label>
              <Input
                id="employee-name"
                value={editEmployeeForm.name}
                onChange={(e) => setEditEmployeeForm({ name: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEmployee(null)}>
              {t('clientDetail.cancel')}
            </Button>
            <Button onClick={handleSaveEmployee} disabled={isEmployeeActionLoading}>
              {isEmployeeActionLoading ? t('clientDetail.saving') : t('clientDetail.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Employee Confirmation */}
      <AlertDialog open={!!deletingEmployee} onOpenChange={(open) => !open && setDeletingEmployee(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('clientDetail.removeEmployee')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('clientDetail.removeEmployeeConfirm', { name: deletingEmployee?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('clientDetail.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteEmployee}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isEmployeeActionLoading ? t('clientDetail.removing') : t('clientDetail.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
