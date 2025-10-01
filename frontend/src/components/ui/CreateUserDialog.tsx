import React, { useState } from 'react';
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

interface CreateUserDialogProps {
  roles: Role[];
}

export default function CreateUserDialog({ roles }: CreateUserDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    role_id: ''
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.name || !formData.role_id) {
      alert('Bitte füllen Sie alle Felder aus.');
      return;
    }

    setIsLoading(true);

    try {
      const formDataObj = new FormData();
      formDataObj.append('email', formData.email);
      formDataObj.append('name', formData.name);
      formDataObj.append('role_id', formData.role_id);

      const result = await actions.createEmployee(formDataObj);

      if (!result?.data?.success) {
        alert(result?.data?.message ?? "Fehler beim Anlegen");
        return;
      }

      // Erfolg: Dialog schließen, Formular zurücksetzen und Seite neu laden
      setIsOpen(false);
      setFormData({ email: '', name: '', role_id: '' });
      
      const url = new URL(location.href);
      url.search = "";
      location.href = url.toString();
      
    } catch (err) {
      console.error(err);
      alert("Unerwarteter Fehler");
      
      const url = new URL(location.href);
      url.search = "";
      location.href = url.toString();
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ email: '', name: '', role_id: '' });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) resetForm(); // Form zurücksetzen beim Schließen
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <IconPlus className="w-4 h-4 mr-2" />
          Nutzer anlegen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Neuen Nutzer anlegen</DialogTitle>
            <DialogDescription>
              Geben Sie die Daten für den neuen Nutzer ein. Alle Felder sind erforderlich.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="beispiel@firma.de"
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
                placeholder="Max Mustermann"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="role">Rolle</Label>
              <Select 
                value={formData.role_id} 
                onValueChange={(value) => handleInputChange('role_id', value)}
                required
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Rolle auswählen" />
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
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
            >
              Abbrechen
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading}
            >
              {isLoading ? "Wird angelegt..." : "Nutzer anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}