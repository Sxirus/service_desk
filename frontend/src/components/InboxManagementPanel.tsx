/**
 * InboxManagementPanel Component
 *
 * Allows admins to create and manage inboxes with filters and group access.
 * Features:
 * - Create, edit, and delete inboxes
 * - Multi-select status filters (backend supports arrays)
 * - Assignment filters with clear context
 * - Access group management with explanatory descriptions
 * - Plain-language summary of inbox configuration
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Inbox,
  Plus,
  Trash2,
  Pencil,
  Save,
  Filter,
  Users,
  Mail,
  Loader2,
  Eye,
  SlidersHorizontal,
  Info,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '@/utils/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
import { cn } from '@/lib/utils';

interface InboxFilter {
  filter_type: string;
  filter_config: any;
}

interface InboxData {
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

type AssignmentFilterValue = 'all' | 'unassigned' | 'groups';

// All possible ticket statuses
const ALL_STATUSES = ['new', 'open', 'waiting', 'resolved'] as const;
type TicketStatus = (typeof ALL_STATUSES)[number];

const STATUS_DOT_COLORS: Record<TicketStatus, string> = {
  new: 'bg-green-500',
  open: 'bg-orange-500',
  waiting: 'bg-blue-500',
  resolved: 'bg-muted-foreground',
};

const InboxManagementPanel: React.FC<Props> = ({ groups }) => {
  const { t } = useTranslation('manage');
  const [inboxes, setInboxes] = useState<InboxData[]>([]);
  const [selectedInbox, setSelectedInbox] = useState<InboxData | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [inboxToDelete, setInboxToDelete] = useState<number | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  // Multi-select: empty array = all statuses (no filter)
  const [selectedStatuses, setSelectedStatuses] = useState<TicketStatus[]>([]);
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilterValue>('all');
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
      toast.error(t('common.errors.generic') || 'Failed to load inboxes');
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
    setSelectedStatuses([]);
    setAssignmentFilter('all');
    setAssignmentGroups([]);
    setIsCreating(false);
    setIsEditing(false);
  };

  // Load inbox into form
  const loadInboxToForm = (inbox: InboxData) => {
    setFormName(inbox.name);
    setFormDescription(inbox.description || '');
    setSelectedGroups(inbox.inbox_groups.map(ig => ig.group_id));

    // Load status filter → multi-select
    const statusFilterData = inbox.inbox_filters.find(f => f.filter_type === 'status');
    const readFilter = inbox.inbox_filters.find(f => f.filter_type === 'read_status');

    if (statusFilterData) {
      const show = statusFilterData.filter_config.show;
      if (Array.isArray(show)) {
        setSelectedStatuses(show as TicketStatus[]);
      } else if (show && show !== 'all') {
        setSelectedStatuses([show as TicketStatus]);
      } else {
        setSelectedStatuses([]);
      }
    } else if (readFilter) {
      // Legacy migration
      const show = readFilter.filter_config.show;
      if (show === 'read') {
        setSelectedStatuses(['resolved']);
      } else if (show === 'unread') {
        setSelectedStatuses(['new', 'open']);
      } else {
        setSelectedStatuses([]);
      }
    } else {
      setSelectedStatuses([]);
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

  // Build filters array from form state
  const buildFilters = () => {
    const filters = [];

    if (selectedStatuses.length > 0) {
      filters.push({
        filter_type: 'status',
        filter_config: {
          show: selectedStatuses.length === 1 ? selectedStatuses[0] : selectedStatuses
        }
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

    return filters;
  };

  // Create inbox
  const handleCreate = async () => {
    if (!formName.trim()) {
      toast.error(t('inboxes.enterInboxName'));
      return;
    }

    try {
      const createResponse = await apiClient.post('/inboxes/createInbox', {
        name: formName,
        description: formDescription
      });

      if (!createResponse.success) throw new Error('Failed to create inbox');

      const newInboxId = createResponse.data.id;

      for (const groupId of selectedGroups) {
        await apiClient.post('/inboxes/addGroup', {
          inbox_id: newInboxId,
          group_id: groupId
        });
      }

      const filters = buildFilters();
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
      await apiClient.put('/inboxes/updateInbox', {
        inbox_id: selectedInbox.id,
        name: formName,
        description: formDescription
      });

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

      await apiClient.post('/inboxes/setFilters', {
        inbox_id: selectedInbox.id,
        filters: buildFilters()
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
  const handleDelete = (inboxId: number) => {
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

  // Toggle status in multi-select
  const toggleStatus = (status: TicketStatus) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
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

  // Build a plain-language summary of what this inbox shows
  const buildInboxSummary = (inbox: InboxData): string => {
    const parts: string[] = [];

    // Status part
    const statusFilter = inbox.inbox_filters.find(f => f.filter_type === 'status');
    const readFilter = inbox.inbox_filters.find(f => f.filter_type === 'read_status');

    if (statusFilter) {
      const show = statusFilter.filter_config.show;
      if (Array.isArray(show)) {
        const labels = show.map((s: string) => t(`inboxes.statusNames.${s}`));
        parts.push(t('inboxes.summaryStatus', { statuses: labels.join(', ') }));
      } else if (show && show !== 'all') {
        parts.push(t('inboxes.summaryStatus', { statuses: t(`inboxes.statusNames.${show}`) }));
      }
    } else if (readFilter) {
      const show = readFilter.filter_config.show;
      if (show === 'read') {
        parts.push(t('inboxes.summaryStatus', { statuses: t('inboxes.statusNames.resolved') }));
      } else if (show === 'unread') {
        parts.push(t('inboxes.summaryStatus', { statuses: `${t('inboxes.statusNames.new')}, ${t('inboxes.statusNames.open')}` }));
      }
    }

    // Assignment part
    const assignFilter = inbox.inbox_filters.find(f => f.filter_type === 'assignment');
    if (assignFilter) {
      if (assignFilter.filter_config.show === 'unassigned') {
        parts.push(t('inboxes.summaryUnassigned'));
      } else if (assignFilter.filter_config.show === 'groups') {
        const groupNames = (assignFilter.filter_config.group_ids || [])
          .map((gid: number) => groups.find(g => g.id === gid)?.name)
          .filter(Boolean);
        if (groupNames.length > 0) {
          parts.push(t('inboxes.summaryAssignedTo', { groups: groupNames.join(', ') }));
        }
      }
    }

    if (parts.length === 0) {
      return t('inboxes.summaryAllTickets');
    }

    return parts.join(' · ');
  };

  // Build a live preview summary from form state
  const buildFormSummary = (): string => {
    const parts: string[] = [];

    if (selectedStatuses.length > 0 && selectedStatuses.length < ALL_STATUSES.length) {
      const labels = selectedStatuses.map(s => t(`inboxes.statusNames.${s}`));
      parts.push(t('inboxes.summaryStatus', { statuses: labels.join(', ') }));
    }

    if (assignmentFilter === 'unassigned') {
      parts.push(t('inboxes.summaryUnassigned'));
    } else if (assignmentFilter === 'groups' && assignmentGroups.length > 0) {
      const groupNames = assignmentGroups
        .map(gid => groups.find(g => g.id === gid)?.name)
        .filter(Boolean);
      if (groupNames.length > 0) {
        parts.push(t('inboxes.summaryAssignedTo', { groups: groupNames.join(', ') }));
      }
    }

    if (parts.length === 0) {
      return t('inboxes.summaryAllTickets');
    }

    return parts.join(' · ');
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span className="text-sm">{t('inboxes.loadingInboxes')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="font-medium">{t('inboxes.inboxesCount', { count: inboxes.length })}</h3>
          </div>
        </div>
        <Button
          size="sm"
          className="gap-2"
          onClick={() => {
            resetForm();
            setSelectedInbox(null);
            setIsCreating(true);
          }}
        >
          <Plus className="h-4 w-4" />
          {t('inboxes.newInbox')}
        </Button>
      </div>

      {/* Create Form */}
      {isCreating && (
        <InboxForm
          t={t}
          formName={formName}
          setFormName={setFormName}
          formDescription={formDescription}
          setFormDescription={setFormDescription}
          selectedGroups={selectedGroups}
          toggleGroup={toggleGroup}
          selectedStatuses={selectedStatuses}
          toggleStatus={toggleStatus}
          setSelectedStatuses={setSelectedStatuses}
          assignmentFilter={assignmentFilter}
          setAssignmentFilter={setAssignmentFilter}
          assignmentGroups={assignmentGroups}
          toggleAssignmentGroup={toggleAssignmentGroup}
          groups={groups}
          onSubmit={handleCreate}
          onCancel={resetForm}
          title={t('inboxes.createNewInbox')}
          submitLabel={t('inboxes.createInbox')}
          buildFormSummary={buildFormSummary}
        />
      )}

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Inbox List */}
        <div className="rounded-xl border bg-card">
          <div className="px-4 py-3 border-b">
            <h4 className="text-sm font-medium">{t('inboxes.allInboxes')}</h4>
          </div>
          <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto">
            {inboxes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('inboxes.noInboxesYet')}</p>
                <p className="text-xs">{t('inboxes.createToGetStarted')}</p>
              </div>
            ) : (
              inboxes.map(inbox => (
                <div
                  key={inbox.id}
                  className={cn(
                    'p-3 rounded-lg border cursor-pointer transition-all',
                    selectedInbox?.id === inbox.id
                      ? 'bg-primary/5 border-primary/50 shadow-sm'
                      : 'hover:bg-muted/50 border-transparent hover:border-border'
                  )}
                  onClick={() => {
                    setSelectedInbox(inbox);
                    setIsCreating(false);
                    setIsEditing(false);
                  }}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{inbox.name}</h4>
                      {inbox.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{inbox.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {inbox.inbox_groups.length} {t('groups.groups')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Filter className="h-3 w-3" />
                          {inbox.inbox_filters.length} {t('inboxes.filters')}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedInbox(inbox);
                          loadInboxToForm(inbox);
                          setIsCreating(false);
                          setIsEditing(true);
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
                          handleDelete(inbox.id);
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

        {/* Detail / Edit Panel */}
        <div className="rounded-xl border bg-card">
          {isEditing && selectedInbox ? (
            <>
              <div className="px-4 py-3 border-b">
                <h4 className="text-sm font-medium">{t('inboxes.editInbox')}</h4>
              </div>
              <div className="p-4">
                <InboxForm
                  t={t}
                  formName={formName}
                  setFormName={setFormName}
                  formDescription={formDescription}
                  setFormDescription={setFormDescription}
                  selectedGroups={selectedGroups}
                  toggleGroup={toggleGroup}
                  selectedStatuses={selectedStatuses}
                  toggleStatus={toggleStatus}
                  setSelectedStatuses={setSelectedStatuses}
                  assignmentFilter={assignmentFilter}
                  setAssignmentFilter={setAssignmentFilter}
                  assignmentGroups={assignmentGroups}
                  toggleAssignmentGroup={toggleAssignmentGroup}
                  groups={groups}
                  onSubmit={handleUpdate}
                  onCancel={() => {
                    setIsEditing(false);
                    resetForm();
                  }}
                  submitLabel={t('common.saveChanges')}
                  buildFormSummary={buildFormSummary}
                  inline
                />
              </div>
            </>
          ) : selectedInbox ? (
            <>
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <h4 className="text-sm font-medium">{selectedInbox.name}</h4>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5"
                  onClick={() => {
                    loadInboxToForm(selectedInbox);
                    setIsEditing(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t('common.edit')}
                </Button>
              </div>
              <div className="p-4 space-y-4">
                {selectedInbox.description && (
                  <p className="text-xs text-muted-foreground pb-2 border-b">{selectedInbox.description}</p>
                )}

                {/* Summary — plain-language explanation */}
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{t('inboxes.whatThisInboxShows')}</p>
                      <p className="text-sm">{buildInboxSummary(selectedInbox)}</p>
                    </div>
                  </div>
                </div>

                {/* Visibility */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t('inboxes.visibilityLabel')}
                    </h4>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{t('inboxes.visibilityHint')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedInbox.inbox_groups.map(ig => (
                      <Badge key={ig.group_id} variant="secondary">
                        {ig.employee_groups.name}
                      </Badge>
                    ))}
                    {selectedInbox.inbox_groups.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">{t('inboxes.noGroupsAssigned')}</p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Ticket Filters detail */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t('inboxes.ticketFiltersLabel')}
                    </h4>
                  </div>

                  {/* Status badges */}
                  <div className="mb-3">
                    <p className="text-xs text-muted-foreground mb-1.5">{t('inboxes.statusSectionLabel')}</p>
                    {(() => {
                      const statusFilter = selectedInbox.inbox_filters.find(f => f.filter_type === 'status');
                      const readFilter = selectedInbox.inbox_filters.find(f => f.filter_type === 'read_status');
                      let statuses: string[] = [];

                      if (statusFilter) {
                        const show = statusFilter.filter_config.show;
                        statuses = Array.isArray(show) ? show : (show && show !== 'all' ? [show] : []);
                      } else if (readFilter) {
                        const show = readFilter.filter_config.show;
                        if (show === 'read') statuses = ['resolved'];
                        else if (show === 'unread') statuses = ['new', 'open'];
                      }

                      if (statuses.length === 0) {
                        return (
                          <Badge variant="outline" className="text-xs">
                            {t('inboxes.allStatuses')}
                          </Badge>
                        );
                      }

                      return (
                        <div className="flex flex-wrap gap-1.5">
                          {statuses.map(s => (
                            <Badge key={s} variant="secondary" className="gap-1.5">
                              <span className={cn('w-2 h-2 rounded-full', STATUS_DOT_COLORS[s as TicketStatus] || 'bg-muted-foreground')} />
                              {t(`inboxes.statusNames.${s}`)}
                            </Badge>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Assignment */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">{t('inboxes.assignmentSectionLabel')}</p>
                    {(() => {
                      const assignFilter = selectedInbox.inbox_filters.find(f => f.filter_type === 'assignment');
                      if (!assignFilter) {
                        return (
                          <Badge variant="outline" className="text-xs">
                            {t('inboxes.allAssignments')}
                          </Badge>
                        );
                      }
                      if (assignFilter.filter_config.show === 'unassigned') {
                        return (
                          <Badge variant="secondary" className="gap-1.5">
                            <UserCheck className="h-3 w-3" />
                            {t('inboxes.unassignedOnly')}
                          </Badge>
                        );
                      }
                      if (assignFilter.filter_config.show === 'groups') {
                        const groupNames = (assignFilter.filter_config.group_ids || [])
                          .map((gid: number) => groups.find(g => g.id === gid)?.name)
                          .filter(Boolean);
                        return (
                          <div className="flex flex-wrap gap-1.5">
                            {groupNames.map((name: string) => (
                              <Badge key={name} variant="secondary">{name}</Badge>
                            ))}
                          </div>
                        );
                      }
                      return (
                        <Badge variant="outline" className="text-xs">
                          {t('inboxes.allAssignments')}
                        </Badge>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Inbox className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">{t('inboxes.selectInboxOrCreate')}</p>
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
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-white hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ------- Extracted Form Component -------

interface InboxFormProps {
  t: (key: string, opts?: any) => string;
  formName: string;
  setFormName: (v: string) => void;
  formDescription: string;
  setFormDescription: (v: string) => void;
  selectedGroups: number[];
  toggleGroup: (id: number) => void;
  selectedStatuses: TicketStatus[];
  toggleStatus: (s: TicketStatus) => void;
  setSelectedStatuses: (v: TicketStatus[]) => void;
  assignmentFilter: AssignmentFilterValue;
  setAssignmentFilter: (v: AssignmentFilterValue) => void;
  assignmentGroups: number[];
  toggleAssignmentGroup: (id: number) => void;
  groups: Group[];
  onSubmit: () => void;
  onCancel: () => void;
  title?: string;
  submitLabel: string;
  buildFormSummary: () => string;
  inline?: boolean;
}

const InboxForm: React.FC<InboxFormProps> = ({
  t,
  formName,
  setFormName,
  formDescription,
  setFormDescription,
  selectedGroups,
  toggleGroup,
  selectedStatuses,
  toggleStatus,
  setSelectedStatuses,
  assignmentFilter,
  setAssignmentFilter,
  assignmentGroups,
  toggleAssignmentGroup,
  groups,
  onSubmit,
  onCancel,
  title,
  submitLabel,
  buildFormSummary,
  inline = false,
}) => {
  const Wrapper = inline
    ? React.Fragment
    : ({ children }: { children: React.ReactNode }) => (
        <div className="rounded-xl border bg-muted/30 p-5">{children}</div>
      );

  return (
    <Wrapper>
      {title && <h4 className="text-sm font-medium mb-4">{title}</h4>}

      <div className="space-y-5">
        {/* ── Section 1: General ── */}
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="inbox-name">{t('inboxes.inboxName')} *</Label>
            <Input
              id="inbox-name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={t('inboxes.inboxNamePlaceholder')}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="inbox-description">{t('groups.description')}</Label>
            <textarea
              id="inbox-description"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] min-h-[64px] resize-y"
              placeholder={t('groups.optionalDescription')}
              rows={2}
            />
          </div>
        </div>

        <Separator />

        {/* ── Section 2: Visibility ── */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('inboxes.visibilityLabel')}
            </Label>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            {t('inboxes.visibilityDescription')}
          </p>
          <div className="rounded-lg border p-3 max-h-40 overflow-y-auto space-y-1">
            {groups.map(group => (
              <label
                key={group.id}
                className="flex items-center gap-2.5 py-1.5 px-1 rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={selectedGroups.includes(group.id)}
                  onCheckedChange={() => toggleGroup(group.id)}
                />
                <span className="text-sm">{group.name}</span>
              </label>
            ))}
            {groups.length === 0 && (
              <p className="text-xs text-muted-foreground py-1">{t('groups.noGroupsAvailable')}</p>
            )}
          </div>
        </div>

        <Separator />

        {/* ── Section 3: Ticket Filters ── */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('inboxes.ticketFiltersLabel')}
            </Label>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {t('inboxes.ticketFiltersDescription')}
          </p>

          <div className="space-y-3">
            {/* Status Filter — multi-select checkboxes */}
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium mb-1">{t('inboxes.statusSectionLabel')}</p>
              <p className="text-xs text-muted-foreground mb-2">{t('inboxes.statusHint')}</p>
              <div className="space-y-1">
                {ALL_STATUSES.map(status => (
                  <label
                    key={status}
                    className="flex items-center gap-2.5 py-1.5 px-1 rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={selectedStatuses.includes(status)}
                      onCheckedChange={() => toggleStatus(status)}
                    />
                    <span className="flex items-center gap-2 text-sm">
                      <span className={cn('w-2 h-2 rounded-full', STATUS_DOT_COLORS[status])} />
                      {t(`inboxes.statusNames.${status}`)}
                    </span>
                  </label>
                ))}
              </div>
              {selectedStatuses.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2 italic">{t('inboxes.noStatusFilterHint')}</p>
              )}
            </div>

            {/* Assignment Filter */}
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium mb-1">{t('inboxes.assignmentSectionLabel')}</p>
              <p className="text-xs text-muted-foreground mb-2">{t('inboxes.assignmentHint')}</p>
              <div className="space-y-1">
                {(['all', 'unassigned', 'groups'] as AssignmentFilterValue[]).map(val => (
                  <label
                    key={val}
                    className="flex items-center gap-2.5 py-1.5 px-1 rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <input
                      type="radio"
                      name="assignment"
                      checked={assignmentFilter === val}
                      onChange={() => setAssignmentFilter(val)}
                      className="accent-primary"
                    />
                    <span className="text-sm">
                      {val === 'all' && t('inboxes.assignmentAll')}
                      {val === 'unassigned' && t('inboxes.assignmentUnassigned')}
                      {val === 'groups' && t('inboxes.assignmentByGroup')}
                    </span>
                  </label>
                ))}

                {assignmentFilter === 'groups' && (
                  <div className="ml-6 mt-2 rounded-lg border p-2 max-h-32 overflow-y-auto space-y-1">
                    <p className="text-xs text-muted-foreground mb-1">{t('inboxes.assignmentGroupsHint')}</p>
                    {groups.map(group => (
                      <label
                        key={group.id}
                        className="flex items-center gap-2.5 py-1 px-1 rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          checked={assignmentGroups.includes(group.id)}
                          onCheckedChange={() => toggleAssignmentGroup(group.id)}
                        />
                        <span className="text-sm">{group.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Live preview ── */}
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-0.5">{t('inboxes.previewLabel')}</p>
              <p className="text-sm">{buildFormSummary()}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={onSubmit} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {submitLabel}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Wrapper>
  );
};

export default InboxManagementPanel;
