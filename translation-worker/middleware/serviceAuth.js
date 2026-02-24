const crypto = require('node:crypto');
const logger = require('../utils/logger');

function safeCompareHex(a, b) {
  if (!a || !b) return false;
  const aBuf = Buffer.from(String(a), 'hex');
  const bBuf = Buffer.from(String(b), 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function validateServiceAuth(req, res, next) {
  try {
    const secret = process.env.TRANSLATION_SERVICE_SECRET;
    if (!secret) {
      logger.error('[SERVICE_AUTH] Missing TRANSLATION_SERVICE_SECRET');
      return res.status(500).json({ error: 'Service misconfigured' });
    }

    const timestamp = req.header('x-service-timestamp');
    const signature = req.header('x-service-auth');

    if (!timestamp || !signature) {
      return res.status(401).json({ error: 'Missing service auth headers' });
    }

    const parsedTs = parseInt(timestamp, 10);
    if (Number.isNaN(parsedTs)) {
      return res.status(401).json({ error: 'Invalid service auth timestamp' });
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parsedTs) > 30) {
      return res.status(401).json({ error: 'Expired service auth timestamp' });
    }

    const rawBody = JSON.stringify(req.body ?? {});
    const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}:${bodyHash}`)
      .digest('hex');

    if (!safeCompareHex(signature, expected)) {
      logger.warn('[SERVICE_AUTH] Signature mismatch');
      return res.status(401).json({ error: 'Invalid service auth signature' });
    }

    next();
  } catch (error) {
    logger.error('[SERVICE_AUTH] Validation error', { error: error.message });
    res.status(401).json({ error: 'Service authentication failed' });
  }
}

module.exports = {
  validateServiceAuth
};
