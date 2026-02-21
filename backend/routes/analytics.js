/**
 * Analytics Routes
 * Handles analytics and statistics endpoints
 * 
 * All routes protected with authentication
 * Data automatically scoped to user's client_id
 */

const express = require('express');
const router = express.Router();
const supabase = require("../config/supabase");
const { authenticate } = require('../middleware/auth');
const { authorizeAdmin } = require('../middleware/authorization');
const logger = require('../utils/logger');

/**
 * Get email statistics for a date range
 * GET /api/analytics/email-stats?from=<ISO_DATE>&to=<ISO_DATE>
 * 
 * Authentication: Required
 * Authorization: Automatically filtered by user's client_id
 * 
 * Query Parameters:
 * - from: Start date (ISO 8601 format)
 * - to: End date (ISO 8601 format)
 * 
 * Returns:
 * {
 *   totalIncoming: number,
 *   totalSent: number,
 *   averageIncomingPerDay: number,
 *   averageSentPerDay: number,
 *   dailyStats: Array<{ date: string, incoming: number, sent: number }>
 * }
 */
router.get('/email-stats', 
  authenticate,
  authorizeAdmin,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      const { from, to } = req.query;

      // Validate date parameters
      if (!from || !to) {
        return res.status(400).json({ 
          error: 'Bad Request',
          message: 'Missing required parameters: from and to dates' 
        });
      }

      const startDate = new Date(from);
      const endDate = new Date(to);

      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ 
          error: 'Bad Request',
          message: 'Invalid date format. Use ISO 8601 format (e.g., 2025-01-01T00:00:00.000Z)' 
        });
      }

      if (startDate > endDate) {
        return res.status(400).json({ 
          error: 'Bad Request',
          message: 'Start date must be before end date' 
        });
      }

      // Limit date range to prevent excessive queries
      const MAX_DATE_RANGE_DAYS = 365;
      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      if (daysDiff > MAX_DATE_RANGE_DAYS) {
        return res.status(400).json({ 
          error: 'Bad Request',
          message: `Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days` 
        });
      }

      logger.info('[ANALYTICS] Fetching email stats for client', { client_id, from, to });

      // Use database-level aggregation via RPC (B4 fix: avoids loading all rows into JS)
      const { data: dailyRows, error: rpcError } = await supabase
        .rpc('get_daily_email_stats', {
          p_client_id: client_id,
          p_from: from,
          p_to: to
        });

      if (rpcError) {
        logger.error('[ANALYTICS] RPC error fetching email stats', { error: rpcError.message });
        return res.status(500).json({ 
          error: 'Database Error',
          message: 'Failed to fetch email statistics' 
        });
      }

      // Build a map from RPC results for quick lookup
      const rpcMap = new Map();
      for (const row of (dailyRows || [])) {
        rpcMap.set(row.day, { incoming: Number(row.incoming), sent: Number(row.sent) });
      }

      // Initialize all dates in range with zero counts, then overlay RPC data
      const dailyStats = [];
      let totalIncoming = 0;
      let totalSent = 0;

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().split('T')[0];
        const rpcEntry = rpcMap.get(dateKey) || { incoming: 0, sent: 0 };
        totalIncoming += rpcEntry.incoming;
        totalSent += rpcEntry.sent;
        dailyStats.push({
          date: dateKey,
          incoming: rpcEntry.incoming,
          sent: rpcEntry.sent
        });
      }

      // Calculate averages
      const dayCount = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const averageIncomingPerDay = dayCount > 0 ? Math.round(totalIncoming / dayCount) : 0;

      // Calculate average response time
      // TODO: Implement proper response time tracking based on ticket creation/first response
      const averageResponseTime = totalSent > 0 ? Math.round(24 / (totalSent / totalIncoming + 1)) : 0;

      const response = {
        totalIncoming,
        totalSent,
        averageIncomingPerDay,
        averageResponseTime,
        dailyStats
      };

      logger.info('[ANALYTICS] Returning stats', { totalIncoming, totalSent, dailyStatsCount: dailyStats.length, averageResponseTime });

      res.json(response);
    } catch (err) {
      logger.error('[ANALYTICS] Server error', { error: err.message });
      res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'Failed to fetch analytics data' 
      });
    }
  }
);

/**
 * Get employee email statistics for a date range
 * GET /api/analytics/employee-stats?from=<ISO_DATE>&to=<ISO_DATE>
 * 
 * Authentication: Required
 * Authorization: Automatically filtered by user's client_id
 * 
 * Returns:
 * {
 *   summary: [{ employee_id, employee_name, email_count }],
 *   daily: [{ date, employee_id, employee_name, count }]
 * }
 */
router.get('/employee-stats',
  authenticate,
  authorizeAdmin,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      const { from, to } = req.query;

      // Validate date parameters
      if (!from || !to) {
        return res.status(400).json({ 
          error: 'Bad Request',
          message: 'Missing required parameters: from and to dates' 
        });
      }

      const startDate = new Date(from);
      const endDate = new Date(to);

      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ 
          error: 'Bad Request',
          message: 'Invalid date format. Use ISO 8601 format' 
        });
      }

      logger.info('[ANALYTICS] Fetching employee stats for client', { client_id, from, to });

      // Use database-level aggregation via RPC (B4 fix)
      const [
        { data: employees, error: employeesError },
        { data: rpcRows, error: rpcError }
      ] = await Promise.all([
        supabase
          .from('employees')
          .select('id, name')
          .eq('client_id', client_id),
        supabase
          .rpc('get_employee_email_stats', {
            p_client_id: client_id,
            p_from: from,
            p_to: to
          })
      ]);

      if (employeesError) {
        logger.error('[ANALYTICS] Error fetching employees', { error: employeesError.message });
        return res.status(500).json({ 
          error: 'Database Error',
          message: 'Failed to fetch employee data' 
        });
      }

      if (rpcError) {
        logger.error('[ANALYTICS] RPC error fetching employee stats', { error: rpcError.message });
        return res.status(500).json({ 
          error: 'Database Error',
          message: 'Failed to fetch employee email statistics' 
        });
      }

      // Build summary from RPC results
      const employeeStatsMap = new Map();
      (employees || []).forEach(emp => {
        employeeStatsMap.set(emp.id, {
          employee_id: emp.id,
          employee_name: emp.name || 'Unknown',
          email_count: 0
        });
      });

      // Build daily stats from RPC results, also accumulate summary totals
      const dailyEmployeeMap = new Map();

      // Initialize all dates for all employees
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().split('T')[0];
        (employees || []).forEach(emp => {
          const key = `${dateKey}-${emp.id}`;
          dailyEmployeeMap.set(key, {
            date: dateKey,
            employee_id: emp.id,
            employee_name: emp.name || 'Unknown',
            count: 0
          });
        });
      }

      // Populate from RPC rows
      for (const row of (rpcRows || [])) {
        const empId = row.employee_id;
        const dateKey = row.day;
        const count = Number(row.cnt);

        // Update summary
        const stats = employeeStatsMap.get(empId);
        if (stats) {
          stats.email_count += count;
        }

        // Update daily
        const key = `${dateKey}-${empId}`;
        const daily = dailyEmployeeMap.get(key);
        if (daily) {
          daily.count = count;
        }
      }

      // Convert to arrays
      const summary = Array.from(employeeStatsMap.values())
        .sort((a, b) => b.email_count - a.email_count);

      const daily = Array.from(dailyEmployeeMap.values())
        .sort((a, b) => {
          const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
          if (dateCompare !== 0) return dateCompare;
          return a.employee_id - b.employee_id;
        });

      logger.info('[ANALYTICS] Returning employee stats', { employeeCount: summary.length, dailyRecords: daily.length });

      res.json({ summary, daily });
    } catch (err) {
      logger.error('[ANALYTICS] Server error', { error: err.message });
      res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'Failed to fetch employee analytics data' 
      });
    }
  }
);

/**
 * Get response time statistics (placeholder for future implementation)
 * GET /api/analytics/response-times?from=<ISO_DATE>&to=<ISO_DATE>
 * 
 * Authentication: Required
 */
router.get('/response-times',
  authenticate,
  authorizeAdmin,
  async (req, res) => {
    // TODO: Implement response time analytics
    res.status(501).json({ 
      error: 'Not Implemented',
      message: 'Response time analytics coming soon' 
    });
  }
);

/**
 * Get ticket status distribution statistics
 * GET /api/analytics/status-stats?from=<ISO_DATE>&to=<ISO_DATE>
 * 
 * Authentication: Required
 * Authorization: Automatically filtered by user's client_id
 * 
 * Returns:
 * {
 *   statusDistribution: { new: number, open: number, waiting: number, resolved: number },
 *   dailyStatus: Array<{ date: string, new: number, open: number, waiting: number, resolved: number }>
 * }
 */
router.get('/status-stats',
  authenticate,
  authorizeAdmin,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      const { from, to } = req.query;

      // Validate date parameters
      if (!from || !to) {
        return res.status(400).json({ 
          error: 'Bad Request',
          message: 'Missing required parameters: from and to dates' 
        });
      }

      const startDate = new Date(from);
      const endDate = new Date(to);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ 
          error: 'Bad Request',
          message: 'Invalid date format. Use ISO 8601 format' 
        });
      }

      logger.info('[ANALYTICS] Fetching status stats for client', { client_id, from, to });

      // Use database-level aggregation via RPC (B4 fix)
      const { data: rpcRows, error: rpcError } = await supabase
        .rpc('get_status_stats', {
          p_client_id: client_id,
          p_from: from,
          p_to: to
        });

      if (rpcError) {
        logger.error('[ANALYTICS] RPC error fetching status stats', { error: rpcError.message });
        return res.status(500).json({ 
          error: 'Database Error',
          message: 'Failed to fetch status statistics' 
        });
      }

      // Calculate status distribution and daily stats from RPC results
      const statusDistribution = { new: 0, open: 0, waiting: 0, resolved: 0 };
      const dailyStatusMap = new Map();

      // Initialize all dates in range
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().split('T')[0];
        dailyStatusMap.set(dateKey, {
          date: dateKey,
          new: 0,
          open: 0,
          waiting: 0,
          resolved: 0
        });
      }

      // Populate from RPC rows
      for (const row of (rpcRows || [])) {
        const status = row.status || 'new';
        const count = Number(row.cnt);
        const dateKey = row.day;

        if (statusDistribution.hasOwnProperty(status)) {
          statusDistribution[status] += count;
        }

        const dailyStats = dailyStatusMap.get(dateKey);
        if (dailyStats && dailyStats.hasOwnProperty(status)) {
          dailyStats[status] = count;
        }
      }

      const dailyStatus = Array.from(dailyStatusMap.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      logger.info('[ANALYTICS] Returning status stats', { statusDistribution });

      res.json({ statusDistribution, dailyStatus });
    } catch (err) {
      logger.error('[ANALYTICS] Server error', { error: err.message });
      res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'Failed to fetch status analytics data' 
      });
    }
  }
);

/**
 * Get agent performance statistics (placeholder for future implementation)
 * GET /api/analytics/agent-performance?from=<ISO_DATE>&to=<ISO_DATE>
 * 
 * Authentication: Required
 */
router.get('/agent-performance',
  authenticate,
  authorizeAdmin,
  async (req, res) => {
    // TODO: Implement agent performance analytics
    res.status(501).json({ 
      error: 'Not Implemented',
      message: 'Agent performance analytics coming soon' 
    });
  }
);

module.exports = router;
