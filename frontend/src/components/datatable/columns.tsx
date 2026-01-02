"use client"
 
import { type ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal } from "lucide-react"
import { useState } from "react"
 
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { UserDialog, DeleteUserDialog } from "@/components/UserDialog"
import { ReassignTicketsDialog } from "@/components/ReassignTicketsDialog"

// This type is used to define the shape of our data.
export type User = {
  id: string
  name: string
  role: string
  email: string
  disabled?: boolean
}

interface Role {
  id: number;
  name: string;
}

// Actions Cell Component für bessere Trennung der Logik
function UserActionsCell({ user, roles }: { user: User, roles: Role[] }) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [unassignDialogOpen, setUnassignDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open Menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
            Edit User
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDisableDialogOpen(true)}>
            {user.disabled ? 'Enable User' : 'Disable User'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setReassignDialogOpen(true)}>
            Reassign All Tickets
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setUnassignDialogOpen(true)}>
            Unassign All Tickets
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={() => setDeleteDialogOpen(true)}
            className="text-red-600 focus:text-red-600"
          >
            Delete User
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit Dialog */}
      <UserDialog
        roles={roles}
        user={user}
        mode="edit"
        isOpen={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />

      {/* Delete Dialog */}
      <DeleteUserDialog
        user={user}
        isOpen={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />

      {/* Disable Dialog */}
      <DeleteUserDialog
        user={user}
        isOpen={disableDialogOpen}
        onOpenChange={setDisableDialogOpen}
        mode={user.disabled ? 'enable' : 'disable'}
      />

      {/* Reassign Tickets Dialog */}
      <ReassignTicketsDialog
        open={reassignDialogOpen}
        onOpenChange={setReassignDialogOpen}
        user={user}
        mode="reassign"
      />

      {/* Unassign Tickets Dialog */}
      <ReassignTicketsDialog
        open={unassignDialogOpen}
        onOpenChange={setUnassignDialogOpen}
        user={user}
        mode="unassign"
      />
    </>
  );
}

export const createColumns = (roles: Role[]): ColumnDef<User>[] => [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      const user = row.original;
      return (
        <div className="flex items-center gap-2">
          <span>{user.name}</span>
          {user.disabled && (
            <Badge variant="secondary" className="text-xs">Disabled</Badge>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "email",
    header: "E-Mail",
  },
  {
    accessorKey: "role",
    header: "Role",
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const user = row.original;
      return <UserActionsCell user={user} roles={roles} />;
    },
  },
];

// Für Rückwärtskompatibilität - falls Sie die Rollen nicht zur Verfügung haben
export const columns: ColumnDef<User>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "email",
    header: "E-Mail",
  },
  {
    accessorKey: "role",
    header: "Role",
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const user = row.original
 
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open Menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Edit User</DropdownMenuItem>
            <DropdownMenuItem>Delete User</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]