const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

router.get('/', async (req, res) => {
  try {
    // Test Supabase connection
    const { data, error } = await supabase.from('_health_check').select('*').limit(1);
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: error ? 'ERROR' : 'OK',
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

module.exports = router;