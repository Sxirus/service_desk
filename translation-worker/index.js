require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { validateServiceAuth } = require('./middleware/serviceAuth');
const { callTranslate } = require('./services/translationService');
const logger = require('./utils/logger');

const REQUIRED_ENV = ['TRANSLATION_SERVICE_SECRET', 'ZAI_API_KEY'];
const missing = REQUIRED_ENV.filter(v => !process.env[v]);
if (missing.length > 0) {
  logger.error('FATAL: Missing required environment variables', { missing });
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3002;

app.use(helmet());
app.use(express.json({ limit: '1mb' }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many translation requests' }
});

app.use('/translate', limiter);

app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'translation-worker' });
});

app.post('/translate', validateServiceAuth, async (req, res) => {
  try {
    const { text, targetLanguage, sourceLanguage = 'auto' } = req.body || {};

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text is required and must be a string' });
    }

    if (!targetLanguage || typeof targetLanguage !== 'string') {
      return res.status(400).json({ error: 'targetLanguage is required and must be a string' });
    }

    if (text.length > 50000) {
      return res.status(400).json({ error: 'text exceeds max length of 50000 characters' });
    }

    const result = await callTranslate({ text, targetLanguage, sourceLanguage });

    return res.json({
      success: true,
      translatedText: result.translatedText,
      detectedLanguage: result.detectedLanguage,
      targetLanguage,
      provider: result.provider,
      model: result.model
    });
  } catch (error) {
    logger.error('[TRANSLATE] Request failed', { error: error.message });
    const statusCode = error?.statusCode === 429 ? 429 : 502;
    const retryAfterSeconds = Number.isFinite(error?.retryAfterMs)
      ? Math.max(0, Math.ceil(error.retryAfterMs / 1000))
      : null;

    if (retryAfterSeconds !== null) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
    }

    return res.status(statusCode).json({
      error: process.env.NODE_ENV === 'development'
        ? error.message
        : (statusCode === 429
          ? 'Translation provider rate limit reached. Please try again shortly.'
          : 'Unable to translate right now'),
      code: statusCode === 429 ? 'provider_rate_limited' : 'provider_failure'
    });
  }
});

app.listen(PORT, () => {
  logger.info(`Translation Worker running on port ${PORT}`);
});
