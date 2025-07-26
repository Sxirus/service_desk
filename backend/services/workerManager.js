// --- workerManager.js ---
// Worker Manager module for orchestrating multiple IMAP email workers
// This module manages the lifecycle of IMAP workers for all client email accounts
// It fetches client email configurations from the database and starts dedicated workers for each

// Import required modules
const supabase = require('../config/supabase');     // Database client for fetching email configurations
const { startImapWorker } = require('./imapWorker'); // IMAP worker function for individual email accounts

// Track active workers to prevent duplicate instances
// Map structure: clientEmailId -> boolean (true if worker is active)
const activeWorkers = new Map();

/**
 * Initialize IMAP workers for all configured client email accounts
 * This function:
 * 1. Fetches all client email configurations from the database
 * 2. Validates each configuration has required provider settings
 * 3. Starts IMAP workers for valid configurations
 * 4. Tracks active workers to prevent duplicates
 * 
 * Should be called on server startup to begin email monitoring for all clients
 */
async function initializeWorkers() {
  // Fetch all client email configurations with their provider settings
  // Uses Supabase's relational query to join client-emails with email-provider table
  const { data: clientEmails, error } = await supabase
    .from('client-emails')
    .select(`id, client_id, email_address, password, provider:email-provider (imap, imap_port)`);

  // Handle database query errors
  if (error) {
    console.error('Failed to fetch client emails:', error);
    return;
  }

  // Process each client email configuration
  for (const entry of clientEmails) {
    const { id, client_id, email_address, password, provider } = entry;

    // Validate that required provider configuration exists
    // Skip entries that don't have complete IMAP settings
    if (!provider || !provider.imap || !provider.imap_port) {
      console.warn(`Skipping ${email_address} due to missing provider config.`);
      continue;
    }

    // Check if a worker is already running for this email account
    // Prevents duplicate workers for the same email account
    if (activeWorkers.has(id)) {
      console.log(`Worker for ${email_address} already running.`);
      continue;
    }

    // Start a new IMAP worker for this client email account
    console.log(`Starting worker for ${email_address}`);
    startImapWorker({
      email: email_address,                      // Email address to monitor
      password,                                  // Email account password
      imapHost: provider.imap,                   // IMAP server hostname from provider config
      imapPort: provider.imap_port,              // IMAP server port from provider config
      clientId: client_id                               // Client identifier for database association
    });

    // Mark this worker as active to prevent duplicate instances
    activeWorkers.set(id, true);
  }
}

// Export the initialization function for use by the main server
module.exports = { initializeWorkers };
