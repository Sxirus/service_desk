// --- imapWorker.js ---
// Polling-based IMAP Worker with time-cutoff strategy
// Restored to original interval-based approach for development

const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { saveEmail, getConfirmation } = require('./emailHandler');
const supabase = require('../config/supabase');
const logger = require('../utils/logger');

// Track polling intervals per email account
const pollingIntervals = new Map();

/**
 * Start polling-based IMAP worker with time-cutoff strategy
 * @param {Object} config - Email account configuration
 */
async function startImapWorker({ id, email, password, imapHost, imapPort, clientId }) {
    logger.info(`[${email}] Starting interval-based polling worker (5min interval)`);
    
    const confirmation = await getConfirmation(clientId);
    
    // Execute first poll immediately
    await pollNewEmailsSinceLast({ id, email, password, imapHost, imapPort, clientId }, confirmation);
    
    // Clear existing interval if present (prevents memory leak on restart)
    if (pollingIntervals.has(email)) {
        clearInterval(pollingIntervals.get(email));
    }
    
    // Set up polling interval (5 minutes = 300000 ms)
    const interval = setInterval(async () => {
        await pollNewEmailsSinceLast({ id, email, password, imapHost, imapPort, clientId }, confirmation);
    }, 300000);
    
    pollingIntervals.set(email, interval);
}

/**
 * Update the status of an email account in the database
 */
async function updateAccountStatus(id, errorMsg = null) {
    try {
        const updates = {
            last_sync_at: new Date().toISOString(),
            last_error: errorMsg
        };

        await supabase
            .from('client-emails')
            .update(updates)
            .eq('id', id);
    } catch (error) {
        logger.error(`[ID: ${id}] Failed to update account status`, { error: error.message });
    }
}

/**
 * Get the timestamp of the last successfully processed email for this inbox
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
                logger.info(`[${email}] No previous emails found. Using 24-hour cutoff for first run.`);
                return getDefaultCutoffTime();
            }
            throw error;
        }

        return new Date(data.send_at);
        
    } catch (error) {
        logger.error(`[${email}] Error fetching last email time`, { error: error.message });
        return getDefaultCutoffTime();
    }
}

function getDefaultCutoffTime() {
    return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function formatDateForImap(date) {
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('en', { month: 'short' });
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

async function pollNewEmailsSinceLast(config, confirmation) {
    const { id, email, password, imapHost, imapPort, clientId } = config;
    
    let imap;
    try {
        const cutoffTime = await getLastEmailTime(email);
        const imapDate = formatDateForImap(cutoffTime);
        
        imap = new Imap({
            user: email,
            password,
            host: imapHost,
            port: imapPort,
            tls: true,
            authTimeout: 15000,
            connTimeout: 30000,
            tlsOptions: {
                rejectUnauthorized: process.env.NODE_ENV === 'production',
                servername: imapHost
            }
        });

        await new Promise((resolve, reject) => {
            imap.once('ready', resolve);
            imap.once('error', (err) => {
                logger.error(`[${email}] IMAP connection error`, { error: err.message });
                reject(err);
            });
            imap.connect();
        });

        await new Promise((resolve, reject) => {
            imap.openBox('INBOX', true, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        const results = await new Promise((resolve, reject) => {
            imap.search([['SINCE', imapDate]], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        if (results.length > 0) {
            await fetchAndProcessEmails(imap, results, email, clientId, confirmation, cutoffTime);
        }

        await updateAccountStatus(id, null);

    } catch (error) {
        logger.error(`[${email}] Polling failed`, { error: error.message });
        await updateAccountStatus(id, error.message);
    } finally {
        if (typeof imap !== 'undefined' && imap.state !== 'disconnected') {
            imap.end();
        }
    }
}

async function fetchAndProcessEmails(imap, seqNumbers, email, clientId, confirmation, cutoffTime) {
    return new Promise((resolve, reject) => {
        const fetch = imap.fetch(seqNumbers, {
            bodies: '',
            struct: true
        });

        let processed = 0;

        fetch.on('message', (msg) => {
            let emailBuffer = '';
            
            msg.on('body', (stream) => {
                stream.on('data', (chunk) => {
                    emailBuffer += chunk.toString('utf8');
                });
            });

            msg.on('end', async () => {
                try {
                    const parsed = await simpleParser(emailBuffer);
                    const emailDate = new Date(parsed.date);
                    
                    if (emailDate > cutoffTime) {
                        await saveEmail(parsed, clientId, email, confirmation);
                        logger.info(`[${email}] Saved: "${parsed.subject}"`);
                    }
                } catch (e) {
                    logger.error(`[${email}] Error processing email`, { error: e.message });
                } finally {
                    processed++;
                    if (processed === seqNumbers.length) resolve();
                }
            });
        });

        fetch.on('error', (err) => {
            logger.error(`[${email}] Fetch error`, { error: err.message });
            reject(err);
        });
    });
}

function stopImapWorker(email) {
    if (pollingIntervals.has(email)) {
        clearInterval(pollingIntervals.get(email));
        pollingIntervals.delete(email);
        logger.info(`[${email}] Polling worker stopped`);
    }
}

function stopAllWorkers() {
    logger.info('Stopping all polling workers...');
    for (const [email, interval] of pollingIntervals.entries()) {
        clearInterval(interval);
    }
    pollingIntervals.clear();
}

module.exports = { startImapWorker, stopImapWorker, stopAllWorkers };