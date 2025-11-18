/**
 * Input Validation Middleware
 * Validates and sanitizes request parameters to prevent injection attacks
 */

const validator = require('validator');

/**
 * Validate and sanitize Shopify shop name
 */
function validateShopName(req, res, next) {
  let shop = req.query.shop || req.body.shop;

  if (!shop) {
    return res.status(400).json({ 
      error: 'Bad Request',
      message: 'Shop parameter is required' 
    });
  }

  // Remove any whitespace
  shop = shop.trim();

  // Normalize to include .myshopify.com
  if (!shop.includes('.myshopify.com')) {
    shop = `${shop}.myshopify.com`;
  }

  // Validate format: lowercase letters, numbers, hyphens only
  const shopRegex = /^[a-z0-9-]+\.myshopify\.com$/;
  if (!shopRegex.test(shop)) {
    return res.status(400).json({ 
      error: 'Bad Request',
      message: 'Invalid shop name format. Must be: yourshop.myshopify.com' 
    });
  }

  // Attach sanitized shop name to request
  req.sanitized = req.sanitized || {};
  req.sanitized.shop = shop;
  next();
}

/**
 * Validate email address format
 */
function validateEmail(paramName = 'email') {
  return (req, res, next) => {
    const email = req.query[paramName] || req.body[paramName];

    if (!email) {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: `${paramName} is required` 
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: `Invalid ${paramName} format` 
      });
    }

    // Attach sanitized email to request
    req.sanitized = req.sanitized || {};
    req.sanitized[paramName] = validator.normalizeEmail(email);
    next();
  };
}

/**
 * Validate integer ID parameters
 */
function validateId(paramName, options = {}) {
  return (req, res, next) => {
    const { required = true, min = 1 } = options;
    const value = req.query[paramName] || req.body[paramName] || req.params[paramName];

    if (!value) {
      if (required) {
        return res.status(400).json({ 
          error: 'Bad Request',
          message: `${paramName} is required` 
        });
      }
      return next();
    }

    const id = parseInt(value, 10);

    if (isNaN(id) || id < min) {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: `${paramName} must be a valid positive integer` 
      });
    }

    // Attach sanitized ID to request
    req.sanitized = req.sanitized || {};
    req.sanitized[paramName] = id;
    next();
  };
}

/**
 * Validate OAuth state parameter
 */
function validateOAuthState(req, res, next) {
  const state = req.query.state;
  const savedState = req.cookies?.shopify_oauth_state;

  if (!state || !savedState) {
    console.error('[VALIDATION] Missing OAuth state');
    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'Invalid OAuth state' 
    });
  }

  if (state !== savedState) {
    console.error('[VALIDATION] OAuth state mismatch - possible CSRF attack');
    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'State validation failed - possible CSRF attack' 
    });
  }

  // Decode and validate state structure
  try {
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    
    if (!stateData.nonce) {
      throw new Error('Invalid state structure');
    }

    req.sanitized = req.sanitized || {};
    req.sanitized.stateData = stateData;
    next();
  } catch (error) {
    console.error('[VALIDATION] Failed to decode state:', error);
    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'Invalid state format' 
    });
  }
}

/**
 * Validate HMAC signature from Shopify
 */
function validateShopifyHMAC(req, res, next) {
  const crypto = require('node:crypto');
  const hmac = req.query.hmac;

  if (!hmac) {
    console.error('[VALIDATION] Missing HMAC parameter');
    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'HMAC validation required' 
    });
  }

  // Create params object without hmac
  const params = { ...req.query };
  delete params.hmac;

  // Create sorted query string
  const message = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');

  // Generate expected HMAC
  const generatedHash = crypto
    .createHmac('sha256', process.env.SHOPIFY_SECRET)
    .update(message)
    .digest('hex');

  if (generatedHash !== hmac) {
    console.error('[VALIDATION] HMAC validation failed');
    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'HMAC validation failed - request may be forged' 
    });
  }

  console.log('[VALIDATION] HMAC validated successfully');
  next();
}

/**
 * Sanitize text content (for emails, notes, etc.)
 */
function sanitizeText(paramName, options = {}) {
  return (req, res, next) => {
    const { required = false, maxLength = 10000 } = options;
    const value = req.body[paramName];

    if (!value) {
      if (required) {
        return res.status(400).json({ 
          error: 'Bad Request',
          message: `${paramName} is required` 
        });
      }
      return next();
    }

    if (typeof value !== 'string') {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: `${paramName} must be a string` 
      });
    }

    if (value.length > maxLength) {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: `${paramName} exceeds maximum length of ${maxLength}` 
      });
    }

    // Basic sanitization - trim whitespace
    req.sanitized = req.sanitized || {};
    req.sanitized[paramName] = value.trim();
    next();
  };
}

module.exports = {
  validateShopName,
  validateEmail,
  validateId,
  validateOAuthState,
  validateShopifyHMAC,
  sanitizeText
};