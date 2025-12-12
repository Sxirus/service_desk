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

      console.log('[ANALYTICS] Fetching email stats for client:', client_id, 'from:', from, 'to:', to);

      // Get all customer IDs for this client
      const { data: clientCustomers, error: customersError } = await supabase
        .from('customers')
        .select('id')
        .eq('client_id', client_id);

      if (customersError) {
        console.error('[ANALYTICS] Error fetching customer IDs:', customersError.message);
        return res.status(500).json({ 
          error: 'Database Error',
          message: 'Failed to fetch customer data' 
        });
      }

      const customerIds = (clientCustomers || []).map(c => c.id);

      // Handle case where client has no customers
      if (customerIds.length === 0) {
        console.log('[ANALYTICS] No customers found for client:', client_id);
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
        console.error('[ANALYTICS] Error fetching incoming emails:', incomingError.message);
        return res.status(500).json({ 
          error: 'Database Error',
          message: 'Failed to fetch incoming emails' 
        });
      }

      if (sentError) {
        console.error('[ANALYTICS] Error fetching sent emails:', sentError.message);
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

      console.log('[ANALYTICS] Returning stats:', {
        totalIncoming,
        totalSent,
        dailyStatsCount: dailyStats.length,
        averageResponseTime
      });

      res.json(response);
    } catch (err) {
      console.error('[ANALYTICS] Server error:', err.message);
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

      console.log('[ANALYTICS] Fetching employee stats for client:', client_id, 'from:', from, 'to:', to);

      // Get all employees for this client
      const { data: employees, error: employeesError } = await supabase
        .from('employees')
        .select('id, name')
        .eq('client_id', client_id);

      if (employeesError) {
        console.error('[ANALYTICS] Error fetching employees:', employeesError.message);
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
        console.error('[ANALYTICS] Error fetching customers:', customersError.message);
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
        console.error('[ANALYTICS] Error fetching sent emails:', sentError.message);
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

      console.log('[ANALYTICS] Returning employee stats:', summary.length, 'employees', daily.length, 'daily records');

      res.json({ summary, daily });
    } catch (err) {
      console.error('[ANALYTICS] Server error:', err.message);
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
