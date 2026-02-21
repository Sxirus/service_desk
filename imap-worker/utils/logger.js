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

const formatMessage = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  return JSON.stringify({
    timestamp,
    level,
    message,
    ...meta
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
  // Compatibility with winston style logger.log('level', msg)
  log: (level, message, meta) => {
    if (logger[level]) {
      logger[level](message, meta);
    } else {
      logger.info(message, meta);
    }
  }
};

module.exports = logger;
