// --- workerManager.js ---
// Worker Manager for email polling with time-cutoff strategy
// Manages lifecycle of IMAP polling workers for all client email accounts

const supabase = require('../config/supabase');
const { startImapWorker, stopImapWorker, stopAllWorkers } = require('./imapWorker');

// Track active workers to manage their lifecycle
const activeWorkers = new Map(); // Map: clientEmailId -> emailAddress

/**
 * Initialize polling workers for all configured client email accounts
 * Uses time-cutoff strategy to only fetch emails since last processed email
 */
async function initializeWorkers() {
    console.log('Initializing time-cutoff polling workers (120s interval)...');

    // Fetch all client email configurations with provider settings
    const { data: clientEmails, error } = await supabase
        .from('client-emails')
        .select(`id, client_id, email_address, password, provider:email-provider (imap, imap_port)`);

    if (error) {
        console.error('Failed to fetch client emails:', error);
        return;
    }

    console.log(`Found ${clientEmails.length} client email configurations`);

    // Start a worker for each configured email account
    for (const entry of clientEmails) {
        const { id, client_id, email_address, password, provider } = entry;

        // Validate provider configuration
        if (!provider || !provider.imap || !provider.imap_port) {
            console.warn(`Skipping ${email_address} - missing IMAP provider configuration`);
            continue;
        }

        // Stop existing worker if already running (restart scenario)
        if (activeWorkers.has(id)) {
            console.log(`Restarting worker for ${email_address}`);
            stopImapWorker(email_address);
        }

        console.log(`Starting time-cutoff worker for ${email_address}`);
        
        try {
            await startImapWorker({
                email: email_address,
                password,
                imapHost: provider.imap,
                imapPort: provider.imap_port,
                clientId: client_id
            });
            
            // Track active worker
            activeWorkers.set(id, email_address);
            
        } catch (error) {
            console.error(`Failed to start worker for ${email_address}:`, error.message);
        }
    }
    
    console.log(`Successfully started ${activeWorkers.size} time-cutoff polling workers`);
}

/**
 * Stop specific worker by client email ID
 */
function stopWorkerById(clientEmailId) {
    if (activeWorkers.has(clientEmailId)) {
        const email = activeWorkers.get(clientEmailId);
        stopImapWorker(email);
        activeWorkers.delete(clientEmailId);
        console.log(`Stopped worker for ${email}`);
    }
}

/**
 * Stop specific worker by email address
 */
function stopWorkerByEmail(email) {
    stopImapWorker(email);
    // Find and remove from activeWorkers map
    for (const [id, workerEmail] of activeWorkers.entries()) {
        if (workerEmail === email) {
            activeWorkers.delete(id);
            break;
        }
    }
    console.log(`Stopped worker for ${email}`);
}

module.exports = { 
    initializeWorkers, 
    stopAllWorkers, 
    stopWorkerById,
    stopWorkerByEmail 
};