/**
 * Activity Logger Service
 * 
 * Provides fire-and-forget audit logging for all agent/system actions.
 * All inserts use the service-role Supabase client (bypasses RLS).
 * Logging failures never block or fail parent requests.
 */

const supabase = require('../config/supabase');
const logger = require('../utils/logger');

/**
 * Action constants — use these instead of raw strings to prevent typos.
 * Each entry has { action, category }.
 */
/**
 * S9 fix: In-memory audit log failure metrics.
 * Operators can call getAuditMetrics() to monitor audit log health.
 */
const auditMetrics = {
  totalAttempts: 0,
  totalFailures: 0,
  lastFailureAt: null,
  lastFailureError: null,
  consecutiveFailures: 0,
};

const ACTIONS = {
  // Email
  EMAIL_SENT:                { action: 'email.sent',                  category: 'email' },
  INTERNAL_NOTE_ADDED:       { action: 'email.internal_note_added',   category: 'email' },

  // Ticket
  TICKET_STATUS_CHANGED:     { action: 'ticket.status_changed',       category: 'ticket' },
  TICKET_SUBJECT_CHANGED:    { action: 'ticket.subject_changed',      category: 'ticket' },
  TICKET_BULK_STATUS:        { action: 'ticket.bulk_status_changed',  category: 'ticket' },

  // Customer
  CUSTOMER_MERGED:           { action: 'customer.merged',             category: 'customer' },

  // Assignment
  EMPLOYEE_ASSIGNED:         { action: 'assignment.employee_assigned', category: 'assignment' },
  GROUP_ASSIGNED:            { action: 'assignment.group_assigned',    category: 'assignment' },
  UNASSIGNED:                { action: 'assignment.unassigned',        category: 'assignment' },
  BULK_ASSIGNED:             { action: 'assignment.bulk_assigned',     category: 'assignment' },
  BULK_UNASSIGNED:           { action: 'assignment.bulk_unassigned',   category: 'assignment' },
  BULK_REASSIGNED:           { action: 'assignment.bulk_reassigned',   category: 'assignment' },

  // Shopify
  SHOPIFY_CONNECTED:         { action: 'shopify.connected',            category: 'shopify' },
  SHOPIFY_DISCONNECTED:      { action: 'shopify.disconnected',         category: 'shopify' },
  SHOPIFY_REFUND_CREATED:    { action: 'shopify.refund_created',       category: 'shopify' },
  SHOPIFY_ORDER_CANCELLED:   { action: 'shopify.order_cancelled',      category: 'shopify' },

  // Settings
  SETTINGS_SIGNATURE:        { action: 'settings.signature_updated',           category: 'settings' },
  SETTINGS_EMAIL_CONFIG:     { action: 'settings.email_config_updated',        category: 'settings' },
  SETTINGS_CONFIRM_MAIL:     { action: 'settings.confirm_mail_updated',        category: 'settings' },
  SETTINGS_TRACKING:         { action: 'settings.tracking_updated',            category: 'settings' },
  SETTINGS_GENERAL:          { action: 'settings.general_updated',             category: 'settings' },
  SETTINGS_CONFIRM_MODE:     { action: 'settings.confirm_mail_mode_updated',   category: 'settings' },
  SETTINGS_AUTO_ASSIGN:      { action: 'settings.auto_assign_toggle',          category: 'settings' },

  // Employee management
  EMPLOYEE_CREATED:          { action: 'employee.created',             category: 'employee_mgmt' },
  EMPLOYEE_UPDATED:          { action: 'employee.updated',             category: 'employee_mgmt' },
  EMPLOYEE_DELETED:          { action: 'employee.deleted',             category: 'employee_mgmt' },
  EMPLOYEE_DISABLED:         { action: 'employee.disabled',            category: 'employee_mgmt' },
  EMPLOYEE_ENABLED:          { action: 'employee.enabled',             category: 'employee_mgmt' },
  EMPLOYEE_PROFILE_UPDATED:  { action: 'employee.profile_updated',    category: 'employee_mgmt' },

  // Company
  COMPANY_UPDATED:           { action: 'company.updated',              category: 'settings' },

  // Macros
  MACRO_CREATED:             { action: 'macro.created',                category: 'macro' },
  MACRO_UPDATED:             { action: 'macro.updated',                category: 'macro' },
  MACRO_DELETED:             { action: 'macro.deleted',                category: 'macro' },
  MACRO_GROUP_DELETED:       { action: 'macro.group_deleted',          category: 'macro' },

  // Groups
  GROUP_CREATED:             { action: 'group.created',                category: 'group' },
  GROUP_UPDATED:             { action: 'group.updated',                category: 'group' },
  GROUP_DELETED:             { action: 'group.deleted',                category: 'group' },
  GROUP_MEMBER_ADDED:        { action: 'group.member_added',           category: 'group' },
  GROUP_MEMBER_REMOVED:      { action: 'group.member_removed',        category: 'group' },

  // Inboxes
  INBOX_CREATED:             { action: 'inbox.created',                category: 'inbox' },
  INBOX_UPDATED:             { action: 'inbox.updated',                category: 'inbox' },
  INBOX_DELETED:             { action: 'inbox.deleted',                category: 'inbox' },
  INBOX_GROUP_ADDED:         { action: 'inbox.group_added',            category: 'inbox' },
  INBOX_GROUP_REMOVED:       { action: 'inbox.group_removed',         category: 'inbox' },
  INBOX_FILTERS_SET:         { action: 'inbox.filters_set',            category: 'inbox' },

  // Email accounts
  EMAIL_ACCOUNT_ADDED:       { action: 'email_account.added',         category: 'email_account' },
  EMAIL_ACCOUNT_UPDATED:     { action: 'email_account.updated',       category: 'email_account' },
  EMAIL_ACCOUNT_DELETED:     { action: 'email_account.deleted',       category: 'email_account' },

  // Billing
  CHECKOUT_CREATED:          { action: 'billing.checkout_created',          category: 'billing' },
  SUBSCRIPTION_COMPLETED:    { action: 'billing.subscription_completed',    category: 'billing' },

  // Auth
  SIGNED_IN:                 { action: 'auth.signed_in',               category: 'auth' },
  SIGNED_OUT:                { action: 'auth.signed_out',              category: 'auth' },
};

/**
 * Log an activity entry. Fire-and-forget — never throws.
 *
 * @param {Object} params
 * @param {number} params.clientId - Client (tenant) ID
 * @param {number|null} params.employeeId - Acting employee ID (null for system actions)
 * @param {string} params.action - Dotted action string (use ACTIONS constants)
 * @param {string} params.category - Category string (use ACTIONS constants)
 * @param {string} [params.targetType] - Entity type affected
 * @param {string} [params.targetId] - ID of the affected entity
 * @param {Object} [params.details] - Action-specific payload
 * @param {string} [params.ipAddress] - Client IP address
 */
function logActivity({ clientId, employeeId, action, category, targetType, targetId, details, ipAddress }) {
  if (!clientId || !action || !category) {
    logger.warn('[ACTIVITY] Missing required fields for activity log', { clientId, action, category });
    return;
  }

  const row = {
    client_id: clientId,
    employee_id: employeeId || null,
    action,
    category,
    target_type: targetType || null,
    target_id: targetId ? String(targetId) : null,
    details: details || null,
    ip_address: ipAddress || null,
  };

  auditMetrics.totalAttempts++;

  supabase
    .from('activity_log')
    .insert(row)
    .then(({ error }) => {
      if (error) {
        auditMetrics.totalFailures++;
        auditMetrics.consecutiveFailures++;
        auditMetrics.lastFailureAt = new Date().toISOString();
        auditMetrics.lastFailureError = error.message;
        logger.error('[ACTIVITY] Failed to insert activity log', { error: error.message, row });
        if (auditMetrics.consecutiveFailures > 10) {
          logger.error('[AUDIT_HEALTH_CRITICAL] Audit log has failed more than 10 consecutive inserts', {
            consecutiveFailures: auditMetrics.consecutiveFailures,
            lastError: error.message,
          });
        }
      } else {
        auditMetrics.consecutiveFailures = 0;
      }
    })
    .catch((err) => {
      auditMetrics.totalFailures++;
      auditMetrics.consecutiveFailures++;
      auditMetrics.lastFailureAt = new Date().toISOString();
      auditMetrics.lastFailureError = err.message;
      logger.error('[ACTIVITY] Unexpected error inserting activity log', { error: err.message });
      if (auditMetrics.consecutiveFailures > 10) {
        logger.error('[AUDIT_HEALTH_CRITICAL] Audit log has failed more than 10 consecutive inserts', {
          consecutiveFailures: auditMetrics.consecutiveFailures,
          lastError: err.message,
        });
      }
    });
}

/**
 * Convenience wrapper that extracts clientId, employeeId, and ipAddress from req.
 *
 * @param {Object} req - Express request with req.user populated by auth middleware
 * @param {Object} params - Same as logActivity minus clientId/employeeId/ipAddress
 */
function logFromReq(req, { action, category, targetType, targetId, details }) {
  const clientId = req.user?.client_id;
  const employeeId = req.user?.employee_id;
  const ipAddress = req.ip || req.connection?.remoteAddress || null;

  logActivity({ clientId, employeeId, action, category, targetType, targetId, details, ipAddress });
}

/**
 * Returns a snapshot of the audit log metrics.
 */
function getAuditMetrics() {
  return { ...auditMetrics };
}

module.exports = { logActivity, logFromReq, ACTIONS, getAuditMetrics };
