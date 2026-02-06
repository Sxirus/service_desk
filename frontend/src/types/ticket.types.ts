/**
 * Type definitions for the ticket/customer detail view
 * 
 * These types provide type safety for email threads, attachments,
 * customer data, and all related entities in the ticket system.
 */

/**
 * Attachment metadata for incoming or sent emails
 */
export interface EmailAttachment {
  id: string;
  filename: string;
  mime_type: string;
  object_path: string;
  size?: number;
}

/**
 * Base email interface with common properties
 */
interface BaseEmail {
  id: string;
  send_at: string;
  text_content: string;
  attachments: EmailAttachment[];
  has_attachments: boolean;
}

/**
 * Ticket status lifecycle states
 */
export type TicketStatus = 'new' | 'open' | 'waiting' | 'resolved';

/**
 * Incoming email from customer
 */
export interface IncomingEmail extends BaseEmail {
  type: 'incoming';
  subject: string;
  html_content?: string;
  email_address: string;
  status: TicketStatus;
  read?: boolean; // Deprecated, kept for backwards compatibility
  received_by?: string;
  to_email_address?: string;
}

/**
 * Sent email from support agent
 */
export interface SentEmail extends BaseEmail {
  type: 'sent';
  employee_id: string;
  agent_name?: string;
  agent_avatar_url?: string | null;
  html_content?: string;
}

/**
 * Union type for all email types in the thread
 */
export type ThreadEmail = IncomingEmail | SentEmail;

/**
 * Customer information
 */
export interface Customer {
  id: string;
  name: string;
  client_id: string;
  employee_id: string | null;
  group_id?: number | null;
}

/**
 * Employee/Agent information
 */
export interface Employee {
  id: string;
  name: string;
}

/**
 * Macro for quick responses
 */
export interface Macro {
  id: string;
  title: string;
  text: string;
  client_id: string;
  group_id?: string;
}

/**
 * Macro group/category
 */
export interface MacroGroup {
  id: string;
  name: string;
  client_id: string;
}

/**
 * Client/company data with email configuration
 */
export interface ClientData {
  id: string;
  name: string;
  email_signature?: string;
  shopify_store_url?: string;
  shopify_access_token?: string;
  shopify_connected: boolean;
  shopify_scope?: string;
}

/**
 * Email sending mode configuration
 */
export type EmailSendingMode = 'primary' | 'thread-based';

/**
 * Client email configuration
 */
export interface ClientEmailConfig {
  email_sending_mode: EmailSendingMode;
  primary_email_id?: string;
  'client-emails'?: Array<{
    id: string;
    email_address: string;
  }>;
}

/**
 * Context for macro text interpolation
 */
export interface MacroContext {
  customerID: string;
  employeeName: string | null;
  customerFullName: string;
  customerFirstName: string;
  customerLastName: string;
  shopifyLastOrderNumber: string | null;
  customerEmail: string;
}

/**
 * Supabase session tokens for browser client
 */
export interface BrowserTokens {
  access: string;
  refresh: string;
}

/**
 * Props for new message separator component
 */
export interface NewMessageSeparatorProps {
  newMessageCount: number;
}

/**
 * Props for email thread component
 */
export interface EmailThreadProps {
  emails: ThreadEmail[];
  customer: Customer;
}

/**
 * Props for reply area component
 */
export interface ReplyAreaProps {
  emailAddress: string;
  subject: string;
  customerId: string;
  signature: string;
  threadEmailAddress: string | null;
  agentName?: string;
  agentAvatarUrl?: string | null;
  composeMode?: boolean;
  onEmailSent?: () => void;
}

/**
 * Props for ticket sidebar component
 */
export interface TicketSidebarProps {
  customer: Customer;
  emailAddress: string;
  shopifyConfig: {
    connected: boolean;
    customerId: string;
  };
  clientData: ClientData;
  macros: Macro[];
  macroGroups: MacroGroup[];
  employees: Array<{ title: string; text: string }>;
  assignedEmployeeName: string | null;
  macroContext: MacroContext;
}

/**
 * File upload state for attachments
 */
export interface FileUploadState {
  file: File;
  objectURL: string;
  uploadProgress?: number;
}

/**
 * Error state for UI components
 */
export interface ErrorState {
  hasError: boolean;
  message: string;
  details?: string;
}

/**
 * Loading state for async operations
 */
export interface LoadingState {
  isLoading: boolean;
  operation?: string;
}
