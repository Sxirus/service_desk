/**
 * EmailThread Component
 * 
 * Displays a chronological thread of emails between customer and support.
 * Features:
 * - Auto-scrolls to latest message on mount
 * - Shows attachments with preview and download
 * - Accessible keyboard navigation
 * - Error boundaries for failed renders
 * - XSS protection with DOMPurify
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'isomorphic-dompurify';
import { formatDate } from '@/utils/formatDate.js';
import { useAvatarUrl } from '@/hooks/use-avatar';
import {
  getAttachmentSignedUrl,
  downloadAttachment,
  isImageMimeType
} from '@/utils/attachmentManager';
import type { EmailThreadProps, ThreadEmail, EmailAttachment } from '@/types/ticket.types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ParsedEmailContent } from '@/components/ParsedEmailContent';
import { hasQuotedContent } from '@/utils/emailQuoteParser';
import { NewMessageSeparator } from '@/components/NewMessageSeparator';

/**
 * Individual attachment button component
 */
interface AttachmentButtonProps {
  attachment: EmailAttachment;
  mailId: string;
  mailType: 'incoming' | 'sent';
  onPreview: (url: string, filename: string) => void;
}

const AttachmentButton: React.FC<AttachmentButtonProps> = ({ 
  attachment, 
  mailId, 
  mailType,
  onPreview 
}) => {
  const { t } = useTranslation('dashboard');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Handles attachment click - opens preview or downloads
   */
  const handleClick = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const storage = mailType === 'incoming' ? 'mail-attachments' : 'sent-attachments';
      const url = await getAttachmentSignedUrl(attachment.object_path, storage);

      if (isImageMimeType(attachment.mime_type)) {
        onPreview(url, attachment.filename);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('tickets.failedToLoadAttachment');
      setError(message);
      console.error('[AttachmentButton] Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="inline-block">
      <button
        className="inline-flex items-center gap-2 rounded-md bg-accent px-2.5 py-1 text-xs hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title={`Open: ${attachment.filename}`}
        onClick={handleClick}
        disabled={isLoading}
        aria-label={`View attachment ${attachment.filename}`}
      >
        {isLoading ? '⏳' : '📎'} {attachment.filename}
      </button>
      {error && (
        <p className="text-xs text-red-600 mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

/**
 * Image preview modal component
 */
interface ImagePreviewProps {
  url: string;
  filename: string;
  onClose: () => void;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ url, filename, onClose }) => {
  const { t } = useTranslation('dashboard');

  /**
   * Handles download of the previewed image
   */
  const handleDownload = async () => {
    try {
      await downloadAttachment(url, filename);
    } catch (err) {
      console.error('[ImagePreview] Download failed:', err);
      alert(t('tickets.downloadFailed'));
    }
  };

  /**
   * Closes preview on Escape key
   */
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${filename}`}
    >
      <div 
        className="bg-white rounded-lg shadow-xl max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b">
          <span className="text-sm font-medium text-gray-700 truncate pr-4">
            {filename}
          </span>
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownload}
              aria-label="Download attachment"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-4 w-4 mr-1" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor" 
                strokeWidth="2"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M20 20H4"/>
              </svg>
              {t('tickets.download')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              aria-label="Close preview"
            >
              ✕
            </Button>
          </div>
        </div>

        {/* Image */}
        <div className="flex-1 overflow-auto bg-gray-50 flex items-center justify-center">
          <img
            src={url}
            alt={filename}
            className="max-w-full max-h-full object-contain"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  );
};

/**
 * Checks if HTML content has significant HTML tags beyond basic formatting
 * Uses regex patterns to work in both server and client environments
 * Requires substantial HTML content to avoid false positives
 */
const hasSignificantHtml = (htmlContent: string | undefined): boolean => {
  if (!htmlContent) return false;
  
  // Remove simple wrappers like <div dir="ltr"><br></div>, <p><br></p>, etc.
  const cleanedHtml = htmlContent
    .replace(/<div[^>]*>\s*<br\s*\/?>\s*<\/div>/gi, '')
    .replace(/<p[^>]*>\s*<br\s*\/?>\s*<\/p>/gi, '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // If there's very little content left, it's not significant
  if (cleanedHtml.length < 50) return false;
  
  // Check for tables (very significant)
  if (/<table[>\s]/i.test(htmlContent)) return true;
  
  // Check for images (very significant)
  if (/<img[>\s]/i.test(htmlContent)) return true;
  
  // Check for headings (significant)
  if (/<h[1-6][>\s]/i.test(htmlContent)) return true;
  
  // Check for multiple divs or spans with styling (indicates complex layout)
  const styledDivSpanCount = (htmlContent.match(/<(div|span)[^>]+(style|class)=/gi) || []).length;
  if (styledDivSpanCount >= 3) return true;
  
  // Check for font tags (old-school HTML emails)
  const fontTagCount = (htmlContent.match(/<font[>\s]/gi) || []).length;
  if (fontTagCount >= 2) return true;
  
  // Check for complex lists or blockquotes
  if (/<(ul|ol)[>\s].*<li/is.test(htmlContent) && /<li[^>]*>/gi.test(htmlContent)) {
    const listItems = (htmlContent.match(/<li[^>]*>/gi) || []).length;
    if (listItems >= 3) return true;
  }
  
  if (/<blockquote[>\s]/i.test(htmlContent)) return true;
  
  return false;
};

/**
 * Individual email message component
 */
interface EmailMessageProps {
  email: ThreadEmail;
  customerName: string;
  onPreview: (url: string, filename: string) => void;
  /** Indicates this is a new unread incoming message (shows red highlight + badge) */
  isNew?: boolean;
}

const EmailMessage: React.FC<EmailMessageProps> = ({ email, customerName, onPreview, isNew = false }) => {
  const { t } = useTranslation('dashboard');
  const isOutgoing = email.type === 'sent' || email.type === 'internal_note';
  const isInternalNote = email.type === 'internal_note' || (email.type === 'sent' && 'is_internal_note' in email && email.is_internal_note);
  const [showHtml, setShowHtml] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Check if this email has significant HTML (only relevant for incoming emails)
  const hasHtml = hasSignificantHtml(email.html_content);

  // Get agent name and avatar for sent emails
  const agentName = isOutgoing && (email.type === 'sent' || email.type === 'internal_note') ? email.agent_name || t('tickets.supportAgent') : null;
  const agentAvatarPath = isOutgoing && (email.type === 'sent' || email.type === 'internal_note') ? email.agent_avatar_url : null;
  
  // Resolve avatar URL from private storage path
  const { url: agentAvatarUrl } = useAvatarUrl(agentAvatarPath);
  
  // Generate initials for avatar fallback
  const getInitials = (name: string) => {
    if (!name) return 'SA';
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase() || 'SA';
  };

  // Check if content is long (more than 1500 characters or 25 lines)
  // Skip truncation for emails with quoted content (quotes are already collapsible)
  const MAX_CHARS = 1500;
  const MAX_LINES = 25;
  const textContent = email.text_content || '';
  const lineCount = (textContent.match(/\n/g) || []).length + 1;
  const emailHasQuotes = hasQuotedContent(textContent);
  const isLongContent = !emailHasQuotes && (textContent.length > MAX_CHARS || lineCount > MAX_LINES);
  
  // Truncate content if needed (never truncate emails with quotes)
  const getTruncatedContent = () => {
    if (emailHasQuotes || !isLongContent || isExpanded) return textContent;
    
    // Find a good truncation point
    let truncateAt = MAX_CHARS;
    const lines = textContent.split('\n');
    if (lines.length > MAX_LINES) {
      truncateAt = lines.slice(0, MAX_LINES).join('\n').length;
    }
    truncateAt = Math.min(truncateAt, MAX_CHARS);
    
    // Try to truncate at a word boundary
    const truncated = textContent.substring(0, truncateAt);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > truncateAt - 50) {
      return truncated.substring(0, lastSpace) + '...';
    }
    return truncated + '...';
  };

  // Determine article styling based on message type
  const getArticleStyles = () => {
    if (isInternalNote) {
      return 'bg-amber-50 border-amber-300';
    }
    if (isOutgoing) {
      return 'bg-blue-50 border-blue-200';
    }
    return 'bg-card border-border';
  };

  return (
    <article
      className={`rounded-lg border shadow-sm transition-all duration-300 relative ${getArticleStyles()}`}
      id={email.id}
      aria-label={`${isInternalNote ? t('tickets.internalNote') + ' ' : ''}${isOutgoing ? t('tickets.sentMessage') : t('tickets.receivedMessage')} ${isOutgoing ? agentName : customerName}`}
    >
      {/* Unread Badge - Top Right Corner */}
      {isNew && (
        <div className="absolute -top-2 -right-2 z-10">
          <div className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-md">
            {t('tickets.new')}
          </div>
        </div>
      )}
      <div className="p-4">
        {/* Message Header */}
        <header className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {/* Avatar */}
            {isOutgoing && agentAvatarUrl ? (
              <img 
                src={agentAvatarUrl} 
                alt={agentName || 'Agent'} 
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div 
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                  isInternalNote ? 'bg-amber-500 text-white' : isOutgoing ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground'
                }`}
                aria-hidden="true"
              >
                {isOutgoing ? getInitials(agentName || '') : (
                  <svg
                    className="h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                    />
                  </svg>
                )}
              </div>
            )}
            <div>
              <p className={`text-sm font-semibold ${
                isInternalNote ? 'text-amber-900' : isOutgoing ? 'text-blue-900' : 'text-foreground'
              }`}>
                {isOutgoing ? agentName : customerName}
              </p>
              <p className="text-xs text-muted-foreground">
                {isInternalNote ? t('tickets.internalNote') : isOutgoing ? t('tickets.supportAgent') : t('tickets.customer')}
              </p>
            </div>
          </div>
          <time className="text-xs text-muted-foreground" dateTime={email.send_at}>
            {formatDate(email.send_at)}
          </time>
        </header>

        {/* Message Body - Sent emails show HTML directly, incoming shows text with optional HTML toggle */}
        {isOutgoing && email.html_content ? (
          // Sent emails: HTML is the primary content (matching text email styling)
          <div 
            className="text-sm text-foreground overflow-auto"
            style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
            dangerouslySetInnerHTML={{ 
              __html: DOMPurify.sanitize(email.html_content, {
                ALLOWED_TAGS: [
                  'b', 'i', 'em', 'strong', 'a', 'br', 'p', 'ul', 'ol', 'li',
                  'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                  'table', 'thead', 'tbody', 'tr', 'td', 'th',
                  'img', 'blockquote', 'pre', 'code', 'hr', 'sup', 'sub'
                ],
                ALLOWED_ATTR: [
                  'href', 'title', 'target', 'src', 'alt', 'width', 'height',
                  'style', 'class', 'colspan', 'rowspan', 'align', 'valign'
                ],
                ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
              })
            }}
          />
        ) : (
          // Incoming emails: Text view with collapsible quoted replies
          <>
            <ParsedEmailContent textContent={getTruncatedContent()} />

            {/* Show More/Less Button for long emails */}
            {isLongContent && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-2 text-xs text-muted-foreground hover:text-foreground p-0 h-auto"
              >
                {isExpanded ? (
                  <>
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className="h-3 w-3 mr-1"
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor" 
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7"/>
                    </svg>
                    {t('tickets.showLess')}
                  </>
                ) : (
                  <>
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className="h-3 w-3 mr-1"
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor" 
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                    </svg>
                    {t('tickets.showMore')}
                  </>
                )}
              </Button>
            )}

            {/* HTML View Toggle Button - Only show for incoming emails with significant HTML */}
            {hasHtml && (
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowHtml(!showHtml)}
                  className="text-xs"
                  aria-expanded={showHtml}
                  aria-controls={`html-content-${email.id}`}
                >
                  <>
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className={`h-3 w-3 mr-1 transition-transform ${showHtml ? 'rotate-90' : ''}`}
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor" 
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                    </svg>
                    {showHtml ? t('tickets.hideHtmlVersion') : t('tickets.showHtmlVersion')}
                  </>
                </Button>
              </div>
            )}
            
            {/* HTML Content Display for incoming emails */}
            {showHtml && email.html_content && (
              <div 
                id={`html-content-${email.id}`}
                className="mt-3 p-4 border rounded-md bg-white overflow-auto max-h-96"
                role="region"
                aria-label={t('tickets.htmlVersionOfEmail')}
                dangerouslySetInnerHTML={{ 
                  __html: DOMPurify.sanitize(email.html_content, {
                    ALLOWED_TAGS: [
                      'b', 'i', 'em', 'strong', 'a', 'br', 'p', 'ul', 'ol', 'li',
                      'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                      'table', 'thead', 'tbody', 'tr', 'td', 'th',
                      'img', 'blockquote', 'pre', 'code', 'hr', 'sup', 'sub'
                    ],
                    ALLOWED_ATTR: [
                      'href', 'title', 'target', 'src', 'alt', 'width', 'height',
                      'style', 'class', 'colspan', 'rowspan', 'align', 'valign'
                    ],
                    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
                  })
                }}
              />
            )}
          </>
        )}

        {/* Attachments */}
        {email.has_attachments && email.attachments.length > 0 && (
          <div className="mt-3" role="region" aria-label="Email attachments">
            <div className="flex flex-wrap gap-2">
              {email.attachments.map((attachment, attachmentIndex) => (
                <AttachmentButton
                  key={`${email.key}-att-${attachment.id ?? attachmentIndex}`}
                  attachment={attachment}
                  mailId={email.id}
                  mailType={email.type === 'internal_note' ? 'sent' : email.type}
                  onPreview={onPreview}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
};

/**
 * Main EmailThread Component
 */
export const EmailThread: React.FC<EmailThreadProps> = ({
  emails,
  customer
}) => {
  const { t } = useTranslation('dashboard');
  const threadRef = useRef<HTMLDivElement>(null);
  const separatorRef = useRef<HTMLDivElement>(null);
  const hasScrolledToSeparator = useRef(false);
  const [threadEmails, setThreadEmails] = useState<ThreadEmail[]>(emails || []);
  const [previewImage, setPreviewImage] = useState<{ url: string; filename: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // State for new messages tracking
  const [newMessageIndex, setNewMessageIndex] = useState<number | null>(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  /**
   * Update emails when props change
   */
  useEffect(() => {
    setThreadEmails(emails || []);
  }, [emails]);
  
  /**
   * Determine where new messages start (based on read field)
   */
  useEffect(() => {
    if (!threadEmails || threadEmails.length === 0) return;
    
    // Find first incoming email that hasn't been read
    let firstNewIndex = null;
    for (let i = 0; i < threadEmails.length; i++) {
      const email = threadEmails[i];
      // Only check incoming emails for read status
      if (email.type === 'incoming' && !email.read) {
        firstNewIndex = i;
        break;
      }
    }
    
    setNewMessageIndex(firstNewIndex);
    setHasNewMessages(firstNewIndex !== null);
  }, [threadEmails]);

  /**
   * Handle initial scroll behavior:
   * - If there are new messages, scroll to the separator
   * - Otherwise, scroll to the bottom
   * Only runs once on initial mount when we have emails
   */
  useEffect(() => {
    if (hasScrolledToSeparator.current) return;
    if (!threadEmails || threadEmails.length === 0) return;
    if (!threadRef.current) return;
    
    // Wait for the DOM to be fully rendered
    const timeoutId = setTimeout(() => {
      if (hasScrolledToSeparator.current) return;
      
      if (hasNewMessages && separatorRef.current) {
        // Scroll to the separator
        separatorRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      } else if (threadRef.current) {
        // No new messages, scroll to bottom
        threadRef.current.scrollTop = threadRef.current.scrollHeight;
      }
      
      hasScrolledToSeparator.current = true;
    }, 150);
    
    return () => clearTimeout(timeoutId);
  }, [threadEmails, hasNewMessages]);

  /**
   * Auto-scroll to bottom when NEW emails are added (after initial load)
   * This handles the case when a new email comes in or when user sends a reply
   */
  useEffect(() => {
    // Skip if we haven't done the initial scroll yet
    if (!hasScrolledToSeparator.current) return;
    if (!threadRef.current) return;
    
    requestAnimationFrame(() => {
      if (!threadRef.current) return;
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    });
  }, [threadEmails.length]);

  /**
   * Listen for optimistic “sent email” events
   * When a reply is sent, also clear new message indicators
   */
  useEffect(() => {
    const handler = (e: Event) => {
      const evt = e as CustomEvent;
      const detail = evt?.detail as { customerId?: string; email?: ThreadEmail } | undefined;
      if (!detail?.customerId || !detail?.email) return;
      if (String(detail.customerId) !== String(customer.id)) return;
      
      // Add the sent email to the thread
      setThreadEmails((prev) => [...prev, detail.email!]);
      
      // Clear new message indicators since we've replied
      setHasNewMessages(false);
      setNewMessageIndex(null);
    };

    window.addEventListener('TicketEmailSent', handler);
    return () => window.removeEventListener('TicketEmailSent', handler);
  }, [customer.id]);

  /**
   * Handle image preview
   */
  const handlePreview = (url: string, filename: string) => {
    setPreviewImage({ url, filename });
  };

  /**
   * Close image preview
   */
  const handleClosePreview = () => {
    setPreviewImage(null);
  };

  if (!threadEmails || threadEmails.length === 0) {
    return (
      <div className="flex-1 px-6 flex items-center justify-center">
        <div className="text-center py-12">
          <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900">New Conversation</h3>
          <p className="text-gray-500 mt-1">Compose your first message to {customer.name} below.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div 
        ref={threadRef}
        className="flex-1 px-6 overflow-y-auto overflow-x-hidden"
        role="log"
        aria-label={t('tickets.emailConversationThread')}
        aria-live="polite"
      >
        <div className="space-y-4 pb-4">
          {threadEmails.map((email, index) => {
            // Insert separator before first new message
            const shouldShowSeparator =
              hasNewMessages &&
              newMessageIndex === index;
            
            return (
              <React.Fragment key={email.key}>
                {shouldShowSeparator && (
                  <div ref={separatorRef}>
                    <NewMessageSeparator
                      newMessageCount={threadEmails
                        .slice(newMessageIndex!)
                        .filter(e => e.type === 'incoming' && !e.read)
                        .length
                      }
                    />
                  </div>
                )}
                
                <EmailMessage
                  email={email}
                  customerName={customer.name}
                  onPreview={handlePreview}
                  isNew={hasNewMessages && index >= (newMessageIndex || 0) && email.type === 'incoming' && !email.read}
                />
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <ImagePreview
          url={previewImage.url}
          filename={previewImage.filename}
          onClose={handleClosePreview}
        />
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive" className="mx-6 mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </>
  );
};
