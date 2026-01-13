/**
 * Worker Manager
 * Manages individual IMAP polling workers for each client email account.
 * Restored to original approach for development.
 */

const supabase = require('../config/supabase');
const encryption = require('../utils/encryption');
const { startImapWorker, stopImapWorker, stopAllWorkers } = require('./imapWorker');
const logger = require('../utils/logger');

// Track active workers to manage their lifecycle
const activeWorkers = new Map(); // Map: clientEmailId -> emailAddress

/**
 * Initialize polling workers for all configured client email accounts
 */
async function initializeWorkers() {
    logger.info('Initializing polling workers (5min interval)...');

    try {
        const { data: clientEmails, error } = await supabase
            .from('client-emails')
            .select(`id, client_id, email_address, password, provider:email-provider (imap, imap_port)`);

        if (error) {
            logger.error('Failed to fetch client emails', { error: error.message });
            return;
        }

        logger.info(`Found ${clientEmails.length} client email configurations`);

        for (const entry of clientEmails) {
            const { id, client_id, email_address, password, provider } = entry;

            if (!provider || !provider.imap || !provider.imap_port) {
                logger.warn(`Skipping ${email_address} - missing IMAP provider configuration`);
                continue;
            }

            if (activeWorkers.has(id)) {
                stopImapWorker(email_address);
            }

            try {
                const decryptedPassword = encryption.decrypt(password);

                await startImapWorker({
                    id,
                    email: email_address,
                    password: decryptedPassword,
                    imapHost: provider.imap,
                    imapPort: provider.imap_port,
                    clientId: client_id
                });
                
                activeWorkers.set(id, email_address);
            } catch (error) {
                logger.error(`Failed to start worker for ${email_address}`, { error: error.message });
            }
        }
        
        logger.info(`Successfully started ${activeWorkers.size} polling workers`);
    } catch (err) {
        logger.error('Worker initialization error', { error: err.message });
    }
}

async function restartWorker(clientEmailId, email_address) {
    logger.info(`Restarting worker for ${email_address}`);
    stopWorkerById(clientEmailId);
    // Note: In original logic, initializeWorkers would be called again or individual start.
    // For simplicity, we just trigger initialization which handles restarts.
    await initializeWorkers();
}

function stopWorkerById(clientEmailId) {
    if (activeWorkers.has(clientEmailId)) {
        const email = activeWorkers.get(clientEmailId);
        stopImapWorker(email);
        activeWorkers.delete(clientEmailId);
    }
}

function stopWorker(email_address) {
    stopImapWorker(email_address);
    for (const [id, workerEmail] of activeWorkers.entries()) {
        if (workerEmail === email_address) {
            activeWorkers.delete(id);
            break;
        }
    }
}

module.exports = {
    initializeWorkers,
    restartWorker,
    stopWorker,
    stopAllWorkers
};