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
const { validateId, validateEmail, sanitizeText } = require('../middleware/validation');
const { logFromReq, ACTIONS } = require('../services/activityLogger');
const logger = require('../utils/logger');

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

      logger.info('[CUSTOMERS] Fetching customer', { customerId });

      // Fetch customer and verify it belongs to user's client
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq("id", customerId)
        .single();

      if (error) {
        logger.error('[CUSTOMERS] Supabase error', { error: error.message });
        return res.status(500).json({ error: 'Database error' });
      }

      if (!data) {
        logger.warn('[CUSTOMERS] Customer not found', { customerId });
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Verify customer belongs to user's client
      if (data.client_id !== client_id) {
        logger.warn('[CUSTOMERS] Unauthorized access attempt', {
          customer_id: customerId,
          customer_client_id: data.client_id,
          user_client_id: client_id,
          employee_id: req.user.employee_id
        });
        return res.status(403).json({ error: 'Access denied to this customer' });
      }

      logger.info('[CUSTOMERS] Customer fetched successfully');
      res.json({success: true, data: [data]}); // Return as array to match original API format
    } catch (err) {
      logger.error('[CUSTOMERS] Server error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
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

      logger.info('[CUSTOMERS] Fetching assigned customers for employee', { employee_id });

      // If employee_id was provided (not the authenticated user's), verify it belongs to same client
      if (req.sanitized.employee_id && req.sanitized.employee_id !== req.user.employee_id) {
        const { data: employee, error: employeeError } = await supabase
          .from('employees')
          .select('client_id')
          .eq('id', employee_id)
          .single();

        if (employeeError || !employee) {
          logger.error('[CUSTOMERS] Employee not found', { employee_id });
          return res.status(404).json({ error: 'Employee not found' });
        }

        if (employee.client_id !== client_id) {
          logger.warn('[CUSTOMERS] Unauthorized employee access attempt', {
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
        logger.error('[CUSTOMERS] Supabase error', { error: error.message });
        return res.status(500).json({ error: 'Database error' });
      }

      logger.info('[CUSTOMERS] Fetched assigned customers', { count: data.length });
      res.json({success: true, data: data});
    } catch (err) {
      logger.error('[CUSTOMERS] Server error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
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

      logger.info('[CUSTOMERS] Fetching all customers for client', { client_id });

      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('client_id', client_id)
        .order('name');

      if (error) {
        logger.error('[CUSTOMERS] Supabase error', { error: error.message });
        return res.status(500).json({ error: 'Database error' });
      }

      logger.info('[CUSTOMERS] Fetched customers', { count: data.length });
      res.json({success: true, data});
    } catch (err) {
      logger.error('[CUSTOMERS] Server error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * Find-or-create customer by email
 * POST /api/customers/upsertByEmail
 * Body: { email, name }
 *
 * Authentication: Required
 * Authorization: Customer is always scoped to authenticated user's client
 */
router.post(
  '/upsertByEmail',
  authenticate,
  validateEmail('email'),
  sanitizeText('name', { required: false, maxLength: 200 }),
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      const email = req.sanitized.email;
      const name = req.sanitized.name || null;

      // Email addresses are stored in "email-addresses".
      const { data: emailRow, error: emailErr } = await supabase
        .from('email-addresses')
        .select('customer_id, email_address')
        .eq('email_address', email)
        .maybeSingle();

      if (emailErr) {
        logger.error('[CUSTOMERS] Error finding email address', { error: emailErr });
        return res.status(500).json({ error: 'Database error' });
      }

      if (emailRow?.customer_id) {
        // Verify the customer belongs to the current client.
        const { data: existingCustomer, error: customerErr } = await supabase
          .from('customers')
          .select('id, client_id, name')
          .eq('id', emailRow.customer_id)
          .maybeSingle();

        if (customerErr) {
          logger.error('[CUSTOMERS] Error loading customer for email', { error: customerErr });
          return res.status(500).json({ error: 'Database error' });
        }

        if (!existingCustomer) {
          // Orphaned email row; treat as error.
          return res.status(500).json({ error: 'Database error' });
        }

        if (existingCustomer.client_id !== client_id) {
          return res.status(409).json({
            error: 'Conflict',
            message: 'This email address is already used by another customer',
          });
        }

        // Optionally update the name if the existing record has no name.
        if (name && (!existingCustomer.name || String(existingCustomer.name).trim() === '')) {
          await supabase
            .from('customers')
            .update({ name })
            .eq('id', existingCustomer.id);
        }

        return res.json({ success: true, customerId: existingCustomer.id, existed: true });
      }

      // Create a new customer record (unassigned) and a related email-addresses row.
      const newName = name || email;
      const { data: createdCustomer, error: createCustomerErr } = await supabase
        .from('customers')
        .insert({
          client_id,
          name: newName,
          employee_id: null,
        })
        .select('id')
        .single();

      if (createCustomerErr) {
        logger.error('[CUSTOMERS] Error creating customer', { error: createCustomerErr });
        return res.status(500).json({ error: 'Database error' });
      }

      const { error: createEmailErr } = await supabase
        .from('email-addresses')
        .insert({
          customer_id: createdCustomer.id,
          email_address: email,
        });

      if (createEmailErr) {
        logger.error('[CUSTOMERS] Error creating email address', { error: createEmailErr });
        return res.status(500).json({ error: 'Database error' });
      }

      return res.json({ success: true, customerId: createdCustomer.id, existed: false });
    } catch (err) {
      logger.error('[CUSTOMERS] Server error', { error: err.message });
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * Search customers by name or email (for merge dialog)
 * GET /api/customers/search?q=searchterm
 *
 * Authentication: Required
 * Authorization: Automatically filtered by user's client_id
 */
router.get('/search',
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      const q = (req.query.q || '').trim();

      if (!q || q.length < 2) {
        return res.json({ success: true, data: [] });
      }

      // Sanitize search input: limit length and escape special SQL LIKE characters
      const sanitizedQ = q.slice(0, 100).replace(/[%_\\]/g, '\\$&');

      logger.info('[CUSTOMERS] Searching customers', { query: sanitizedQ });

      // Search customers by name
      const { data: customersByName, error: nameError } = await supabase
        .from('customers')
        .select('id, name, client_id')
        .eq('client_id', client_id)
        .ilike('name', `%${sanitizedQ}%`)
        .limit(20);

      if (nameError) {
        logger.error('[CUSTOMERS] Search by name error', { error: nameError.message });
        return res.status(500).json({ error: 'Database error' });
      }

      // Search email-addresses table and join with customers
      const { data: emailMatches, error: emailError } = await supabase
        .from('email-addresses')
        .select('customer_id, email_address')
        .ilike('email_address', `%${sanitizedQ}%`);

      if (emailError) {
        logger.error('[CUSTOMERS] Search by email error', { error: emailError.message });
        return res.status(500).json({ error: 'Database error' });
      }

      // Gather unique customer IDs from both searches
      const customerMap = new Map();
      for (const c of customersByName) {
        customerMap.set(c.id, { id: c.id, name: c.name, emails: [] });
      }

      if (emailMatches.length > 0) {
        const emailCustomerIds = [...new Set(emailMatches.map(e => e.customer_id))];
        // Fetch those customers and verify client_id
        const { data: emailCustomers, error: ecError } = await supabase
          .from('customers')
          .select('id, name, client_id')
          .in('id', emailCustomerIds)
          .eq('client_id', client_id);

        if (!ecError && emailCustomers) {
          for (const c of emailCustomers) {
            if (!customerMap.has(c.id)) {
              customerMap.set(c.id, { id: c.id, name: c.name, emails: [] });
            }
          }
        }
      }

      // Fetch all email addresses for found customers
      const customerIds = [...customerMap.keys()];
      if (customerIds.length > 0) {
        const { data: allEmails, error: allEmailsError } = await supabase
          .from('email-addresses')
          .select('customer_id, email_address')
          .in('customer_id', customerIds);

        if (!allEmailsError && allEmails) {
          for (const e of allEmails) {
            const entry = customerMap.get(e.customer_id);
            if (entry) {
              entry.emails.push(e.email_address);
            }
          }
        }
      }

      const results = [...customerMap.values()];
      logger.info('[CUSTOMERS] Search returned results', { count: results.length });
      res.json({ success: true, data: results });
    } catch (err) {
      logger.error('[CUSTOMERS] Server error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * Merge two customers
 * POST /api/customers/merge
 * Body: { primaryCustomerId, secondaryCustomerId }
 *
 * Merges the secondary customer into the primary customer:
 * - Moves all email addresses from secondary to primary
 * - Moves all incoming mails from secondary to primary
 * - Moves all sent mails from secondary to primary
 * - Preserves employee/group assignment from secondary if primary has none
 * - Deletes the secondary customer
 *
 * Authentication: Required
 * Authorization: Both customers must belong to user's client
 */
router.post('/merge',
  authenticate,
  validateId('primaryCustomerId'),
  validateId('secondaryCustomerId'),
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      const primaryId = req.sanitized.primaryCustomerId;
      const secondaryId = req.sanitized.secondaryCustomerId;

      logger.info('[CUSTOMERS] Merge request', { primaryId, secondaryId });

      if (primaryId === secondaryId) {
        return res.status(400).json({ error: 'Cannot merge a customer with itself' });
      }

      // Fetch both customers and verify they belong to the same client
      const { data: primary, error: primaryError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', primaryId)
        .single();

      if (primaryError || !primary) {
        logger.error('[CUSTOMERS] Primary customer not found', { primaryId });
        return res.status(404).json({ error: 'Primary customer not found' });
      }

      const { data: secondary, error: secondaryError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', secondaryId)
        .single();

      if (secondaryError || !secondary) {
        logger.error('[CUSTOMERS] Secondary customer not found', { secondaryId });
        return res.status(404).json({ error: 'Secondary customer not found' });
      }

      if (primary.client_id !== client_id || secondary.client_id !== client_id) {
        logger.warn('[CUSTOMERS] Merge access denied', {
          primary_client_id: primary.client_id,
          secondary_client_id: secondary.client_id,
          user_client_id: client_id
        });
        return res.status(403).json({ error: 'Access denied' });
      }

      // 1. Move all email addresses from secondary to primary
      const { error: emailMoveError } = await supabase
        .from('email-addresses')
        .update({ customer_id: primaryId })
        .eq('customer_id', secondaryId);

      if (emailMoveError) {
        logger.error('[CUSTOMERS] Error moving email addresses', { error: emailMoveError.message });
        return res.status(500).json({ error: 'Failed to move email addresses' });
      }

      // 2. Move all incoming mails from secondary to primary
      const { error: incomingMoveError } = await supabase
        .from('incoming-mails')
        .update({ customer_id: primaryId })
        .eq('customer_id', secondaryId);

      if (incomingMoveError) {
        logger.error('[CUSTOMERS] Error moving incoming mails', { error: incomingMoveError.message });
        return res.status(500).json({ error: 'Failed to move incoming mails' });
      }

      // 3. Move all sent mails from secondary to primary
      const { error: sentMoveError } = await supabase
        .from('sent-mail')
        .update({ customer_id: primaryId })
        .eq('customer_id', secondaryId);

      if (sentMoveError) {
        logger.error('[CUSTOMERS] Error moving sent mails', { error: sentMoveError.message });
        return res.status(500).json({ error: 'Failed to move sent mails' });
      }

      // 4. Preserve assignment if primary has none
      const updates = {};
      if (!primary.employee_id && secondary.employee_id) {
        updates.employee_id = secondary.employee_id;
      }
      if (!primary.group_id && secondary.group_id) {
        updates.group_id = secondary.group_id;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('customers')
          .update(updates)
          .eq('id', primaryId);

        if (updateError) {
          logger.error('[CUSTOMERS] Error updating primary customer', { error: updateError.message });
          // Non-critical, continue with deletion
        }
      }

      // 5. Delete the secondary customer
      const { error: deleteError } = await supabase
        .from('customers')
        .delete()
        .eq('id', secondaryId);

      if (deleteError) {
        logger.error('[CUSTOMERS] Error deleting secondary customer', { error: deleteError.message });
        return res.status(500).json({ error: 'Failed to delete merged customer' });
      }

      logger.info('[CUSTOMERS] Merge completed successfully', {
        primaryId,
        secondaryId,
        assignmentUpdated: Object.keys(updates).length > 0
      });

      logFromReq(req, { ...ACTIONS.CUSTOMER_MERGED, targetType: 'customer', targetId: primaryId, details: { primaryId, secondaryId, primaryName: primary.name, secondaryName: secondary.name } });

      res.json({
        success: true,
        message: 'Customers merged successfully',
        primaryCustomerId: primaryId
      });
    } catch (err) {
      logger.error('[CUSTOMERS] Merge server error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;