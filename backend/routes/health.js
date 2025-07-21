// Import required modules for Express routing and database connection
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Health check endpoint - GET /health
// This route provides system status information including database connectivity
router.get('/', async (req, res) => {
  try {
    // Test Supabase database connection by attempting a simple query
    // Uses a lightweight query with limit(1) to minimize resource usage
    const { data, error } = await supabase.from('_health_check').select('*').limit(1);
    
    // Return successful health check response with system metrics
    res.json({
      status: 'OK',                                    // Overall system status
      timestamp: new Date().toISOString(),            // Current server time in ISO format
      database: error ? 'ERROR' : 'OK',               // Database connectivity status
      uptime: process.uptime()                        // Server uptime in seconds
    });
  } catch (error) {
    // Handle any unexpected errors during health check
    // Return 500 status code to indicate server error
    res.status(500).json({
      status: 'ERROR',                                 // Overall system status
      timestamp: new Date().toISOString(),            // Current server time in ISO format
      error: error.message                            // Error details for debugging
    });
  }
});

// Export the router for use in the main application
module.exports = router;