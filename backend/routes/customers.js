/**
 * Customer Routes - SECURED
 * Handles customer-related operations
 * 
 * All routes now protected with authentication and authorization
 */

const express = require('express');
const router = express.Router();
const supabase = require("../config/supabase");
const { authenticate } = require('../middleware/auth');
const { authorizeCustomerAccess, authorizeEmployeeAccess } = require('../middleware/authorization');
const { validateId } = require('../middleware/validation');

/**
 * Get customer by ID
 * GET /api/customers/getCustomerById?customerId=123
 * 
 * Authentication: Required
 * Authorization: Customer must belong to user's client
 */
router.get('/getCustomerById',
  authenticate,
  validateId('customerId'),
  async (req, res) => {
    try {
      const customerId = req.sanitized.customerId;
      const client_id = req.user.client_id;

      console.log('[CUSTOMERS] Fetching customer:', customerId);

      // Fetch customer and verify it belongs to user's client
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq("id", customerId)
        .single();

      if (error) {
        console.error('[CUSTOMERS] Supabase error:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      if (!data) {
        console.warn('[CUSTOMERS] Customer not found:', customerId);
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Verify customer belongs to user's client
      if (data.client_id !== client_id) {
        console.warn('[CUSTOMERS] Unauthorized access attempt:', {
          customer_id: customerId,
          customer_client_id: data.client_id,
          user_client_id: client_id,
          employee_id: req.user.employee_id
        });
        return res.status(403).json({ error: 'Access denied to this customer' });
      }

      console.log('[CUSTOMERS] Customer fetched successfully');
      res.json({success: true, data: [data]}); // Return as array to match original API format
    } catch (err) {
      console.error('[CUSTOMERS] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

/**
 * Get all customers assigned to an employee
 * GET /api/customers/getAssignedCustomers?employee_id=123
 * 
 * Authentication: Required
 * Authorization: Employee must belong to user's client
 * 
 * Note: If no employee_id provided, returns customers for authenticated user
 */
router.get('/getAssignedCustomers',
  authenticate,
  validateId('employee_id', { required: false }),
  async (req, res) => {
    try {
      // If employee_id provided, use it; otherwise use authenticated user's employee_id
      const employee_id = req.sanitized.employee_id || req.user.employee_id;
      const client_id = req.user.client_id;

      console.log('[CUSTOMERS] Fetching assigned customers for employee:', employee_id);

      // If employee_id was provided (not the authenticated user's), verify it belongs to same client
      if (req.sanitized.employee_id && req.sanitized.employee_id !== req.user.employee_id) {
        const { data: employee, error: employeeError } = await supabase
          .from('employees')
          .select('client_id')
          .eq('id', employee_id)
          .single();

        if (employeeError || !employee) {
          console.error('[CUSTOMERS] Employee not found:', employee_id);
          return res.status(404).json({ error: 'Employee not found' });
        }

        if (employee.client_id !== client_id) {
          console.warn('[CUSTOMERS] Unauthorized employee access attempt:', {
            requested_employee_id: employee_id,
            employee_client_id: employee.client_id,
            user_client_id: client_id
          });
          return res.status(403).json({ error: 'Access denied to this employee' });
        }
      }

      // Fetch customers assigned to this employee
      const { data, error } = await supabase
        .from('customers')
        .select('id')
        .eq('employee_id', employee_id);

      if (error) {
        console.error('[CUSTOMERS] Supabase error:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[CUSTOMERS] Fetched', data.length, 'assigned customers');
      res.json({success: true, data: data});
    } catch (err) {
      console.error('[CUSTOMERS] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

/**
 * Get all customers for authenticated user's client
 * GET /api/customers/getAllCustomers
 * 
 * Authentication: Required
 * Authorization: Automatically filtered by user's client_id
 * 
 * This is a new endpoint to get all customers (not just assigned ones)
 */
router.get('/getAllCustomers',
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;

      console.log('[CUSTOMERS] Fetching all customers for client:', client_id);

      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('client_id', client_id)
        .order('name');

      if (error) {
        console.error('[CUSTOMERS] Supabase error:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[CUSTOMERS] Fetched', data.length, 'customers');
      res.json({success: true, data});
    } catch (err) {
      console.error('[CUSTOMERS] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

module.exports = router;