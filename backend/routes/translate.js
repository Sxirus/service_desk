const express = require('express');
const router = express.Router();

const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { createServiceSignature } = require('../utils/serviceAuth');
const logger = require('../utils/logger');

const ALLOWED_TARGET_LANGUAGES = new Set(['en', 'de']);
const ALLOWED_EMAIL_TYPES = new Set(['incoming', 'sent', 'internal_note']);

function getTranslationWorkerUrls() {
  const rawFromEnv = (process.env.TRANSLATION_SERVICE_URL || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  if (rawFromEnv.length > 0) {
    return rawFromEnv;
  }

  if (process.env.NODE_ENV === 'development') {
    return ['http://localhost:3002', 'http://translation-worker:3002'];
  }

  return ['http://translation-worker:3002'];
}

async function postToTranslationWorker(payload, timestamp, signature) {
  const workerUrls = getTranslationWorkerUrls();
  let lastNetworkError = null;

  for (const workerUrl of workerUrls) {
    try {
      const response = await fetch(`${workerUrl}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Timestamp': timestamp,
          'X-Service-Auth': signature
        },
        body: JSON.stringify(payload)
      });

      return response;
    } catch (error) {
      lastNetworkError = error;
      logger.warn('[TRANSLATE_ROUTE] Worker network call failed', {
        workerUrl,
        error: error.message
      });
    }
  }

  throw lastNetworkError || new Error('Unable to reach translation worker');
}

async function getMailByType(clientId, emailId, emailType) {
  if (emailType === 'incoming') {
    const { data, error } = await supabase
      .from('incoming-mails')
      .select('id, text_content, html_content, client_id')
      .eq('id', emailId)
      .eq('client_id', clientId)
      .single();
    return { data, error };
  }

  const { data, error } = await supabase
    .from('sent-mail')
    .select('id, text_content, html_content, customer_id')
    .eq('id', emailId)
    .single();

  if (error || !data) return { data: null, error };

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id, client_id')
    .eq('id', data.customer_id)
    .eq('client_id', clientId)
    .single();

  if (customerError || !customer) {
    return { data: null, error: customerError || new Error('Customer not found for client') };
  }

  return { data, error: null };
}

router.post('/', authenticate, async (req, res) => {
  try {
    const { emailId, emailType, targetLanguage } = req.body || {};
    const parsedEmailId = parseInt(emailId, 10);

    if (!Number.isInteger(parsedEmailId) || parsedEmailId < 1) {
      return res.status(400).json({ error: 'emailId must be a valid positive integer' });
    }

    if (!ALLOWED_EMAIL_TYPES.has(emailType)) {
      return res.status(400).json({ error: 'emailType must be one of incoming, sent, internal_note' });
    }

    if (!ALLOWED_TARGET_LANGUAGES.has(targetLanguage)) {
      return res.status(400).json({ error: 'Unsupported target language' });
    }

    const { data: mail, error: mailError } = await getMailByType(req.user.client_id, parsedEmailId, emailType);
    if (mailError || !mail) {
      logger.warn('[TRANSLATE_ROUTE] Email not found or not accessible', {
        emailId: parsedEmailId,
        emailType,
        client_id: req.user.client_id
      });
      return res.status(404).json({ error: 'Email not found' });
    }

    const sourceText = (mail.text_content || '').trim();
    if (!sourceText) {
      return res.status(400).json({ error: 'Selected email has no text content to translate' });
    }

    const translationPayload = {
      text: sourceText,
      targetLanguage,
      sourceLanguage: 'auto'
    };

    const serviceSecret = process.env.TRANSLATION_SERVICE_SECRET;
    if (!serviceSecret) {
      logger.error('[TRANSLATE_ROUTE] Missing TRANSLATION_SERVICE_SECRET');
      return res.status(500).json({ error: 'Translation service is not configured' });
    }

    const { timestamp, signature } = createServiceSignature(translationPayload, serviceSecret);

    const workerResponse = await postToTranslationWorker(translationPayload, timestamp, signature);

    const workerRaw = await workerResponse.text();
    let workerJson = {};
    try {
      workerJson = workerRaw ? JSON.parse(workerRaw) : {};
    } catch (_err) {
      workerJson = { error: 'Invalid response from translation worker' };
    }

    if (!workerResponse.ok) {
      logger.error('[TRANSLATE_ROUTE] Worker request failed', {
        status: workerResponse.status,
        workerError: workerJson?.error || null
      });
      const upstreamStatus = workerResponse.status === 429 ? 429 : 502;
      const workerMessage = workerJson?.error || workerJson?.message || 'Unable to translate right now';
      const retryAfter = workerResponse.headers.get('retry-after');
      if (retryAfter) {
        res.setHeader('Retry-After', retryAfter);
      }

      return res.status(upstreamStatus).json({
        error: workerMessage,
        code: workerJson?.code || (upstreamStatus === 429 ? 'provider_rate_limited' : 'provider_failure')
      });
    }

    return res.json({
      success: true,
      translatedText: workerJson.translatedText,
      detectedLanguage: workerJson.detectedLanguage,
      targetLanguage: workerJson.targetLanguage || targetLanguage
    });
  } catch (error) {
    logger.error('[TRANSLATE_ROUTE] Unexpected error', { error: error.message });
    return res.status(500).json({
      error: 'Server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to translate email'
    });
  }
});

module.exports = router;
