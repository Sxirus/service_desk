// Import required dependencies for the Express server
const express = require('express');           // Web framework for Node.js
const cors = require('cors');                 // Cross-Origin Resource Sharing middleware
const helmet = require('helmet');             // Security middleware for HTTP headers
require('dotenv').config();                   // Load environment variables from .env file

// Initialize Express application and configure port
const app = express();
const PORT = process.env.PORT || 3000;       // Use environment PORT or default to 3000

// Security and parsing middleware configuration
app.use(helmet());                            // Add security headers to protect against common vulnerabilities
app.use(cors());                              // Enable CORS for cross-origin requests from frontend
app.use(express.json({ limit: '10mb' }));    // Parse JSON payloads up to 10MB (for file uploads)
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded form data with extended syntax support

// API route registration
app.use('/api/health', require('./routes/health')); // Health check endpoint for monitoring

app.use('/api/emails', require('./routes/emails'));

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

/*
// 404 Handler for unmatched routes
// Currently commented out - uncomment if you want to handle unknown routes
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
}); */

// Initialize email monitoring service
const EmailService = require('./services/emailService');
const emailService = new EmailService();

// Start the email monitoring service
// This begins listening for incoming emails to process as support tickets
emailService.connect();

// Graceful shutdown handlers
// These ensure the email service is properly disconnected when the server stops

// Handle SIGTERM signal (typically sent by process managers like PM2 or Docker)
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  emailService.disconnect();                  // Close email connections cleanly
  process.exit(0);                           // Exit with success code
});

// Handle SIGINT signal (typically Ctrl+C in terminal)
process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  emailService.disconnect();                  // Close email connections cleanly
  process.exit(0);                           // Exit with success code
});

// Start the HTTP server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});