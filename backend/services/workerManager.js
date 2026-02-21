/**
 * Worker Manager
 * Manages individual IMAP polling workers as child processes.
 * Each email account runs in its own Node.js process via child_process.fork(),
 * so a stuck/crashed IMAP connection cannot affect the main backend.
 */

const { fork } = require('child_process');
const path = require('path');
const supabase = require('../config/supabase');
const encryption = require('../utils/encryption');
const logger = require('../utils/logger');

// Track active worker child processes
const activeWorkers = new Map(); // Map: clientEmailId -> { child, email, restartCount }
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_DELAY_MS = 10000; // 10 seconds before restart

/**
 * Fork a child process for a single email account worker
 */
function startWorkerProcess(config) {
    const child = fork(path.join(__dirname, 'imapWorkerProcess.js'), [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    child.on('message', (msg) => {
        if (msg.type === 'started') {
            logger.info(`[WORKER] Child process started for ${msg.email} (pid: ${child.pid})`);
        } else if (msg.type === 'error') {
            logger.error(`[WORKER] Child process error for ${msg.email}`, { error: msg.error });
        } else if (msg.type === 'crash') {
            logger.error(`[WORKER] Child process crashed for ${msg.email}`, { error: msg.error });
        }
    });

    child.on('exit', (code, signal) => {
        if (code !== 0 && code !== null) {
            logger.warn(`[WORKER] Child process for ${config.email} exited with code ${code}`);
            scheduleRestart(config);
        } else if (signal) {
            logger.info(`[WORKER] Child process for ${config.email} killed by signal ${signal}`);
        }
    });

    child.on('error', (err) => {
        logger.error(`[WORKER] Child process spawn error for ${config.email}`, { error: err.message });
    });

    // Pipe child stdout/stderr to logger
    if (child.stdout) child.stdout.on('data', (data) => logger.info(`[${config.email}] ${data.toString().trim()}`));
    if (child.stderr) child.stderr.on('data', (data) => logger.error(`[${config.email}] ${data.toString().trim()}`));

    // Send start command with config
    child.send({ type: 'start', config });
    return child;
}

/**
 * Schedule a restart for a crashed worker with exponential backoff
 */
function scheduleRestart(config) {
    const worker = activeWorkers.get(config.id);
    if (!worker) return;

    const restartCount = (worker.restartCount || 0) + 1;
    if (restartCount > MAX_RESTART_ATTEMPTS) {
        logger.error(`[WORKER] Max restart attempts reached for ${config.email}, giving up`);
        activeWorkers.delete(config.id);
        return;
    }

    const delay = RESTART_DELAY_MS * restartCount;
    logger.info(`[WORKER] Scheduling restart #${restartCount} for ${config.email} in ${delay}ms`);

    setTimeout(async () => {
        try {
            // Re-fetch config in case password/settings changed
            const { data: entry, error } = await supabase
                .from('client-emails')
                .select(`id, client_id, email_address, password, provider:email-provider (imap, imap_port)`)
                .eq('id', config.id)
                .single();

            if (error || !entry || !entry.provider?.imap) {
                logger.error(`[WORKER] Cannot restart ${config.email} - config no longer valid`);
                activeWorkers.delete(config.id);
                return;
            }

            const decryptedPassword = encryption.decrypt(entry.password);
            const newConfig = {
                id: entry.id,
                email: entry.email_address,
                password: decryptedPassword,
                imapHost: entry.provider.imap,
                imapPort: entry.provider.imap_port,
                clientId: entry.client_id
            };

            const child = startWorkerProcess(newConfig);
            activeWorkers.set(config.id, { child, email: newConfig.email, restartCount });
        } catch (err) {
            logger.error(`[WORKER] Restart failed for ${config.email}`, { error: err.message });
        }
    }, delay);
}

/**
 * Initialize polling workers for all configured client email accounts
 */
async function initializeWorkers() {
    logger.info('Initializing IMAP worker child processes (5min polling interval)...');

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
                stopWorkerById(id);
            }

            try {
                const decryptedPassword = encryption.decrypt(password);
                const config = {
                    id,
                    email: email_address,
                    password: decryptedPassword,
                    imapHost: provider.imap,
                    imapPort: provider.imap_port,
                    clientId: client_id
                };

                const child = startWorkerProcess(config);
                activeWorkers.set(id, { child, email: email_address, restartCount: 0 });
            } catch (error) {
                logger.error(`Failed to start worker for ${email_address}`, { error: error.message });
            }
        }
        
        logger.info(`Successfully forked ${activeWorkers.size} worker processes`);
    } catch (err) {
        logger.error('Worker initialization error', { error: err.message });
    }
}

async function restartWorker(clientEmailId, email_address) {
    logger.info(`Restarting worker process for ${email_address}`);
    stopWorkerById(clientEmailId);
    
    // Re-fetch this specific email account's config and restart only that worker
    try {
        const { data: entry, error } = await supabase
            .from('client-emails')
            .select(`id, client_id, email_address, password, provider:email-provider (imap, imap_port)`)
            .eq('id', clientEmailId)
            .single();

        if (error || !entry) {
            logger.error(`Failed to fetch config for worker ${clientEmailId}`, { error: error?.message });
            return;
        }

        const { id, client_id, password, provider } = entry;
        if (!provider || !provider.imap || !provider.imap_port) {
            logger.warn(`Skipping restart for ${email_address} - missing IMAP provider configuration`);
            return;
        }

        const decryptedPassword = encryption.decrypt(password);
        const config = {
            id,
            email: entry.email_address,
            password: decryptedPassword,
            imapHost: provider.imap,
            imapPort: provider.imap_port,
            clientId: client_id
        };

        const child = startWorkerProcess(config);
        activeWorkers.set(id, { child, email: entry.email_address, restartCount: 0 });
        logger.info(`Worker process restarted successfully for ${email_address}`);
    } catch (err) {
        logger.error(`Failed to restart worker for ${email_address}`, { error: err.message });
    }
}

function stopWorkerById(clientEmailId) {
    const worker = activeWorkers.get(clientEmailId);
    if (worker) {
        try {
            worker.child.send({ type: 'stop' });
            // Force kill if not exited after 5 seconds
            setTimeout(() => {
                try { worker.child.kill('SIGKILL'); } catch {}
            }, 5000);
        } catch {
            try { worker.child.kill('SIGKILL'); } catch {}
        }
        activeWorkers.delete(clientEmailId);
    }
}

function stopWorker(email_address) {
    for (const [id, worker] of activeWorkers.entries()) {
        if (worker.email === email_address) {
            stopWorkerById(id);
            break;
        }
    }
}

function stopAllWorkers() {
    logger.info('Stopping all worker child processes...');
    for (const [id] of activeWorkers.entries()) {
        stopWorkerById(id);
    }
    activeWorkers.clear();
}

module.exports = {
    initializeWorkers,
    restartWorker,
    stopWorker,
    stopWorkerById,
    stopAllWorkers
};