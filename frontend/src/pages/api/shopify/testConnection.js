/**
 * Shopify Connection Test Endpoint
 * Tests if the Shopify API connection is working for a client
 * Makes test API calls to verify credentials and retrieve basic store info
 */

import { createClient } from '@supabase/supabase-js';

export async function GET({ request }) {
  console.log('[SHOPIFY_TEST] Connection test request received');
  
  const url = new URL(request.url);
  const clientId = url.searchParams.get('clientId');
  
  console.log('[SHOPIFY_TEST] Parameters:', { clientId });
  
  // Validate clientId parameter
  if (!clientId) {
    console.error('[SHOPIFY_TEST] Missing clientId parameter');
    return new Response(JSON.stringify({ success: false, error: 'clientId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  console.log('[SHOPIFY_TEST] Creating Supabase client');
  
  const supabase = createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_KEY
  );
  
  console.log('[SHOPIFY_TEST] Fetching client record from database');
  
  // Fetch client record from database
  const { data: client, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();
  
  if (error || !client) {
    console.error('[SHOPIFY_TEST] Client not found:', error);
    return new Response(JSON.stringify({ success: false, error: 'Client not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  console.log('[SHOPIFY_TEST] Client found:', {
    id: client.id,
    name: client.name,
    connected: client.shopify_connected,
    hasToken: !!client.shopify_access_token
  });
  
  // Verify client has Shopify connection
  if (!client.shopify_connected || !client.shopify_access_token) {
    console.error('[SHOPIFY_TEST] Client is not connected to Shopify');
    return new Response(JSON.stringify({ success: false, error: 'Shopify not connected' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  try {
    console.log('[SHOPIFY_TEST] Testing API connection to:', client.shopify_store_url);
    
    // Test API Call 1: Fetch products (limit 1 to minimize data transfer)
    console.log('[SHOPIFY_TEST] Fetching products from Shopify API');
    const productsResponse = await fetch(
      `https://${client.shopify_store_url}/admin/api/2024-01/products.json?limit=1`,
      {
        headers: {
          'X-Shopify-Access-Token': client.shopify_access_token,
        },
      }
    );
    
    console.log('[SHOPIFY_TEST] Products API response status:', productsResponse.status);
    
    if (!productsResponse.ok) {
      const errorText = await productsResponse.text();
      console.error('[SHOPIFY_TEST] Products API failed:', errorText);
      throw new Error(`Shopify API error: ${productsResponse.status}`);
    }
    
    const productsData = await productsResponse.json();
    console.log('[SHOPIFY_TEST] Products fetched:', productsData.products?.length || 0);
    
    // Test API Call 2: Get order count
    console.log('[SHOPIFY_TEST] Fetching order count from Shopify API');
    const ordersResponse = await fetch(
      `https://${client.shopify_store_url}/admin/api/2024-01/orders/count.json`,
      {
        headers: {
          'X-Shopify-Access-Token': client.shopify_access_token,
        },
      }
    );
    
    console.log('[SHOPIFY_TEST] Orders count API response status:', ordersResponse.status);
    
    let ordersCount = 0;
    if (ordersResponse.ok) {
      const ordersData = await ordersResponse.json();
      ordersCount = ordersData.count;
      console.log('[SHOPIFY_TEST] Orders count:', ordersCount);
    } else {
      console.warn('[SHOPIFY_TEST] Orders count API failed, setting count to 0');
    }
    
    console.log('[SHOPIFY_TEST] Connection test successful');
    
    return new Response(JSON.stringify({ 
      success: true,
      shop: client.shopify_store_url,
      productsCount: productsData.products?.length || 0,
      ordersCount: ordersCount,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('[SHOPIFY_TEST] Connection test failed:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}