/**
 * emailService.js (imap-worker slim version)
 * Only contains getClientSmtpConfig — the single function used by emailHandler
 * to resolve SMTP credentials for sending confirmation emails.
 *
 * The full emailService.js (send, limits, bulk status updates, etc.) lives in
 * the backend service and is not needed here.
 */

const supabase = require('../config/supabase');
const encryption = require('../utils/encryption');
const logger = require('../utils/logger');

/**
 * Resolve SMTP configuration for a client, respecting the configured sending mode.
 *
 * Modes (stored in clients.email_sending_mode):
 *   thread-based  → use the same inbox that received the email
 *   primary       → use the account set as clients.primary_email_id
 *   (fallback)    → first active account for the client
 *
 * @param {string} client_id
 * @param {string|null} threadEmailAddress - inbox address that received the original email
 * @returns {object|null} nodemailer transport config, or null if none found
 */
async function getClientSmtpConfig(client_id, threadEmailAddress = null) {
  // 1. Read client settings
  const { data: clientSettings } = await supabase
    .from('clients')
    .select('email_sending_mode, primary_email_id')
    .eq('id', client_id)
    .single();

  if (!clientSettings) return null;
  const { email_sending_mode, primary_email_id } = clientSettings;

  // 2. Thread-based mode
  if (email_sending_mode === 'thread-based' && threadEmailAddress) {
    const config = await getEmailAccountConfig(client_id, { email_address: threadEmailAddress });
    if (config) return { ...config, provider: 'Thread-Based: ' + threadEmailAddress };
  }

  // 3. Primary mode
  if (email_sending_mode === 'primary' && primary_email_id) {
    const config = await getEmailAccountConfig(client_id, { id: primary_email_id });
    if (config) return { ...config, provider: 'Primary' };
  }

  // 4. Fallback: first active account
  const config = await getEmailAccountConfig(client_id, {}, true);
  if (config) return { ...config, provider: 'Fallback' };

  return null;
}

/**
 * Internal helper — fetch and decrypt SMTP credentials for a single email account.
 */
async function getEmailAccountConfig(client_id, query = {}, limit = false) {
  let builder = supabase
    .from('client-emails')
    .select(`
      id, email_address, password,
      email-provider (smtp, smtp_port)
    `)
    .eq('client_id', client_id)
    .eq('active', true);

  if (query.id) builder = builder.eq('id', query.id);
  if (query.email_address) builder = builder.eq('email_address', query.email_address);

  const { data } = limit
    ? await builder.order('id').limit(1)
    : await builder.single();

  const emailData = limit ? data?.[0] : data;

  if (!emailData || !emailData['email-provider']) return null;

  const provider = emailData['email-provider'];
  const decryptedPassword = encryption.decrypt(emailData.password);

  return {
    host: provider.smtp,
    port: parseInt(provider.smtp_port),
    secure: parseInt(provider.smtp_port) === 465,
    auth: {
      user: emailData.email_address,
      pass: decryptedPassword
    }
  };
}

module.exports = { getClientSmtpConfig };
