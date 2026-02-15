/**
 * Group Routes - SECURED
 * Handles employee group management operations
 * 
 * All routes protected with authentication and authorization
 */

const express = require('express');
const router = express.Router();
const supabase = require("../config/supabase");
const { authenticate } = require('../middleware/auth');
const { validateId } = require('../middleware/validation');

/**
 * Get all groups for authenticated user's client
 * GET /api/groups/getGroups
 * 
 * Authentication: Required
 * Authorization: Automatically filtered by user's client_id
 */
router.get('/getGroups', 
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      
      console.log('[GROUPS] Fetching groups for client:', client_id);

      const { data, error } = await supabase
        .from("employee_groups")
        .select("id, name, description, created_at")
        .eq("client_id", client_id)
        .order("name");

      if (error) {
        console.error('[GROUPS] Supabase error:', error.message);
        return res.status(500).json({ error: 'Database error' });
      }

      console.log('[GROUPS] Fetched', data.length, 'groups');
      res.json({success: true, data});
    } catch (err) {
      console.error('[GROUPS] Server error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * Get all groups with their members for authenticated user's client
 * GET /api/groups/getGroupsWithMembers
 * 
 * Authentication: Required
 * Authorization: Automatically filtered by user's client_id
 * Returns groups with nested employee arrays
 */
router.get('/getGroupsWithMembers',
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;

      console.log('[GROUPS] Fetching groups with members for client:', client_id);

      // Fetch all groups
      const { data: groups, error: groupsError } = await supabase
        .from("employee_groups")
        .select("id, name, description")
        .eq("client_id", client_id)
        .order("name");

      if (groupsError) {
        console.error('[GROUPS] Supabase error fetching groups:', groupsError.message);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!groups || groups.length === 0) {
        console.log('[GROUPS] No groups found');
        return res.json({ success: true, data: [] });
      }

      // Fetch all memberships for these groups in one query
      const groupIds = groups.map(g => g.id);
      const { data: memberships, error: membersError } = await supabase
        .from('employee_group_members')
        .select(`
          group_id,
          employee_id,
          employees (
            id,
            name
          )
        `)
        .in('group_id', groupIds);

      if (membersError) {
        console.error('[GROUPS] Supabase error fetching members:', membersError.message);
        return res.status(500).json({ error: 'Database error' });
      }

      // Map memberships to groups
      const membersByGroup = {};
      (memberships || []).forEach(m => {
        if (!membersByGroup[m.group_id]) {
          membersByGroup[m.group_id] = [];
        }
        if (m.employees) {
          membersByGroup[m.group_id].push({
            employee_id: m.employee_id,
            name: m.employees.name
          });
        }
      });

      const result = groups.map(g => ({
        ...g,
        members: membersByGroup[g.id] || []
      }));

      console.log('[GROUPS] Fetched', result.length, 'groups with members');
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('[GROUPS] Server error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * Get group members (employees in a group)
 * GET /api/groups/getGroupMembers?group_id=123
 * 
 * Authentication: Required
 * Authorization: Group must belong to user's client
 */
router.get('/getGroupMembers',
  authenticate,
  validateId('group_id'),
  async (req, res) => {
    try {
      const group_id = req.sanitized.group_id;
      const client_id = req.user.client_id;

      console.log('[GROUPS] Fetching members for group:', group_id);

      // Verify group belongs to user's client
      const { data: group, error: groupError } = await supabase
        .from('employee_groups')
        .select('client_id')
        .eq('id', group_id)
        .single();

      if (groupError || !group) {
        console.error('[GROUPS] Group not found:', group_id);
        return res.status(404).json({ error: 'Group not found' });
      }

      if (group.client_id !== client_id) {
        console.warn('[GROUPS] Unauthorized group access attempt:', {
          group_id,
          group_client_id: group.client_id,
          user_client_id: client_id
        });
        return res.status(403).json({ error: 'Access denied to this group' });
      }

      // Fetch group members
      const { data, error } = await supabase
        .from('employee_group_members')
        .select(`
          employee_id,
          employees (
            id,
            name
          )
        `)
        .eq('group_id', group_id);

      if (error) {
        console.error('[GROUPS] Supabase error:', error.message);
        return res.status(500).json({ error: 'Database error' });
      }

      const members = data.map(m => ({
        employee_id: m.employee_id,
        name: m.employees?.name
      }));

      console.log('[GROUPS] Fetched', members.length, 'members');
      res.json({success: true, data: members});
    } catch (err) {
      console.error('[GROUPS] Server error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * Create a new group
 * POST /api/groups/createGroup
 * Body: { name, description }
 * 
 * Authentication: Required
 * Authorization: Creates group for user's client
 */
router.post('/createGroup',
  authenticate,
  async (req, res) => {
    try {
      const { name, description } = req.body;
      const client_id = req.user.client_id;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Valid group name is required' });
      }

      console.log('[GROUPS] Creating group:', name);

      const { data, error } = await supabase
        .from('employee_groups')
        .insert({
          name: name.trim(),
          description: description?.trim() || null,
          client_id: client_id
        })
        .select()
        .single();

      if (error) {
        console.error('[GROUPS] Create failed:', error.message);
        return res.status(500).json({ error: 'Database error' });
      }

      console.log('[GROUPS] Group created successfully:', data.id);
      res.json({ success: true, data });
    } catch (err) {
      console.error('[GROUPS] Server error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * Update a group
 * PUT /api/groups/updateGroup
 * Body: { group_id, name, description }
 * 
 * Authentication: Required
 * Authorization: Group must belong to user's client
 */
router.put('/updateGroup',
  authenticate,
  validateId('group_id'),
  async (req, res) => {
    try {
      const group_id = req.sanitized.group_id;
      const { name, description } = req.body;
      const client_id = req.user.client_id;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Valid group name is required' });
      }

      console.log('[GROUPS] Updating group:', group_id);

      // Verify group belongs to user's client
      const { data: group, error: groupError } = await supabase
        .from('employee_groups')
        .select('client_id')
        .eq('id', group_id)
        .single();

      if (groupError || !group) {
        console.error('[GROUPS] Group not found:', group_id);
        return res.status(404).json({ error: 'Group not found' });
      }

      if (group.client_id !== client_id) {
        console.warn('[GROUPS] Unauthorized group update attempt:', {
          group_id,
          group_client_id: group.client_id,
          user_client_id: client_id
        });
        return res.status(403).json({ error: 'Access denied to this group' });
      }

      // Update group
      const { data, error } = await supabase
        .from('employee_groups')
        .update({
          name: name.trim(),
          description: description?.trim() || null
        })
        .eq('id', group_id)
        .select()
        .single();

      if (error) {
        console.error('[GROUPS] Update failed:', error.message);
        return res.status(500).json({ error: 'Database error' });
      }

      console.log('[GROUPS] Group updated successfully');
      res.json({ success: true, data });
    } catch (err) {
      console.error('[GROUPS] Server error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * Delete a group
 * DELETE /api/groups/deleteGroup?group_id=123
 * 
 * Authentication: Required
 * Authorization: Group must belong to user's client
 * Note: This will also delete all group memberships (CASCADE)
 */
router.delete('/deleteGroup',
  authenticate,
  validateId('group_id'),
  async (req, res) => {
    try {
      const group_id = req.sanitized.group_id;
      const client_id = req.user.client_id;

      console.log('[GROUPS] Deleting group:', group_id);

      // Verify group belongs to user's client
      const { data: group, error: groupError } = await supabase
        .from('employee_groups')
        .select('client_id')
        .eq('id', group_id)
        .single();

      if (groupError || !group) {
        console.error('[GROUPS] Group not found:', group_id);
        return res.status(404).json({ error: 'Group not found' });
      }

      if (group.client_id !== client_id) {
        console.warn('[GROUPS] Unauthorized group delete attempt:', {
          group_id,
          group_client_id: group.client_id,
          user_client_id: client_id
        });
        return res.status(403).json({ error: 'Access denied to this group' });
      }

      // Delete group (memberships will be deleted via CASCADE)
      const { error } = await supabase
        .from('employee_groups')
        .delete()
        .eq('id', group_id);

      if (error) {
        console.error('[GROUPS] Delete failed:', error.message);
        return res.status(500).json({ error: 'Database error' });
      }

      console.log('[GROUPS] Group deleted successfully');
      res.json({ success: true });
    } catch (err) {
      console.error('[GROUPS] Server error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * Add employee to group
 * POST /api/groups/addMember
 * Body: { group_id, employee_id }
 * 
 * Authentication: Required
 * Authorization: Both group and employee must belong to user's client
 */
router.post('/addMember',
  authenticate,
  validateId('group_id'),
  validateId('employee_id'),
  async (req, res) => {
    try {
      const group_id = req.sanitized.group_id;
      const employee_id = req.sanitized.employee_id;
      const client_id = req.user.client_id;

      console.log('[GROUPS] Adding employee', employee_id, 'to group', group_id);

      // Verify group belongs to user's client
      const { data: group, error: groupError } = await supabase
        .from('employee_groups')
        .select('client_id')
        .eq('id', group_id)
        .single();

      if (groupError || !group) {
        console.error('[GROUPS] Group not found:', group_id);
        return res.status(404).json({ error: 'Group not found' });
      }

      if (group.client_id !== client_id) {
        console.warn('[GROUPS] Unauthorized group access:', {
          group_id,
          group_client_id: group.client_id,
          user_client_id: client_id
        });
        return res.status(403).json({ error: 'Access denied to this group' });
      }

      // Verify employee belongs to user's client
      const { data: employee, error: employeeError } = await supabase
        .from('employees')
        .select('client_id')
        .eq('id', employee_id)
        .single();

      if (employeeError || !employee) {
        console.error('[GROUPS] Employee not found:', employee_id);
        return res.status(404).json({ error: 'Employee not found' });
      }

      if (employee.client_id !== client_id) {
        console.warn('[GROUPS] Unauthorized employee access:', {
          employee_id,
          employee_client_id: employee.client_id,
          user_client_id: client_id
        });
        return res.status(403).json({ error: 'Employee does not belong to your client' });
      }

      // Add member (upsert to handle duplicates gracefully)
      const { data, error } = await supabase
        .from('employee_group_members')
        .upsert({
          group_id: group_id,
          employee_id: employee_id
        }, {
          onConflict: 'group_id,employee_id'
        })
        .select();

      if (error) {
        console.error('[GROUPS] Add member failed:', error.message);
        return res.status(500).json({ error: 'Database error' });
      }

      console.log('[GROUPS] Member added successfully');
      res.json({ success: true, data });
    } catch (err) {
      console.error('[GROUPS] Server error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * Remove employee from group
 * DELETE /api/groups/removeMember
 * Body: { group_id, employee_id }
 * 
 * Authentication: Required
 * Authorization: Group must belong to user's client
 */
router.delete('/removeMember',
  authenticate,
  validateId('group_id'),
  validateId('employee_id'),
  async (req, res) => {
    try {
      const group_id = req.sanitized.group_id;
      const employee_id = req.sanitized.employee_id;
      const client_id = req.user.client_id;

      console.log('[GROUPS] Removing employee', employee_id, 'from group', group_id);

      // Verify group belongs to user's client
      const { data: group, error: groupError } = await supabase
        .from('employee_groups')
        .select('client_id')
        .eq('id', group_id)
        .single();

      if (groupError || !group) {
        console.error('[GROUPS] Group not found:', group_id);
        return res.status(404).json({ error: 'Group not found' });
      }

      if (group.client_id !== client_id) {
        console.warn('[GROUPS] Unauthorized group access:', {
          group_id,
          group_client_id: group.client_id,
          user_client_id: client_id
        });
        return res.status(403).json({ error: 'Access denied to this group' });
      }

      // Remove member
      const { error } = await supabase
        .from('employee_group_members')
        .delete()
        .eq('group_id', group_id)
        .eq('employee_id', employee_id);

      if (error) {
        console.error('[GROUPS] Remove member failed:', error.message);
        return res.status(500).json({ error: 'Database error' });
      }

      console.log('[GROUPS] Member removed successfully');
      res.json({ success: true });
    } catch (err) {
      console.error('[GROUPS] Server error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
