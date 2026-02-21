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

      // Get customer IDs for this client with a reasonable limit
      // For very large clients, we use direct client_id filtering on incoming-mails
      const MAX_CUSTOMER_IDS = 10000;
      const { data: clientCustomers, error: customersError } = await supabase
        .from('customers')
        .select('id')
        .eq('client_id', client_id)
        .limit(MAX_CUSTOMER_IDS);

      if (customersError) {
        logger.error('[ANALYTICS] Error fetching customer IDs', { error: customersError.message });
        return res.status(500).json({ 
          error: 'Database Error',
          message: 'Failed to fetch customer data' 
        });
      }

      const customerIds = (clientCustomers || []).map(c => c.id);

      // Handle case where client has no customers
      if (customerIds.length === 0) {
        logger.info('[ANALYTICS] No customers found for client', { client_id });
        return res.json({
          totalIncoming: 0,
          totalSent: 0,
          averageIncomingPerDay: 0,
          averageSentPerDay: 0,
          dailyStats: []
        });
      }

      // Fetch email data in parallel
      const [
        { data: incomingEmails, error: incomingError },
        { data: sentEmails, error: sentError }
      ] = await Promise.all([
        // Incoming emails
        supabase
          .from('incoming-mails')
          .select('send_at')
          .eq('client_id', client_id)
          .gte('send_at', from)
          .lte('send_at', to)
          .order('send_at', { ascending: true }),
        
        // Sent emails (filtered by customer IDs)
        supabase
          .from('sent-mail')
          .select('send_at, customer_id')
          .in('customer_id', customerIds)
          .gte('send_at', from)
          .lte('send_at', to)
          .order('send_at', { ascending: true })
      ]);

      if (incomingError) {
        logger.error('[ANALYTICS] Error fetching incoming emails', { error: incomingError.message });
        return res.status(500).json({ 
          error: 'Database Error',
          message: 'Failed to fetch incoming emails' 
        });
      }

      if (sentError) {
        logger.error('[ANALYTICS] Error fetching sent emails', { error: sentError.message });
        return res.status(500).json({ 
          error: 'Database Error',
          message: 'Failed to fetch sent emails' 
        });
      }

      // Process data
      const totalIncoming = incomingEmails?.length ?? 0;
      const totalSent = sentEmails?.length ?? 0;

      // Create daily stats map
      const dailyStatsMap = new Map();

      // Initialize all dates in range with zero counts
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().split('T')[0];
        dailyStatsMap.set(dateKey, {
          date: dateKey,
          incoming: 0,
          sent: 0
        });
      }

      // Count incoming emails by day
      if (incomingEmails) {
        for (const email of incomingEmails) {
          const dateKey = email.send_at.split('T')[0];
          const stats = dailyStatsMap.get(dateKey);
          if (stats) {
            stats.incoming++;
          }
        }
      }

      // Count sent emails by day
      if (sentEmails) {
        for (const email of sentEmails) {
          const dateKey = email.send_at.split('T')[0];
          const stats = dailyStatsMap.get(dateKey);
          if (stats) {
            stats.sent++;
          }
        }
      }

      // Convert map to sorted array
      const dailyStats = Array.from(dailyStatsMap.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // Calculate averages
      const dayCount = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const averageIncomingPerDay = dayCount > 0 ? Math.round(totalIncoming / dayCount) : 0;

      // Calculate average response time
      // For simplicity, using a placeholder calculation
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

      // Get all employees for this client
      const { data: employees, error: employeesError } = await supabase
        .from('employees')
        .select('id, name')
        .eq('client_id', client_id);

      if (employeesError) {
        logger.error('[ANALYTICS] Error fetching employees', { error: employeesError.message });
        return res.status(500).json({ 
          error: 'Database Error',
          message: 'Failed to fetch employee data' 
        });
      }

      // Get all customers for this client
      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('id')
        .eq('client_id', client_id);

      if (customersError) {
        logger.error('[ANALYTICS] Error fetching customers', { error: customersError.message });
        return res.status(500).json({ 
          error: 'Database Error',
          message: 'Failed to fetch customer data' 
        });
      }

      const customerIds = (customers || []).map(c => c.id);

      if (customerIds.length === 0) {
        return res.json({ summary: [], daily: [] });
      }

      // Get sent emails for date range with dates
      const { data: sentEmails, error: sentError } = await supabase
        .from('sent-mail')
        .select('employee_id, customer_id, send_at')
        .in('customer_id', customerIds)
        .gte('send_at', from)
        .lte('send_at', to)
        .order('send_at', { ascending: true });

      if (sentError) {
        logger.error('[ANALYTICS] Error fetching sent emails', { error: sentError.message });
        return res.status(500).json({ 
          error: 'Database Error',
          message: 'Failed to fetch sent emails' 
        });
      }

      // Build employee map
      const employeeMap = new Map();
      (employees || []).forEach(emp => {
        employeeMap.set(emp.id, emp.name || 'Unknown');
      });

      // Count total emails per employee for summary
      const employeeStats = new Map();
      (employees || []).forEach(emp => {
        employeeStats.set(emp.id, {
          employee_id: emp.id,
          employee_name: emp.name || 'Unknown',
          email_count: 0
        });
      });

      // Build daily stats per employee
      const dailyEmployeeMap = new Map(); // key: "date-employeeId"

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

      // Count emails
      (sentEmails || []).forEach(email => {
        if (email.employee_id) {
          // Update summary
          const stats = employeeStats.get(email.employee_id);
          if (stats) {
            stats.email_count++;
          }

          // Update daily
          const dateKey = email.send_at.split('T')[0];
          const key = `${dateKey}-${email.employee_id}`;
          const dailyStats = dailyEmployeeMap.get(key);
          if (dailyStats) {
            dailyStats.count++;
          }
        }
      });

      // Convert to arrays
      const summary = Array.from(employeeStats.values())
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

      // Fetch all emails with their current status
      const { data: emails, error: emailsError } = await supabase
        .from('incoming-mails')
        .select('status, send_at')
        .eq('client_id', client_id)
        .gte('send_at', from)
        .lte('send_at', to);

      if (emailsError) {
        logger.error('[ANALYTICS] Error fetching emails', { error: emailsError.message });
        return res.status(500).json({ 
          error: 'Database Error',
          message: 'Failed to fetch email data' 
        });
      }

      // Calculate status distribution
      const statusDistribution = {
        new: 0,
        open: 0,
        waiting: 0,
        resolved: 0
      };

      // Initialize daily stats map
      const dailyStatusMap = new Map();
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

      // Process emails
      if (emails) {
        for (const email of emails) {
          const status = email.status || 'new';
          if (statusDistribution.hasOwnProperty(status)) {
            statusDistribution[status]++;
          }

          const dateKey = email.send_at.split('T')[0];
          const dailyStats = dailyStatusMap.get(dateKey);
          if (dailyStats && dailyStats.hasOwnProperty(status)) {
            dailyStats[status]++;
          }
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
  async (req, res) => {
    // TODO: Implement agent performance analytics
    res.status(501).json({ 
      error: 'Not Implemented',
      message: 'Agent performance analytics coming soon' 
    });
  }
);

module.exports = router;
