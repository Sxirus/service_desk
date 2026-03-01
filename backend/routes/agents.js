/**
 * Agent / Employee Details Route
 * Provides agent profile data including groups and assigned tickets.
 *
 * GET /api/employees/:id/details
 *
 * Authentication: Required
 * Authorization: Automatically filtered by user's client_id
 */

const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * Get full agent details: profile, groups, and assigned tickets
 */
router.get('/:id/details', authenticate, async (req, res) => {
  try {
    const client_id = req.user.client_id;
    const employeeId = parseInt(req.params.id, 10);

    if (isNaN(employeeId) || employeeId < 1) {
      return res.status(400).json({ error: 'Invalid employee ID' });
    }

    // 1. Fetch the employee
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, name, avatar_url, disabled, created_at')
      .eq('id', employeeId)
      .eq('client_id', client_id)
      .single();

    if (empError || !employee) {
      logger.error('[AGENTS] Employee not found', { employeeId, error: empError?.message });
      return res.status(404).json({ error: 'Agent not found' });
    }

    // 2. Fetch group memberships
    const { data: memberships, error: memError } = await supabase
      .from('employee_group_members')
      .select('group_id')
      .eq('employee_id', employeeId);

    let groups = [];
    if (!memError && memberships && memberships.length > 0) {
      const groupIds = memberships.map((m) => m.group_id);
      const { data: groupData, error: grpError } = await supabase
        .from('employee_groups')
        .select('id, name, description')
        .in('id', groupIds)
        .eq('client_id', client_id);

      if (!grpError && groupData) {
        groups = groupData;
      }
    }

    // 3. Fetch assigned customers (tickets assigned to this agent)
    const { data: customers, error: custError } = await supabase
      .from('customers')
      .select('id, name')
      .eq('employee_id', employeeId)
      .eq('client_id', client_id);

    let tickets = [];
    if (!custError && customers && customers.length > 0) {
      const customerIds = customers.map((c) => c.id);
      const customerMap = new Map(customers.map((c) => [c.id, c.name]));

      const { data: mails, error: mailError } = await supabase
        .from('incoming-mails')
        .select('id, subject, customer_id, email_address, status, send_at, read')
        .in('customer_id', customerIds)
        .eq('client_id', client_id)
        .order('send_at', { ascending: false })
        .limit(100);

      if (!mailError && mails) {
        tickets = mails.map((m) => ({
          ...m,
          customer_name: customerMap.get(m.customer_id) || 'Unknown',
        }));
      }
    }

    // 4. Fetch the employee's email (from user account if available)
    const { data: empFull } = await supabase
      .from('employees')
      .select('user_id')
      .eq('id', employeeId)
      .single();

    let email = null;
    if (empFull?.user_id) {
      const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(empFull.user_id);
      if (!userError && user) {
        email = user.email;
      }
    }

    logger.info('[AGENTS] Agent details fetched', {
      employeeId,
      groups: groups.length,
      tickets: tickets.length,
    });

    res.json({
      success: true,
      data: {
        employee: { ...employee, email },
        groups,
        tickets,
      },
    });
  } catch (err) {
    logger.error('[AGENTS] Server error', { error: err.message });
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
