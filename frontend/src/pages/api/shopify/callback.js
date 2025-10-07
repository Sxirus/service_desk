/**
 * Shopify OAuth Callback Endpoint
 * Handles the OAuth callback from Shopify after user authorization
 * Exchanges authorization code for access token and stores in database
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export async function GET({ request, redirect, cookies }) {
  console.log('[SHOPIFY_CALLBACK] OAuth callback received');
  
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const hmac = url.searchParams.get('hmac');
  const shop = url.searchParams.get('shop');
  const state = url.searchParams.get('state');
  
  console.log('[SHOPIFY_CALLBACK] Callback parameters:', {
    hasCode: !!code,
    codeLength: code?.length,
    hasHmac: !!hmac,
    hmacLength: hmac?.length,
    shop: shop,
    hasState: !!state
  });
  
  const CLIENT_ID = import.meta.env.SHOPIFY_CLIENT_ID;
  const CLIENT_SECRET = import.meta.env.SHOPIFY_SECRET;
  
  // Step 1: Validate state parameter (CSRF protection)
  const savedState = cookies.get('shopify_oauth_state')?.value;
  console.log('[SHOPIFY_CALLBACK] Validating state:', {
    receivedStateLength: state?.length,
    savedStateLength: savedState?.length,
    statesMatch: state === savedState
  });
  
  if (state !== savedState) {
    console.error('[SHOPIFY_CALLBACK] State validation failed - possible CSRF attack');
    return new Response('State validation failed', { status: 403 });
  }
  
  console.log('[SHOPIFY_CALLBACK] State validation successful');
  
  // Decode state to extract clientId
  let clientId = null;
  try {
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    clientId = stateData.clientId;
    console.log('[SHOPIFY_CALLBACK] State decoded:', {
      nonce: stateData.nonce,
      clientId: clientId
    });
  } catch (e) {
    console.error('[SHOPIFY_CALLBACK] Failed to decode state:', e);
  }
  
  // Step 2: Validate HMAC signature (ensures request is from Shopify)
  const params = Object.fromEntries(url.searchParams);
  delete params.hmac; // Remove hmac from params before validation
  
  console.log('[SHOPIFY_CALLBACK] Validating HMAC with params:', Object.keys(params));
  
  // Create sorted query string for HMAC validation
  const message = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  
  console.log('[SHOPIFY_CALLBACK] HMAC message created, length:', message.length);
  
  // Generate expected HMAC using client secret
  const generatedHash = crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(message)
    .digest('hex');
  
  console.log('[SHOPIFY_CALLBACK] HMAC comparison:', {
    receivedHmac: hmac?.substring(0, 10) + '...',
    generatedHmac: generatedHash?.substring(0, 10) + '...',
    match: generatedHash === hmac
  });
  
  if (generatedHash !== hmac) {
    console.error('[SHOPIFY_CALLBACK] HMAC validation failed - request may be forged');
    return new Response('HMAC validation failed', { status: 403 });
  }
  
  console.log('[SHOPIFY_CALLBACK] HMAC validation successful');
  
  // Step 3: Exchange authorization code for access token
  try {
    console.log('[SHOPIFY_CALLBACK] Exchanging authorization code for access token');
    console.log('[SHOPIFY_CALLBACK] Shop:', shop);
    
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
      }),
    });
    
    console.log('[SHOPIFY_CALLBACK] Token exchange response status:', tokenResponse.status);
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[SHOPIFY_CALLBACK] Token exchange failed:', errorText);
      throw new Error('Token exchange failed');
    }
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const scope = tokenData.scope;
    
    console.log('[SHOPIFY_CALLBACK] Access token received:', {
      tokenLength: accessToken?.length,
      scope: scope,
      hasToken: !!accessToken
    });
    
    // Step 4: Store access token in Supabase (clients table)
    if (clientId) {
      console.log('[SHOPIFY_CALLBACK] Storing Shopify credentials in database for client:', clientId);
      
      const supabase = createClient(
        import.meta.env.SUPABASE_URL,
        import.meta.env.SUPABASE_KEY
      );
      
      console.log('[SHOPIFY_CALLBACK] Supabase client created');
      
      const { error } = await supabase
        .from('clients')
        .update({
          shopify_store_url: shop,
          shopify_access_token: accessToken,
          shopify_connected: true,
          shopify_scope: scope,
        })
        .eq('id', clientId);
      
      if (error) {
        console.error('[SHOPIFY_CALLBACK] Supabase update failed:', error);
        throw error;
      }
      
      console.log('[SHOPIFY_CALLBACK] Successfully stored Shopify credentials in database');
      console.log('[SHOPIFY_CALLBACK] Client ID:', clientId);
      console.log('[SHOPIFY_CALLBACK] Store URL:', shop);
      
      // Redirect back to admin page with success message
      const redirectUrl = `/manage/shopify?shopify=connected&clientId=${clientId}`;
      console.log('[SHOPIFY_CALLBACK] Redirecting to:', redirectUrl);
      return redirect(redirectUrl, 302);
    } else {
      // No clientId provided - redirect to generic success page
      console.log('[SHOPIFY_CALLBACK] No clientId provided, redirecting to success page');
      return redirect(`/shopify-success?shop=${shop}`, 302);
    }
    
  } catch (error) {
    console.error('[SHOPIFY_CALLBACK] OAuth process failed:', error);
    console.error('[SHOPIFY_CALLBACK] Error details:', {
      message: error.message,
      stack: error.stack
    });
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}