/**
 * MergeCustomerDialog Component
 *
 * Dialog for merging two customer records into one.
 * Used when the same customer writes from two different email addresses,
 * creating duplicate customer entries.
 *
 * Flow:
 * 1. Agent searches for the other customer to merge with
 * 2. Agent selects which email address should be the primary
 * 3. Confirmation step before merge is executed
 * 4. All emails/conversations are moved to the primary customer
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Merge, Search, Mail, AlertTriangle, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { apiClient } from '@/utils/api';
import { toast } from 'sonner';

interface CustomerSearchResult {
  id: number;
  name: string;
  emails: string[];
}

interface MergeCustomerDialogProps {
  /** Current customer being viewed */
  customer: {
    id: number;
    name: string;
  };
  /** Email address of the current customer */
  emailAddress: string;
  /** Callback when merge is completed successfully */
  onMergeComplete?: () => void;
}

type MergeStep = 'search' | 'confirm';

export const MergeCustomerDialog: React.FC<MergeCustomerDialogProps> = ({
  customer,
  emailAddress,
  onMergeComplete,
}) => {
  const { t } = useTranslation('dashboard');
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<MergeStep>('search');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);

  // Primary selection: which customer record to keep
  const [primaryId, setPrimaryId] = useState<number | null>(null);

  // Merge state
  const [merging, setMerging] = useState(false);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setStep('search');
      setSearchQuery('');
      setSearchResults([]);
      setSelectedCustomer(null);
      setPrimaryId(null);
      setMerging(false);
      // Focus search input after dialog animation
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Debounced search
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      if (query.trim().length < 2) {
        setSearchResults([]);
        setSearching(false);
        return;
      }

      setSearching(true);
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const data = await apiClient.get(
            `/customers/search?q=${encodeURIComponent(query.trim())}`
          );
          if (data.success) {
            // Filter out the current customer from results
            const filtered = (data.data || []).filter(
              (c: CustomerSearchResult) => c.id !== customer.id
            );
            setSearchResults(filtered);
          }
        } catch (err) {
          console.error('[MergeCustomer] Search error:', err);
        } finally {
          setSearching(false);
        }
      }, 300);
    },
    [customer.id]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const handleSelectCustomer = (result: CustomerSearchResult) => {
    setSelectedCustomer(result);
    setPrimaryId(customer.id); // Default: keep current customer as primary
    setStep('confirm');
  };

  const handleMerge = async () => {
    if (!selectedCustomer || !primaryId) return;

    const secondaryId = primaryId === customer.id ? selectedCustomer.id : customer.id;

    setMerging(true);
    try {
      const data = await apiClient.post('/customers/merge', {
        primaryCustomerId: primaryId,
        secondaryCustomerId: secondaryId,
      });

      if (data.success) {
        toast.success(t('customers.mergeSuccess'));
        setOpen(false);
        onMergeComplete?.();
      } else {
        toast.error(data.error || t('customers.mergeFailed'));
      }
    } catch (err) {
      console.error('[MergeCustomer] Merge error:', err);
      toast.error(t('customers.mergeFailed'));
    } finally {
      setMerging(false);
    }
  };

  const currentCustomerEmails = [emailAddress];
  const otherCustomerEmails = selectedCustomer?.emails || [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Merge className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('customers.mergeCustomers')}</p>
        </TooltipContent>
      </Tooltip>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            {t('customers.mergeCustomers')}
          </DialogTitle>
          <DialogDescription>
            {t('customers.mergeDescription')}
          </DialogDescription>
        </DialogHeader>

        {step === 'search' && (
          <div className="space-y-4">
            {/* Current customer info */}
            <div className="rounded-md border p-3 bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">
                {t('customers.currentCustomer')}
              </p>
              <p className="text-sm font-medium">{customer.name}</p>
              <p className="text-xs text-muted-foreground">{emailAddress}</p>
            </div>

            {/* Search input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t('customers.searchToMerge')}
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder={t('customers.searchCustomers')}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Search results */}
            <div className="max-h-60 overflow-y-auto space-y-1">
              {searching && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    {t('customers.loadingCustomers')}
                  </span>
                </div>
              )}

              {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('customers.noCustomersFound')}
                </p>
              )}

              {!searching &&
                searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => handleSelectCustomer(result)}
                    className="w-full text-left rounded-md border p-3 hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <p className="text-sm font-medium">{result.name || t('table.unknown')}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {result.emails.map((email) => (
                        <span
                          key={email}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                        >
                          <Mail className="h-3 w-3" />
                          {email}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
            </div>
          </div>
        )}

        {step === 'confirm' && selectedCustomer && (
          <div className="space-y-4">
            {/* Warning */}
            <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                {t('customers.mergeWarning')}
              </p>
            </div>

            {/* Primary selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t('customers.selectPrimaryEmail')}
              </label>
              <p className="text-xs text-muted-foreground">
                {t('customers.primaryEmailHint')}
              </p>

              {/* Current customer option */}
              <button
                onClick={() => setPrimaryId(customer.id)}
                className={`w-full text-left rounded-md border p-3 transition-colors ${
                  primaryId === customer.id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'hover:bg-accent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{customer.name}</p>
                    {currentCustomerEmails.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground mt-1"
                      >
                        <Mail className="h-3 w-3" />
                        {email}
                      </span>
                    ))}
                  </div>
                  {primaryId === customer.id && (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  )}
                </div>
              </button>

              {/* Other customer option */}
              <button
                onClick={() => setPrimaryId(selectedCustomer.id)}
                className={`w-full text-left rounded-md border p-3 transition-colors ${
                  primaryId === selectedCustomer.id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'hover:bg-accent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {selectedCustomer.name || t('table.unknown')}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {otherCustomerEmails.map((email) => (
                        <span
                          key={email}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                        >
                          <Mail className="h-3 w-3" />
                          {email}
                        </span>
                      ))}
                    </div>
                  </div>
                  {primaryId === selectedCustomer.id && (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  )}
                </div>
              </button>
            </div>

            {/* Merge summary */}
            <div className="rounded-md border p-3 bg-muted/50 text-sm space-y-1">
              <p className="font-medium">{t('customers.mergeSummary')}</p>
              <p className="text-muted-foreground">
                {t('customers.mergeSummaryDetail', {
                  primary: primaryId === customer.id ? customer.name : selectedCustomer.name,
                  secondary: primaryId === customer.id ? (selectedCustomer.name || t('table.unknown')) : customer.name,
                })}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'confirm' && (
            <Button
              variant="secondary"
              onClick={() => {
                setStep('search');
                setSelectedCustomer(null);
                setPrimaryId(null);
              }}
              disabled={merging}
            >
              {t('customers.mergeBack')}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => setOpen(false)}
            disabled={merging}
          >
            {t('customers.mergeCancel')}
          </Button>
          {step === 'confirm' && (
            <Button
              variant="destructive"
              onClick={handleMerge}
              disabled={merging || !primaryId}
            >
              {merging ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {t('customers.merging')}
                </>
              ) : (
                t('customers.mergeConfirm')
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
