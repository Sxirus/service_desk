import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconPlus } from "@tabler/icons-react";
import { actions } from "astro:actions";

interface Role {
  id: number;
  name: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface UserDialogProps {
  roles: Role[];
  user?: User;
  mode: 'create' | 'edit';
  trigger?: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface DeleteUserDialogProps {
  user: User;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

// Delete Dialog Component
export function DeleteUserDialog({ user, isOpen, onOpenChange }: DeleteUserDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async () => {
    setIsLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('id', user.id);
      const result = await actions.deleteEmployee(formData);
      
      // Close dialog and reload page
      onOpenChange(false);
      
      const url = new URL(location.href);
      url.search = "";
      location.href = url.toString();
      
    } catch (err) {
      console.error('Error deleting user:', err);
      alert("Error deleting user");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete User</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the user "{user.name}" ({user.email})? 
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleDelete} 
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {isLoading ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Main User Dialog (Create/Edit)
export function UserDialog({ roles, user, mode, trigger, isOpen = false, onOpenChange }: UserDialogProps) {
  const [dialogOpen, setDialogOpen] = useState(isOpen);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    role_id: ''
  });

  // Pre-fill form with user data (Edit mode)
  useEffect(() => {
    if (mode === 'edit' && user) {
      // Find role ID from role name
      const roleId = roles.find(r => r.name === user.role)?.id?.toString() || '';
      setFormData({
        email: user.email,
        name: user.name,
        role_id: roleId
      });
    }
  }, [user, mode, roles]);

  // Dialog State Management
  useEffect(() => {
    if (onOpenChange) {
      onOpenChange(dialogOpen);
    }
  }, [dialogOpen, onOpenChange]);

  useEffect(() => {
    setDialogOpen(isOpen);
  }, [isOpen]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.name || !formData.role_id) {
      alert('Please fill in all fields.');
      return;
    }

    setIsLoading(true);

    try {
      const formDataObj = new FormData();
      formDataObj.append('email', formData.email);
      formDataObj.append('name', formData.name);
      formDataObj.append('role_id', formData.role_id);
      
      if (mode === 'edit' && user) {
        formDataObj.append('id', user.id);
        const result = await actions.updateEmployee(formDataObj);
        if (!result?.data?.success) {
            alert(result?.data?.message ?? "Error updating user");
            return;
        }

      } else {
        const result = await actions.createEmployee(formDataObj);
        if (!result?.data?.success) {
          alert(result?.data?.message ?? "Error creating user");
          return;
        }
      }

      // Success: Close dialog, reset form, and reload page
      setDialogOpen(false);
      setFormData({ email: '', name: '', role_id: '' });
      
      const url = new URL(location.href);
      url.search = "";
      location.href = url.toString();
      
    } catch (err) {
      console.error(err);
      alert("Unexpected error");
      
      const url = new URL(location.href);
      url.search = "";
      location.href = url.toString();
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    if (mode === 'create') {
      setFormData({ email: '', name: '', role_id: '' });
    } else if (mode === 'edit' && user) {
      // For edit mode: Reset to original values
      const roleId = roles.find(r => r.name === user.role)?.id?.toString() || '';
      setFormData({
        email: user.email,
        name: user.name,
        role_id: roleId
      });
    }
  };

  const dialogContent = (
    <DialogContent className="sm:max-w-[425px]">
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create New User' : 'Edit User'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create' 
              ? 'Enter the details for the new user. All fields are required.'
              : 'Edit user details. All fields are required.'
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="example@company.com"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="John Doe"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="role">Role</Label>
            <Select 
              value={formData.role_id} 
              onValueChange={(value) => handleInputChange('role_id', value)}
              required
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id.toString()}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <DialogFooter>
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => setDialogOpen(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={isLoading}
          >
            {isLoading 
              ? (mode === 'create' ? "Creating..." : "Saving...") 
              : (mode === 'create' ? "Create User" : "Save Changes")
            }
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );

  // If a trigger is provided, use the dialog with trigger
  if (trigger) {
    return (
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
        {dialogContent}
      </Dialog>
    );
  }

  // Otherwise, just the dialog content for external control
  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => {
      setDialogOpen(open);
      if (!open) resetForm();
    }}>
      {dialogContent}
    </Dialog>
  );
}

// Create User Dialog (for compatibility with existing implementation)
export default function CreateUserDialog({ roles }: { roles: Role[] }) {
  return (
    <UserDialog 
      roles={roles} 
      mode="create"
      trigger={
        <Button variant="outline" size="sm">
          <IconPlus className="w-4 h-4 mr-2" />
          Create User
        </Button>
      }
    />
  );
}