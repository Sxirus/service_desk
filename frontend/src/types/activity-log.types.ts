/**
 * Type definitions for the Activity Log feature.
 */

/**
 * Categories match the backend ACTIONS constants categories.
 */
export type ActivityCategory =
  | 'email'
  | 'ticket'
  | 'customer'
  | 'assignment'
  | 'shopify'
  | 'settings'
  | 'employee_mgmt'
  | 'macro'
  | 'group'
  | 'inbox'
  | 'email_account'
  | 'billing'
  | 'auth';

/**
 * A single activity log entry as returned by the API.
 */
export interface ActivityLogEntry {
  id: string;
  client_id: number;
  employee_id: number | null;
  action: string;
  category: ActivityCategory;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, any> | null;
  ip_address: string | null;
  created_at: string;
  /** Joined from employees table */
  employees: {
    id: number;
    name: string;
    avatar_url: string | null;
  } | null;
}

/**
 * Pagination metadata returned by the API.
 */
export interface ActivityLogPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Response shape from GET /api/activity-log.
 */
export interface ActivityLogResponse {
  success: boolean;
  data: ActivityLogEntry[];
  pagination: ActivityLogPagination;
  error?: string;
}
