/**
 * Activity Log Routes
 * 
 * GET  /api/activity-log   — Read activity logs (admin-only)
 * POST /api/activity-log   — Accept log entries from frontend actions
 */

const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { logActivity, ACTIONS } = require('../services/activityLogger');
const logger = require('../utils/logger');

/**
 * Verify that the authenticated user has admin role (role_id = 1).
 * Returns true if admin, false otherwise.
 */
async function isAdmin(employeeId) {
  const { data, error } = await supabase
    .from('roles-employees')
    .select('role_id')
    .eq('employee_id', employeeId)
    .eq('role_id', 1)
    .maybeSingle();

  if (error) {
    logger.error('[ACTIVITY-LOG] Admin check error', { error: error.message });
    return false;
  }
  return !!data;
}

/**
 * GET /api/activity-log
 * 
 * Query params:
 *   category    — filter by category
 *   employeeId  — filter by acting employee
 *   targetType  — filter by target entity type
 *   targetId    — filter by target entity ID
 *   startDate   — ISO date string, inclusive lower bound
 *   endDate     — ISO date string, inclusive upper bound
 *   page        — page number (1-based, default 1)
 *   limit       — results per page (default 50, max 100)
 */
router.get('/', authenticate, async (req, res) => {
  try {
    // Server-side admin check (defense-in-depth alongside RLS)
    const admin = await isAdmin(req.user.employee_id);
    if (!admin) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const client_id = req.user.client_id;
    const {
      category,
      employeeId,
      targetType,
      targetId,
      startDate,
      endDate,
    } = req.query;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('activity_log')
      .select('*, employees(id, name, avatar_url)', { count: 'exact' })
      .eq('client_id', client_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (category) query = query.eq('category', category);
    if (employeeId) query = query.eq('employee_id', parseInt(employeeId));
    if (targetType) query = query.eq('target_type', targetType);
    if (targetId) query = query.eq('target_id', String(targetId));
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data, error, count } = await query;

    if (error) {
      logger.error('[ACTIVITY-LOG] Query error', { error: error.message });
      return res.status(500).json({ success: false, error: 'Database error' });
    }

    res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err) {
    logger.error('[ACTIVITY-LOG] Server error', { error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * POST /api/activity-log
 * 
 * Accepts log entries from frontend Astro actions that bypass the backend.
 * Forces clientId to req.user.client_id to prevent spoofing.
 *
 * Body: { action, category, targetType?, targetId?, details? }
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { action, category, targetType, targetId, details } = req.body;

    if (!action || !category) {
      return res.status(400).json({ success: false, error: 'action and category are required' });
    }

    // Validate that the action string is a known action
    const knownActions = Object.values(ACTIONS).map(a => a.action);
    if (!knownActions.includes(action)) {
      return res.status(400).json({ success: false, error: 'Unknown action' });
    }

    logActivity({
      clientId: req.user.client_id,
      employeeId: req.user.employee_id,
      action,
      category,
      targetType: targetType || null,
      targetId: targetId ? String(targetId) : null,
      details: details || null,
      ipAddress: req.ip || req.connection?.remoteAddress || null,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('[ACTIVITY-LOG] POST error', { error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
