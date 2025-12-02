/**
 * Client Routes - SECURED
 * Handles client-related operations: employees, assignments
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
 * Get all employees for authenticated user's client
 * GET /api/client/getEmployees
 * 
 * Authentication: Required
 * Authorization: Automatically filtered by user's client_id
 */
router.get('/getEmployees', 
  authenticate,
  async (req, res) => {
    try {
      // Use client_id from authenticated user (secure - can't be spoofed)
      const client_id = req.user.client_id;
      
      console.log('[CLIENT] Fetching employees for client:', client_id);

      const { data, error } = await supabase
        .from("employees")
        .select("id, name")
        .eq("client_id", client_id)
        .order("name");

      if (error) {
        console.error('[CLIENT] Supabase error:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[CLIENT] Fetched', data.length, 'employees');
      res.json({success: true, data});
    } catch (err) {
      console.error('[CLIENT] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

/**
 * Assign employee to customer
 * POST /api/client/assignEmployee
 * Body: { employee_id, customer_id }
 * 
 * Authentication: Required
 * Authorization: Both employee and customer must belong to user's client
 */
router.post('/assignEmployee',
  authenticate,
  validateId('employee_id'),
  validateId('customer_id'),
  async (req, res) => {
    try {
      const employee_id = req.sanitized.employee_id;
      const customer_id = req.sanitized.customer_id;
      const client_id = req.user.client_id;

      console.log('[CLIENT] Assigning employee:', {
        employee_id,
        customer_id,
        client_id
      });

      // Verify employee belongs to user's client
      const { data: employee, error: employeeError } = await supabase
        .from('employees')
        .select('client_id')
        .eq('id', employee_id)
        .single();

      if (employeeError || !employee) {
        console.error('[CLIENT] Employee not found:', employee_id);
        return res.status(404).json({ error: 'Employee not found' });
      }

      if (employee.client_id !== client_id) {
        console.warn('[CLIENT] Unauthorized employee access attempt:', {
          employee_id,
          employee_client_id: employee.client_id,
          user_client_id: client_id
        });
        return res.status(403).json({ error: 'Employee does not belong to your client' });
      }

      // Verify customer belongs to user's client
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('client_id')
        .eq('id', customer_id)
        .single();

      if (customerError || !customer) {
        console.error('[CLIENT] Customer not found:', customer_id);
        return res.status(404).json({ error: 'Customer not found' });
      }

      if (customer.client_id !== client_id) {
        console.warn('[CLIENT] Unauthorized customer access attempt:', {
          customer_id,
          customer_client_id: customer.client_id,
          user_client_id: client_id
        });
        return res.status(403).json({ error: 'Customer does not belong to your client' });
      }

      // Both verified - proceed with assignment
      const { data, error } = await supabase
        .from('customers')
        .update({ employee_id: employee_id })
        .eq('id', customer_id);

      if (error) {
        console.error('[CLIENT] Assignment update failed:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[CLIENT] Successfully assigned employee', employee_id, 'to customer', customer_id);
      res.json({ success: true, data });
    } catch (err) {
      console.error('[CLIENT] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

module.exports = router;