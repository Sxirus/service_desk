// src/components/platform/AdminsManagement.tsx
"use client"

import * as React from "react"
import {
  Shield,
  Plus,
  Trash2,
  Clock,
  Mail,
  AlertTriangle,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { toast } from "sonner"
import { apiClient } from "@/utils/api"

interface PlatformAdmin {
  id: string
  user_id: string
  email: string
  created_at: string
  last_login: string | null
  created_by: string | null
}

interface Props {
  initialAdmins: PlatformAdmin[]
  currentAdminId: string
}

export default function AdminsManagement({ initialAdmins, currentAdminId }: Props) {
  const [admins, setAdmins] = React.useState<PlatformAdmin[]>(initialAdmins)
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false)
  const [adminToDelete, setAdminToDelete] = React.useState<PlatformAdmin | null>(null)
  const [newAdminEmail, setNewAdminEmail] = React.useState("")
  const [isAdding, setIsAdding] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getInitials = (email: string) => {
    const parts = email.split('@')[0].split(/[._-]/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return email.substring(0, 2).toUpperCase()
  }

  const handleAddAdmin = async () => {
    if (!newAdminEmail.trim()) {
      toast.error("Please enter an email address")
      return
    }

    setIsAdding(true)
    try {
      const response = await apiClient.post('/platform/admins', { email: newAdminEmail.trim() })
      if (response.success) {
        setAdmins([response.data, ...admins])
        setNewAdminEmail("")
        setIsAddDialogOpen(false)
        toast.success("Platform admin added successfully")
      } else {
        throw new Error(response.error || "Failed to add admin")
      }
    } catch (error: any) {
      console.error("Failed to add admin:", error)
      toast.error(error.message || "Failed to add platform admin")
    } finally {
      setIsAdding(false)
    }
  }

  const handleDeleteAdmin = async () => {
    if (!adminToDelete) return

    setIsDeleting(true)
    try {
      const response = await apiClient.delete(`/platform/admins/${adminToDelete.id}`)
      if (response.success) {
        setAdmins(admins.filter(a => a.id !== adminToDelete.id))
        setIsDeleteDialogOpen(false)
        setAdminToDelete(null)
        toast.success("Platform admin removed")
      } else {
        throw new Error(response.error || "Failed to remove admin")
      }
    } catch (error: any) {
      console.error("Failed to remove admin:", error)
      toast.error(error.message || "Failed to remove platform admin")
    } finally {
      setIsDeleting(false)
    }
  }

  const openDeleteDialog = (admin: PlatformAdmin) => {
    setAdminToDelete(admin)
    setIsDeleteDialogOpen(true)
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Platform Admins</h1>
          <p className="text-sm text-muted-foreground">
            Manage users with platform-level administrative access
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Admin
        </Button>
      </div>

      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
        <CardContent className="flex items-start gap-3 p-4">
          <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900 dark:text-blue-100">Platform Admin Access</p>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Platform admins have full access to manage all clients, view billing information, 
              and access platform-wide analytics. Only add trusted team members.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Admins List */}
      <Card>
        <CardHeader>
          <CardTitle>Current Administrators</CardTitle>
          <CardDescription>
            {admins.length} platform {admins.length === 1 ? 'admin' : 'admins'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {admins.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No platform admins found
            </p>
          ) : (
            <div className="space-y-3">
              {admins.map((admin) => (
                <div
                  key={admin.id}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {getInitials(admin.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{admin.email}</p>
                        {admin.id === currentAdminId && (
                          <Badge variant="secondary" className="text-xs">You</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          Added {formatDate(admin.created_at)}
                        </span>
                        {admin.last_login && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Last login {formatDate(admin.last_login)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => openDeleteDialog(admin)}
                    disabled={admin.id === currentAdminId}
                    title={admin.id === currentAdminId ? "Cannot remove yourself" : "Remove admin"}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Admin Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Platform Admin</DialogTitle>
            <DialogDescription>
              Add a new user with platform-level administrative access. The user must already 
              have an account in the system.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddAdmin} disabled={isAdding}>
              {isAdding ? "Adding..." : "Add Admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Remove Platform Admin
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{adminToDelete?.email}</strong> as a 
              platform admin? They will lose all platform-level access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAdmin}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Removing..." : "Remove Admin"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
