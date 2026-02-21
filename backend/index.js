// Import required dependencies for the Express server
const express = require('express');           // Web framework for Node.js
const cors = require('cors');                 // Cross-Origin Resource Sharing middleware
const helmet = require('helmet');             // Security middleware for HTTP headers
require('dotenv').config();                   // Load environment variables from .env file
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { initializeWorkers } = require('./services/workerManager');
const logger = require('./utils/logger');

// Validate required environment variables at startup
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'FRONTEND_URL',
  'ENCRYPTION_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingEnvVars.length > 0) {
  logger.error('FATAL: Missing required environment variables:', { missing: missingEnvVars });
  process.exit(1);
}

// Initialize Express application and configure port
const app = express();
const PORT = process.env.PORT || 3000;       // Use environment PORT or default to 3000

// Security and parsing middleware configuration
app.use(helmet());

// Add security headers to protect against common vulnerabilities
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4321', // Allow requests from frontend URL
  credentials: true  // CRITICAL: Enable credentials
}));

// IMPORTANT: Stripe webhook route must be registered BEFORE express.json()
// because Stripe requires the raw body for signature verification
app.use('/api/webhooks/stripe', require('./routes/webhooks'));

app.use(express.json({ limit: '10mb' }));    // Parse JSON payloads up to 10MB (for file uploads)
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded form data with extended syntax support

// cookie parser to read cookies
app.use(cookieParser());

// CSRF protection: require a custom header on all state-changing requests.
// Browsers enforce that custom headers cannot be sent cross-origin without CORS preflight,
// so the presence of this header proves the request originated from an allowed origin.
app.use('/api/', (req, res, next) => {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) return next();
  // Stripe webhooks send raw body and cannot include custom headers
  if (req.originalUrl.startsWith('/api/webhooks/')) return next();
  
  if (!req.headers['x-requested-with'] || req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    return res.status(403).json({ error: 'Missing or invalid CSRF header (X-Requested-With)' });
  }
  next();
});

// Add rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300 // Reduced from 1000 to 300 — stricter general rate limit (S5 fix)
});
app.use('/api/', limiter);

// Stricter rate limiter for auth-sensitive and login-adjacent routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 30,                     // 30 requests per 15min window
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/client/register', authLimiter);
app.use('/api/client/invite', authLimiter);
app.use('/api/shopify/install', authLimiter);
app.use('/api/shopify/callback', authLimiter);

// API route registration
app.use('/api/health', require('./routes/health')); // Health check endpoint for monitoring

app.use('/api/emails', require('./routes/emails'));

app.use('/api/customers', require('./routes/customers'));

app.use('/api/macros', require('./routes/macros'));

app.use('/api/settings', require('./routes/settings'));

app.use('/api/client', require('./routes/client'))

app.use('/api/shopify', require('./routes/shopify'));

app.use('/api/analytics', require('./routes/analytics'));

app.use('/api/groups', require('./routes/groups'));

app.use('/api/inboxes', require('./routes/inboxes'));

app.use('/api/email-accounts', require('./routes/email-accounts'));

app.use('/api/avatars', require('./routes/avatars'));

app.use('/api/activity-log', require('./routes/activity-log'));

app.use('/api/platform', require('./routes/platform'));

// Global error handling middleware
// This catches any unhandled errors from routes and provides consistent error responses
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.stack });
  res.status(500).json({ 
    error: 'Something went wrong!',
    // Only show detailed error messages in development for security
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  });
});

// Start the HTTP server
app.listen(PORT, async () => {
    logger.info(`Server running on port ${PORT}`);
    try {
        await initializeWorkers();
    } catch (err) {
        logger.error('Failed to initialize workers:', { error: err.message });
    }
});
