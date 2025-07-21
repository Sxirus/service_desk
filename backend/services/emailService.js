// Import required modules for IMAP email processing
const Imap = require('imap');                    // IMAP client for connecting to email servers
const { simpleParser } = require('mailparser');  // Email parser for extracting email content
require('dotenv').config();                      // Load environment variables

/**
 * EmailService class handles IMAP email monitoring and processing
 * Connects to an email inbox and processes incoming emails for the service desk system
 */
class EmailService {
  constructor() {
    // Initialize IMAP connection with environment variables
    // These credentials should be set in your .env file
    this.imap = new Imap({
      user: process.env.IMAP_USER,               // Email username/address
      password: process.env.IMAP_PASS,           // Email password or app-specific password
      host: process.env.IMAP_HOST,               // IMAP server hostname (e.g., imap.gmail.com)
      port: parseInt(process.env.IMAP_PORT),     // IMAP port (usually 993 for SSL/TLS)
      tls: true                                  // Enable TLS encryption for secure connection
    });

    // Track processed messages to prevent duplicate processing
    this.processedMessages = new Set(); // Duplikat-Tracking
    this.setupEventHandlers();
  }

  /**
   * Set up IMAP event handlers for connection management
   * Handles ready, error, and end events for robust email monitoring
   */
  setupEventHandlers() {
    // Handle successful IMAP connection
    this.imap.once('ready', () => {
      console.log('IMAP connection ready');
      this.openInbox();                          // Open the inbox once connected
    });

    // Handle IMAP connection errors with automatic reconnection
    this.imap.once('error', (err) => {
      console.error('IMAP Error:', err);
      // Reconnect after 5 seconds to handle temporary network issues
      setTimeout(() => this.connect(), 5000);
    });

    // Handle IMAP connection termination
    this.imap.once('end', () => {
      console.log('IMAP Connection ended');
    });
  }

  /**
   * Initiate IMAP connection to the email server
   * Wrapped in try-catch for error handling
   */
  connect() {
    try {
      this.imap.connect();
    } catch (error) {
      console.error('Failed to connect to IMAP:', error);
    }
  }

  /**
   * Open the INBOX folder and set up email monitoring
   * Opens the inbox in read-write mode to allow message processing
   */
  openInbox() {
    this.imap.openBox('INBOX', false, (err, box) => {
      if (err) {
        console.error('Error opening inbox:', err);
        return;
      }

      console.log(`Connected to inbox: ${box.name}`);
      console.log('Listening for new emails...');

      // Set up listener for new incoming emails
      // This event fires whenever new mail arrives in the inbox
      this.imap.on('mail', (numNewMsgs) => {
        console.log(`${numNewMsgs} new email(s) received!`);
        this.processNewEmails();                 // Process the new emails
      });
    });
  }

  /**
   * Process new emails from the inbox
   * Searches for all emails and processes the most recent ones to avoid missing any
   */
  processNewEmails() {
    // Search for all emails in the inbox
    this.imap.search(['ALL'], (err, results) => {
      if (err || !results || results.length === 0) {
        console.error('Error while searching for emails:', err);
        return;
      }

      // Process last 5 emails to catch any missed ones during connection issues
      const recentEmails = results.slice(-5);
      
      // Fetch email headers and bodies for processing
      const fetch = this.imap.seq.fetch(recentEmails, {
        bodies: '',                              // Fetch full email body
        struct: true                             // Include email structure information
      });

      // Handle each individual email message
      fetch.on('message', (msg) => {
        let messageId = null;
        
        // Extract email attributes (including unique ID)
        msg.on('attributes', (attrs) => {
          messageId = attrs.uid;                 // Use UID as unique message identifier
        });

        // Process the email body content
        msg.on('body', async (stream) => {
          try {
            // Skip emails that have already been processed to prevent duplicates
            if (this.processedMessages.has(messageId)) {
              console.log(`Email ${messageId} already processed, skipping`);
              return;
            }

            // Parse the raw email stream into structured data
            const parsed = await simpleParser(stream);
            const emailData = this.extractEmailData(parsed);
            
            // TODO: Save to database when Jakob is ready
            // This is where the email would be converted to a support ticket
            console.log('Processed email:', emailData.subject);
            
            // Mark this email as processed to avoid future duplicate processing
            this.processedMessages.add(messageId);
          } catch (error) {
            console.error('Error processing email:', error);
          }
        });
      });

      // Log when email fetching is complete
      fetch.once('end', () => {
        console.log('Email fetch complete');
      });
    });
  }

  /**
   * Extract and structure email data from parsed email content
   * Converts raw email data into a standardized format for the service desk system
   * @param {Object} parsed - Parsed email object from mailparser
   * @returns {Object} Structured email data ready for database storage
   */
  extractEmailData(parsed) {
    return {
      messageId: parsed.messageId,               // Unique message identifier from email headers
      subject: parsed.subject || 'No Subject',  // Email subject line (fallback for missing subject)
      
      // Sender information with fallbacks for missing data
      from: {
        email: parsed.from?.value?.[0]?.address || 'unknown@unknown.com',
        name: parsed.from?.value?.[0]?.name || 'Unknown Sender'
      },
      
      // Recipient information (can be multiple recipients)
      to: parsed.to?.value?.map(addr => ({
        email: addr.address,
        name: addr.name
      })) || [],
      
      date: parsed.date || new Date(),           // Email timestamp (fallback to current time)
      textContent: parsed.text || '',           // Plain text version of email content
      htmlContent: parsed.html || '',           // HTML version of email content (if available)
      
      // File attachments processing (be careful with large files!)
      attachments: parsed.attachments?.map(att => ({
        filename: att.filename,                  // Original filename
        contentType: att.contentType,            // MIME type (e.g., image/jpeg, application/pdf)
        size: att.size,                         // File size in bytes
        content: att.content                    // Binary content - Consider storing separately for large files
      })) || [],
      
      // Email threading information for conversation tracking
      inReplyTo: parsed.inReplyTo,              // Message ID this email is replying to
      references: parsed.references             // Chain of message IDs for conversation history
    };
  }

  /**
   * Graceful shutdown of the IMAP connection
   * Ensures the connection is properly closed when the service stops
   */
  disconnect() {
    if (this.imap) {
      this.imap.end();                          // Close the IMAP connection cleanly
    }
  }
}

module.exports = EmailService;