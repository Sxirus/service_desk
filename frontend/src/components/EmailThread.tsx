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
      const message = err instanceof Error ? err.message : 'Failed to load attachment';
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
  /**
   * Handles download of the previewed image
   */
  const handleDownload = async () => {
    try {
      await downloadAttachment(url, filename);
    } catch (err) {
      console.error('[ImagePreview] Download failed:', err);
      alert('Download failed. Please try again.');
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
              Download
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
}

const EmailMessage: React.FC<EmailMessageProps> = ({ email, customerName, onPreview }) => {
  const isOutgoing = email.type === 'sent';
  const [showHtml, setShowHtml] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Check if this email has significant HTML (only for incoming emails)
  const hasHtml = email.type === 'incoming' && hasSignificantHtml(email.html_content);

  // Get agent name and avatar for sent emails
  const agentName = isOutgoing && email.type === 'sent' ? email.agent_name || 'Support Agent' : null;
  const agentAvatarPath = isOutgoing && email.type === 'sent' ? email.agent_avatar_url : null;
  
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

  return (
    <article 
      className={`rounded-lg border shadow-sm ${
        isOutgoing 
          ? 'bg-blue-50 border-blue-200' 
          : 'bg-card border-border'
      }`}
      id={email.id}
      aria-label={`${isOutgoing ? 'Sent' : 'Received'} message from ${isOutgoing ? agentName : customerName}`}
    >
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
                  isOutgoing ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground'
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
                isOutgoing ? 'text-blue-900' : 'text-foreground'
              }`}>
                {isOutgoing ? agentName : customerName}
              </p>
              <p className="text-xs text-muted-foreground">
                {isOutgoing ? 'Support Agent' : 'Customer'}
              </p>
            </div>
          </div>
          <time className="text-xs text-muted-foreground" dateTime={email.send_at}>
            {formatDate(email.send_at)}
          </time>
        </header>

        {/* Message Body - With collapsible quoted replies */}
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
                Show less
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
                Show more
              </>
            )}
          </Button>
        )}

        {/* HTML View Toggle Button - Only show if email has significant HTML */}
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
                {showHtml ? 'Hide' : 'Show'} HTML Version
              </>
            </Button>
            
            {/* HTML Content Display */}
            {showHtml && email.type === 'incoming' && email.html_content && (
              <div 
                id={`html-content-${email.id}`}
                className="mt-3 p-4 border rounded-md bg-white overflow-auto max-h-96"
                role="region"
                aria-label="HTML version of email"
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
          </div>
        )}

        {/* Attachments */}
        {email.has_attachments && email.attachments.length > 0 && (
          <div className="mt-3" role="region" aria-label="Email attachments">
            <div className="flex flex-wrap gap-2">
              {email.attachments.map((attachment) => (
                <AttachmentButton
                  key={attachment.id}
                  attachment={attachment}
                  mailId={email.id}
                  mailType={email.type}
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
  const threadRef = useRef<HTMLDivElement>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; filename: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Auto-scroll to bottom on mount to show latest messages
   */
  useEffect(() => {
    if (threadRef.current) {
      // Use requestAnimationFrame to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        if (threadRef.current) {
          threadRef.current.scrollTop = threadRef.current.scrollHeight;
          console.log('[EmailThread] Auto-scrolled to bottom');
        }
      });
    }
  }, []);

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

  if (!emails || emails.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          No messages found in this conversation.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <div 
        ref={threadRef}
        className="flex-1 px-6 overflow-y-auto overflow-x-hidden"
        role="log"
        aria-label="Email conversation thread"
        aria-live="polite"
      >
        <div className="space-y-4 pb-4">
          {emails.map((email) => (
            <EmailMessage
              key={email.id}
              email={email}
              customerName={customer.name}
              onPreview={handlePreview}
            />
          ))}
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
