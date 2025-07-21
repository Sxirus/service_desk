// --- workerManager.js ---
const supabase = require('../config/supabase');
const { startImapWorker } = require('./imapWorker');

const activeWorkers = new Map();

async function initializeWorkers() {
  const { data: clientEmails, error } = await supabase
    .from('client-emails')
    .select(`id, email_address, password, provider:email-provider (imap, imap_port)`);

  if (error) {
    console.error('Failed to fetch client emails:', error);
    return;
  }

  for (const entry of clientEmails) {
    const { id, email_address, password, provider } = entry;

    if (!provider || !provider.imap || !provider.imap_port) {
      console.warn(`Skipping ${email_address} due to missing provider config.`);
      continue;
    }

    if (activeWorkers.has(id)) {
      console.log(`Worker for ${email_address} already running.`);
      continue;
    }

    console.log(`Starting worker for ${email_address}`);
    startImapWorker({
      email: email_address,
      password,
      imapHost: provider.imap,
      imapPort: provider.imap_port,
      clientId: id
    });

    activeWorkers.set(id, true);
  }
}

module.exports = { initializeWorkers };
