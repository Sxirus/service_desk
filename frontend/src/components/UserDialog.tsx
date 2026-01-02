import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import { SimplePrivateAvatar } from "@/components/ui/private-avatar";

interface Role {
  id: number;
  name: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url?: string | null;
  disabled?: boolean;
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
  mode?: 'delete' | 'disable' | 'enable';
}

// Delete Dialog Component
export function DeleteUserDialog({ user, isOpen, onOpenChange, mode = 'delete' }: DeleteUserDialogProps) {
  const { t } = useTranslation('manage');
  const [isLoading, setIsLoading] = useState(false);

  const handleAction = async () => {
    setIsLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('id', user.id);
      
      let result;
      if (mode === 'delete') {
        result = await actions.deleteEmployee(formData);
      } else if (mode === 'disable') {
        result = await actions.disableEmployee(formData);
      } else {
        result = await actions.enableEmployee(formData);
      }
      
      // Close dialog and reload page
      onOpenChange(false);
      
      const url = new URL(location.href);
      url.search = "";
      location.href = url.toString();
      
    } catch (err) {
      console.error('Error:', err);
      alert(t(`users.${mode}Error`));
    } finally {
      setIsLoading(false);
    }
  };

  const getTitle = () => {
    if (mode === 'delete') return t('users.deleteUser');
    if (mode === 'disable') return t('users.disableUser');
    return t('users.enableUser');
  };

  const getDescription = () => {
    if (mode === 'delete') {
      return t('users.deleteConfirmation', { name: user.name, email: user.email });
    }
    if (mode === 'disable') {
      return t('users.disableConfirmation', { name: user.name, email: user.email });
    }
    return t('users.enableConfirmation', { name: user.name, email: user.email });
  };

  const getButtonText = () => {
    if (mode === 'delete') return isLoading ? t('users.deleting') : t('common.delete');
    if (mode === 'disable') return isLoading ? t('users.disabling') : t('users.disable');
    return isLoading ? t('users.enabling') : t('users.enable');
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{getTitle()}</AlertDialogTitle>
          <AlertDialogDescription>
            {getDescription()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleAction} 
            disabled={isLoading}
            className={mode === 'delete' ? 'bg-red-600 hover:bg-red-700' : ''}
          >
            {getButtonText()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Main User Dialog (Create/Edit)
export function UserDialog({ roles, user, mode, trigger, isOpen = false, onOpenChange }: UserDialogProps) {
  const { t } = useTranslation('manage');
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
      alert(t('users.fillAllFields'));
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
            alert(result?.data?.message ?? t('users.updateError'));
            return;
        }

      } else {
        const result = await actions.createEmployee(formDataObj);
        if (!result?.data?.success) {
          alert(result?.data?.message ?? t('users.createError'));
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
      alert(t('common.unexpectedError'));
      
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
            {mode === 'create' ? t('users.addTeamMember') : t('users.editTeamMember')}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create' 
              ? t('users.addMemberDescription')
              : t('users.editMemberDescription')
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {/* Avatar display for edit mode */}
          {mode === 'edit' && user && (
            <div className="flex justify-center pb-2">
              <SimplePrivateAvatar
                src={user.avatar_url}
                name={user.name}
                className="h-16 w-16"
                fallbackClassName="text-xl bg-primary/10 text-primary"
              />
            </div>
          )}
          
          <div className="grid gap-2">
            <Label htmlFor="email">{t('users.email')}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t('users.emailPlaceholder')}
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="name">{t('users.name')}</Label>
            <Input
              id="name"
              type="text"
              placeholder={t('users.namePlaceholder')}
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="role">{t('users.role')}</Label>
            <Select 
              value={formData.role_id} 
              onValueChange={(value) => handleInputChange('role_id', value)}
              required
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('users.selectRole')} />
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
            {t('common.cancel')}
          </Button>
          <Button 
            type="submit" 
            disabled={isLoading}
          >
            {isLoading 
              ? (mode === 'create' ? t('users.creating') : t('users.saving')) 
              : (mode === 'create' ? t('users.createUser') : t('common.saveChanges'))
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
  const { t } = useTranslation('manage');
  return (
    <UserDialog 
      roles={roles} 
      mode="create"
      trigger={
        <Button size="sm" className="gap-2">
          <IconPlus className="w-4 h-4" />
          {t('users.addMember')}
        </Button>
      }
    />
  );
}