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
  sanitizeText('text', { required: true, maxLength: 50000 }),
  sanitizeText('subject', { required: true, maxLength: 500 }),
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      const customerId = req.sanitized.customerId;
      const { to, threadEmailAddress } = req.body;
      const subject = req.sanitized.subject;
      const text = req.sanitized.text;

      console.log('[EMAILS] Sending mail with thread context:', { 
        customerId, 
        threadEmailAddress 
      });

      console.log('[EMAILS] Sending mail to customer:', customerId, 'using client SMTP:', client_id);

      // Validate recipient email
      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Ungültige Empfänger-Email-Adresse' 
        });
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
      const info = await transporter.sendMail({
        from: `"Service Desk" <${smtpConfig.auth.user}>`,
        to,
        subject,
        text,
      });

      console.log('[EMAILS] Email sent via', smtpConfig.provider, ':', info.messageId);

      // 5. Store in database with authenticated employee_id
      const { data, error } = await supabase
        .from('sent-mail')
        .insert([{
          employee_id: req.user.employee_id,
          text_content: text,
          customer_id: customerId,
          sent_via: smtpConfig.auth.user, // Welche Email verwendet wurde
          provider_name: smtpConfig.provider // Welcher Provider verwendet wurde
        }]);

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
            pass: threadEmail.password
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
            pass: primaryEmail.password
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
            pass: fallbackEmail.password
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
        client_id,
        emails: data,
        count: data?.length || 0
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;