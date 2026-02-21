/**
 * Worker Manager
 * Manages individual IMAP polling workers as child processes.
 * Each email account runs in its own Node.js process via child_process.fork(),
 * so a stuck/crashed IMAP connection cannot affect the main service.
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a worker config object from a client-emails DB row.
 */
function buildWorkerConfig(entry) {
    return {
        id: entry.id,
        email: entry.email_address,
        password: encryption.decrypt(entry.password),
        imapHost: entry.provider.imap,
        imapPort: entry.provider.imap_port,
        clientId: entry.client_id
    };
}

/**
 * Fetch all active email accounts from Supabase.
 * Returns the rows array, or null on error.
 */
async function fetchActiveAccounts() {
    const { data, error } = await supabase
        .from('client-emails')
        .select('id, client_id, email_address, password, provider:email-provider (imap, imap_port)')
        .eq('active', true);

    if (error) {
        logger.error('Failed to fetch client emails', { error: error.message });
        return null;
    }
    return data;
}

// ── Process management ────────────────────────────────────────────────────────

/**
 * Fork a child process for a single email account worker.
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
            const currentRestart = activeWorkers.get(config.id)?.restartCount || 0;
            scheduleRestart(config, currentRestart);
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
 * Schedule a restart for a crashed worker with linear backoff.
 */
function scheduleRestart(config, currentRestartCount) {
    const restartCount = currentRestartCount + 1;
    if (restartCount > MAX_RESTART_ATTEMPTS) {
        logger.error(`[WORKER] Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached for ${config.email}, giving up`);
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
                .select('id, client_id, email_address, password, provider:email-provider (imap, imap_port)')
                .eq('id', config.id)
                .eq('active', true)
                .single();

            if (error || !entry || !entry.provider?.imap) {
                logger.warn(`[WORKER] Account ${config.id} no longer active or missing IMAP config, not restarting`);
                activeWorkers.delete(config.id);
                return;
            }

            const newConfig = buildWorkerConfig(entry);
            const child = startWorkerProcess(newConfig);
            activeWorkers.set(config.id, { child, email: newConfig.email, restartCount });
        } catch (err) {
            logger.error(`[WORKER] Restart failed for ${config.email}`, { error: err.message });
            activeWorkers.delete(config.id);
        }
    }, delay);
}

/**
 * Gracefully stop a single worker by its client-email DB id.
 */
function stopWorkerById(clientEmailId) {
    const worker = activeWorkers.get(clientEmailId);
    if (!worker) return;

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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize polling workers for all active client email accounts.
 * Called once at service startup.
 */
async function initializeWorkers() {
    logger.info('Initializing IMAP worker child processes...');

    const clientEmails = await fetchActiveAccounts();
    if (!clientEmails) return;

    logger.info(`Found ${clientEmails.length} active email account(s)`);

    for (const entry of clientEmails) {
        if (!entry.provider?.imap || !entry.provider?.imap_port) {
            logger.warn(`Skipping ${entry.email_address} — missing IMAP provider configuration`);
            continue;
        }

        // Stop existing worker if somehow already running
        if (activeWorkers.has(entry.id)) {
            stopWorkerById(entry.id);
        }

        try {
            const config = buildWorkerConfig(entry);
            const child = startWorkerProcess(config);
            activeWorkers.set(entry.id, { child, email: config.email, restartCount: 0 });
        } catch (err) {
            logger.error(`Failed to start worker for ${entry.email_address}`, { error: err.message });
        }
    }

    logger.info(`Successfully forked ${activeWorkers.size} worker process(es)`);
}

/**
 * Sync workers against the current DB state.
 * Called periodically to pick up new accounts and stop removed/deactivated ones.
 */
async function syncWorkers() {
    const clientEmails = await fetchActiveAccounts();
    if (!clientEmails) return;

    const activeDbIds = new Set(clientEmails.map(e => e.id));

    // Stop workers for accounts that are no longer active in DB
    for (const [id, worker] of activeWorkers) {
        if (!activeDbIds.has(id)) {
            logger.info(`[SYNC] Stopping worker for removed/deactivated account: ${worker.email}`);
            stopWorkerById(id);
        }
    }

    // Start workers for new accounts not yet running
    for (const entry of clientEmails) {
        if (activeWorkers.has(entry.id)) continue;
        if (!entry.provider?.imap || !entry.provider?.imap_port) continue;

        try {
            const config = buildWorkerConfig(entry);
            const child = startWorkerProcess(config);
            activeWorkers.set(entry.id, { child, email: config.email, restartCount: 0 });
            logger.info(`[SYNC] Started new worker for ${config.email}`);
        } catch (err) {
            logger.error(`[SYNC] Failed to start worker for ${entry.email_address}`, { error: err.message });
        }
    }
}

/**
 * Stop every active worker. Called during graceful shutdown.
 */
function stopAllWorkers() {
    logger.info(`Stopping all worker child processes (${activeWorkers.size} active)...`);
    for (const [id] of activeWorkers) {
        stopWorkerById(id);
    }
    activeWorkers.clear();
}

/**
 * Return how many workers are currently tracked.
 */
function getActiveWorkerCount() {
    return activeWorkers.size;
}

module.exports = {
    initializeWorkers,
    syncWorkers,
    stopAllWorkers,
    getActiveWorkerCount
};
