/**
 * IMAP Worker Child Process
 * Runs as a standalone Node.js process forked by workerManager.
 * Receives email account config via IPC, delegates to imapWorker for polling.
 * Isolates each IMAP connection so a stuck/crashed worker cannot affect the main service.
 */

const { startImapWorker, stopAllWorkers } = require('./imapWorker');
const logger = require('../utils/logger');

let currentEmail = null;

process.on('message', async (msg) => {
  if (msg.type === 'start') {
    currentEmail = msg.config.email;
    try {
      await startImapWorker(msg.config);
      process.send({ type: 'started', email: msg.config.email });
    } catch (err) {
      logger.error(`[${msg.config.email}] Worker process failed to start`, { error: err.message });
      process.send({ type: 'error', email: msg.config.email, error: err.message });
    }
  } else if (msg.type === 'stop') {
    logger.info(`[${currentEmail}] Worker process received stop signal`);
    stopAllWorkers();
    process.exit(0);
  }
});

process.on('uncaughtException', (err) => {
  logger.error(`[${currentEmail}] Uncaught exception in worker process`, { error: err.message });
  try { process.send({ type: 'crash', email: currentEmail, error: err.message }); } catch {}
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  const message = err?.message || String(err);
  logger.error(`[${currentEmail}] Unhandled rejection in worker process`, { error: message });
  try { process.send({ type: 'crash', email: currentEmail, error: message }); } catch {}
  process.exit(1);
});
