// --- emailHandler.js ---
// Email Handler module for processing and storing incoming emails in the database
// Handles customer creation, email address management, and email storage for the service desk system

// Import required modules
const supabase = require('../config/supabase');  // Supabase client for database operations
const { storeIncomingAttachmentInDB } = require('./attachments/incoming');
const nodemailer = require('nodemailer');
const { getClientSmtpConfig } = require('./emailService');
const logger = require('../utils/logger');

/**
 * Save a parsed email to the database with customer association
 * This function handles the complete workflow of processing an incoming email:
 * 1. Extract sender information from the email
 * 2. Check if sender exists as a customer
 * 3. Create new customer if needed
 * 4. Store the email in the incoming-mails table
 * 
 * @param {Object} parsedEmail - Parsed email object from mailparser
 * @param {string} clientId - Unique identifier for the client this email belongs to
 * @param {string} InboxEmail - The inbox email address this process belongs to (for logging and debugging)
 */
async function saveEmail(parsedEmail, clientId, InboxEmail, confirmation) {
    // Extract relevant email data for processing
    const { subject, from, to, date, text, html, attachments = [], messageId } = parsedEmail;
    
    // Extract sender's email address from the parsed email structure
    const senderEmailAddress = Array.isArray(from.value) && from.value.length > 0 && from.value[0].address
        ? from.value[0].address
        : null;
    if (!senderEmailAddress) {
        logger.error(`[${InboxEmail}] Invalid sender email structure`, { from });
        return;
    }

    // Deduplication: skip if we've already processed this message_id
    if (messageId) {
        const { data: existingEmail } = await supabase
            .from('incoming-mails')
            .select('id')
            .eq('message_id', messageId)
            .eq('client_id', clientId)
            .maybeSingle();

        if (existingEmail) {
            logger.info(`[${InboxEmail}] Duplicate email detected (message_id: ${messageId}), skipping`);
            return;
        }
    }

    // Extract recipient email addresses (to_email_address)
    let toEmailAddress = null;
    if (Array.isArray(to?.value) && to.value.length > 0) {
        // Take the first recipient email address
        toEmailAddress = to.value[0].address;
    } else if (to?.text) {
        // Fallback: try to extract from text field
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        const match = to.text.match(emailRegex);
        toEmailAddress = match ? match[0] : null;
    }

    // received_by is the inbox email
    const receivedBy = InboxEmail;

    let customerId;

    logger.info(`[${InboxEmail}] Checking if email address exists`, { senderEmailAddress });
    
    // Check if this email address is already associated with a customer
    if (!(await checkIfEmailAddressExists(senderEmailAddress))) {
        // Email address is new - create a new customer record
        logger.info(`[${InboxEmail}] Email address does not exist, creating new customer with email`, { senderEmailAddress });
        customerId = await createCustomerWithEmail(from, clientId);
        if (!customerId) {
            logger.error(`[${clientId}] Failed to create customer for email address`, { senderEmailAddress });
            return;
        }
    } else {
        // Email address exists - retrieve the existing customer ID
        customerId = await getCustomerIdByEmail(senderEmailAddress);
        logger.info(`[${InboxEmail}] Email address exists, retrieving customer ID for "${senderEmailAddress}"`, { customerId });
    }

    // Log email details for debugging
    logger.info(`[${InboxEmail}] Email details`, {
        from: senderEmailAddress,
        to: toEmailAddress,
        receivedBy: receivedBy,
        subject: subject
    });

    // Determine initial status based on ticket lifecycle:
    // - If there's no prior agent response (no sent-mail), status is 'new'
    // - If agent has responded before and ticket was 'resolved', this is a re-open -> 'open'
    // - Otherwise for follow-ups during active conversation -> 'open'
    let initialStatus = 'new';
    
    // Check if there are any sent emails to this customer (agent has responded before)
    const { data: sentEmails, error: sentError } = await supabase
        .from('sent-mail')
        .select('id')
        .eq('customer_id', customerId)
        .limit(1);
    
    if (!sentError && sentEmails && sentEmails.length > 0) {
        // Agent has responded before, this is a follow-up or re-open
        // Check the most recent email status for this customer
        const { data: lastEmail } = await supabase
            .from('incoming-mails')
            .select('status')
            .eq('customer_id', customerId)
            .order('send_at', { ascending: false })
            .limit(1)
            .single();
        
        if (lastEmail?.status === 'resolved') {
            // Ticket was resolved, customer is re-opening it
            initialStatus = 'open';
            logger.info(`[${InboxEmail}] Customer re-opening resolved ticket, setting status to 'open'`);
        } else {
            // Active conversation, customer follow-up
            initialStatus = 'open';
            logger.info(`[${InboxEmail}] Customer follow-up on active ticket, setting status to 'open'`);
        }
    } else {
        logger.info(`[${InboxEmail}] New ticket (no prior agent response), setting status to 'new'`);
    }

    // Insert the email into the incoming-mails table with customer association
    const { data: email, error: emailError } = await supabase.from('incoming-mails').insert([
        {
            send_at: date,                           // When the email was sent
            client_id: clientId,                     // Which client this email belongs to
            customer_id: customerId,                 // Which customer sent this email
            subject: subject,                        // Email subject line
            text_content: text,                      // Plain text version of email content
            html_content: html,                      // HTML version of email content
            email_address: senderEmailAddress,       // Sender's email address for quick reference
            to_email_address: toEmailAddress,        // Recipient email address
            received_by: receivedBy,                 // Which of our emails received the message
            message_id: messageId || null,           // Email Message-ID header for deduplication
            status: initialStatus                    // Ticket lifecycle status
        }
    ]).select().single();

    // Handle database insertion errors
    if (emailError) {
        logger.error(`[${InboxEmail}] Failed to insert email`, { error: emailError });
        return;
    }

    //saving attachments
    if (attachments.length > 0) {
        logger.info(`[${InboxEmail}] Saving attachments`);
        storeIncomingAttachmentInDB(attachments, clientId, email.id);
    } else {
        logger.info(`[${InboxEmail}] Mail had no attachments, proceding`);
    }

    //sending confirmation email
    const confirmMode = confirmation[0].confirmation_mail_mode || 'all';

    if (confirmMode === 'disabled') {
        logger.info(`[${InboxEmail}] Confirmation mail is disabled for this client`);
    } else if (confirmation[0].confirm_mail == null || confirmation[0].confirm_mail == '' || confirmation[0].confirmation_mail_subject == null || confirmation[0].confirmation_mail_subject == '') {
        logger.info('Client set no confirmation mail');
    } else if (confirmMode === 'new_only' && initialStatus !== 'new') {
        logger.info(`[${InboxEmail}] Confirmation mail mode is 'new_only' but ticket status is '${initialStatus}', skipping`);
    } else {
        sendConfirmation(senderEmailAddress, confirmation[0], clientId, InboxEmail);
    }

    logger.info(`[${InboxEmail}] New Email processed and saved successfully`, { emailId: email.id });
}

/**
 * Create a new customer record with associated email address
 */
async function createCustomerWithEmail(from, clientId) {
    const senderEmailAddress = from.value[0].address;
    const senderName = from.value[0].name || 'Unknown Sender';
    
    const { data: customer, error: customerError } = await supabase.from('customers').insert([
        {
            client_id: clientId,
            name: senderName
        }
    ]).select().single();

    if (customerError) {
        logger.error(`[${senderEmailAddress}] Failed to create customer`, { error: customerError });
        return;
    }

    const { data: emailAddress, error: emailError } = await supabase.from('email-addresses').insert([
        {
            email_address: senderEmailAddress,
            customer_id: customer.id
        }
    ]).select().single();

    if (emailError) {
        logger.error(`[${clientId}] Failed to create email address`, { error: emailError });
        return;
    }

    return customer.id;
}

/**
 * Check if an email address already exists in the system
 */
async function checkIfEmailAddressExists(email) {
    const { data, error } = await supabase.from('email-addresses')
        .select('customer_id')
        .eq('email_address', email)
        .maybeSingle();
    
    if (error) {
        logger.error(`[${email}] Failed to check email existence`, { error });
        return false;
    } else {
        return Boolean(data?.customer_id);
    }
}

/**
 * Retrieve the customer ID associated with a given email address
 */
async function getCustomerIdByEmail(email) {
    const { data, error } = await supabase.from('email-addresses')
        .select('customer_id')
        .eq('email_address', email)
        .maybeSingle();
    
    if (error) {
        logger.error(`[${email}] Failed to get customer ID by email`, { error });
        return null;
    }
    
    return data && data.customer_id ? data.customer_id : null;
}

/**
 * Get confirmation email settings for a client
 */
async function getConfirmation(clientId) {
    const {data, error} = await supabase
      .from('clients')
      .select('confirm_mail, confirmation_mail_subject, confirmation_mail_mode')
      .eq('id', clientId)
      .limit(1)

    if (error) {
        logger.info(`[${clientId}, Email Handler] Error getting clients confirm text`, { error });
        return null
    }

    return data;
}

/**
 * Send a confirmation email to the customer
 */
async function sendConfirmation(customerEmail, confirmation, clientId, inboxEmail) {
  try {
    const to = customerEmail;
    const subject = confirmation.confirmation_mail_subject;
    const htmlBody = confirmation.confirm_mail;
    const textBody = htmlBody ? htmlBody.replace(/<[^>]*>/g, '') : '';

    const smtpConfig = await getClientSmtpConfig(clientId, inboxEmail);
    if (!smtpConfig) {
      logger.error(`[CONFIRMATION] No SMTP configuration found for client ${clientId}`);
      return;
    }

    const transporter = nodemailer.createTransport(smtpConfig);

    const info = await transporter.sendMail({
      from: `"Service Desk" <${smtpConfig.auth.user}>`,
      to,
      subject,
      text: textBody,
      html: htmlBody,
    });

    logger.info('[CONFIRMATION] Confirmation email sent', { messageId: info.messageId });

  } catch (err) {
    logger.error('[CONFIRMATION] Send error', { error: err });
  }
}

module.exports = { saveEmail, getConfirmation };
