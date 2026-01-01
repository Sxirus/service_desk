/**
 * Inbox Routes - SECURED
 * Handles inbox management and email filtering
 * 
 * All routes protected with authentication and authorization
 */

const express = require('express');
const router = express.Router();
const supabase = require("../config/supabase");
const { authenticate } = require('../middleware/auth');
const { validateId } = require('../middleware/validation');

/**
 * Get all inboxes for authenticated user's client (Admin only)
 * GET /api/inboxes/getInboxes
 * 
 * Authentication: Required
 * Authorization: Automatically filtered by user's client_id
 */
router.get('/getInboxes', 
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      
      console.log('[INBOXES] Fetching inboxes for client:', client_id);

      const { data, error } = await supabase
        .from("inboxes")
        .select(`
          id,
          name,
          description,
          created_at,
          inbox_groups (
            group_id,
            employee_groups (
              id,
              name
            )
          ),
          inbox_filters (
            filter_type,
            filter_config
          )
        `)
        .eq("client_id", client_id)
        .order("name");

      if (error) {
        console.error('[INBOXES] Supabase error:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[INBOXES] Fetched', data.length, 'inboxes');
      res.json({success: true, data});
    } catch (err) {
      console.error('[INBOXES] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

/**
 * Get accessible inboxes for authenticated user (based on group membership)
 * GET /api/inboxes/getAccessibleInboxes
 * 
 * Authentication: Required
 * Returns: Only inboxes the user can access via their group memberships
 */
router.get('/getAccessibleInboxes',
  authenticate,
  async (req, res) => {
    try {
      const employee_id = req.user.employee_id;
      const client_id = req.user.client_id;

      console.log('[INBOXES] Fetching accessible inboxes for employee:', employee_id);

      // Get employee's groups
      const { data: employeeGroups, error: groupsError } = await supabase
        .from('employee_group_members')
        .select('group_id')
        .eq('employee_id', employee_id);

      if (groupsError) {
        console.error('[INBOXES] Error fetching employee groups:', groupsError.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      const groupIds = employeeGroups.map(g => g.group_id);
      console.log('[INBOXES] Employee is in groups:', groupIds);

      if (groupIds.length === 0) {
        console.log('[INBOXES] Employee not in any groups, returning empty list');
        return res.json({success: true, data: []});
      }

      // Get inboxes accessible to these groups
      const { data: inboxGroups, error: inboxError } = await supabase
        .from('inbox_groups')
        .select(`
          inbox_id,
          inboxes (
            id,
            name,
            description,
            client_id
          )
        `)
        .in('group_id', groupIds);

      if (inboxError) {
        console.error('[INBOXES] Error fetching inbox groups:', inboxError.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      // Extract unique inboxes and filter by client
      const uniqueInboxes = [];
      const seenIds = new Set();
      
      for (const ig of inboxGroups) {
        if (ig.inboxes && ig.inboxes.client_id === client_id && !seenIds.has(ig.inboxes.id)) {
          uniqueInboxes.push(ig.inboxes);
          seenIds.add(ig.inboxes.id);
        }
      }

      console.log('[INBOXES] Found', uniqueInboxes.length, 'accessible inboxes');
      res.json({success: true, data: uniqueInboxes});
    } catch (err) {
      console.error('[INBOXES] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

/**
 * Get filtered emails for an inbox
 * GET /api/inboxes/getInboxEmails?inbox_id=123
 * 
 * Authentication: Required
 * Authorization: User must have access to inbox via group membership
 */
router.get('/getInboxEmails',
  authenticate,
  validateId('inbox_id'),
  async (req, res) => {
    try {
      const inbox_id = req.sanitized.inbox_id;
      const employee_id = req.user.employee_id;
      const client_id = req.user.client_id;

      console.log('[INBOXES] Fetching emails for inbox:', inbox_id);

      // Verify user has access to this inbox
      const { data: employeeGroups, error: groupsError } = await supabase
        .from('employee_group_members')
        .select('group_id')
        .eq('employee_id', employee_id);

      if (groupsError) {
        console.error('[INBOXES] Error fetching employee groups:', groupsError.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      const groupIds = employeeGroups.map(g => g.group_id);

      const { data: inboxAccess, error: accessError } = await supabase
        .from('inbox_groups')
        .select('inbox_id')
        .eq('inbox_id', inbox_id)
        .in('group_id', groupIds)
        .limit(1);

      if (accessError || !inboxAccess || inboxAccess.length === 0) {
        console.warn('[INBOXES] Unauthorized inbox access attempt:', {
          inbox_id,
          employee_id,
          employee_groups: groupIds
        });
        return res.status(403).json({ error: 'Access denied to this inbox' });
      }

      // Get inbox filters
      const { data: filters, error: filtersError } = await supabase
        .from('inbox_filters')
        .select('filter_type, filter_config')
        .eq('inbox_id', inbox_id);

      if (filtersError) {
        console.error('[INBOXES] Error fetching filters:', filtersError.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      // Build query based on filters
      let query = supabase
        .from('incoming-mails')
        .select(`
          id,
          subject,
          send_at,
          email_address,
          read,
          customer_id,
          customers!inner (
            id,
            name,
            group_id,
            employee_id,
            employees (
              id,
              name
            ),
            employee_groups (
              id,
              name
            )
          )
        `)
        .eq('client_id', client_id)
        .order('send_at', { ascending: false });

      // Apply filters
      for (const filter of filters) {
        const config = filter.filter_config;

        if (filter.filter_type === 'read_status') {
          if (config.show === 'read') {
            query = query.eq('read', true);
          } else if (config.show === 'unread') {
            query = query.eq('read', false);
          }
          // 'all' means no filter
        }

        if (filter.filter_type === 'assignment') {
          if (config.show === 'unassigned') {
            // Show emails where customer has no group assigned
            query = query.is('customers.group_id', null);
          } else if (config.show === 'groups' && config.group_ids && config.group_ids.length > 0) {
            // Show emails where customer is assigned to specific groups
            // Use !inner join and filter on the joined table
            query = query.in('customers.group_id', config.group_ids);
          }
          // 'all' means no filter
        }
      }

      const { data, error } = await query;

      if (error) {
        console.error('[INBOXES] Error fetching emails:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[INBOXES] Fetched', data.length, 'filtered emails');
      res.json({success: true, data});
    } catch (err) {
      console.error('[INBOXES] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

/**
 * Create a new inbox
 * POST /api/inboxes/createInbox
 * Body: { name, description }
 * 
 * Authentication: Required
 * Authorization: Creates inbox for user's client
 */
router.post('/createInbox',
  authenticate,
  async (req, res) => {
    try {
      const { name, description } = req.body;
      const client_id = req.user.client_id;
      const user_id = req.user.id;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Valid inbox name is required' });
      }

      console.log('[INBOXES] Creating inbox:', name);

      const { data, error } = await supabase
        .from('inboxes')
        .insert({
          name: name.trim(),
          description: description?.trim() || null,
          client_id: client_id,
          created_by: user_id
        })
        .select()
        .single();

      if (error) {
        console.error('[INBOXES] Create failed:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[INBOXES] Inbox created successfully:', data.id);
      res.json({ success: true, data });
    } catch (err) {
      console.error('[INBOXES] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

/**
 * Update an inbox
 * PUT /api/inboxes/updateInbox
 * Body: { inbox_id, name, description }
 * 
 * Authentication: Required
 * Authorization: Inbox must belong to user's client
 */
router.put('/updateInbox',
  authenticate,
  validateId('inbox_id'),
  async (req, res) => {
    try {
      const inbox_id = req.sanitized.inbox_id;
      const { name, description } = req.body;
      const client_id = req.user.client_id;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Valid inbox name is required' });
      }

      console.log('[INBOXES] Updating inbox:', inbox_id);

      // Verify inbox belongs to user's client
      const { data: inbox, error: inboxError } = await supabase
        .from('inboxes')
        .select('client_id')
        .eq('id', inbox_id)
        .single();

      if (inboxError || !inbox) {
        console.error('[INBOXES] Inbox not found:', inbox_id);
        return res.status(404).json({ error: 'Inbox not found' });
      }

      if (inbox.client_id !== client_id) {
        console.warn('[INBOXES] Unauthorized inbox update attempt');
        return res.status(403).json({ error: 'Access denied to this inbox' });
      }

      const { data, error } = await supabase
        .from('inboxes')
        .update({
          name: name.trim(),
          description: description?.trim() || null
        })
        .eq('id', inbox_id)
        .select()
        .single();

      if (error) {
        console.error('[INBOXES] Update failed:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[INBOXES] Inbox updated successfully');
      res.json({ success: true, data });
    } catch (err) {
      console.error('[INBOXES] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

/**
 * Delete an inbox
 * DELETE /api/inboxes/deleteInbox?inbox_id=123
 * 
 * Authentication: Required
 * Authorization: Inbox must belong to user's client
 */
router.delete('/deleteInbox',
  authenticate,
  validateId('inbox_id'),
  async (req, res) => {
    try {
      const inbox_id = req.sanitized.inbox_id;
      const client_id = req.user.client_id;

      console.log('[INBOXES] Deleting inbox:', inbox_id);

      // Verify inbox belongs to user's client
      const { data: inbox, error: inboxError } = await supabase
        .from('inboxes')
        .select('client_id')
        .eq('id', inbox_id)
        .single();

      if (inboxError || !inbox) {
        console.error('[INBOXES] Inbox not found:', inbox_id);
        return res.status(404).json({ error: 'Inbox not found' });
      }

      if (inbox.client_id !== client_id) {
        console.warn('[INBOXES] Unauthorized inbox delete attempt');
        return res.status(403).json({ error: 'Access denied to this inbox' });
      }

      const { error } = await supabase
        .from('inboxes')
        .delete()
        .eq('id', inbox_id);

      if (error) {
        console.error('[INBOXES] Delete failed:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[INBOXES] Inbox deleted successfully');
      res.json({ success: true });
    } catch (err) {
      console.error('[INBOXES] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

/**
 * Add group to inbox
 * POST /api/inboxes/addGroup
 * Body: { inbox_id, group_id }
 */
router.post('/addGroup',
  authenticate,
  validateId('inbox_id'),
  validateId('group_id'),
  async (req, res) => {
    try {
      const inbox_id = req.sanitized.inbox_id;
      const group_id = req.sanitized.group_id;
      const client_id = req.user.client_id;

      // Verify both belong to client
      const [inboxCheck, groupCheck] = await Promise.all([
        supabase.from('inboxes').select('client_id').eq('id', inbox_id).single(),
        supabase.from('employee_groups').select('client_id').eq('id', group_id).single()
      ]);

      if (inboxCheck.error || !inboxCheck.data || inboxCheck.data.client_id !== client_id) {
        return res.status(404).json({ error: 'Inbox not found' });
      }

      if (groupCheck.error || !groupCheck.data || groupCheck.data.client_id !== client_id) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const { data, error } = await supabase
        .from('inbox_groups')
        .upsert({ inbox_id, group_id }, { onConflict: 'inbox_id,group_id' })
        .select();

      if (error) {
        console.error('[INBOXES] Add group failed:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      res.json({ success: true, data });
    } catch (err) {
      console.error('[INBOXES] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

/**
 * Remove group from inbox
 * DELETE /api/inboxes/removeGroup
 * Body: { inbox_id, group_id }
 */
router.delete('/removeGroup',
  authenticate,
  validateId('inbox_id'),
  validateId('group_id'),
  async (req, res) => {
    try {
      const inbox_id = req.sanitized.inbox_id;
      const group_id = req.sanitized.group_id;

      const { error } = await supabase
        .from('inbox_groups')
        .delete()
        .eq('inbox_id', inbox_id)
        .eq('group_id', group_id);

      if (error) {
        console.error('[INBOXES] Remove group failed:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[INBOXES] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

/**
 * Set inbox filters
 * POST /api/inboxes/setFilters
 * Body: { inbox_id, filters: [{filter_type, filter_config}, ...] }
 */
router.post('/setFilters',
  authenticate,
  validateId('inbox_id'),
  async (req, res) => {
    try {
      const inbox_id = req.sanitized.inbox_id;
      const { filters } = req.body;
      const client_id = req.user.client_id;

      if (!Array.isArray(filters)) {
        return res.status(400).json({ error: 'Filters must be an array' });
      }

      // Verify inbox belongs to client
      const { data: inbox, error: inboxError } = await supabase
        .from('inboxes')
        .select('client_id')
        .eq('id', inbox_id)
        .single();

      if (inboxError || !inbox || inbox.client_id !== client_id) {
        return res.status(404).json({ error: 'Inbox not found' });
      }

      // Delete existing filters
      await supabase
        .from('inbox_filters')
        .delete()
        .eq('inbox_id', inbox_id);

      // Insert new filters
      if (filters.length > 0) {
        const filtersToInsert = filters.map(f => ({
          inbox_id,
          filter_type: f.filter_type,
          filter_config: f.filter_config
        }));

        const { error } = await supabase
          .from('inbox_filters')
          .insert(filtersToInsert);

        if (error) {
          console.error('[INBOXES] Set filters failed:', error.message);
          return res.status(500).json({ error: 'Datenbankfehler' });
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[INBOXES] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

/**
 * Get email counts for all accessible inboxes (for sidebar display)
 * GET /api/inboxes/getCounts
 * 
 * Authentication: Required
 * Returns: { all: number, inboxes: { [inbox_id]: number } }
 */
router.get('/getCounts',
  authenticate,
  async (req, res) => {
    try {
      const employee_id = req.user.employee_id;
      const client_id = req.user.client_id;

      console.log('[INBOXES] Fetching email counts for employee:', employee_id);

      // Get count for "Dashboard" (unread emails from customers assigned to this employee)
      const { count: dashboardCount, error: dashboardError } = await supabase
        .from('incoming-mails')
        .select('id, customers!inner(employee_id)', { count: 'exact', head: true })
        .eq('client_id', client_id)
        .eq('customers.employee_id', employee_id)
        .eq('read', false);

      if (dashboardError) {
        console.error('[INBOXES] Error counting dashboard mails:', dashboardError.message);
      }

      // Get employee's groups
      const { data: employeeGroups, error: groupsError } = await supabase
        .from('employee_group_members')
        .select('group_id')
        .eq('employee_id', employee_id);

      if (groupsError) {
        console.error('[INBOXES] Error fetching employee groups:', groupsError.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      const groupIds = employeeGroups.map(g => g.group_id);
      
      if (groupIds.length === 0) {
        return res.json({ 
          success: true, 
          data: { 
            dashboard: dashboardCount || 0,
            inboxes: {} 
          } 
        });
      }

      // Get accessible inboxes with their filters
      const { data: inboxGroups, error: inboxError } = await supabase
        .from('inbox_groups')
        .select(`
          inbox_id,
          inboxes (
            id,
            client_id,
            inbox_filters (
              filter_type,
              filter_config
            )
          )
        `)
        .in('group_id', groupIds);

      if (inboxError) {
        console.error('[INBOXES] Error fetching inbox groups:', inboxError.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      // Get unique inbox IDs
      const uniqueInboxes = [];
      const seenIds = new Set();
      
      for (const ig of inboxGroups) {
        if (ig.inboxes && ig.inboxes.client_id === client_id && !seenIds.has(ig.inboxes.id)) {
          uniqueInboxes.push(ig.inboxes);
          seenIds.add(ig.inboxes.id);
        }
      }

      // Count emails for each inbox based on their filters
      const inboxCounts = {};
      
      for (const inbox of uniqueInboxes) {
        const filters = inbox.inbox_filters || [];
        
        // Build count query with same filter logic as getInboxEmails
        let query = supabase
          .from('incoming-mails')
          .select('id, customers!inner(group_id)', { count: 'exact', head: true })
          .eq('client_id', client_id);

        // Apply filters
        for (const filter of filters) {
          const config = filter.filter_config;

          if (filter.filter_type === 'read_status') {
            if (config.show === 'read') {
              query = query.eq('read', true);
            } else if (config.show === 'unread') {
              query = query.eq('read', false);
            }
          }

          if (filter.filter_type === 'assignment') {
            if (config.show === 'unassigned') {
              query = query.is('customers.group_id', null);
            } else if (config.show === 'groups' && config.group_ids && config.group_ids.length > 0) {
              query = query.in('customers.group_id', config.group_ids);
            }
          }
        }

        const { count, error: countError } = await query;
        
        if (countError) {
          console.error(`[INBOXES] Error counting emails for inbox ${inbox.id}:`, countError.message);
          inboxCounts[inbox.id] = 0;
        } else {
          inboxCounts[inbox.id] = count || 0;
        }
      }

      console.log('[INBOXES] Email counts:', { dashboard: dashboardCount, inboxes: inboxCounts });
      res.json({ 
        success: true, 
        data: { 
          dashboard: dashboardCount || 0,
          inboxes: inboxCounts 
        } 
      });
    } catch (err) {
      console.error('[INBOXES] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

module.exports = router;
