// Import the Supabase client from the official SDK
const { createClient } = require('@supabase/supabase-js');

// Get Supabase configuration from environment variables
// These should be set in your .env file or deployment environment
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Validate that required environment variables are present
// This prevents runtime errors if configuration is missing
if (!supabaseUrl || !supabaseKey) {
  const missingVars = [];
  if (!supabaseUrl) missingVars.push('SUPABASE_URL');
  if (!supabaseKey) missingVars.push('SUPABASE_KEY');
  throw new Error(`Missing Supabase environment variable(s): ${missingVars.join(', ')}`);
}

// Create and configure the Supabase client instance
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
