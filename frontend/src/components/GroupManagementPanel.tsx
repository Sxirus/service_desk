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
    return <div className="p-6">Loading groups...</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Employee Groups</h2>
        <Button onClick={() => setIsCreating(true)}>Create Group</Button>
      </div>

      {/* Create Group Form */}
      {isCreating && (
        <div className="rounded-lg border bg-card p-6">
          <h3 className="text-lg font-semibold mb-4">Create New Group</h3>
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Group Name *</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                placeholder="e.g., Support Team, Sales Department"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                placeholder="Optional description"
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Create</Button>
              <Button 
                type="button" 
                variant="outline" 
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Groups List */}
        <div className="rounded-lg border bg-card">
          <div className="p-4 border-b">
            <h3 className="font-semibold">Groups ({groups.length})</h3>
          </div>
          <div className="p-4 space-y-2 max-h-[500px] overflow-y-auto">
            {groups.length === 0 ? (
              <p className="text-muted-foreground text-sm">No groups yet. Create one to get started.</p>
            ) : (
              groups.map((group) => (
                <div
                  key={group.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedGroup?.id === group.id
                      ? 'bg-primary/10 border-primary'
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => setSelectedGroup(group)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="font-medium">{group.name}</h4>
                      {group.description && (
                        <p className="text-sm text-muted-foreground mt-1">{group.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(group);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGroup(group.id);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Group Details & Members */}
        <div className="rounded-lg border bg-card">
          {selectedGroup ? (
            <>
              <div className="p-4 border-b">
                <h3 className="font-semibold">
                  {isEditing ? 'Edit Group' : selectedGroup.name}
                </h3>
              </div>
              <div className="p-4 space-y-4">
                {isEditing ? (
                  <form onSubmit={handleUpdateGroup} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Group Name *</label>
                      <input
                        type="text"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <textarea
                        value={groupDescription}
                        onChange={(e) => setGroupDescription(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2"
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm">Save</Button>
                      <Button type="button" size="sm" variant="outline" onClick={cancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    {selectedGroup.description && (
                      <p className="text-sm text-muted-foreground">{selectedGroup.description}</p>
                    )}
                    
                    <div>
                      <h4 className="font-medium mb-2">Members ({groupMembers.length})</h4>
                      <div className="space-y-1 max-h-[200px] overflow-y-auto">
                        {groupMembers.map((member) => (
                          <div
                            key={member.employee_id}
                            className="flex justify-between items-center p-2 rounded bg-muted"
                          >
                            <span className="text-sm">{member.name}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveMember(member.employee_id)}
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                        {groupMembers.length === 0 && (
                          <p className="text-sm text-muted-foreground">No members yet</p>
                        )}
                      </div>
                    </div>

                    {availableEmployees.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Add Members</h4>
                        <div className="space-y-1 max-h-[200px] overflow-y-auto">
                          {availableEmployees.map((emp) => (
                            <div
                              key={emp.id}
                              className="flex justify-between items-center p-2 rounded hover:bg-muted"
                            >
                              <span className="text-sm">{emp.name}</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAddMember(emp.id)}
                              >
                                Add
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
            <div className="p-4 text-center text-muted-foreground">
              Select a group to view details and manage members
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
