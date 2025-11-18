// --- emailHandler.js ---
// Email Handler module for processing and storing incoming emails in the database
// Handles customer creation, email address management, and email storage for the service desk system

// Import required modules
const { parse } = require('postcss');
const supabase = require('../config/supabase');  // Supabase client for database operations
const { saveAttachment } = require('./attachments/attachmenthandler');
const nodemailer = require('nodemailer');

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
    const { subject, from, to, date, text, html, attachments = [] } = parsedEmail;
    
    // Extract sender's email address from the parsed email structure
    const senderEmailAddress = Array.isArray(from.value) && from.value.length > 0 && from.value[0].address
        ? from.value[0].address
        : null;
    if (!senderEmailAddress) {
        console.error(`[${InboxEmail}] Invalid sender email structure:`, from);
        return;
    }

    // NEU: Extract recipient email addresses (to_email_address)
    let toEmailAddress = null;
    if (Array.isArray(to?.value) && to.value.length > 0) {
        // Nehme die erste Empfänger-Email-Adresse
        toEmailAddress = to.value[0].address;
    } else if (to?.text) {
        // Fallback: Versuche aus dem Text-Feld zu extrahieren
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        const match = to.text.match(emailRegex);
        toEmailAddress = match ? match[0] : null;
    }

    // NEU: received_by ist die InboxEmail (welche unserer Emails hat die Nachricht empfangen)
    const receivedBy = InboxEmail;

    let customerId;

    console.log(`[${InboxEmail}] Checking if email address exists:`, senderEmailAddress);
    
    // Check if this email address is already associated with a customer
    if (!(await checkIfEmailAddressExists(senderEmailAddress))) {
        // Email address is new - create a new customer record
        console.log(`[${InboxEmail}] Email address does not exist, creating new customer with email:`, senderEmailAddress);
        customerId = await createCustomerWithEmail(from, clientId);
        if (!customerId) {
            console.error(`[${clientId}] Failed to create customer for email address:`, senderEmailAddress);
            return;
        }
    } else {
        // Email address exists - retrieve the existing customer ID
        customerId = await getCustomerIdByEmail(senderEmailAddress);
        console.log(`[${InboxEmail}] Email address exists, retrieving customer ID for "${senderEmailAddress}":`, customerId);
    }

    // NEU: Logging der Email-Details für Debugging
    console.log(`[${InboxEmail}] Email details:`, {
        from: senderEmailAddress,
        to: toEmailAddress,
        receivedBy: receivedBy,
        subject: subject
    });

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
            to_email_address: toEmailAddress,        // NEU: Empfänger-Email-Adresse
            received_by: receivedBy                  // NEU: Welche unserer Emails hat die Nachricht empfangen
        }
    ]).select().single();

    // Handle database insertion errors
    if (emailError) {
        console.error(`[${InboxEmail}] Failed to insert email:`, emailError);
        return;
    }

    //saving attachments
    if (attachments.length > 0) {
        console.log(`[${InboxEmail}] Saving attachments`);
        saveAttachment(attachments, clientId, email.id);
    } else {
        console.log(`[${InboxEmail}] Mail had no attachments, proceding`);
    }

    //sending confirmation email
    if (confirmation[0].confirm_mail == null || confirmation[0].confirm_mail == '' || confirmation[0].confirmation_mail_subject == null || confirmation[0].confirmation_mail_subject == '') {
        console.log('Client set no confirmation mail');
    } else {
        sendConfirmation(senderEmailAddress, confirmation[0]);
    }

    console.log(`[${InboxEmail}] New Email processed and saved successfully with ID:`, email.id);
}

/**
 * Create a new customer record with associated email address
 * This function handles the two-step process of creating a customer and linking their email
 * 
 * @param {Object} from - Email sender information from parsed email
 * @param {string} clientId - Client ID this customer belongs to
 * @returns {string|null} The newly created customer's ID, or null if creation failed
 */
async function createCustomerWithEmail(from, clientId) {
    // Extract sender information from email headers
    const senderEmailAddress = from.value[0].address;
    const senderName = from.value[0].name || 'Unknown Sender';  // Fallback for missing name
    
    // Step 1: Create a new customer record in the customers table
    const { data: customer, error: customerError } = await supabase.from('customers').insert([
        {
            client_id: clientId,                 // Associate customer with specific client
            name: senderName                     // Customer's display name from email
        }
    ]).select().single();

    // Handle customer creation errors
    if (customerError) {
        console.error(`[${senderEmailAddress}] Failed to create customer:`, customerError);
        return;
    }

    // Step 2: Create email address record linked to the new customer
    const { data: emailAddress, error: emailError } = await supabase.from('email-addresses').insert([
        {
            email_address: senderEmailAddress,   // The actual email address
            customer_id: customer.id             // Link to the customer we just created
        }
    ]).select().single();

    // Handle email address creation errors
    if (emailError) {
        console.error(`[${clientId}] Failed to create email address:`, emailError);
        return;
    }

    return customer.id; // Return the newly created customer's ID for email association
}

/**
 * Check if an email address already exists in the system
 * Queries the email-addresses table to determine if we have a record for this email
 * 
 * @param {string} email - Email address to check for existence
 * @returns {boolean} True if email exists, false otherwise
 */
async function checkIfEmailAddressExists(email) {
    // Query the email-addresses table for this specific email
    const { data, error } = await supabase.from('email-addresses')
        .select('customer_id')                   // Only need customer_id to confirm existence
        .eq('email_address', email)              // Filter by the email address
        .maybeSingle();                          // Use maybeSingle() to handle 0 or 1 results gracefully
    
    // Handle database query errors
    if (error) {
        console.error(`[${email}] Failed to check email existence:`, error);
        return false;                            // Assume email doesn't exist on error
    } else {
        // Return true if we found a record with a valid customer_id
        return Boolean(data?.customer_id);
    }
}

/**
 * Retrieve the customer ID associated with a given email address
 * Used when we know the email exists and need to link it to an incoming email
 * 
 * @param {string} email - Email address to look up
 * @returns {string|null} Customer ID if found, null if not found or error occurred
 */
async function getCustomerIdByEmail(email) {
    // Query the email-addresses table to get the customer ID
    const { data, error } = await supabase.from('email-addresses')
        .select('customer_id')                   // Only select the customer_id field
        .eq('email_address', email)              // Filter by the email address
        .maybeSingle();                          // Use maybeSingle() for safe single record retrieval
    
    // Handle database query errors
    if (error) {
        console.error(`[${email}] Failed to get customer ID by email:`, error);
        return null;                             // Return null to indicate failure
    }
    
    return data && data.customer_id ? data.customer_id : null; // Return customer ID or null if not found
}

//getting the text send as confirmation
async function getConfirmation(clientId) {
    const {data, error} = await supabase
      .from('clients')
      .select('confirm_mail, confirmation_mail_subject')
      .eq('id', clientId)
      .limit(1)

    if (error) {
        console.log(`[${clientId}, Email Handler] Error getting clients confirm text`, error);
        return null
    }

    return data;
}

//sending a confirmation mail
async function sendConfirmation(customerEmail, confirmation) {
  try {
    const to  = customerEmail
    const subject = confirmation.confirmation_mail_subject
    const text = confirmation.confirm_mail
    
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: false,
      auth: {
        user: process.env.IMAP_USER,
        pass: process.env.IMAP_PASS,
      },
    });

    // Send email
    const info = await transporter.sendMail({
      from: `"Service Desk" <${process.env.MAIL_USER}>`,
      to,
      subject,
      text,
    });

    console.log('[EMAILS] Email sent:', info.messageId);

  } catch (err) {
    console.error('[EMAILS] Send error:', err);
  }
}

// Export the main function for use by IMAP workers
module.exports = { saveEmail, getConfirmation };