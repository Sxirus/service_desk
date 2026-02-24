/**
 * Simple Logger Utility
 * Replaces winston with a lightweight wrapper around console
 * Supports log levels and standard formatting
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const CURRENT_LEVEL = process.env.LOG_LEVEL || 'info';
const CURRENT_LEVEL_NUM = LOG_LEVELS[CURRENT_LEVEL] || LOG_LEVELS.info;

const SENSITIVE_KEYS_PATTERN = /^(password|token|secret|authorization|cookie|access_token|refresh_token|api_key|apikey|stripe_secret|webhook_secret|encryption_secret|creditcard|credit_card|ssn|shopify_access_token)$/i;

const redactSensitiveFields = (obj, depth = 0) => {
  if (depth > 10) return obj;
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map(item => redactSensitiveFields(item, depth + 1));
  if (typeof obj !== 'object') return obj;

  const redacted = {};
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEYS_PATTERN.test(key)) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = redactSensitiveFields(obj[key], depth + 1);
    }
  }
  return redacted;
};

const formatMessage = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  const safeMeta = redactSensitiveFields(meta);
  return JSON.stringify({
    timestamp,
    level,
    message,
    ...safeMeta
  });
};

const logger = {
  error: (message, meta) => {
    if (LOG_LEVELS.error <= CURRENT_LEVEL_NUM) {
      console.error(formatMessage('error', message, meta));
    }
  },
  warn: (message, meta) => {
    if (LOG_LEVELS.warn <= CURRENT_LEVEL_NUM) {
      console.warn(formatMessage('warn', message, meta));
    }
  },
  info: (message, meta) => {
    if (LOG_LEVELS.info <= CURRENT_LEVEL_NUM) {
      console.log(formatMessage('info', message, meta));
    }
  },
  debug: (message, meta) => {
    if (LOG_LEVELS.debug <= CURRENT_LEVEL_NUM) {
      console.debug(formatMessage('debug', message, meta));
    }
  },
  log: (level, message, meta) => {
    if (logger[level]) {
      logger[level](message, meta);
    } else {
      logger.info(message, meta);
    }
  }
};

module.exports = logger;
