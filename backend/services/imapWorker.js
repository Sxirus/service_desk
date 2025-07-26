// --- imapWorker.js ---
// IMAP Worker module for monitoring individual email accounts
// This module creates dedicated IMAP connections for each client's email account

// Import required modules for IMAP email processing
const Imap = require('imap');                    // IMAP client library for email server connections
const { simpleParser } = require('mailparser');  // Email parser for extracting structured data from raw emails
const { saveEmail } = require('./emailHandler'); // Email handler service for database operations

// Enable IMAP debug logging to console for troubleshooting connection issues
Imap.prototype._debug = console.log;

/**
 * Start an IMAP worker for a specific client's email account
 * Creates a dedicated IMAP connection to monitor incoming emails for a single client
 * 
 * @param {Object} config - Configuration object for the email account
 * @param {string} config.email - Email address to connect to
 * @param {string} config.password - Password or app-specific password for the email account
 * @param {string} config.imapHost - IMAP server hostname (e.g., imap.gmail.com)
 * @param {number} config.imapPort - IMAP server port (usually 993 for SSL/TLS)
 * @param {string} config.clientId - Unique identifier for the client this email account belongs to
 */
function startImapWorker({ email, password, imapHost, imapPort, clientId }) {
    // Create IMAP connection instance with client-specific credentials
    const imap = new Imap({
        user: email,                             // Email username/address
        password,                                // Email password or app-specific password
        host: imapHost,                         // IMAP server hostname
        port: imapPort,                         // IMAP server port
        tls: true,                              // Enable TLS encryption for secure connection
        tlsOptions: {
            rejectUnauthorized: false, // unsersicher in production ändern
        }
    });

    /**
     * Open the INBOX folder for monitoring
     * Opens in read-write mode to allow message processing and marking
     * 
     * @param {Function} cb - Callback function to handle opening result
     */
    function openInbox(cb) {
        imap.openBox('INBOX', false, cb);       // false = read-write mode
        console.log(`[${email}] INBOX opened`);
    }

    // Handle successful IMAP connection establishment
    imap.once('ready', () => {
        console.log(`[${email}] Connection ready`);
        
        // Open the inbox once the connection is established
        openInbox((err) => {
            if (err) return console.error(`[${email}] Error opening inbox:`, err);
            console.log(`[${email}] Listening for new emails...`);

            // Set up listener for new incoming emails
            // This event fires whenever new mail arrives in the inbox
            imap.on('mail', (numNewMsgs) => {
                console.log(`[${email}] mail event triggered: ${numNewMsgs} new messages`);
                
                // Fetch the latest message(s) using '*' to get the most recent
                // This approach ensures we capture new emails as they arrive
                const fetch = imap.seq.fetch('*', { 
                    bodies: '',                  // Fetch full email body content
                    struct: true                 // Include email structure information
                });

                // Process each individual email message
                fetch.on('message', (msg) => {
                    // Handle the email body content stream
                    msg.on('body', async (stream) => {
                        try {
                            // Parse the raw email stream into structured data
                            const parsed = await simpleParser(stream);
                            
                            // Save the parsed email to the database with client association
                            await saveEmail(parsed, clientId, email);
                        } catch (e) {
                            console.error(`[${email}] Error parsing message:`, e);
                        }
                    });
                });
            });
        });
    });

    // Handle IMAP connection errors
    // Log errors with email identifier for multi-client debugging
    imap.once('error', (err) => console.error(`[${email}] IMAP error:`, err));
    
    // Handle IMAP connection termination
    // Log when connection is closed for monitoring purposes and attempt to reconnect
    imap.once('end', () => {
      console.warn(`[${email}] Connection closed. Reconnecting in 3 seconds...`);
      setTimeout(() => imap.connect(), 3000);
      console.log(`[${email}] Connecting...`);
    });
    
    // Initiate the IMAP connection to the email server
    imap.connect();
    console.log(`[${email}] Connecting...`);
}

// Export the worker function for use by the worker manager
module.exports = { startImapWorker };