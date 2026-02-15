/**
 * Platform Admin Routes - SECURED
 * Routes for platform administration (super-admin)
 * Refactored to use platformService
 */

const express = require('express');
const router = express.Router();
const supabase = require("../config/supabase");
const { authenticate } = require('../middleware/auth');
const { authenticatePlatformAdmin, logPlatformAction } = require('../middleware/platformAuth');
const { validateId } = require('../middleware/validation');
const platformService = require('../services/platformService');
const logger = require('../utils/logger');

// Middleware to ensure user is platform admin
router.use(authenticatePlatformAdmin);

/**
 * Get Platform Analytics
 */
router.get('/analytics', async (req, res) => {
  try {
    const data = await platformService.getAnalytics();
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[PLATFORM] Analytics error', { error: err.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get Billing Overview
 */
router.get('/billing', async (req, res) => {
  try {
    const data = await platformService.getBillingOverview();
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[PLATFORM] Billing error', { error: err.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get All Clients
 */
router.get('/clients', async (req, res) => {
  try {
    const data = await platformService.getClients();
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[PLATFORM] Clients error', { error: err.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get Client Detail
 */
router.get('/clients/:id', validateId('id'), async (req, res) => {
  try {
    const data = await platformService.getClientDetail(req.sanitized.id);
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[PLATFORM] Client detail error', { error: err.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Update Client
 */
router.patch('/clients/:id', validateId('id'), async (req, res) => {
  try {
    const data = await platformService.updateClient(req.sanitized.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[PLATFORM] Client update error', { error: err.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Delete Client
 */
router.delete('/clients/:id', validateId('id'), async (req, res) => {
  try {
    await platformService.deleteClient(req.sanitized.id);
    res.json({ success: true });
  } catch (err) {
    logger.error('[PLATFORM] Client delete error', { error: err.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Update Employee (name, disabled status)
 */
router.patch('/clients/:id/employees/:employeeId', validateId('id'), validateId('employeeId'), async (req, res) => {
  try {
    const data = await platformService.updateEmployee(req.sanitized.id, req.sanitized.employeeId, req.body);
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[PLATFORM] Employee update error', { error: err.message });
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Delete Employee
 */
router.delete('/clients/:id/employees/:employeeId', validateId('id'), validateId('employeeId'), async (req, res) => {
  try {
    await platformService.deleteEmployee(req.sanitized.id, req.sanitized.employeeId);
    res.json({ success: true });
  } catch (err) {
    logger.error('[PLATFORM] Employee delete error', { error: err.message });
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get Audit Log
 */
router.get('/audit-log', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const { data, error } = await supabase
      .from('platform_audit_log')
      .select('*, platform_admins(email)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[PLATFORM] Audit log error', { error: err.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get Unread Notification Count
 */
router.get('/notifications/unread-count', async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('platform_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('read', false);

    if (error) throw error;
    res.json({ success: true, count: count || 0 });
  } catch (err) {
    logger.error('[PLATFORM] Unread count error', { error: err.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get Notifications
 */
router.get('/notifications', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    
    // Get notifications
    const { data, error } = await supabase
      .from('platform_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Get unread count
    const { count, error: countError } = await supabase
      .from('platform_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('read', false);

    res.json({ 
      success: true, 
      data,
      unread_count: count || 0 
    });
  } catch (err) {
    logger.error('[PLATFORM] Notifications error', { error: err.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Mark Notification Read
 */
router.post('/notifications/:id/read', validateId('id'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('platform_notifications')
      .update({ read: true })
      .eq('id', req.sanitized.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    logger.error('[PLATFORM] Notification read error', { error: err.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get Platform Admins
 */
router.get('/admins', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('platform_admins')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[PLATFORM] Get admins error', { error: err.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Invite Platform Admin
 */
router.post('/admins/invite', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    // Check if user exists in auth
    const { data: { users }, error: searchError } = await supabase.auth.admin.listUsers();
    const existingUser = users.find(u => u.email === email);
    
    let userId;
    
    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Invite user
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);
      if (inviteError) throw inviteError;
      userId = inviteData.user.id;
    }

    // Add to platform_admins table
    const { data, error } = await supabase
      .from('platform_admins')
      .insert({
        user_id: userId,
        email: email,
        created_by: req.platformAdmin.id
      })
      .select()
      .single();

    if (error) throw error;

    // Log audit
    await supabase.from('platform_audit_log').insert({
      admin_id: req.platformAdmin.id,
      action: 'invite_admin',
      target_type: 'platform_admin',
      target_id: data.id,
      details: { email }
    });

    res.json({ success: true, data });
  } catch (err) {
    logger.error('[PLATFORM] Invite admin error', { error: err.message });
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;