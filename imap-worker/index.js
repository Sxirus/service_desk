/**
 * IMAP Worker Service — entrypoint
 *
 * Standalone service that polls IMAP inboxes for all active client email accounts.
 * Reads configuration directly from Supabase; does not depend on the backend API.
 *
 * Required environment variables:
 *   SUPABASE_URL        — Supabase project URL
 *   SUPABASE_KEY        — Supabase service-role key
 *   ENCRYPTION_SECRET   — Must match the backend's value exactly (passwords are encrypted there)
 *
 * Optional:
 *   NODE_ENV            — 'production' enables strict TLS (rejectUnauthorized: true)
 *   LOG_LEVEL           — error | warn | info | debug  (default: info)
 *   SYNC_INTERVAL_MS    — How often to re-scan DB for new/removed accounts (default: 60000)
 */

require('dotenv').config();

const { initializeWorkers, syncWorkers, stopAllWorkers, getActiveWorkerCount } = require('./services/workerManager');
const logger = require('./utils/logger');

// ── Startup validation ────────────────────────────────────────────────────────

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_KEY', 'ENCRYPTION_SECRET'];
const missing = REQUIRED_ENV.filter(v => !process.env[v]);
if (missing.length > 0) {
    logger.error('FATAL: Missing required environment variables', { missing });
    process.exit(1);
}

// ── Configuration ─────────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS || '60000', 10);

// ── Main ──────────────────────────────────────────────────────────────────────

let syncTimer = null;

async function main() {
    logger.info('IMAP Worker Service starting...');

    // Start workers for all currently active accounts
    await initializeWorkers();

    logger.info(`IMAP Worker Service running — ${getActiveWorkerCount()} worker(s) active. Account sync every ${SYNC_INTERVAL_MS / 1000}s.`);

    // Periodically sync against the DB:
    //   - starts workers for newly added/activated accounts
    //   - stops workers for deleted/deactivated accounts
    syncTimer = setInterval(async () => {
        try {
            await syncWorkers();
        } catch (err) {
            logger.error('[SYNC] Sync cycle failed', { error: err.message });
        }
    }, SYNC_INTERVAL_MS);
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(signal) {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    if (syncTimer) clearInterval(syncTimer);
    stopAllWorkers();
    // Give child processes a moment to exit cleanly before we exit
    setTimeout(() => {
        logger.info('Shutdown complete.');
        process.exit(0);
    }, 6000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Go ────────────────────────────────────────────────────────────────────────

main().catch(err => {
    logger.error('Failed to start IMAP Worker Service', { error: err.message });
    process.exit(1);
});
