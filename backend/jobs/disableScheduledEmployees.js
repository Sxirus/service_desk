/**
 * Scheduled Employee Disable Job
 * 
 * This job runs periodically to disable employees whose scheduled_disable_at
 * date has passed. This is used for grace period handling after subscription
 * cancellations.
 * 
 * This can be run as:
 * - A cron job: node jobs/disableScheduledEmployees.js
 * - Part of the worker manager during startup
 * - Via Supabase Edge Functions or pg_cron
 */

const supabase = require('../config/supabase');
const logger = require('../utils/logger');

/**
 * Disable all employees whose scheduled_disable_at has passed
 * @returns {Promise<{success: boolean, disabled: number, errors: string[]}>}
 */
async function disableScheduledEmployees() {
  logger.info('[DisableJob] Starting scheduled employee disable check');
  
  const now = new Date().toISOString();
  const errors = [];
  
  try {
    // Find all employees with scheduled_disable_at in the past
    const { data: employees, error: fetchError } = await supabase
      .from('employees')
      .select('id, name, client_id, scheduled_disable_at')
      .lte('scheduled_disable_at', now)
      .eq('disabled', false);

    if (fetchError) {
      logger.error('[DisableJob] Error fetching employees:', { error: fetchError });
      return { success: false, disabled: 0, errors: [fetchError.message] };
    }

    if (!employees || employees.length === 0) {
      logger.info('[DisableJob] No employees to disable');
      return { success: true, disabled: 0, errors: [] };
    }

    logger.info(`[DisableJob] Found ${employees.length} employees to disable`);

    // Disable each employee
    const employeeIds = employees.map(e => e.id);
    
    const { error: updateError } = await supabase
      .from('employees')
      .update({ 
        disabled: true,
        scheduled_disable_at: null // Clear the schedule
      })
      .in('id', employeeIds);

    if (updateError) {
      logger.error('[DisableJob] Error disabling employees:', { error: updateError });
      errors.push(updateError.message);
    }

    // Group by client for logging
    const clientGroups = {};
    employees.forEach(e => {
      if (!clientGroups[e.client_id]) {
        clientGroups[e.client_id] = [];
      }
      clientGroups[e.client_id].push(e.name);
    });

    // Log for each client
    for (const [clientId, employeeNames] of Object.entries(clientGroups)) {
      logger.info(`[DisableJob] Disabled ${employeeNames.length} employees for client ${clientId}`, { employeeNames });
      
      // Create platform notification
      await supabase.from('platform_notifications').insert({
        type: 'employees_disabled',
        client_id: parseInt(clientId),
        title: 'Employees disabled',
        message: `${employeeNames.length} employees were disabled after the subscription cancellation grace period expired.`,
        metadata: {
          employee_count: employeeNames.length,
          employee_names: employeeNames,
          disabled_at: now,
        },
        read: false,
      });

      // Log to audit trail
      await supabase.from('platform_audit_log').insert({
        admin_id: null, // Automated job
        action: 'employees_auto_disabled',
        target_type: 'client',
        target_id: clientId,
        details: {
          employee_count: employeeNames.length,
          employee_ids: employeeIds.filter(id => 
            employees.find(e => e.id === id && e.client_id === parseInt(clientId))
          ),
          reason: 'subscription_ended',
        },
      });
    }

    logger.info(`[DisableJob] Successfully disabled ${employees.length} employees`);
    return { 
      success: true, 
      disabled: employees.length, 
      errors 
    };
  } catch (error) {
    logger.error('[DisableJob] Unexpected error:', { error });
    return { 
      success: false, 
      disabled: 0, 
      errors: [error.message] 
    };
  }
}

/**
 * Clear scheduled disables for a client (e.g., when reactivating subscription)
 * @param {number} clientId - The client ID
 */
async function clearScheduledDisables(clientId) {
  logger.info(`[DisableJob] Clearing scheduled disables for client ${clientId}`);
  
  const { error } = await supabase
    .from('employees')
    .update({ scheduled_disable_at: null })
    .eq('client_id', clientId)
    .not('scheduled_disable_at', 'is', null);

  if (error) {
    logger.error('[DisableJob] Error clearing scheduled disables:', { error });
    return { success: false, error: error.message };
  }

  return { success: true };
}

// If run directly as a script
if (require.main === module) {
  disableScheduledEmployees()
    .then(result => {
      logger.info('[DisableJob] Job completed', { result });
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      logger.error('[DisableJob] Job failed', { error: err });
      process.exit(1);
    });
}

module.exports = {
  disableScheduledEmployees,
  clearScheduledDisables,
};
