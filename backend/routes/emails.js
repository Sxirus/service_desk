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
const { validateId, sanitizeText, sanitizeHtmlField } = require('../middleware/validation');
const multer = require('multer');
const upload = multer();
const { storeOutgoingAttachmentsInDB } = require('../services/attachments/outgoing');
const encryption = require('../utils/encryption');

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

      // Fetch only unassigned customer mails (customers without an employee_id)
      const { data: unassignedCustomers, error: custErr } = await supabase
        .from('customers')
        .select('id')
        .eq('client_id', client_id)
        .is('employee_id', null);

      if (custErr) {
        console.error('[EMAILS] Customers fetch error:', custErr.message);
        return res.status(500).json({ error: 'Database error' });
      }

      const ids = (unassignedCustomers ?? []).map(c => c.id);
      if (ids.length === 0) {
        console.log('[EMAILS] No unassigned customers, returning empty array');
        return res.json({ success: true, data: [] });
      }

      const { data, error } = await supabase
        .from('incoming-mails')
        .select('*')
        .eq('client_id', client_id)
        .in('customer_id', ids)
        .in('status', ['new', 'open'])
        .order('send_at', { ascending: true })
        .limit(100);

      if (error) {
        console.error('[EMAILS] Supabase error:', error.message);
        return res.status(500).json({ error: 'Database error' });
      }

      const mails = data ?? [];

      console.log('[EMAILS] Fetched', mails.length, 'unread mails');
      res.json({success: true, data: mails});
    } catch (err) {
      console.error('[EMAILS] Server error:', err.message);
      res.status(500).json({ error: 'Server error' });
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
        return res.status(500).json({ error: 'Database error' });
      }

      // Fetch sent mails
      const { data: sentMails, error: errorSent } = await supabase
        .from('sent-mail')
        .select('*')
        .eq('customer_id', customerId);
      
      if (errorSent) {
        console.error('[EMAILS] Error fetching sent mails:', errorSent);
        return res.status(500).json({ error: 'Database error' });
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
      res.json({success: true, allMails});
    } catch (err) {
      console.error('[EMAILS] Server error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * Send email to customer - USING CLIENT SMTP CONFIG FROM DATABASE
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
  upload.array('attachments'),
  sanitizeText('text', { required: true, maxLength: 50000 }),
  sanitizeText('subject', { required: true, maxLength: 500 }),
  sanitizeHtmlField('html', { required: false, maxLength: 100000 }),
  async (req, res) => {
    try {
      const customerId = req.sanitized.customerId;
      const { to, threadEmailAddress } = req.body;
      const subject = req.sanitized.subject;
      const text = req.sanitized.text;
      const html = req.sanitized.html || null;
      const client_id = req.user.client_id;
      const employee_id = req.user.employee_id;

      const attachments = req.files || [];

      console.log('[EMAILS] Sending mail with thread context:', { 
        customerId, 
        threadEmailAddress,
        attachmentCount: attachments.length,
        files: attachments.map(f => f.originalname)
      });

      console.log('[EMAILS] Sending mail to customer:', customerId, 'using client SMTP:', client_id);

      // Check if client is on free tier and has reached limits
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('subscription_tier, auto_assign_employee_on_send')
        .eq('id', client_id)
        .single();

      if (clientError) {
        console.error('[EMAILS] Error fetching client data:', clientError.message);
      } else if (clientData.subscription_tier === 'free' || !clientData.subscription_tier) {
        // Check user limit for free tier
        const { count: activeEmployeeCount } = await supabase
          .from('employees')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', client_id)
          .or('disabled.is.null,disabled.eq.false');

        if (activeEmployeeCount && activeEmployeeCount > 1) {
          console.warn('[EMAILS] Free tier user limit exceeded:', activeEmployeeCount, '/ 1');
          return res.status(403).json({
            success: false,
            error: 'User limit exceeded',
            message: 'You have more than 1 active user on the Free plan. Please upgrade to Pro or disable users to continue sending emails.',
            limitReached: true,
            limitType: 'users'
          });
        }

        // Check email limit for free tier
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const { data: customers } = await supabase
          .from('customers')
          .select('id')
          .eq('client_id', client_id);

        const customerIds = (customers || []).map(c => c.id);
        
        if (customerIds.length > 0) {
          const { count: emailCount } = await supabase
            .from('sent-mail')
            .select('*', { count: 'exact', head: true })
            .in('customer_id', customerIds)
            .gte('send_at', firstDayOfMonth.toISOString());

          if (emailCount && emailCount >= 50) {
            console.warn('[EMAILS] Free tier email limit reached:', emailCount, '/ 50');
            return res.status(403).json({
              success: false,
              error: 'Email limit reached',
              message: 'You have reached your monthly email limit of 50. Please upgrade to Pro plan to send unlimited emails.',
              limitReached: true,
              limitType: 'emails'
            });
          }
        }
      }

      // Validate recipient email
      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Ungültige Empfänger-Email-Adresse' 
        });
      }

      const autoAssign = clientData?.auto_assign_employee_on_send;
      console.log('[Emails] Auto assign employee:', autoAssign);

      if(autoAssign) {
        // Verify customer belongs to user's client and check current assignment
        const { data: customer, error: customerError } = await supabase
          .from('customers')
          .select('client_id, employee_id')
          .eq('id', customerId)
          .single();

        if (customerError || !customer) {
          console.error('[Emails] Customer not found:', customerId);
          return res.status(404).json({ error: 'Customer not found' });
        }

        if (customer.client_id !== client_id) {
          console.warn('[Emails] Unauthorized customer access attempt:', {
            customerId,
            customer_client_id: customer.client_id,
            user_client_id: client_id
          });
          return res.status(403).json({ error: 'Customer does not belong to your client' });
        }

        // Only auto-assign if no employee is currently assigned
        if (customer.employee_id === null || customer.employee_id === undefined) {
          // Verify employee belongs to user's client
          const { data: employee, error: employeeError } = await supabase
            .from('employees')
            .select('client_id')
            .eq('id', employee_id)
            .single();

          if (employeeError || !employee) {
            console.error('[Emails] Employee not found:', employee_id);
            return res.status(404).json({ error: 'Employee not found' });
          }

          if (employee.client_id !== client_id) {
            console.warn('[Emails] Unauthorized employee access attempt:', {
              employee_id,
              employee_client_id: employee.client_id,
              user_client_id: client_id
            });
            return res.status(403).json({ error: 'Employee does not belong to your client' });
          }

          // Proceed with auto-assignment
          const { data, error } = await supabase
            .from('customers')
            .update({ employee_id: employee_id })
            .eq('id', customerId);

          if (error) {
            console.error('[Emails] Auto-assignment update failed:', error.message);
            return res.status(500).json({ error: 'Database error' });
          }

          console.log('[Emails] Successfully auto-assigned employee', employee_id, 'to customer', customerId);
        } else {
          console.log('[Emails] Customer already has an assigned employee, skipping auto-assign');
        }
      }
      
      // 1. SMTP Konfiguration aus Datenbank holen (mit Provider JOIN)
      const smtpConfig = await getClientSmtpConfig(client_id, threadEmailAddress);
      
      if (!smtpConfig) {
        return res.status(500).json({ 
          success: false, 
          error: 'Keine SMTP Konfiguration für diesen Client gefunden. Bitte kontaktieren Sie den Administrator.' 
        });
      }

      console.log('[EMAILS] Using SMTP config:', {
        provider: smtpConfig.provider,
        host: smtpConfig.host,
        port: smtpConfig.port,
        from: smtpConfig.auth.user
      });

      // 2. Create transporter mit Datenbank-Konfiguration
      const transporter = nodemailer.createTransport(smtpConfig);

      // 3. Verify SMTP connection (optional aber empfohlen)
      try {
        await transporter.verify();
        console.log('[EMAILS] SMTP connection verified for provider:', smtpConfig.provider);
      } catch (verifyError) {
        console.error('[EMAILS] SMTP verification failed for provider:', smtpConfig.provider, verifyError);
        return res.status(500).json({ 
          success: false, 
          error: `SMTP Verbindung zu ${smtpConfig.provider} fehlgeschlagen: ${verifyError.message}` 
        });
      }

      // 4. Send email
      const mailOptions = {
        from: `"Service Desk" <${smtpConfig.auth.user}>`,
        to,
        subject,
        text,
        attachments: attachments.map(file => ({
          filename: file.originalname,
          content: file.buffer,
          contentType: file.mimetype
        }))
      };

      // Include HTML body when rich-text content is provided
      if (html) {
        mailOptions.html = html;
      }

      const info = await transporter.sendMail(mailOptions);

      console.log('[EMAILS] Email sent via', smtpConfig.provider, ':', info.messageId);

      // 5. Store in database with authenticated employee_id
      const insertData = {
        employee_id: employee_id,
        text_content: text,
        customer_id: customerId,
        sent_via: smtpConfig.auth.user,
        provider_name: smtpConfig.provider
      };

      // Store HTML content if available
      if (html) {
        insertData.html_content = html;
      }

      const { data, error } = await supabase
        .from('sent-mail')
        .insert([insertData])
        .select()
        .single();

      if (error) {
        console.error('[EMAILS] Database insert error:', error);
        // Email wurde gesendet, aber DB-Speicherung fehlgeschlagen
        return res.status(500).json({ 
          success: false, 
          error: 'Email gesendet, aber Speicherung fehlgeschlagen',
          messageId: info.messageId,
          sentVia: smtpConfig.auth.user
        });
      }

      // 6. Update ticket status (default to 'resolved' if not specified) AND mark emails as read
      const ticketStatus = req.body.ticketStatus || 'resolved';
      const validStatuses = ['new', 'open', 'waiting', 'resolved'];
      const finalStatus = validStatuses.includes(ticketStatus) ? ticketStatus : 'resolved';
      
      const { error: statusError } = await supabase
        .from('incoming-mails')
        .update({ status: finalStatus, read: true })
        .eq('customer_id', customerId);

      if (statusError) {
        console.warn('[EMAILS] Failed to update ticket status:', statusError.message);
        // Non-critical, continue
      } else {
        console.log('[EMAILS] Ticket status updated to:', finalStatus);
      }
      
      if (attachments.length > 0) {
        storeOutgoingAttachmentsInDB(attachments, client_id, data.id);
      } else {
        console.log('[Email] No attachments, procceding');
      }
      

      res.json({
        success: true,
        messageId: info.messageId,
        sentVia: smtpConfig.auth.user,
        provider: smtpConfig.provider,
        insertedData: data
      });
    } catch (err) {
      console.error('[EMAILS] Send error:', err);
      res.status(500).json({ 
        success: false, 
        error: 'Email konnte nicht gesendet werden: ' + err.message 
      });
    }
  }
);

/**
 * Update ticket status for a customer
 * POST /api/emails/updateStatus?customerId=123
 * Body: { status: 'new' | 'open' | 'waiting' | 'resolved' }
 * 
 * Authentication: Required
 * Authorization: Customer must belong to user's client
 */
router.post('/updateStatus', 
  authenticate,
  validateId('customerId'),
  authorizeCustomerAccess,
  async (req, res) => {
    try {
      const customerId = req.sanitized.customerId;
      const { status } = req.body;

      // Validate status value
      const validStatuses = ['new', 'open', 'waiting', 'resolved'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ 
          success: false, 
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
        });
      }

      console.log('[EMAILS] Updating status to', status, 'for customer:', customerId);

      const { data, error } = await supabase
        .from('incoming-mails')
        .update({ status: status })
        .eq('customer_id', customerId);

      if (error) {
        console.error('[EMAILS] Supabase error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }

      console.log('[EMAILS] Status updated to:', status);
      res.json({ success: true, status });
    } catch (err) {
      console.error('[EMAILS] Server error:', err.message);
      res.status(500).json({ success: false, error: 'Server error' });
    } 
  }
);

/**
 * Bulk update ticket status
 * POST /api/emails/bulkUpdateStatus
 * Body: { customerIds: number[], status: 'new' | 'open' | 'waiting' | 'resolved' }
 * 
 * Authentication: Required
 * Authorization: All customers must belong to user's client
 */
router.post('/bulkUpdateStatus',
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      const { customerIds, status } = req.body;

      // Validate status value
      const validStatuses = ['new', 'open', 'waiting', 'resolved'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ 
          success: false, 
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
        });
      }

      // Validate customerIds
      if (!Array.isArray(customerIds) || customerIds.length === 0) {
        return res.status(400).json({ success: false, error: 'customerIds must be a non-empty array' });
      }

      const ids = customerIds.map(Number).filter(id => !isNaN(id));
      if (ids.length === 0) {
        return res.status(400).json({ success: false, error: 'No valid customer IDs provided' });
      }

      console.log('[EMAILS] Bulk updating status to', status, 'for customers:', ids);

      // Verify all customers belong to user's client
      const { data: customers, error: customerError } = await supabase
        .from('customers')
        .select('id, client_id')
        .in('id', ids);

      if (customerError) {
        console.error('[EMAILS] Customer verification error:', customerError);
        return res.status(500).json({ error: 'Database error' });
      }

      const unauthorizedCustomer = customers.find(c => c.client_id !== client_id);
      if (unauthorizedCustomer) {
        console.warn('[EMAILS] Unauthorized bulk status update attempt for customer:', unauthorizedCustomer.id);
        return res.status(403).json({ error: 'Access denied to one or more customers' });
      }

      const authorizedIds = customers.map(c => c.id);

      // Update status for all authorized customers
      const { error } = await supabase
        .from('incoming-mails')
        .update({ status: status })
        .in('customer_id', authorizedIds);

      if (error) {
        console.error('[EMAILS] Bulk status update error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }

      console.log('[EMAILS] Bulk status updated to', status, 'for', authorizedIds.length, 'customers');
      res.json({ success: true, updated: authorizedIds.length, status });
    } catch (err) {
      console.error('[EMAILS] Server error:', err.message);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

/**
 * @deprecated Use updateStatus instead. Kept for backwards compatibility.
 * Mark all emails from a customer as read (sets status to 'resolved')
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

      console.log('[EMAILS] [DEPRECATED] Marking emails as read for customer:', customerId);

      // Update both read flag (for backwards compat) and new status
      const { data, error } = await supabase
        .from('incoming-mails')
        .update({ read: true, status: 'resolved' })
        .eq('customer_id', customerId);

      if (error) {
        console.error('[EMAILS] Supabase error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
      }

      console.log('[EMAILS] Emails marked as read (status: resolved)');
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
        return res.status(500).json({ error: 'Database error' });
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
        .select('*, customers(id, name)')
        .in('customer_id', authorizedIds)
        .in('status', ['new', 'open', 'waiting'])
        .order('send_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('[EMAILS] Supabase error:', error.message);
        return res.status(500).json({ error: 'Database error' });
      }

      console.log('[EMAILS] Fetched', data.length, 'mails for', authorizedIds.length, 'customers');
      res.json({success: true, data});    
    } catch (err) {
      console.error('[EMAILS] Server error:', err.message);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

async function getClientSmtpConfig(client_id, threadEmailAddress = null) {
  try {
    console.log('[EMAILS] Fetching SMTP config for client:', client_id, 'thread email:', threadEmailAddress);

    // 1. Hole Client-Einstellungen (Modus & primäre Email)
    const { data: clientSettings, error: clientError } = await supabase
      .from('clients')
      .select('email_sending_mode, primary_email_id')
      .eq('id', client_id)
      .single();

    if (clientError || !clientSettings) {
      console.error('[EMAILS] Client settings error:', clientError);
      return null;
    }

    const { email_sending_mode, primary_email_id } = clientSettings;

    // 2. Thread-Based Mode: Verwende die Email, von der die ursprüngliche Nachricht kam
    if (email_sending_mode === 'thread-based' && threadEmailAddress) {
      console.log('[EMAILS] Thread-based mode, looking for email:', threadEmailAddress);
      
      const { data: threadEmail, error: threadError } = await supabase
        .from('client-emails')
        .select(`
          id,
          email_address, 
          password,
          email-provider (
            smtp,
            smtp_port
          )
        `)
        .eq('client_id', client_id)
        .eq('email_address', threadEmailAddress)
        .eq('active', true)
        .single();

      if (!threadError && threadEmail && threadEmail['email-provider']) {
        const provider = threadEmail['email-provider'];
        console.log('[EMAILS] Using thread-based email:', threadEmail.email_address);
        
        return {
          host: provider.smtp,
          port: parseInt(provider.smtp_port),
          secure: parseInt(provider.smtp_port) === 465,
          auth: {
            user: threadEmail.email_address,
            pass: encryption.decrypt(threadEmail.password)
          },
          provider: 'Thread-Based: ' + threadEmail.email_address
        };
      } else {
        console.warn('[EMAILS] Thread email not found, falling back to primary mode');
      }
    }

    // 3. Primary Mode: Verwende die konfigurierte primäre Email
    if (email_sending_mode === 'primary' && primary_email_id) {
      console.log('[EMAILS] Primary mode, using primary email ID:', primary_email_id);
      
      const { data: primaryEmail, error: primaryError } = await supabase
        .from('client-emails')
        .select(`
          id,
          email_address, 
          password,
          email-provider (
            smtp,
            smtp_port
          )
        `)
        .eq('id', primary_email_id)
        .eq('client_id', client_id)
        .eq('active', true)
        .single();

      if (!primaryError && primaryEmail && primaryEmail['email-provider']) {
        const provider = primaryEmail['email-provider'];
        console.log('[EMAILS] Using primary email:', primaryEmail.email_address);
        
        return {
          host: provider.smtp,
          port: parseInt(provider.smtp_port),
          secure: parseInt(provider.smtp_port) === 465,
          auth: {
            user: primaryEmail.email_address,
            pass: encryption.decrypt(primaryEmail.password)
          },
          provider: 'Primary: ' + primaryEmail.email_address
        };
      }
    }

    // 4. Fallback: Erste verfügbare Email
    console.warn('[EMAILS] Using fallback - first available email');
    const { data: fallbackEmails, error: fallbackError } = await supabase
      .from('client-emails')
      .select(`
        email_address, 
        password,
        email-provider (
          smtp,
          smtp_port
        )
      `)
      .eq('client_id', client_id)
      .eq('active', true)
      .order('id', { ascending: true })
      .limit(1);

    if (!fallbackError && fallbackEmails && fallbackEmails.length > 0) {
      const fallbackEmail = fallbackEmails[0];
      const provider = fallbackEmail['email-provider'];
      
      if (provider && provider.smtp) {
        return {
          host: provider.smtp,
          port: parseInt(provider.smtp_port),
          secure: parseInt(provider.smtp_port) === 465,
          auth: {
            user: fallbackEmail.email_address,
            pass: encryption.decrypt(fallbackEmail.password)
          },
          provider: 'Fallback: ' + fallbackEmail.email_address
        };
      }
    }
    console.error('[EMAILS] No valid SMTP configuration found for client:', client_id);
    return null;
  } catch (err) {
    console.error('[EMAILS] SMTP config error:', err);
    return null;
  }
}

// In emails.js - Temporäre Debug-Route
router.get('/debug-client-emails', 
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      
      const { data, error } = await supabase
        .from('client-emails')
        .select(`
          id,
          email_address,
          client_id,
          active,
          provider_id,
          "email-provider" (
            name,
            smtp,
            smtp_port
          )
        `)
        .eq('client_id', client_id)
        .eq('active', true);

      console.log('[DEBUG] Client emails for client_id:', client_id, data);

      res.json({
        success: true,
        client_id,
        emails: data,
        count: data?.length || 0
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

//getting a signed url for an attachment
router.post('/getSignedUrl',
  authenticate,
  async (req, res) => {
    const location = req.body.location;
    const path = req.body.path;
    const client_id = req.user.client_id;

    // Security: Validate that the path belongs to the user's client
    if (!path || typeof path !== 'string') {
      return res.status(400).json({ error: 'Path is required' });
    }

    // Validate allowed storage locations
    const allowedLocations = ['attachments', 'avatars'];
    if (!location || !allowedLocations.includes(location)) {
      return res.status(400).json({ error: 'Invalid storage location' });
    }

    // Security check: Verify the path starts with the user's client_id
    // This prevents accessing other clients' files
    if (!path.startsWith(`${client_id}/`)) {
      console.warn('[EMAILS] Access denied - path does not belong to client:', {
        path,
        client_id,
        requestedBy: req.user.employee_id
      });
      return res.status(403).json({ error: 'Access denied to this resource' });
    }

    console.log('[EMAILS] creating signed url for', {
      path: path,
      location: location,
      client_id: client_id
    });

    try {
      const { data, error } = await supabase
        .storage
        .from(location)
        .createSignedUrl(path, 60 * 5);

      if (error) {
        return res.status(500).json({ error: error.message });
      }
      const signedUrl = data.signedUrl;

      return res.json({ success: true, signedUrl });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

/**
 * Test mailbox IMAP/SMTP connection
 * POST /api/emails/test-mailbox
 * 
 * Authentication: Required
 * Body: { email_address, password, imap, imap_port, smtp, smtp_port }
 */
router.post('/test-mailbox',
  authenticate,
  async (req, res) => {
    try {
      const { email_address, password, imap, imap_port, smtp, smtp_port } = req.body;

      if (!email_address || !password || !imap || !imap_port || !smtp || !smtp_port) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required fields' 
        });
      }

      console.log('[EMAILS] Testing mailbox connection for:', email_address);

      const results = {
        imap: { success: false, message: '' },
        smtp: { success: false, message: '' },
      };

      // Test IMAP connection
      try {
        const Imap = require('imap');
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            if (imap) imap.end();
            reject(new Error('IMAP connection timeout'));
          }, 10000);
          
          const imapConnection = new Imap({
            user: email_address,
            password: password,
            host: imap,
            port: imap_port,
            tls: imap_port === 993,
            tlsOptions: { rejectUnauthorized: false },
            connTimeout: 10000,
            authTimeout: 10000,
          });
          
          imapConnection.once('ready', () => {
            clearTimeout(timeout);
            console.log('[EMAILS] IMAP connection successful');
            results.imap = { success: true, message: 'IMAP connection successful' };
            imapConnection.end();
            resolve();
          });
          
          imapConnection.once('error', (err) => {
            clearTimeout(timeout);
            console.error('[EMAILS] IMAP error:', err.message);
            results.imap = { success: false, message: err.message };
            reject(err);
          });
          
          imapConnection.connect();
        });
      } catch (imapErr) {
        console.error('[EMAILS] IMAP test failed:', imapErr.message);
        results.imap = { 
          success: false, 
          message: imapErr.message || 'IMAP connection failed' 
        };
      }

      // Test SMTP connection
      try {
        const transporter = nodemailer.createTransport({
          host: smtp,
          port: smtp_port,
          secure: smtp_port === 465,
          auth: {
            user: email_address,
            pass: password,
          },
          tls: {
            rejectUnauthorized: false,
          },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
        });
        
        await transporter.verify();
        console.log('[EMAILS] SMTP connection successful');
        results.smtp = { success: true, message: 'SMTP connection successful' };
        
        transporter.close();
      } catch (smtpErr) {
        console.error('[EMAILS] SMTP test failed:', smtpErr.message);
        results.smtp = { 
          success: false, 
          message: smtpErr.message || 'SMTP connection failed' 
        };
      }

      // Return comprehensive results
      const allSuccess = results.imap.success && results.smtp.success;
      
      if (!allSuccess) {
        const failedServices = [];
        if (!results.imap.success) failedServices.push(`IMAP: ${results.imap.message}`);
        if (!results.smtp.success) failedServices.push(`SMTP: ${results.smtp.message}`);
        
        return res.status(400).json({
          success: false,
          message: 'Connection test failed',
          details: results,
          errors: failedServices,
        });
      }
      
      return res.json({
        success: true,
        message: 'All connections tested successfully',
        details: results,
      });
    } catch (err) {
      console.error('[EMAILS] Test mailbox error:', err.message);
      return res.status(500).json({ 
        success: false, 
        message: 'Connection test failed: ' + err.message 
      });
    }
  }
);

module.exports = router;