// --- imapWorker.js ---
// Polling-based IMAP Worker with time-cutoff strategy
// Fetches only emails since the last successfully processed email for each inbox
// This avoids duplicates and minimizes data transfer

const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { saveEmail, getConfirmation } = require('./emailHandler');
const supabase = require('../config/supabase');

// Track polling intervals per email account
const pollingIntervals = new Map();

/**
 * Start polling-based IMAP worker with time-cutoff strategy
 * @param {Object} config - Email account configuration
 */
async function startImapWorker({ email, password, imapHost, imapPort, clientId }) {
    console.log(`[${email}] Starting time-cutoff polling worker (5min interval)`);
    
    const confirmation = await getConfirmation(clientId);
    
    // Execute first poll immediately
    await pollNewEmailsSinceLast({ email, password, imapHost, imapPort, clientId }, confirmation);
    
    // Clear existing interval if present (prevents memory leak on restart)
    if (pollingIntervals.has(email)) {
        clearInterval(pollingIntervals.get(email));
    }
    
    // Set up polling interval (5 minutes = 300000 ms)
    const interval = setInterval(async () => {
        await pollNewEmailsSinceLast({ email, password, imapHost, imapPort, clientId }, confirmation);
    }, 300000);
    
    pollingIntervals.set(email, interval);
}

/**
 * Get the timestamp of the last successfully processed email for this inbox
 * This serves as our cutoff point - we only fetch emails newer than this
 */
async function getLastEmailTime(email) {
    try {
        const { data, error } = await supabase
            .from('incoming-mails')
            .select('send_at')
            .eq('received_by', email)
            .order('send_at', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No emails found for this inbox - first time setup
                console.log(`[${email}] No previous emails found. Using 24-hour cutoff for first run.`);
                return getDefaultCutoffTime();
            }
            throw error;
        }

        console.log(`[${email}] Last email time: ${data.send_at}`);
        return new Date(data.send_at);
        
    } catch (error) {
        console.error(`[${email}] Error fetching last email time:`, error.message);
        // Fallback to default cutoff on error
        return getDefaultCutoffTime();
    }
}

/**
 * Default cutoff time when no previous emails exist
 * Returns a date 24 hours ago to avoid fetching entire inbox on first run
 */
function getDefaultCutoffTime() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    console.log(`Using default cutoff time: ${twentyFourHoursAgo.toISOString()}`);
    return twentyFourHoursAgo;
}

/**
 * Format date for IMAP SEARCH SINCE command
 * IMAP expects dates in format "DD-MMM-YYYY" (e.g., "15-Jan-2024")
 */
function formatDateForImap(date) {
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('en', { month: 'short' });
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

/**
 * Main polling function - fetches only emails since last processed email
 */
async function pollNewEmailsSinceLast(config, confirmation) {
    const { email, password, imapHost, imapPort, clientId } = config;
    
    console.log(`[${email}] Checking for new emails...`);
    
    // Get cutoff time - we only want emails newer than this
    const cutoffTime = await getLastEmailTime(email);
    const imapDate = formatDateForImap(cutoffTime);
    
    console.log(`[${email}] Fetching emails since ${imapDate} (cutoff: ${cutoffTime.toISOString()})`);
    
    const imap = new Imap({
        user: email,
        password,
        host: imapHost,
        port: imapPort,
        tls: true,
        authTimeout: 15000,
        connTimeout: 30000,
        tlsOptions: {
            rejectUnauthorized: false,
        }
    });

    try {
        await new Promise((resolve, reject) => {
            imap.once('ready', () => {
                console.log(`[${email}] IMAP connected`);
                resolve();
            });

            imap.once('error', (err) => {
                console.error(`[${email}] IMAP connection error:`, err.message);
                reject(err);
            });

            imap.connect();
        });

        // Open INBOX in read-only mode (don't modify emails)
        await new Promise((resolve, reject) => {
            imap.openBox('INBOX', true, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`[${email}] INBOX opened`);
                    resolve();
                }
            });
        });

        // Search for emails since our cutoff date
        // Note: IMAP SINCE is inclusive and uses local date without time
        // We'll do additional time filtering after fetching
        const results = await new Promise((resolve, reject) => {
            imap.search([['SINCE', imapDate]], (err, results) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`[${email}] IMAP found ${results.length} emails since ${imapDate}`);
                    resolve(results);
                }
            });
        });

        if (results.length > 0) {
            await fetchAndProcessEmails(imap, results, email, clientId, confirmation, cutoffTime);
        } else {
            console.log(`[${email}] No new emails found since cutoff`);
        }

    } catch (error) {
        console.error(`[${email}] Polling failed:`, error.message);
    } finally {
        // Always close connection to avoid resource leaks
        imap.end();
        console.log(`[${email}] IMAP connection closed`);
    }
}

/**
 * Fetch and process emails with additional time filtering
 * Since IMAP SINCE only uses date (not time), we need to filter by exact time
 */
async function fetchAndProcessEmails(imap, seqNumbers, email, clientId, confirmation, cutoffTime) {
    return new Promise((resolve, reject) => {
        const fetch = imap.fetch(seqNumbers, {
            bodies: '',
            struct: true
            // Important: No markSeen - don't modify user's emails
        });

        let processed = 0;
        let saved = 0;
        let filtered = 0;

        fetch.on('message', (msg) => {
            let emailBuffer = '';
            
            // Collect email data
            msg.on('body', (stream) => {
                stream.on('data', (chunk) => {
                    emailBuffer += chunk.toString('utf8');
                });
            });

            msg.on('end', async () => {
                try {
                    const parsed = await simpleParser(emailBuffer);
                    
                    // Additional time filtering since IMAP SINCE is date-only
                    const emailDate = new Date(parsed.date);
                    
                    if (emailDate > cutoffTime) {
                        // This email is newer than our cutoff - process it
                        await saveEmail(parsed, clientId, email, confirmation);
                        saved++;
                        console.log(`[${email}] Saved: "${parsed.subject}" (${emailDate.toISOString()})`);
                    } else {
                        // Email is older than cutoff (can happen with IMAP date resolution)
                        filtered++;
                        console.log(`[${email}] Filtered (older than cutoff): "${parsed.subject}"`);
                    }
                    
                    processed++;
                    
                    // Show progress every 10 emails or at the end
                    if (processed % 10 === 0 || processed === seqNumbers.length) {
                        console.log(`[${email}] Progress: ${processed}/${seqNumbers.length} (${saved} saved, ${filtered} filtered)`);
                    }
                    
                } catch (e) {
                    console.error(`[${email}] Error processing email:`, e.message);
                    processed++;
                }

                // Resolve when all emails are processed
                if (processed === seqNumbers.length) {
                    console.log(`[${email}] Finished: ${saved} new emails saved, ${filtered} filtered by time`);
                    resolve();
                }
            });
        });

        fetch.on('error', (err) => {
            console.error(`[${email}] Fetch error:`, err);
            reject(err);
        });

        fetch.on('end', () => {
            // This fires when fetch operation ends, but we wait for all message events
            console.log(`[${email}] Fetch operation completed`);
        });
    });
}

/**
 * Stop individual worker
 */
function stopImapWorker(email) {
    if (pollingIntervals.has(email)) {
        clearInterval(pollingIntervals.get(email));
        pollingIntervals.delete(email);
        console.log(`[${email}] Polling worker stopped`);
    }
}

/**
 * Stop all workers (for graceful shutdown)
 */
function stopAllWorkers() {
    console.log('Stopping all polling workers...');
    for (const [email, interval] of pollingIntervals.entries()) {
        clearInterval(interval);
        console.log(`[${email}] Worker stopped`);
    }
    pollingIntervals.clear();
    console.log('All workers stopped');
}

module.exports = { startImapWorker, stopImapWorker, stopAllWorkers };