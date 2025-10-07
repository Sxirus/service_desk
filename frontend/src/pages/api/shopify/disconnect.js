/**
 * Shopify Disconnect Endpoint
 * Removes Shopify connection for a specific client
 * Clears all Shopify-related data from the clients table
 */

import { createClient } from '@supabase/supabase-js';

export async function POST({ request }) {
  console.log('[SHOPIFY_DISCONNECT] Request received');
  
  try {
    const { clientId } = await request.json();
    
    console.log('[SHOPIFY_DISCONNECT] Parameters:', { clientId });
    
    // Validate clientId parameter
    if (!clientId) {
      console.error('[SHOPIFY_DISCONNECT] Missing clientId parameter');
      return new Response(JSON.stringify({ error: 'clientId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    console.log('[SHOPIFY_DISCONNECT] Creating Supabase client');
    
    const supabase = createClient(
      import.meta.env.SUPABASE_URL,
      import.meta.env.SUPABASE_KEY
    );
    
    console.log('[SHOPIFY_DISCONNECT] Updating client record to remove Shopify data');
    
    // Clear all Shopify-related fields in the clients table
    const { error } = await supabase
      .from('clients')
      .update({
        shopify_store_url: null,
        shopify_access_token: null,
        shopify_connected: false,
        shopify_scope: null,
      })
      .eq('id', clientId);
    
    if (error) {
      console.error('[SHOPIFY_DISCONNECT] Database update failed:', error);
      throw error;
    }
    
    console.log('[SHOPIFY_DISCONNECT] Successfully disconnected Shopify for client:', clientId);
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[SHOPIFY_DISCONNECT] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}