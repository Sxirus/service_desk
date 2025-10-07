/**
 * Shopify OAuth Installation Endpoint
 * Initiates the OAuth flow by redirecting to Shopify's authorization page
 * 
 * Query Parameters:
 * - shop: Shopify store name (required)
 * - clientId: Internal client ID for association (optional)
 */

export async function GET({ request, redirect, cookies }) {
  console.log('[SHOPIFY_INSTALL] Request received');
  
  const url = new URL(request.url);
  let shop = url.searchParams.get('shop');
  const clientId = url.searchParams.get('clientId');
  
  console.log('[SHOPIFY_INSTALL] Parameters:', { shop, clientId });
  
  // Validate shop parameter exists
  if (!shop) {
    console.error('[SHOPIFY_INSTALL] Missing shop parameter');
    return new Response('Shop parameter is required', { status: 400 });
  }
  
  // Normalize shop name to include .myshopify.com domain
  if (!shop.includes('.myshopify.com')) {
    shop = `${shop}.myshopify.com`;
    console.log('[SHOPIFY_INSTALL] Shop name normalized to:', shop);
  }
  
  // Validate shop format using regex
  // Format must be: lowercase letters, numbers, hyphens, followed by .myshopify.com
  const shopRegex = /^[a-z0-9-]+\.myshopify\.com$/;
  if (!shopRegex.test(shop)) {
    console.error('[SHOPIFY_INSTALL] Invalid shop name format:', shop);
    return new Response('Invalid shop name format', { status: 400 });
  }
  
  console.log('[SHOPIFY_INSTALL] Shop name validated:', shop);
  
  // Get OAuth credentials from environment variables
  const CLIENT_ID = import.meta.env.SHOPIFY_CLIENT_ID;
  const REDIRECT_URI = import.meta.env.SHOPIFY_REDIRECT_URI;
  const SCOPES = 'read_orders,read_customers,read_products';
  
  console.log('[SHOPIFY_INSTALL] OAuth configuration:', {
    clientId: CLIENT_ID?.substring(0, 10) + '...',
    redirectUri: REDIRECT_URI,
    scopes: SCOPES
  });
  
  // Create state parameter for CSRF protection
  // State includes: random nonce + optional clientId
  const stateData = {
    nonce: crypto.randomUUID(),
    clientId: clientId || null,
  };
  const state = Buffer.from(JSON.stringify(stateData)).toString('base64');
  
  console.log('[SHOPIFY_INSTALL] State created:', {
    nonce: stateData.nonce,
    clientId: stateData.clientId,
    stateLength: state.length
  });
  
  // Store state in HTTP-only cookie for validation in callback
  cookies.set('shopify_oauth_state', state, {
    path: '/',
    httpOnly: true,
    secure: false, // Set to true in production with HTTPS
    maxAge: 60 * 10, // 10 minutes expiration
  });
  
  console.log('[SHOPIFY_INSTALL] State stored in cookie');
  
  // Build Shopify OAuth authorization URL
  const authUrl = `https://${shop}/admin/oauth/authorize?` +
    `client_id=${CLIENT_ID}&` +
    `scope=${SCOPES}&` +
    `redirect_uri=${REDIRECT_URI}&` +
    `state=${state}`;
  
  console.log('[SHOPIFY_INSTALL] Redirecting to Shopify OAuth:', authUrl.substring(0, 100) + '...');
  console.log('[SHOPIFY_INSTALL] Full shop URL:', `https://${shop}`);
  
  return redirect(authUrl, 302);
}