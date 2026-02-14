/**
 * ReplyArea Component
 * 
 * Resizable and collapsible reply area for composing email responses.
 * Features:
 * - Smooth resize with throttled mouse tracking
 * - Collapse/expand with persistent state
 * - File attachment support with preview
 * - Memory-safe file handling
 * - Accessible keyboard controls
 * - Ticket status selection (defaults to resolved)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@/utils/api';
import { FileUploadManager } from '@/utils/attachmentManager';
import type { ReplyAreaProps, FileUploadState } from '@/types/ticket.types';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RichTextEditor, type RichTextEditorRef } from '@/components/RichTextEditor';

const MIN_HEIGHT = 200;
const MAX_HEIGHT = 600;
const COLLAPSED_HEIGHT = 52;
const DEFAULT_HEIGHT = 200;

type PostSendBehavior = 'stay' | 'next' | 'back';
type TicketStatus = 'new' | 'open' | 'waiting' | 'resolved';

const AFTER_SEND_KEY = 'replyAfterSendBehavior';

// Status configuration for display - labels are translation keys
const STATUS_OPTIONS: { value: TicketStatus; labelKey: string; color: string }[] = [
  { value: 'resolved', labelKey: 'tickets.statusResolved', color: 'bg-gray-400' },
  { value: 'waiting', labelKey: 'tickets.statusWaiting', color: 'bg-blue-500' },
  { value: 'open', labelKey: 'tickets.statusOpen', color: 'bg-orange-500' },
  { value: 'new', labelKey: 'tickets.statusNew', color: 'bg-green-500' },
];

function getOriginFromLocation(): string | null {
  try {
    const url = new URL(window.location.href);
    const from = url.searchParams.get('from');
    return from;
  } catch {
    return null;
  }
}

function getBackHref(fromTableId: string | null): string {
  if (!fromTableId) return '/dashboard';
  if (fromTableId === 'dashboard') return '/dashboard';
  if (fromTableId.startsWith('inbox-')) {
    const inboxId = fromTableId.slice('inbox-'.length);
    if (inboxId) return `/inboxes/${inboxId}`;
  }
  return '/dashboard';
}

function getNextTicketHref(fromTableId: string, currentCustomerId: string): string | null {
  try {
    const raw = localStorage.getItem(`table_${fromTableId}_ticketOrder`);
    if (!raw) return null;
    const order = JSON.parse(raw) as string[];
    if (!Array.isArray(order) || order.length === 0) return null;

    const currentIndex = order.findIndex((id) => String(id) === String(currentCustomerId));
    if (currentIndex < 0) return null;
    const nextId = order[currentIndex + 1];
    if (!nextId) return null;
    const from = encodeURIComponent(fromTableId);
    return `/tickets/${nextId}?from=${from}`;
  } catch {
    return null;
  }
}

/**
 * File attachment preview item component
 */
interface AttachmentPreviewItemProps {
  fileState: FileUploadState;
  index: number;
  onRemove: (index: number) => void;
}

const AttachmentPreviewItem: React.FC<AttachmentPreviewItemProps> = ({ 
  fileState, 
  index, 
  onRemove 
}) => {
  const { t } = useTranslation('dashboard');
  return (
    <div 
      className="border rounded p-2 w-32 text-xs flex flex-col gap-1 bg-card"
      role="listitem"
    >
      <a
        href={fileState.objectURL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline truncate hover:text-blue-800"
        title={fileState.file.name}
      >
        {fileState.file.name}
      </a>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove(index);
          console.log('Remove clicked for index', index);
        }}
        className="self-end text-[10px] text-red-500 hover:text-red-700 font-bold"
        aria-label={`${t('tickets.removeAttachment')} ${fileState.file.name}`}
        type="button"
      >
        ✕ {t('tickets.remove')}
      </button>
    </div>
  );
};

/**
 * Main ReplyArea Component
 */
export const ReplyArea: React.FC<ReplyAreaProps> = ({
  emailAddress,
  subject: initialSubject,
  customerId,
  signature,
  threadEmailAddress,
  agentName,
  agentAvatarUrl,
  composeMode,
  onEmailSent
}) => {
  const { t } = useTranslation('dashboard');
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<RichTextEditorRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subject state - updates when the editable subject header changes
  const [subject, setSubject] = useState(initialSubject);

  useEffect(() => {
    const handleSubjectChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.subject) {
        // Use the agent-edited subject as-is (no RE: prefix added)
        setSubject(detail.subject);
      }
    };
    window.addEventListener('ticket-subject-changed', handleSubjectChange);
    return () => window.removeEventListener('ticket-subject-changed', handleSubjectChange);
  }, []);
  const uploadManagerRef = useRef<FileUploadManager>(new FileUploadManager());
  const rafIdRef = useRef<number | null>(null);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [containerHeight, setContainerHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const [replyHtml, setReplyHtml] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<FileUploadState[]>([]);
  const [postSendBehavior, setPostSendBehavior] = useState<PostSendBehavior>('back');
  const [ticketStatus, setTicketStatus] = useState<TicketStatus>('resolved'); // Default to resolved
  const [isInternalNote, setIsInternalNote] = useState(false); // Toggle between public reply and internal note

  // Refs for resize functionality
  const resizeStateRef = useRef({
    startY: 0,
    startHeight: 0
  });

  /**
   * Load saved state from localStorage on mount
   */
  useEffect(() => {
    const savedCollapsed = localStorage.getItem('replyAreaCollapsed') === 'true';
    const savedHeight = localStorage.getItem('replyAreaHeight');
    const savedBehavior = localStorage.getItem(AFTER_SEND_KEY) as PostSendBehavior | null;

    // In compose mode, always start expanded
    if (composeMode) {
      setIsCollapsed(false);
    } else {
      setIsCollapsed(savedCollapsed);
    }

    if (savedBehavior === 'stay' || savedBehavior === 'next' || savedBehavior === 'back') {
      setPostSendBehavior(savedBehavior);
    } else {
      setPostSendBehavior('back');
      localStorage.setItem(AFTER_SEND_KEY, 'back');
    }

    if (savedHeight) {
      const height = parseInt(savedHeight);
      if (height >= MIN_HEIGHT && height <= MAX_HEIGHT) {
        setContainerHeight(height);
      }
    }
  }, [composeMode]);

  const handleChangeBehavior = useCallback((value: string) => {
    const next = (value as PostSendBehavior);
    if (next !== 'stay' && next !== 'next' && next !== 'back') return;
    setPostSendBehavior(next);
    try {
      localStorage.setItem(AFTER_SEND_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const handleChangeStatus = useCallback((value: string) => {
    const validStatuses: TicketStatus[] = ['new', 'open', 'waiting', 'resolved'];
    if (validStatuses.includes(value as TicketStatus)) {
      setTicketStatus(value as TicketStatus);
    }
  }, []);

  /**
   * Listen for macro selection events
   */
  useEffect(() => {
    const handleMacroChosen = (e: Event) => {
      const customEvent = e as CustomEvent;
      const text = customEvent?.detail?.text || '';

      if (!text) return;

      // If reply area is collapsed, expand it first so the editor is mounted.
      setIsCollapsed(false);
      localStorage.setItem('replyAreaCollapsed', 'false');

      // Insert macro text into the rich text editor via ref.
      // Use a short delay to ensure the editor is mounted after expanding.
      setTimeout(() => {
        if (editorRef.current) {
          // Check if the macro text is already HTML (contains HTML tags)
          const hasHtmlTags = /<[^>]+>/.test(text);
          const macroHtml = hasHtmlTags 
            ? text  // Use as-is if already HTML
            : `<p>${text.replace(/\n/g, '<br>')}</p>`;  // Convert plain text to HTML
          editorRef.current.insertContent(macroHtml);
        }
      }, 50);
    };

    window.addEventListener('MacroChoosen', handleMacroChosen);
    return () => window.removeEventListener('MacroChoosen', handleMacroChosen);
  }, []);

  /**
   * Clean up file upload manager on unmount
   */
  useEffect(() => {
    return () => {
      uploadManagerRef.current.clear();
    };
  }, []);

  /**
   * Toggle collapse/expand
   */
  const handleToggleCollapse = useCallback(() => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    localStorage.setItem('replyAreaCollapsed', newCollapsed.toString());
  }, [isCollapsed]);

  /**
   * Start resize operation
   */
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (isCollapsed) return;

    e.preventDefault();
    setIsResizing(true);
    
    resizeStateRef.current = {
      startY: e.clientY,
      startHeight: containerRef.current?.offsetHeight || DEFAULT_HEIGHT
    };

    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [isCollapsed]);

  /**
   * Handle resize with throttled updates (optimized for performance)
   */
  useEffect(() => {
    if (!isResizing) return;

    let lastY = resizeStateRef.current.startY;

    const handleMouseMove = (e: MouseEvent) => {
      lastY = e.clientY;

      // Cancel previous frame if still pending
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }

      // Schedule update on next frame (throttles to ~60fps)
      rafIdRef.current = requestAnimationFrame(() => {
        const deltaY = resizeStateRef.current.startY - lastY;
        const newHeight = Math.min(
          Math.max(resizeStateRef.current.startHeight + deltaY, MIN_HEIGHT),
          MAX_HEIGHT
        );
        
        setContainerHeight(newHeight);
        rafIdRef.current = null;
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Save final height
      if (containerRef.current) {
        const finalHeight = containerRef.current.offsetHeight;
        localStorage.setItem('replyAreaHeight', finalHeight.toString());
      }

      // Cancel any pending frame
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Cancel any pending animation frame on cleanup
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isResizing]);

  /**
   * Handle file selection
   */
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const errors = uploadManagerRef.current.addFiles(Array.from(files));
    
    if (errors.length > 0) {
      setError(errors.join('\n'));
    }

    setAttachments(uploadManagerRef.current.getFileStates());
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  /**
   * Remove attachment
   */
  const handleRemoveAttachment = useCallback((index: number) => {
    console.log('[ReplyArea] Removing attachment at index:', index);
    uploadManagerRef.current.removeFile(index);
    const updatedStates = uploadManagerRef.current.getFileStates();
    console.log('[ReplyArea] Updated file states:', updatedStates);
    setAttachments([...updatedStates]);
  }, []);

  /**
   * Send email
   */
  const handleSend = async () => {
    setError(null);
    setIsSending(true);

    try {
      // Strip HTML to get plain text for validation
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = replyHtml;
      const plainText = (tempDiv.textContent || tempDiv.innerText || '').trim();
      const files = uploadManagerRef.current.getFiles();

      // If no content and no attachments, just update the status without sending an email
      if (plainText === '' && files.length === 0) {
        await apiClient.post(`/emails/updateStatus?customerId=${customerId}`, {
          status: ticketStatus
        });
        
        toast.success(t('tickets.statusUpdatedSuccess'));
        setTicketStatus('resolved'); // Reset to default for next reply
        
        // Callback or redirect
        if (onEmailSent) {
          onEmailSent();
        } else {
          const fromTableId = getOriginFromLocation();
          const effectiveBehavior: PostSendBehavior = composeMode ? 'stay' : postSendBehavior;

          if (effectiveBehavior === 'next') {
            const nextHref = fromTableId ? getNextTicketHref(fromTableId, String(customerId)) : null;
            if (nextHref) {
              window.location.href = nextHref;
            }
          } else if (effectiveBehavior === 'back') {
            const backHref = getBackHref(fromTableId);
            window.location.href = backHref;
          } else {
            // 'stay' - refresh page to update status badge
            window.location.reload();
          }
        }
        
        setIsSending(false);
        return;
      }

      // ---- Internal Note Path ----
      if (isInternalNote) {
        if (plainText === '') {
          setError(t('tickets.enterNoteContent'));
          setIsSending(false);
          return;
        }

        const response = await apiClient.post(`/emails/addInternalNote?customerId=${customerId}`, {
          text: plainText,
          html: replyHtml,
        });

        if (!response || !response.success) {
          setError(t('tickets.failedToSaveNote'));
          setIsSending(false);
          return;
        }

        toast.success(t('tickets.noteSavedSuccess'));

        // Clear state
        setReplyHtml('');
        if (editorRef.current) {
          editorRef.current.insertContent('');
        }

        // Optimistically add the note to the thread
        try {
          const optimisticNote = {
            id: `temp-note-${Date.now()}`,
            key: `internal_note-temp-note-${Date.now()}`,
            type: 'internal_note' as const,
            send_at: new Date().toISOString(),
            text_content: plainText,
            html_content: replyHtml,
            attachments: [],
            has_attachments: false,
            employee_id: 'me',
            agent_name: agentName || 'Support Agent',
            agent_avatar_url: agentAvatarUrl ?? null,
            is_internal_note: true as const,
          };
          window.dispatchEvent(
            new CustomEvent('TicketEmailSent', {
              detail: { customerId: String(customerId), email: optimisticNote },
            })
          );
        } catch {
          // ignore
        }

        setIsSending(false);
        return;
      }

      // ---- Public Reply Path ----

      // Validate email address format (only needed when sending email)
      if (!emailAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) {
        setError(t('tickets.invalidRecipientEmail'));
        setIsSending(false);
        return;
      }

      // Validate subject (only needed when sending email)
      if (!subject || subject.trim().length === 0) {
        setError(t('tickets.subjectRequired'));
        setIsSending(false);
        return;
      }

      // Build body with signature (both HTML and plain text)
      let fullBodyHtml = replyHtml;
      let fullBodyText = plainText;
      if (signature && signature.trim() !== '') {
        fullBodyHtml += `<br><br>${signature.replace(/\n/g, '<br>')}`;
        fullBodyText += `\n\n${signature}`;
      }

      // Create FormData for attachments
      const formData = new FormData();
      formData.append('to', emailAddress);
      formData.append('subject', subject);
      formData.append('text', fullBodyText);
      formData.append('html', fullBodyHtml);
      formData.append('threadEmailAddress', threadEmailAddress || '');
      formData.append('ticketStatus', ticketStatus); // Include status to set after sending

      files.forEach(file => {
        formData.append('attachments', file);
      });

      // Send email
      const response = await apiClient.postFormData(`/emails/sendMail?customerId=${customerId}`, formData);
      
      // Check if limit was reached
      if (response && typeof response === 'object' && 'limitReached' in response) {
        const limitType = response.limitType || 'emails';
        if (limitType === 'users') {
          setError(t('tickets.userLimitExceeded'));
        } else {
          setError(t('tickets.emailLimitReached'));
        }
        setIsSending(false);
        return;
      }

      // Status is now updated as part of sendMail endpoint
      // No need for separate makeRead call

      toast.success(t('tickets.emailSentSuccess'));

      // Clear state only on success
      uploadManagerRef.current.clear();
      setAttachments([]);
      setReplyHtml('');
      setTicketStatus('resolved'); // Reset to default for next reply
      
      // Callback or redirect
      if (onEmailSent) {
        onEmailSent();
      } else {
        const fromTableId = getOriginFromLocation();
        const effectiveBehavior: PostSendBehavior = composeMode ? 'stay' : postSendBehavior;

        if (effectiveBehavior === 'stay') {
          // Optimistically add the sent message to the current thread.
          try {
            const optimisticSentEmail = {
              id: `temp-sent-${Date.now()}`,
              type: 'sent' as const,
              send_at: new Date().toISOString(),
              text_content: fullBodyText,
              html_content: fullBodyHtml,
              attachments: [],
              has_attachments: false,
              employee_id: 'me',
              agent_name: agentName || 'Support Agent',
              agent_avatar_url: agentAvatarUrl ?? null,
            };
            window.dispatchEvent(
              new CustomEvent('TicketEmailSent', {
                detail: { customerId: String(customerId), email: optimisticSentEmail },
              })
            );
          } catch {
            // ignore
          }
          // do nothing
          setIsSending(false);
          return;
        }

        if (effectiveBehavior === 'next' && fromTableId) {
          const nextHref = getNextTicketHref(fromTableId, String(customerId));
          if (nextHref) {
            window.location.href = nextHref;
            return;
          }
          // fall back to back if no next
        }

        window.location.href = getBackHref(fromTableId);
      }
    } catch (err) {
      console.error('[ReplyArea] Send failed:', err);
      setError(err instanceof Error ? err.message : t('tickets.failedToSendEmail'));
      setIsSending(false);
      // Don't clear form on error so user doesn't lose their message
    }
  };

  const effectiveHeight = isCollapsed ? COLLAPSED_HEIGHT : containerHeight;

  return (
    <div
      ref={containerRef}
      className="border-t bg-card flex flex-col"
      style={{ minHeight: `${COLLAPSED_HEIGHT}px`, height: `${effectiveHeight}px` }}
      role="region"
      aria-label={t('tickets.emailReplyArea')}
    >
      {/* Resize Handle */}
      <div
        className="h-1.5 bg-border hover:bg-primary cursor-ns-resize transition-colors relative group shrink-0"
        onMouseDown={handleResizeStart}
        title={t('tickets.dragToResize')}
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('tickets.resizeReplyArea')}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' && !isCollapsed) {
            setContainerHeight(prev => Math.min(prev + 20, MAX_HEIGHT));
          } else if (e.key === 'ArrowDown' && !isCollapsed) {
            setContainerHeight(prev => Math.max(prev - 20, MIN_HEIGHT));
          }
        }}
      >
        <div className="absolute inset-x-0 -top-2 -bottom-2" aria-hidden="true"></div>
      </div>

      {/* Header with Collapse Button and Mode Toggle */}
      <div className="flex items-center justify-between px-6 pt-3 pb-2 shrink-0">
        <div className="flex items-center gap-3">
          <label htmlFor="reply-textarea" className="text-sm font-medium leading-none">
            {isInternalNote ? t('tickets.internalNote') : t('tickets.yourReply')}
          </label>
          {/* Public Reply / Internal Note Toggle */}
          <div className="flex items-center rounded-md border bg-muted p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setIsInternalNote(false)}
              className={`cursor-pointer px-2.5 py-1 rounded transition-colors font-medium ${
                !isInternalNote
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={!isInternalNote}
            >
              {t('tickets.publicReply')}
            </button>
            <button
              type="button"
              onClick={() => setIsInternalNote(true)}
              className={`cursor-pointer px-2.5 py-1 rounded transition-colors font-medium ${
                isInternalNote
                  ? 'bg-amber-200 text-amber-900 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={isInternalNote}
            >
              {t('tickets.internalNote')}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggleCollapse}
          className="inline-flex cursor-pointer items-center justify-center h-8 w-8 rounded-md hover:bg-accent transition-colors"
          title={isCollapsed ? t('tickets.expandReplyArea') : t('tickets.collapseReplyArea')}
          aria-label={isCollapsed ? t('tickets.expandReplyArea') : t('tickets.collapseReplyArea')}
          aria-expanded={!isCollapsed}
        >
          <svg
            className={`h-4 w-4 transition-transform duration-200 ${isCollapsed ? 'rotate-180' : ''}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </button>
      </div>

      {/* Reply Content */}
      {!isCollapsed && (
        <div className="px-6 pb-4 flex-1 flex flex-col min-h-0">
          {error && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3 items-end h-full">
            <div className={`flex-1 h-full relative rounded-md transition-colors duration-200 ${
              isInternalNote ? 'ring-2 ring-amber-300 bg-amber-50/50' : ''
            }`}>
              <RichTextEditor
                ref={editorRef}
                id="reply-textarea"
                content={replyHtml}
                onContentChange={setReplyHtml}
                placeholder={isInternalNote ? t('tickets.typeInternalNote') : t('tickets.typeYourReply')}
                disabled={isSending}
                className={`w-full h-full min-h-0 ${isInternalNote ? '[&_.tiptap]:bg-amber-50/80' : ''}`}
              />
              
              {/* Floating Attachment Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending}
                className="absolute cursor-pointer bottom-2 left-2 h-8 w-8 rounded-full bg-primary/70 hover:bg-primary text-primary-foreground flex items-center justify-center transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed z-10"
                aria-label={t('tickets.addAttachments')}
                title={t('tickets.attachFiles')}
              >
                <svg
                  className="h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
                  />
                </svg>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                aria-label="File input"
              />
            </div>

            <div className="shrink-0 flex flex-col gap-2">
              {!composeMode && (
                <>
                  {/* Status dropdown - above navigation */}
                  <div className="w-44">
                    <Select value={ticketStatus} onValueChange={handleChangeStatus}>
                      <SelectTrigger aria-label={t('tickets.setStatus')}>
                        <SelectValue placeholder={t('tickets.statusPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${option.color}`} />
                              {t(option.labelKey)}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* After sending behavior dropdown */}
                  <div className="w-44">
                    <Select value={postSendBehavior} onValueChange={handleChangeBehavior}>
                      <SelectTrigger aria-label={t('tickets.afterSendBehavior')}>
                        <SelectValue placeholder={t('tickets.afterSendPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stay">{t('tickets.afterSend.stayInTicket')}</SelectItem>
                        <SelectItem value="next">{t('tickets.afterSend.goToNext')}</SelectItem>
                        <SelectItem value="back">{t('tickets.afterSend.goToInbox')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <Button
                onClick={handleSend}
                disabled={isSending}
                className="shrink-0 cursor-pointer"
                aria-label={isInternalNote ? t('tickets.saveNote') : t('tickets.sendReply')}
              >
              {isSending ? (
                <>
                  <svg 
                    className="mr-2 h-4 w-4 animate-spin" 
                    xmlns="http://www.w3.org/2000/svg" 
                    fill="none" 
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {isInternalNote ? t('tickets.savingNote') : t('tickets.sending')}
                </>
              ) : (
                <>
                  {isInternalNote ? (
                    <svg
                      className="mr-2 h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="mr-2 h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                      />
                    </svg>
                  )}
                  {isInternalNote ? t('tickets.saveNote') : t('tickets.sendReply')}
                </>
              )}
              </Button>
            </div>
          </div>

          {/* File Upload Section - Attachments List */}
          {attachments.length > 0 && (
            <div className="mt-3">
              <div 
                className="flex gap-3 flex-wrap"
                role="list"
                aria-label={t('tickets.selectedAttachments')}
              >
                {attachments.map((fileState, index) => (
                  <AttachmentPreviewItem
                    key={fileState.objectURL}
                    fileState={fileState}
                    index={index}
                    onRemove={handleRemoveAttachment}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
