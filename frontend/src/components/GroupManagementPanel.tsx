/**
 * GroupManagementPanel Component
 * 
 * Allows admins to create and manage employee groups
 * Features:
 * - Create new groups
 * - Edit group details
 * - Manage group members (add/remove employees)
 * - Delete groups
 */

import React, { useState, useEffect } from 'react';
import { apiClient } from '@/utils/api';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Pencil, Trash2, Users, UserPlus, UserMinus } from 'lucide-react';
import { GroupsPanelSkeleton } from '@/components/UserManagementSkeletons';

interface Group {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

interface Employee {
  id: number;
  name: string;
}

interface GroupMember {
  employee_id: number;
  name: string;
}

interface GroupManagementPanelProps {
  employees: Employee[];
}

export const GroupManagementPanel: React.FC<GroupManagementPanelProps> = ({ employees }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Form states
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');

  // Load groups on mount
  useEffect(() => {
    loadGroups();
  }, []);

  // Load group members when group is selected
  useEffect(() => {
    if (selectedGroup) {
      loadGroupMembers(selectedGroup.id);
    }
  }, [selectedGroup]);

  const loadGroups = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiClient.get('/groups/getGroups');
      if (response.success) {
        setGroups(response.data || []);
      } else {
        setError('Failed to load groups');
      }
    } catch (err) {
      console.error('Error loading groups:', err);
      setError('Failed to load groups');
    } finally {
      setIsLoading(false);
    }
  };

  const loadGroupMembers = async (groupId: number) => {
    try {
      const response = await apiClient.get(`/groups/getGroupMembers?group_id=${groupId}`);
      if (response.success) {
        setGroupMembers(response.data || []);
      }
    } catch (err) {
      console.error('Error loading group members:', err);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    try {
      const response = await apiClient.post('/groups/createGroup', {
        name: groupName,
        description: groupDescription
      });

      if (response.success) {
        await loadGroups();
        setIsCreating(false);
        setGroupName('');
        setGroupDescription('');
      } else {
        setError(response.error || 'Failed to create group');
      }
    } catch (err) {
      console.error('Error creating group:', err);
      setError('Failed to create group');
    }
  };

  const handleUpdateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup || !groupName.trim()) return;

    try {
      const response = await apiClient.put('/groups/updateGroup', {
        group_id: selectedGroup.id,
        name: groupName,
        description: groupDescription
      });

      if (response.success) {
        await loadGroups();
        setIsEditing(false);
        setSelectedGroup(response.data);
      } else {
        setError(response.error || 'Failed to update group');
      }
    } catch (err) {
      console.error('Error updating group:', err);
      setError('Failed to update group');
    }
  };

  const handleDeleteGroup = async (groupId: number) => {
    if (!confirm('Are you sure you want to delete this group? This will remove all member assignments.')) {
      return;
    }

    try {
      const response = await apiClient.delete(`/groups/deleteGroup?group_id=${groupId}`);
      if (response.success) {
        await loadGroups();
        if (selectedGroup?.id === groupId) {
          setSelectedGroup(null);
        }
      } else {
        setError(response.error || 'Failed to delete group');
      }
    } catch (err) {
      console.error('Error deleting group:', err);
      setError('Failed to delete group');
    }
  };

  const handleAddMember = async (employeeId: number) => {
    if (!selectedGroup) return;

    try {
      const response = await apiClient.post('/groups/addMember', {
        group_id: selectedGroup.id,
        employee_id: employeeId
      });

      if (response.success) {
        await loadGroupMembers(selectedGroup.id);
      } else {
        setError(response.error || 'Failed to add member');
      }
    } catch (err) {
      console.error('Error adding member:', err);
      setError('Failed to add member');
    }
  };

  const handleRemoveMember = async (employeeId: number) => {
    if (!selectedGroup) return;

    try {
      const response = await apiClient.delete('/groups/removeMember', {
        group_id: selectedGroup.id,
        employee_id: employeeId
      });

      if (response.success) {
        await loadGroupMembers(selectedGroup.id);
      } else {
        setError(response.error || 'Failed to remove member');
      }
    } catch (err) {
      console.error('Error removing member:', err);
      setError('Failed to remove member');
    }
  };

  const startEdit = (group: Group) => {
    setSelectedGroup(group);
    setGroupName(group.name);
    setGroupDescription(group.description || '');
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setGroupName('');
    setGroupDescription('');
  };

  const availableEmployees = employees.filter(
    emp => !groupMembers.some(member => member.employee_id === emp.id)
  );

  if (isLoading) {
    return <GroupsPanelSkeleton />;
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
            <Users className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h3 className="font-medium">{groups.length} Groups</h3>
            <p className="text-xs text-muted-foreground">Manage team organization</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setIsCreating(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Group
        </Button>
      </div>

      {/* Create Group Form */}
      {isCreating && (
        <div className="rounded-xl border bg-muted/30 p-5">
          <h4 className="text-sm font-medium mb-4">Create New Group</h4>
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Group Name *</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="e.g., Support Team, Sales Department"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
              <textarea
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="Optional description"
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm">Create Group</Button>
              <Button 
                type="button" 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setIsCreating(false);
                  setGroupName('');
                  setGroupDescription('');
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Groups List */}
        <div className="rounded-xl border bg-card">
          <div className="px-4 py-3 border-b">
            <h4 className="text-sm font-medium">All Groups</h4>
          </div>
          <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto">
            {groups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No groups yet</p>
                <p className="text-xs">Create one to organize your team</p>
              </div>
            ) : (
              groups.map((group) => (
                <div
                  key={group.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedGroup?.id === group.id
                      ? 'bg-primary/5 border-primary/50 shadow-sm'
                      : 'hover:bg-muted/50 border-transparent hover:border-border'
                  }`}
                  onClick={() => setSelectedGroup(group)}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{group.name}</h4>
                      {group.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{group.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(group);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGroup(group.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Group Details & Members */}
        <div className="rounded-xl border bg-card">
          {selectedGroup ? (
            <>
              <div className="px-4 py-3 border-b">
                <h4 className="text-sm font-medium">
                  {isEditing ? 'Edit Group' : selectedGroup.name}
                </h4>
              </div>
              <div className="p-4 space-y-4">
                {isEditing ? (
                  <form onSubmit={handleUpdateGroup} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Group Name *</label>
                      <input
                        type="text"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
                      <textarea
                        value={groupDescription}
                        onChange={(e) => setGroupDescription(e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        rows={2}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm">Save Changes</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    {selectedGroup.description && (
                      <p className="text-xs text-muted-foreground pb-2 border-b">{selectedGroup.description}</p>
                    )}
                    
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Members ({groupMembers.length})
                        </h4>
                      </div>
                      <div className="space-y-1 max-h-[150px] overflow-y-auto">
                        {groupMembers.map((member) => (
                          <div
                            key={member.employee_id}
                            className="flex justify-between items-center p-2 rounded-lg bg-muted/50 group"
                          >
                            <span className="text-sm">{member.name}</span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                              onClick={() => handleRemoveMember(member.employee_id)}
                            >
                              <UserMinus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        {groupMembers.length === 0 && (
                          <p className="text-xs text-muted-foreground py-2">No members in this group</p>
                        )}
                      </div>
                    </div>

                    {availableEmployees.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <UserPlus className="h-4 w-4 text-muted-foreground" />
                          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Add Members
                          </h4>
                        </div>
                        <div className="space-y-1 max-h-[150px] overflow-y-auto">
                          {availableEmployees.map((emp) => (
                            <div
                              key={emp.id}
                              className="flex justify-between items-center p-2 rounded-lg hover:bg-muted/50 group"
                            >
                              <span className="text-sm">{emp.name}</span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary"
                                onClick={() => handleAddMember(emp.id)}
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Users className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">Select a group</p>
              <p className="text-xs">to view and manage members</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
