/**
 * Authorization Middleware
 * Verifies that authenticated users have permission to access specific resources
 * 
 * These middleware functions should be used AFTER the authenticate middleware
 */

const supabase = require('../config/supabase');
const logger = require('../utils/logger');

/**
 * Verify that the user's client_id matches the requested client_id
 * Prevents users from accessing other clients' data
 * 
 * Expects client_id in query params or request body
 */
function authorizeClient(req, res, next) {
  const requestedClientId = req.query.client_id || req.body.client_id;
  const userClientId = req.user?.client_id;

  if (!userClientId) {
    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'User not associated with any client' 
    });
  }

  // Convert both to numbers for comparison
  if (parseInt(requestedClientId) !== parseInt(userClientId)) {
    logger.warn('[AUTHZ] Client access denied', {
      user_client_id: userClientId,
      requested_client_id: requestedClientId,
      employee_id: req.user?.employee_id
    });
    
    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'You do not have permission to access this client\'s data' 
    });
  }

  next();
}

/**
 * Verify that a customer belongs to the authenticated user's client
 * Used when accessing customer-specific data
 * 
 * Expects customerId in query params
 */
async function authorizeCustomerAccess(req, res, next) {
  try {
    const customerId = req.query.customerId || req.body.customerId;
    const userClientId = req.user?.client_id;

    if (!customerId) {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: 'customerId is required' 
      });
    }

    if (!userClientId) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'User not associated with any client' 
      });
    }

    // Verify customer belongs to user's client
    const { data: customer, error } = await supabase
      .from('customers')
      .select('client_id')
      .eq('id', customerId)
      .single();

    if (error || !customer) {
      logger.error('[AUTHZ] Customer not found', { customerId });
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Customer not found' 
      });
    }

    if (customer.client_id !== userClientId) {
      logger.warn('[AUTHZ] Customer access denied', {
        customer_id: customerId,
        customer_client_id: customer.client_id,
        user_client_id: userClientId,
        employee_id: req.user?.employee_id
      });
      
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'You do not have permission to access this customer' 
      });
    }

    // Attach customer to request for route handler
    req.customer = customer;
    next();
  } catch (error) {
    logger.error('[AUTHZ] Customer authorization error', { error: error.message });
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Authorization check failed' 
    });
  }
}

/**
 * Verify that an employee belongs to the authenticated user's client
 * Used when accessing employee-specific data or performing admin actions
 * 
 * Expects employee_id in query params or body
 */
async function authorizeEmployeeAccess(req, res, next) {
  try {
    const targetEmployeeId = req.query.employee_id || req.body.employee_id;
    const userClientId = req.user?.client_id;

    if (!targetEmployeeId) {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: 'employee_id is required' 
      });
    }

    if (!userClientId) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'User not associated with any client' 
      });
    }

    // Verify employee belongs to user's client
    const { data: employee, error } = await supabase
      .from('employees')
      .select('client_id')
      .eq('id', targetEmployeeId)
      .single();

    if (error || !employee) {
      logger.error('[AUTHZ] Employee not found', { targetEmployeeId });
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Employee not found' 
      });
    }

    if (employee.client_id !== userClientId) {
      logger.warn('[AUTHZ] Employee access denied', {
        target_employee_id: targetEmployeeId,
        employee_client_id: employee.client_id,
        user_client_id: userClientId,
        requester_employee_id: req.user?.employee_id
      });
      
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'You do not have permission to access this employee' 
      });
    }

    next();
  } catch (error) {
    logger.error('[AUTHZ] Employee authorization error', { error: error.message });
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Authorization check failed' 
    });
  }
}

module.exports = {
  authorizeClient,
  authorizeCustomerAccess,
  authorizeEmployeeAccess
};