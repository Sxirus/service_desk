/**
 * Global Search Route
 * Provides a unified search endpoint across customers, email addresses,
 * employees, and tickets (incoming-mails).
 *
 * GET /api/search?q=<term>
 *
 * Authentication: Required
 * Authorization: Automatically filtered by user's client_id
 */

const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

router.get('/', authenticate, async (req, res) => {
  try {
    const client_id = req.user.client_id;
    const q = (req.query.q || '').trim();

    // Require at least 2 characters
    if (!q || q.length < 2) {
      return res.json({
        success: true,
        data: { customers: [], emails: [], employees: [], tickets: [] },
      });
    }

    // Sanitize: limit length and escape SQL LIKE special characters
    const sanitizedQ = q.slice(0, 100).replace(/[%_\\]/g, '\\$&');
    const likePattern = `%${sanitizedQ}%`;

    logger.info('[SEARCH] Global search', { query: sanitizedQ, client_id });

    // Determine if the query is a numeric ticket ID
    const isNumeric = /^\d+$/.test(q);

    // Run all queries in parallel
    const [
      customersResult,
      emailAddressesResult,
      employeesResult,
      subjectResult,
      ticketIdResult,
    ] = await Promise.all([
      // 1. Customers by name
      supabase
        .from('customers')
        .select('id, name')
        .eq('client_id', client_id)
        .ilike('name', likePattern)
        .limit(5),

      // 2. Email addresses (no client_id column — verified via customer join below)
      supabase
        .from('email-addresses')
        .select('customer_id, email_address')
        .ilike('email_address', likePattern),

      // 3. Employees by name (active only)
      supabase
        .from('employees')
        .select('id, name, avatar_url')
        .eq('client_id', client_id)
        .eq('disabled', false)
        .ilike('name', likePattern)
        .limit(5),

      // 4. Incoming mails by subject
      supabase
        .from('incoming-mails')
        .select('id, subject, customer_id, status')
        .eq('client_id', client_id)
        .ilike('subject', likePattern)
        .order('send_at', { ascending: false })
        .limit(5),

      // 5. Ticket by ID (only if numeric)
      isNumeric
        ? supabase
            .from('incoming-mails')
            .select('id, subject, customer_id, status')
            .eq('client_id', client_id)
            .eq('id', parseInt(q, 10))
            .limit(1)
        : Promise.resolve({ data: [], error: null }),
    ]);

    // Handle errors
    if (customersResult.error) {
      logger.error('[SEARCH] Customer search error', { error: customersResult.error.message });
    }
    if (emailAddressesResult.error) {
      logger.error('[SEARCH] Email search error', { error: emailAddressesResult.error.message });
    }
    if (employeesResult.error) {
      logger.error('[SEARCH] Employee search error', { error: employeesResult.error.message });
    }
    if (subjectResult.error) {
      logger.error('[SEARCH] Subject search error', { error: subjectResult.error.message });
    }
    if (ticketIdResult.error) {
      logger.error('[SEARCH] Ticket ID search error', { error: ticketIdResult.error.message });
    }

    const customers = customersResult.data || [];
    const employees = employeesResult.data || [];

    // Merge ticket-by-subject and ticket-by-id, deduplicate
    const ticketMap = new Map();
    for (const t of subjectResult.data || []) {
      ticketMap.set(t.id, t);
    }
    for (const t of ticketIdResult.data || []) {
      ticketMap.set(t.id, t);
    }
    const tickets = [...ticketMap.values()].slice(0, 6);

    // For email address results, verify they belong to customers of this client
    let emails = [];
    const rawEmailMatches = emailAddressesResult.data || [];
    if (rawEmailMatches.length > 0) {
      const emailCustomerIds = [...new Set(rawEmailMatches.map((e) => e.customer_id))];

      const { data: verifiedCustomers, error: vcError } = await supabase
        .from('customers')
        .select('id, name')
        .in('id', emailCustomerIds)
        .eq('client_id', client_id);

      if (!vcError && verifiedCustomers) {
        const verifiedMap = new Map(verifiedCustomers.map((c) => [c.id, c.name]));

        emails = rawEmailMatches
          .filter((e) => verifiedMap.has(e.customer_id))
          .map((e) => ({
            email_address: e.email_address,
            customer_id: e.customer_id,
            customer_name: verifiedMap.get(e.customer_id),
          }))
          .slice(0, 5);
      }
    }

    logger.info('[SEARCH] Results', {
      customers: customers.length,
      emails: emails.length,
      employees: employees.length,
      tickets: tickets.length,
    });

    res.json({
      success: true,
      data: { customers, emails, employees, tickets },
    });
  } catch (err) {
    logger.error('[SEARCH] Server error', { error: err.message });
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
