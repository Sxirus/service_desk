/**
 * Get Customer Orders Endpoint
 * Fetches Shopify orders for a specific customer
 * 
 * Flow:
 * 1. Get customer record
 * 2. Get client record (which has Shopify credentials)
 * 3. Get customer email from incomingmails
 * 4. Fetch orders from Shopify API filtered by email
 */

import { createClient } from '@supabase/supabase-js';
import { createPageLogger } from '../../../utils/logger.ts';

const log = createPageLogger('SHOPIFY_ORDERS');

export async function GET({ request }) {
  log.info('Request received');
  
  const url = new URL(request.url);
  const customerId = url.searchParams.get('customerId');
  
  log.info('Parameters:', { customerId });
  
  // Validate customerId parameter
  if (!customerId) {
    log.error('Missing customerId parameter');
    return new Response(JSON.stringify({ orders: [] }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  log.info('Creating Supabase client');

  const supabase = createClient(
    import.meta.env.SUPABASE_URL,
    import.meta.env.SUPABASE_KEY
  );
  
  // Step 1: Fetch customer record
  log.info('Fetching customer record from database');
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id, name, client_id')
    .eq('id', customerId)
    .single();
  
  if (customerError || !customer) {
    log.error('Customer not found:', customerError);
    return new Response(JSON.stringify({ orders: [], error: 'Customer not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  log.info('Customer found:', {
    id: customer.id,
    name: customer.name,
    clientId: customer.client_id
  });
  
  // Step 2: Fetch client record (contains Shopify credentials)
  log.info('Fetching client record for client ID:', customer.client_id);
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('id', customer.client_id)
    .single();
  
  if (clientError || !client) {
    log.error('Client not found:', clientError);
    return new Response(JSON.stringify({ orders: [], error: 'Client not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  log.info('Client found:', {
    id: client.id,
    name: client.name,
    connected: client.shopify_connected,
    hasToken: !!client.shopify_access_token
  });
  
  // Verify client has Shopify connection
  if (!client.shopify_connected || !client.shopify_access_token) {
    log.warn('Client is not connected to Shopify');
    return new Response(JSON.stringify({ orders: [], error: 'Shopify not connected for this client' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  // Step 3: Get customer email address from incomingmails table
  log.info('Fetching customer email from incoming-mails');
  const { data: emails, error: emailError } = await supabase
    .from('incoming-mails')
    .select('email_address')
    .eq('customer_id', customerId)
    .order('send_at', { ascending: false })
    .limit(1);
  
  if (emailError || !emails || emails.length === 0) {
    log.error('No email found for customer:', emailError);
    return new Response(JSON.stringify({ orders: [], error: 'No email found for customer' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const customerEmail = emails[0].email_address;
  log.info('Customer email found:', customerEmail);
  
  try {
    // Step 4: Fetch orders from Shopify API
    log.info('Fetching orders from Shopify API');
    log.info('Store URL:', client.shopify_store_url);
    log.info('Customer email:', customerEmail);

    const shopifyResponse = await fetch(
      `https://${client.shopify_store_url}/admin/api/2024-01/orders.json?limit=20&status=any&email=${encodeURIComponent(customerEmail)}`,
      {
        headers: {
          'X-Shopify-Access-Token': client.shopify_access_token,
          'Content-Type': 'application/json',
        },
      }
    );

    log.info('Shopify API response status:', shopifyResponse.status);

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      log.error('Shopify API error:', errorText);
      throw new Error(`Shopify API error: ${shopifyResponse.status}`);
    }
    
    const data = await shopifyResponse.json();
    const ordersCount = data.orders?.length || 0;

    log.info('Orders fetched successfully:', ordersCount);

    if (ordersCount > 0) {
      log.info('Retrieved order IDs:', 
        data.orders.slice(0, 3).map(o => o.id).join(', ')
      );
    }
    
    return new Response(JSON.stringify({ 
      orders: data.orders || [],
      customerEmail: customerEmail,
      shopifyStore: client.shopify_store_url,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    log.error('Error fetching orders:', error);
    return new Response(JSON.stringify({ orders: [], error: error.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}