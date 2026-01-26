/**
 * Email Routes
 * Handles incoming and outgoing email operations
 * Uses emailService for business logic
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorizeCustomerAccess } = require('../middleware/authorization');
const { validateId, sanitizeText } = require('../middleware/validation');
const multer = require('multer');
const upload = multer();
const emailService = require('../services/emailService');
const supabase = require('../config/supabase'); // Still needed for some direct DB checks if not fully migrated or for specific small routes

/**
 * Get unread mails for authenticated user's client
 */
router.get('/getMails', authenticate, async (req, res) => {
  try {
    const data = await emailService.getUnreadMails(req.user.client_id);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[EMAILS] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get all emails for a specific customer
 */
router.get('/getEmailsFromCustomer', 
  authenticate,
  validateId('customerId'),
  authorizeCustomerAccess,
  async (req, res) => {
    try {
      const allMails = await emailService.getCustomerEmails(req.sanitized.customerId);
      res.json({ success: true, allMails });
    } catch (err) {
      console.error('[EMAILS] Error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * Send email to customer
 */
router.post('/sendMail', 
  authenticate,
  validateId('customerId'),
  authorizeCustomerAccess,
  upload.array('attachments'),
  sanitizeText('text', { required: true, maxLength: 50000 }),
  sanitizeText('subject', { required: true, maxLength: 500 }),
  async (req, res) => {
    try {
      const result = await emailService.sendEmail({
        clientId: req.user.client_id,
        employeeId: req.user.employee_id,
        customerId: req.sanitized.customerId,
        to: req.body.to,
        subject: req.sanitized.subject,
        text: req.sanitized.text,
        attachments: req.files,
        threadEmailAddress: req.body.threadEmailAddress,
        ticketStatus: req.body.ticketStatus
      });

      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[EMAILS] Send error:', err);
      const status = err.status || 500;
      res.status(status).json({ success: false, error: err.message });
    }
  }
);

/**
 * Update ticket status
 */
router.post('/updateStatus', 
  authenticate,
  validateId('customerId'),
  authorizeCustomerAccess,
  async (req, res) => {
    try {
      const { status } = req.body;
      const validStatuses = ['new', 'open', 'waiting', 'resolved'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
      }

      await emailService.updateTicketStatus(req.sanitized.customerId, status);
      res.json({ success: true, status });
    } catch (err) {
      console.error('[EMAILS] Error:', err.message);
      res.status(500).json({ success: false, error: 'Server error' });
    } 
  }
);

/**
 * Bulk update ticket status
 */
router.post('/bulkUpdateStatus', authenticate, async (req, res) => {
  try {
    const { customerIds, status } = req.body;
    const validStatuses = ['new', 'open', 'waiting', 'resolved'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const updatedCount = await emailService.bulkUpdateTicketStatus(req.user.client_id, customerIds, status);
    res.json({ success: true, updated: updatedCount, status });
  } catch (err) {
    console.error('[EMAILS] Error:', err.message);
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

/**
 * Get mails for multiple customers
 */
router.get('/getMailsbyCustomerIds', authenticate, async (req, res) => {
  try {
    const ids = ([]).concat(req.query.ids ?? []).map(Number).filter(id => !isNaN(id));
    if (ids.length === 0) {
      return res.status(400).json({ error: 'No valid customer IDs provided' });
    }

    const data = await emailService.getMailsByCustomerIds(req.user.client_id, ids);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[EMAILS] Error:', err.message);
    const status = err.status || 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

/**
 * @deprecated Use updateStatus instead.
 */
router.post('/makeRead', 
  authenticate,
  validateId('customerId'),
  authorizeCustomerAccess,
  async (req, res) => {
    try {
      await emailService.updateTicketStatus(req.sanitized.customerId, 'resolved');
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Server error' });
    } 
  }
);

// Routes that don't fit perfectly into standard CRUD service (Signed URL, Testing) kept here or moved to utilities if shared

router.post('/getSignedUrl', authenticate, async (req, res) => {
  const { location, path } = req.body;
  const client_id = req.user.client_id;

  if (!path || !location || !['attachments', 'avatars'].includes(location)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  if (!path.startsWith(`${client_id}/`)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const { data, error } = await supabase.storage.from(location).createSignedUrl(path, 60 * 5);
    if (error) throw error;
    res.json({ success: true, signedUrl: data.signedUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/test-mailbox', authenticate, async (req, res) => {
  // Logic for testing mailbox connection could also be moved to a service if complex
  // For now keeping it here as it's a utility function
  const nodemailer = require('nodemailer');
  const Imap = require('imap');
  
  try {
    const { email_address, password, imap, imap_port, smtp, smtp_port } = req.body;
    // ... implementation same as before ... 
    // For brevity, assuming this is utility logic.
    // Ideally move to emailService.testConnection(...)
    
    // Quick re-implementation or import from service if we moved it. 
    // Let's assume we want to move it to service eventually.
    // For this refactor, I'll leave the logic here or copy it back.
    // To save context space, I will output the implementation.
    
    // ... [Original Implementation of test-mailbox] ...
     const { email_address: user, password: pass, imap: host, imap_port: port, smtp: smtpHost, smtp_port: smtpPort } = req.body;

    if (!user || !pass || !host || !port || !smtpHost || !smtpPort) {
        return res.status(400).json({ success: false, message: 'Missing fields' });
    }

    const results = { imap: { success: false }, smtp: { success: false } };

    // Test IMAP
    await new Promise((resolve) => {
        const imapConn = new Imap({ user, password: pass, host, port, tls: port === 993, authTimeout: 5000 });
        imapConn.once('ready', () => { results.imap.success = true; imapConn.end(); resolve(); });
        imapConn.once('error', (err) => { results.imap.message = err.message; resolve(); });
        imapConn.connect();
    });

    // Test SMTP
    try {
        const transporter = nodemailer.createTransport({
            host: smtpHost, port: smtpPort, secure: smtpPort === 465, auth: { user, pass }
        });
        await transporter.verify();
        results.smtp.success = true;
    } catch (e) {
        results.smtp.message = e.message;
    }

    if (results.imap.success && results.smtp.success) {
        res.json({ success: true, message: 'Connection successful', details: results });
    } else {
        res.status(400).json({ success: false, message: 'Connection failed', details: results });
    }

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Debug route
router.get('/debug-client-emails', authenticate, async (req, res) => {
    // ... implementation ...
    const { data } = await supabase.from('client-emails').select('*').eq('client_id', req.user.client_id);
    res.json({ success: true, emails: data });
});

module.exports = router;
