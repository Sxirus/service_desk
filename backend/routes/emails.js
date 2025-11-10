/**
 * Email Routes - UPDATED WITH SECURITY
 * Handles incoming and outgoing email operations
 * 
 * All routes now protected with authentication and authorization
 */

const express = require('express');
const router = express.Router();
const supabase = require("../config/supabase");
const nodemailer = require('nodemailer');
const { authenticate } = require('../middleware/auth');
const { authorizeCustomerAccess } = require('../middleware/authorization');
const { validateId, sanitizeText } = require('../middleware/validation');

/**
 * Get unread mails for authenticated user's client
 * GET /api/emails/getMails
 * 
 * Authentication: Required
 * Authorization: Automatically filtered by user's client_id
 */
router.get('/getMails', 
  authenticate,
  async (req, res) => {
    try {
      // Use client_id from authenticated user (secure - can't be spoofed)
      const client_id = req.user.client_id;
      
      console.log('[EMAILS] Fetching mails for client:', client_id);
      
      const { data, error } = await supabase
        .from('incoming-mails') 
        .select('*')
        .eq("client_id", client_id)
        .eq('read', false)
        .order('send_at', { ascending: true })
        .limit(100);

      if (error) {
        console.error('[EMAILS] Supabase error:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[EMAILS] Fetched', data.length, 'unread mails');
      res.json(data);
    } catch (err) {
      console.error('[EMAILS] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

/**
 * Get all emails for a specific customer
 * GET /api/emails/getEmailsFromCustomer?customerId=123
 * 
 * Authentication: Required
 * Authorization: Customer must belong to user's client
 */
router.get('/getEmailsFromCustomer', 
  authenticate,
  validateId('customerId'),
  authorizeCustomerAccess, // Verifies customer belongs to user's client
  async (req, res) => {
    try {
      const customerId = req.sanitized.customerId;
      
      console.log('[EMAILS] Fetching emails for customer:', customerId);

      // Fetch incoming mails
      const { data: incomingMails, error: errorIncoming } = await supabase
        .from('incoming-mails')
        .select('*')
        .eq('customer_id', customerId);

      if (errorIncoming) {
        console.error('[EMAILS] Error fetching incoming mails:', errorIncoming);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      // Fetch sent mails
      const { data: sentMails, error: errorSent } = await supabase
        .from('sent-mail')
        .select('*')
        .eq('customer_id', customerId);
      
      if (errorSent) {
        console.error('[EMAILS] Error fetching sent mails:', errorSent);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      // Combine and sort by date
      let allMails;
      if (sentMails && sentMails.length > 0) {
        allMails = [
          ...incomingMails.map(m => ({
            type: 'incoming',
            sendBy: m.customer_id,
            subject: m.subject,
            text: m.text_content,
            date: new Date(m.send_at),
            email_address: m.email_address,
          })),
          ...sentMails.map(m => ({
            type: 'sent',
            sendBy: m.employee_id,
            subject: 'None',
            text: m.text_content,
            date: new Date(m.send_at),
          })),
        ].sort((a, b) => a.date - b.date);
      } else {
        allMails = incomingMails.map(m => ({
          type: 'incoming',
          sendBy: m.customer_id,
          subject: m.subject,
          text: m.text_content,
          date: new Date(m.send_at),
          email_address: m.email_address,
        }));
      }

      console.log('[EMAILS] Fetched', allMails.length, 'total emails');
      res.json(allMails);
    } catch (err) {
      console.error('[EMAILS] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

/**
 * Send email to customer
 * POST /api/emails/sendMail?customerId=123
 * Body: { to, subject, text }
 * 
 * Authentication: Required
 * Authorization: Customer must belong to user's client
 */
router.post('/sendMail', 
  authenticate,
  validateId('customerId'),
  authorizeCustomerAccess,
  sanitizeText('text', { required: true, maxLength: 50000 }),
  sanitizeText('subject', { required: true, maxLength: 500 }),
  async (req, res) => {
    try {
      const customerId = req.sanitized.customerId;
      const { to } = req.body;
      const subject = req.sanitized.subject;
      const text = req.sanitized.text;

      console.log('[EMAILS] Sending mail to customer:', customerId);

      // Validate recipient email
      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid recipient email address' 
        });
      }

      // Create transporter
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE,
        auth: {
          user: process.env.IMAP_USER,
          pass: process.env.IMAP_PASS,
        },
      });

      // Send email
      const info = await transporter.sendMail({
        from: `${process.env.MAIL_USER}`,
        to,
        subject,
        text,
      });

      console.log('[EMAILS] Email sent:', info.messageId);

      // Store in database with authenticated employee_id
      const { data, error } = await supabase
        .from('sent-mail')
        .insert([{
          employee_id: req.user.employee_id, // Use authenticated user's employee_id
          text_content: text,
          customer_id: customerId
        }]);

      if (error) {
        console.error('[EMAILS] Database insert error:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to save sent email' 
        });
      }

      res.json({
        success: true,
        messageId: info.messageId,
        insertedData: data
      });
    } catch (err) {
      console.error('[EMAILS] Send error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * Mark all emails from a customer as read
 * POST /api/emails/makeRead?customerId=123
 * 
 * Authentication: Required
 * Authorization: Customer must belong to user's client
 */
router.post('/makeRead', 
  authenticate,
  validateId('customerId'),
  authorizeCustomerAccess,
  async (req, res) => {
    try {
      const customerId = req.sanitized.customerId;

      console.log('[EMAILS] Marking emails as read for customer:', customerId);

      const { data, error } = await supabase
        .from('incoming-mails')
        .update({ read: true })
        .eq('customer_id', customerId);

      if (error) {
        console.error('[EMAILS] Supabase error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }

      console.log('[EMAILS] Emails marked as read');
      res.json({ success: true });
    } catch (err) {
      console.error('[EMAILS] Server error:', err.message);
      res.status(500).json({ success: false, error: 'Servererror' });
    } 
  }
);

/**
 * Get mails for multiple customers
 * GET /api/emails/getMailsbyCustomerIds?ids=1,2,3
 * 
 * Authentication: Required
 * Authorization: All customers must belong to user's client
 */
router.get('/getMailsbyCustomerIds', 
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      
      // Parse customer IDs from query parameter
      const ids = ([]).concat(req.query.ids ?? []).map(Number).filter(id => !isNaN(id));
      
      if (ids.length === 0) {
        return res.status(400).json({ error: 'No valid customer IDs provided' });
      }

      console.log('[EMAILS] Fetching mails for customers:', ids);

      // Verify all customers belong to user's client (security check)
      const { data: customers, error: customerError } = await supabase
        .from('customers')
        .select('id, client_id')
        .in('id', ids);

      if (customerError) {
        console.error('[EMAILS] Customer verification error:', customerError);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      // Check if any customer doesn't belong to user's client
      const unauthorizedCustomer = customers.find(c => c.client_id !== client_id);
      if (unauthorizedCustomer) {
        console.warn('[EMAILS] Unauthorized access attempt for customer:', unauthorizedCustomer.id);
        return res.status(403).json({ error: 'Access denied to one or more customers' });
      }

      // Fetch mails only for authorized customers
      const authorizedIds = customers.map(c => c.id);
      
      const { data, error } = await supabase
        .from('incoming-mails') 
        .select('*')
        .in('customer_id', authorizedIds)
        .eq('read', false)
        .order('send_at', { ascending: true })
        .limit(100);

      if (error) {
        console.error('[EMAILS] Supabase error:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[EMAILS] Fetched', data.length, 'mails for', authorizedIds.length, 'customers');
      res.json(data);    
    } catch (err) {
      console.error('[EMAILS] Server error:', err.message);
      res.status(500).json({ success: false, error: 'Servererror' });
    }
  }
);

module.exports = router;