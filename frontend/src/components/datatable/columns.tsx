"use client"
 
import { type ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal, Shield, ShieldCheck, UserX } from "lucide-react"
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
import { SimplePrivateAvatar, getInitials } from "@/components/ui/private-avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { UserDialog, DeleteUserDialog } from "@/components/UserDialog"
import { ReassignTicketsDialog } from "@/components/ReassignTicketsDialog"

// This type is used to define the shape of our data.
export type User = {
  id: string
  name: string
  role: string
  email: string
  disabled?: boolean
  avatar_url?: string | null
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
    header: "User",
    cell: ({ row }) => {
      const user = row.original;
      return (
        <div className="flex items-center gap-3 py-1">
          <SimplePrivateAvatar
            src={user.avatar_url}
            name={user.name}
            className="h-9 w-9 shrink-0"
            fallbackClassName="text-sm bg-primary/10 text-primary"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{user.name}</span>
              {user.disabled && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="text-xs gap-1 shrink-0">
                        <UserX className="h-3 w-3" />
                        Disabled
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      This user cannot log in
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => {
      const role = row.original.role;
      const isAdmin = role.toLowerCase().includes('admin');
      
      return (
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <ShieldCheck className="h-4 w-4 text-amber-500" />
          ) : (
            <Shield className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={isAdmin ? "font-medium text-amber-700 dark:text-amber-400" : ""}>
            {role || "—"}
          </span>
        </div>
      );
    },
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
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