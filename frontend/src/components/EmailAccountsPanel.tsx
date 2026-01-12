import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    Mail, 
    Plus, 
    Trash2, 
    Edit2, 
    RefreshCcw, 
    CheckCircle2, 
    AlertCircle, 
    Server, 
    Shield, 
    Settings2,
    Star,
    Loader2,
    Info
} from 'lucide-react';
import { apiClient } from '@/utils/api';
import { Button } from '@/components/ui/button';
import { 
    Dialog, 
    DialogContent, 
    DialogDescription, 
    DialogFooter, 
    DialogHeader, 
    DialogTitle 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
    Tooltip, 
    TooltipContent, 
    TooltipProvider, 
    TooltipTrigger 
} from "@/components/ui/tooltip";

interface Provider {
    id: number;
    name: string;
    logo_url?: string | null;
    imap: string;
    imap_port: number;
    smtp: string;
    smtp_port: number;
}

interface EmailAccount {
    id: number;
    email_address: string;
    active: boolean;
    imap: string;
    imap_port: number;
    smtp: string;
    smtp_port: number;
    last_sync_at?: string | null;
    last_error?: string | null;
    provider_id: number;
    "email-provider"?: {
        name: string;
        logo_url?: string | null;
        imap?: string;
        imap_port?: number;
        smtp?: string;
        smtp_port?: number;
    };
}

interface Props {
    clientId: number;
    primaryEmailId?: number | null;
}

const EmailAccountsPanel: React.FC<Props> = ({ clientId, primaryEmailId: initialPrimaryId }) => {
    const { t, i18n } = useTranslation('manage');
    const [accounts, setEmailAccounts] = useState<EmailAccount[]>([]);
    const [providers, setProviders] = useState<Provider[]>([]);
    const [loading, setLoading] = useState(true);
    const [primaryId, setPrimaryId] = useState<number | null>(initialPrimaryId || null);

    // Dialog state
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [currentAccount, setCurrentAccount] = useState<EmailAccount | null>(null);
    const [accountToDelete, setAccountToDelete] = useState<number | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        email_address: '',
        password: '',
        provider_id: '',
        imap: '',
        imap_port: 993,
        smtp: '',
        smtp_port: 587,
        active: true
    });
    const [isTesting, setIsTesting] = useState(false);
    const [isSaving, setIsSubmitting] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const [accRes, provRes] = await Promise.all([
                apiClient.get('/email-accounts'),
                // We need to use the existing action or an API endpoint for providers
                // For now, let's assume we have an endpoint or fetch it manually
                fetchProviders()
            ]);

            if (accRes.success) setEmailAccounts(accRes.data);
        } catch (error) {
            console.error('Failed to load email accounts:', error);
            toast.error(t('common.errors.generic'));
        } finally {
            setLoading(false);
        }
    };

    const fetchProviders = async () => {
        try {
            // Reusing the logic from RegisterWizard via a custom API call if possible, 
            // or just a direct supabase fetch if we want to bypass the action.
            // Since we are in a React component, apiClient is preferred.
            // Let's assume we add an endpoint for this too.
            // For now, I'll fetch them from the backend if I added the route, 
            // but I didn't. I'll use the existing supabase logic in a temporary way 
            // or just assume they are available.
            // Actually, I'll add a route for providers in the backend.
            const res = await apiClient.get('/email-accounts/providers');
            if (res.success) setProviders(res.data);
        } catch (e) {
            console.error('Failed to fetch providers:', e);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleOpenAdd = () => {
        setCurrentAccount(null);
        setFormData({
            email_address: '',
            password: '',
            provider_id: '',
            imap: '',
            imap_port: 993,
            smtp: '',
            smtp_port: 587,
            active: true
        });
        setIsDialogOpen(true);
    };

    const handleOpenEdit = (account: EmailAccount) => {
        setCurrentAccount(account);
        setFormData({
            email_address: account.email_address ?? '',
            password: '', // Don't show password
            provider_id: account.provider_id?.toString() ?? '',
            imap: account.imap || account["email-provider"]?.imap || '',
            imap_port: account.imap_port || account["email-provider"]?.imap_port || 993,
            smtp: account.smtp || account["email-provider"]?.smtp || '',
            smtp_port: account.smtp_port || account["email-provider"]?.smtp_port || 587,
            active: account.active ?? true
        });
        setIsDialogOpen(true);
    };

    const onSelectProvider = (idStr: string) => {
        const id = Number(idStr);
        const p = providers.find(x => x.id === id);
        if (p) {
            setFormData(prev => ({
                ...prev,
                provider_id: idStr,
                imap: p.imap ?? '',
                imap_port: p.imap_port ?? 993,
                smtp: p.smtp ?? '',
                smtp_port: p.smtp_port ?? 587
            }));
        } else {
            setFormData(prev => ({ ...prev, provider_id: idStr }));
        }
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        try {
            const res = await apiClient.post('/emails/test-mailbox', {
                email_address: formData.email_address,
                password: formData.password || 'KEEP_EXISTING', // Backend needs to handle this if editing
                imap: formData.imap,
                imap_port: formData.imap_port,
                smtp: formData.smtp,
                smtp_port: formData.smtp_port
            });

            if (res.success) {
                toast.success(t('emailAccounts.testSuccess'));
            } else {
                toast.error(t('emailAccounts.testFailed'), {
                    description: res.errors?.join(', ') || res.message
                });
            }
        } catch (error: any) {
            toast.error(t('emailAccounts.testFailed'), { description: error.message });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const payload: any = { ...formData };
            if (!payload.password && currentAccount) delete payload.password;

            let res;
            if (currentAccount) {
                res = await apiClient.patch(`/email-accounts/${currentAccount.id}`, payload);
            } else {
                res = await apiClient.post('/email-accounts', payload);
            }

            if (res.success) {
                toast.success(t('common.changesSaved'));
                setIsDialogOpen(false);
                loadData();
            } else {
                throw new Error(res.error);
            }
        } catch (error: any) {
            toast.error(t('common.failedToSave'), { description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!accountToDelete) return;
        try {
            const res = await apiClient.delete(`/email-accounts/${accountToDelete}`);
            if (res.success) {
                toast.success(t('inboxes.inboxDeleted'));
                setIsDeleteDialogOpen(false);
                loadData();
            } else {
                throw new Error(res.error);
            }
        } catch (error: any) {
            toast.error(t('inboxes.deleteFailed'), { description: error.message });
        }
    };

    const handleSetPrimary = async (id: number) => {
        try {
            const res = await apiClient.post('/settings/updateEmailConfig', {
                sendingMode: 'primary',
                primaryEmailId: id
            });
            if (res.success) {
                setPrimaryId(id);
                toast.success(t('settings.changesSaved'));
            }
        } catch (error: any) {
            toast.error(t('common.failedToSave'));
        }
    };

    if (loading) {
        return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">{t('emailAccounts.title')}</h2>
                    <p className="text-muted-foreground">{t('emailAccounts.description')}</p>
                </div>
                <Button onClick={handleOpenAdd}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('emailAccounts.addAccount')}
                </Button>
            </div>

            <div className="rounded-md border bg-white">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('inboxes.emailAddress')}</TableHead>
                            <TableHead>
                                <div className="flex items-center gap-1.5 cursor-help">
                                    {t('emailAccounts.encryption')}
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-[250px] text-xs">
                                                {t('emailAccounts.encryptionTooltip')}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                            </TableHead>
                            <TableHead>{t('emailAccounts.status')}</TableHead>
                            <TableHead>{t('emailAccounts.lastSync')}</TableHead>
                            <TableHead className="text-right">{t('table.actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {accounts.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    {t('inboxes.noInboxesFound')}
                                </TableCell>
                            </TableRow>
                        ) : (
                            accounts.map((account) => (
                                <TableRow key={account.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">{account.email_address}</span>
                                            {primaryId === account.id && (
                                                <Badge variant="default" className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">
                                                    <Star className="mr-1 h-3 w-3 fill-current" />
                                                    {t('emailAccounts.primaryBadge')}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {account["email-provider"]?.name || t('emailAccounts.custom')}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                                            <span>IMAP: <span className="font-mono text-foreground">{account.imap_port || account["email-provider"]?.imap_port || '—'}</span></span>
                                            <span>SMTP: <span className="font-mono text-foreground">{account.smtp_port || account["email-provider"]?.smtp_port || '—'}</span></span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {account.active ? (
                                                <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">
                                                    {t('emailAccounts.active')}
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary">
                                                    {t('emailAccounts.inactive')}
                                                </Badge>
                                            )}
                                            {account.last_error && (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger>
                                                            <AlertCircle className="h-4 w-4 text-red-500" />
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p className="max-w-xs text-xs">{account.last_error}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                        {account.last_sync_at ? new Date(account.last_sync_at).toLocaleString(i18n.language) : t('emailAccounts.never')}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            {primaryId !== account.id && (
                                                <Button variant="ghost" size="icon" onClick={() => handleSetPrimary(account.id)} title={t('emailAccounts.setAsPrimary')}>
                                                    <Star className="h-4 w-4" />
                                                </Button>
                                            )}
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(account)}>
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => { setAccountToDelete(account.id); setIsDeleteDialogOpen(true); }}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex items-start gap-2 p-4 rounded-lg border border-blue-100 bg-blue-50/50 text-blue-800">
                <Shield className="h-5 w-5 mt-0.5 shrink-0 opacity-80" />
                <p className="text-sm leading-relaxed">
                    {t('emailAccounts.dataSafetyInfo')}
                </p>
            </div>

            {/* Add/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <DialogTitle>{currentAccount ? t('emailAccounts.editAccount') : t('emailAccounts.addAccount')}</DialogTitle>
                            <DialogDescription>{t('emailAccounts.accountDetails')}</DialogDescription>
                        </DialogHeader>
                        
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>{t('emailAccounts.provider')}</Label>
                                    <Select value={formData.provider_id} onValueChange={onSelectProvider}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={t('emailAccounts.selectProvider')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {providers.map(p => (
                                                <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>{t('inboxes.emailAddress')}</Label>
                                    <Input 
                                        type="email" 
                                        required 
                                        value={formData.email_address || ''} 
                                        onChange={e => setFormData({...formData, email_address: e.target.value})} 
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>{t('inboxes.password')}</Label>
                                <Input 
                                    type="password" 
                                    placeholder={currentAccount ? `•••••••• (${t('emailAccounts.leaveBlankHint')})` : "••••••••"}
                                    required={!currentAccount}
                                    value={formData.password || ''} 
                                    onChange={e => setFormData({...formData, password: e.target.value})} 
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4 border-t pt-4 mt-2">
                                <div className="space-y-2">
                                    <Label>{t('emailAccounts.imapHost')}</Label>
                                    <Input value={formData.imap || ''} onChange={e => setFormData({...formData, imap: e.target.value})} required />
                                </div>
                                <div className="space-y-2">
                                    <Label>{t('emailAccounts.imapPort')}</Label>
                                    <Input type="number" value={formData.imap_port || ''} onChange={e => setFormData({...formData, imap_port: parseInt(e.target.value) || 0})} required />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>{t('emailAccounts.smtpHost')}</Label>
                                    <Input value={formData.smtp || ''} onChange={e => setFormData({...formData, smtp: e.target.value})} required />
                                </div>
                                <div className="space-y-2">
                                    <Label>{t('emailAccounts.smtpPort')}</Label>
                                    <Input type="number" value={formData.smtp_port || ''} onChange={e => setFormData({...formData, smtp_port: parseInt(e.target.value) || 0})} required />
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="gap-2">
                            <Button type="button" variant="secondary" onClick={handleTestConnection} disabled={isTesting || !formData.email_address}>
                                {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                                {t('emailAccounts.testConnection')}
                            </Button>
                            <div className="flex-1" />
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>{t('common.cancel')}</Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('emailAccounts.saveAccount')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('common.areYouSure')}</DialogTitle>
                        <DialogDescription>{t('emailAccounts.deleteWarning')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>{t('common.cancel')}</Button>
                        <Button variant="destructive" onClick={handleDelete}>{t('common.delete')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default EmailAccountsPanel;
