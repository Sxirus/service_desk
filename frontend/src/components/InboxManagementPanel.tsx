import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Inbox,
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  Filter,
  Users,
  Mail
} from 'lucide-react';
import { apiClient } from '@/utils/api';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface InboxFilter {
  filter_type: string;
  filter_config: any;
}

interface Inbox {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  inbox_groups: Array<{
    group_id: number;
    employee_groups: {
      id: number;
      name: string;
    };
  }>;
  inbox_filters: InboxFilter[];
}

interface Group {
  id: number;
  name: string;
}

interface Props {
  groups: Group[];
}

const InboxManagementPanel: React.FC<Props> = ({ groups }) => {
  const { t } = useTranslation('manage');
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [selectedInbox, setSelectedInbox] = useState<Inbox | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [inboxToDelete, setInboxToDelete] = useState<number | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [readStatusFilter, setReadStatusFilter] = useState<'all' | 'read' | 'unread'>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'unassigned' | 'groups'>('all');
  const [assignmentGroups, setAssignmentGroups] = useState<number[]>([]);

  // Load inboxes
  const loadInboxes = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/inboxes/getInboxes');
      if (response.success) {
        setInboxes(response.data);
      }
    } catch (error) {
      console.error('Failed to load inboxes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInboxes();
  }, []);

  // Reset form
  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setSelectedGroups([]);
    setReadStatusFilter('all');
    setAssignmentFilter('all');
    setAssignmentGroups([]);
    setIsCreating(false);
    setIsEditing(false);
  };

  // Load inbox into form
  const loadInboxToForm = (inbox: Inbox) => {
    setFormName(inbox.name);
    setFormDescription(inbox.description || '');
    setSelectedGroups(inbox.inbox_groups.map(ig => ig.group_id));
    
    // Load filters
    const readFilter = inbox.inbox_filters.find(f => f.filter_type === 'read_status');
    if (readFilter) {
      setReadStatusFilter(readFilter.filter_config.show || 'all');
    } else {
      setReadStatusFilter('all');
    }

    const assignFilter = inbox.inbox_filters.find(f => f.filter_type === 'assignment');
    if (assignFilter) {
      setAssignmentFilter(assignFilter.filter_config.show || 'all');
      setAssignmentGroups(assignFilter.filter_config.group_ids || []);
    } else {
      setAssignmentFilter('all');
      setAssignmentGroups([]);
    }
  };

  // Create inbox
  const handleCreate = async () => {
    if (!formName.trim()) {
      toast.error(t('inboxes.enterInboxName'));
      return;
    }

    try {
      // Create inbox
      const createResponse = await apiClient.post('/inboxes/createInbox', {
        name: formName,
        description: formDescription
      });

      if (!createResponse.success) throw new Error('Failed to create inbox');

      const newInboxId = createResponse.data.id;

      // Add groups
      for (const groupId of selectedGroups) {
        await apiClient.post('/inboxes/addGroup', {
          inbox_id: newInboxId,
          group_id: groupId
        });
      }

      // Set filters
      const filters = [];
      
      if (readStatusFilter !== 'all') {
        filters.push({
          filter_type: 'read_status',
          filter_config: { show: readStatusFilter }
        });
      }

      if (assignmentFilter === 'unassigned') {
        filters.push({
          filter_type: 'assignment',
          filter_config: { show: 'unassigned' }
        });
      } else if (assignmentFilter === 'groups' && assignmentGroups.length > 0) {
        filters.push({
          filter_type: 'assignment',
          filter_config: { show: 'groups', group_ids: assignmentGroups }
        });
      }

      if (filters.length > 0) {
        await apiClient.post('/inboxes/setFilters', {
          inbox_id: newInboxId,
          filters
        });
      }

      await loadInboxes();
      resetForm();
      toast.success(t('inboxes.inboxCreated'));
    } catch (error) {
      console.error('Failed to create inbox:', error);
      toast.error(t('inboxes.createFailed'));
    }
  };

  // Update inbox
  const handleUpdate = async () => {
    if (!selectedInbox || !formName.trim()) return;

    try {
      // Update basic info
      await apiClient.put('/inboxes/updateInbox', {
        inbox_id: selectedInbox.id,
        name: formName,
        description: formDescription
      });

      // Update groups - remove old, add new
      const currentGroupIds = selectedInbox.inbox_groups.map(ig => ig.group_id);
      const toRemove = currentGroupIds.filter(gid => !selectedGroups.includes(gid));
      const toAdd = selectedGroups.filter(gid => !currentGroupIds.includes(gid));

      for (const groupId of toRemove) {
        await apiClient.delete('/inboxes/removeGroup', {
          inbox_id: selectedInbox.id,
          group_id: groupId
        });
      }

      for (const groupId of toAdd) {
        await apiClient.post('/inboxes/addGroup', {
          inbox_id: selectedInbox.id,
          group_id: groupId
        });
      }

      // Update filters
      const filters = [];
      
      if (readStatusFilter !== 'all') {
        filters.push({
          filter_type: 'read_status',
          filter_config: { show: readStatusFilter }
        });
      }

      if (assignmentFilter === 'unassigned') {
        filters.push({
          filter_type: 'assignment',
          filter_config: { show: 'unassigned' }
        });
      } else if (assignmentFilter === 'groups' && assignmentGroups.length > 0) {
        filters.push({
          filter_type: 'assignment',
          filter_config: { show: 'groups', group_ids: assignmentGroups }
        });
      }

      await apiClient.post('/inboxes/setFilters', {
        inbox_id: selectedInbox.id,
        filters
      });

      await loadInboxes();
      resetForm();
      setSelectedInbox(null);
      toast.success(t('inboxes.inboxUpdated'));
    } catch (error) {
      console.error('Failed to update inbox:', error);
      toast.error(t('inboxes.updateFailed'));
    }
  };

  // Delete inbox
  const handleDelete = async (inboxId: number) => {
    setInboxToDelete(inboxId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!inboxToDelete) return;

    try {
      await apiClient.delete(`/inboxes/deleteInbox?inbox_id=${inboxToDelete}`);

      await loadInboxes();
      if (selectedInbox?.id === inboxToDelete) {
        setSelectedInbox(null);
        resetForm();
      }
      toast.success(t('inboxes.inboxDeleted'));
    } catch (error) {
      console.error('Failed to delete inbox:', error);
      toast.error(t('inboxes.deleteFailed'));
    } finally {
      setDeleteDialogOpen(false);
      setInboxToDelete(null);
    }
  };

  // Toggle group selection
  const toggleGroup = (groupId: number) => {
    setSelectedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  // Toggle assignment group
  const toggleAssignmentGroup = (groupId: number) => {
    setAssignmentGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  if (loading) {
    return <div className="p-6">{t('inboxes.loadingInboxes')}</div>;
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-2">
          <Inbox className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-2xl font-semibold tracking-tight">{t('inboxes.title')}</h2>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setIsCreating(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          {t('inboxes.newInbox')}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inbox List */}
        <div className="lg:col-span-1">
          <h3 className="text-lg font-semibold mb-4">{t('inboxes.inboxesCount', { count: inboxes.length })}</h3>
          <div className="space-y-2">
            {inboxes.map(inbox => (
              <div
                key={inbox.id}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedInbox?.id === inbox.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => {
                  setSelectedInbox(inbox);
                  setIsCreating(false);
                  setIsEditing(false);
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{inbox.name}</div>
                    {inbox.description && (
                      <div className="text-sm text-gray-600 mt-1">{inbox.description}</div>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {inbox.inbox_groups.length} {t('groups.groups')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Filter className="w-3 h-3" />
                        {inbox.inbox_filters.length} {t('inboxes.filters')}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(inbox.id);
                    }}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
            {inboxes.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                <Mail className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{t('inboxes.noInboxesYet')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Inbox Details / Form */}
        <div className="lg:col-span-2">
          {isCreating || isEditing ? (
            <div>
              <h3 className="text-lg font-semibold mb-4">
                {isCreating ? t('inboxes.createNewInbox') : t('inboxes.editInbox')}
              </h3>
              
              {/* Basic Info */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('inboxes.inboxName')} *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder={t('inboxes.inboxNamePlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('groups.description')}</label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder={t('groups.optionalDescription')}
                  />
                </div>
              </div>

              {/* Access Control */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">
                  <Users className="w-4 h-4 inline mr-1" />
                  {t('inboxes.accessGroups')}
                </label>
                <div className="border rounded-lg p-3 max-h-40 overflow-y-auto">
                  {groups.map(group => (
                    <label key={group.id} className="flex items-center gap-2 py-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedGroups.includes(group.id)}
                        onChange={() => toggleGroup(group.id)}
                        className="rounded"
                      />
                      <span>{group.name}</span>
                    </label>
                  ))}
                  {groups.length === 0 && (
                    <p className="text-sm text-gray-500">{t('groups.noGroupsAvailable')}</p>
                  )}
                </div>
              </div>

              {/* Filters */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">
                  <Filter className="w-4 h-4 inline mr-1" />
                  {t('inboxes.emailFilters')}
                </label>
                
                {/* Read Status Filter */}
                <div className="border rounded-lg p-3 mb-3">
                  <div className="text-sm font-medium mb-2">{t('inboxes.readStatus')}</div>
                  <div className="space-y-1">
                    {(['all', 'read', 'unread'] as const).map(option => (
                      <label key={option} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="readStatus"
                          checked={readStatusFilter === option}
                          onChange={() => setReadStatusFilter(option)}
                        />
                        <span>{t(`inboxes.readStatusOptions.${option}`)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Assignment Filter */}
                <div className="border rounded-lg p-3">
                  <div className="text-sm font-medium mb-2">{t('inboxes.assignment')}</div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="assignment"
                        checked={assignmentFilter === 'all'}
                        onChange={() => setAssignmentFilter('all')}
                      />
                      <span>{t('inboxes.allTickets')}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="assignment"
                        checked={assignmentFilter === 'unassigned'}
                        onChange={() => setAssignmentFilter('unassigned')}
                      />
                      <span>{t('inboxes.unassignedOnly')}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="assignment"
                        checked={assignmentFilter === 'groups'}
                        onChange={() => setAssignmentFilter('groups')}
                      />
                      <span>{t('inboxes.specificGroups')}</span>
                    </label>
                    
                    {assignmentFilter === 'groups' && (
                      <div className="ml-6 mt-2 border rounded p-2 max-h-32 overflow-y-auto">
                        {groups.map(group => (
                          <label key={group.id} className="flex items-center gap-2 py-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={assignmentGroups.includes(group.id)}
                              onChange={() => toggleAssignmentGroup(group.id)}
                              className="rounded"
                            />
                            <span className="text-sm">{group.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button onClick={isCreating ? handleCreate : handleUpdate}>
                  <Save className="w-4 h-4 mr-2" />
                  {isCreating ? t('inboxes.createInbox') : t('common.saveChanges')}
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  <X className="w-4 h-4 mr-2" />
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          ) : selectedInbox ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{selectedInbox.name}</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    loadInboxToForm(selectedInbox);
                    setIsEditing(true);
                  }}
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  {t('common.edit')}
                </Button>
              </div>

              {selectedInbox.description && (
                <p className="text-gray-600 mb-4">{selectedInbox.description}</p>
              )}

              <div className="space-y-4">
                {/* Access Groups */}
                <div>
                  <div className="text-sm font-medium mb-2">{t('inboxes.accessGroups')}</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedInbox.inbox_groups.map(ig => (
                      <span
                        key={ig.group_id}
                        className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                      >
                        👥 {ig.employee_groups.name}
                      </span>
                    ))}
                    {selectedInbox.inbox_groups.length === 0 && (
                      <span className="text-sm text-gray-500">{t('inboxes.noGroupsAssigned')}</span>
                    )}
                  </div>
                </div>

                {/* Filters */}
                <div>
                  <div className="text-sm font-medium mb-2">{t('inboxes.activeFilters')}</div>
                  <div className="space-y-2">
                    {selectedInbox.inbox_filters.map((filter, idx) => (
                      <div key={idx} className="px-3 py-2 bg-gray-50 rounded border text-sm">
                        <span className="font-medium capitalize">{filter.filter_type.replace('_', ' ')}:</span>{' '}
                        <span className="text-gray-700">
                          {JSON.stringify(filter.filter_config)}
                        </span>
                      </div>
                    ))}
                    {selectedInbox.inbox_filters.length === 0 && (
                      <span className="text-sm text-gray-500">{t('inboxes.noFiltersConfigured')}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-12">
              <Inbox className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p>{t('inboxes.selectInboxOrCreate')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.areYouSure')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('inboxes.deleteWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default InboxManagementPanel;
