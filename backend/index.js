// Import required dependencies for the Express server
const express = require('express');           // Web framework for Node.js
const cors = require('cors');                 // Cross-Origin Resource Sharing middleware
const helmet = require('helmet');             // Security middleware for HTTP headers
require('dotenv').config();                   // Load environment variables from .env file
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { initializeWorkers } = require('./services/workerManager');

// Validate required environment variables at startup
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'FRONTEND_URL'
];

const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingEnvVars.length > 0) {
  console.error('FATAL: Missing required environment variables:', missingEnvVars.join(', '));
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

// Add rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

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

app.use('/api/avatars', require('./routes/avatars'));

app.use('/api/platform', require('./routes/platform'));

// Global error handling middleware
// This catches any unhandled errors from routes and provides consistent error responses
app.use((err, req, res, next) => {
  console.error(err.stack);                   // Log error details to console for debugging
  res.status(500).json({ 
    error: 'Something went wrong!',
    // Only show detailed error messages in development for security
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  });
});

// Start the email monitoring service
// This begins listening for incoming emails to process as support tickets

// Start the HTTP server
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    try {
        await initializeWorkers();
    } catch (err) {
        console.error('Failed to initialize workers:', err);
    }

});