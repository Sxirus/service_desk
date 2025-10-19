/**
 * Shopify Integration Routes
 * Handles OAuth flow, connection management, and API interactions
 * 
 * All routes are protected with authentication and authorization middleware
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { authorizeClient } = require('../middleware/authorization');
const { 
  validateShopName, 
  validateId,
  validateEmail,
  validateOAuthState,
  validateShopifyHMAC
} = require('../middleware/validation');

/**
 * Initiate Shopify OAuth flow
 * GET /api/shopify/install
 * 
 * Query params:
 * - shop: Shopify store name (required)
 * 
 * Authentication: Required
 * Authorization: User must belong to a client
 */
router.get('/install', 
  authenticate,
  validateShopName,
  async (req, res) => {
    try {
      const shop = req.sanitized.shop;
      const clientId = req.user.client_id;

      console.log('[SHOPIFY_INSTALL] Initiating OAuth for client:', clientId);

      // Get OAuth credentials from environment
      const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
      const REDIRECT_URI = process.env.SHOPIFY_REDIRECT_URI;
      const SCOPES = 'read_orders,read_customers,read_products';

      if (!CLIENT_ID || !REDIRECT_URI) {
        console.error('[SHOPIFY_INSTALL] Missing Shopify credentials in environment');
        return res.status(500).json({ 
          error: 'Configuration Error',
          message: 'Shopify integration is not properly configured' 
        });
      }

      // Create state parameter for CSRF protection
      const stateData = {
        nonce: crypto.randomUUID(),
        clientId: clientId,
        timestamp: Date.now()
      };
      const state = Buffer.from(JSON.stringify(stateData)).toString('base64');

      console.log('[SHOPIFY_INSTALL] State created:', {
        nonce: stateData.nonce,
        clientId: clientId
      });

      // Store state in HTTP-only cookie
      res.cookie('shopify_oauth_state', state, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        sameSite: 'lax',
        maxAge: 10 * 60 * 1000, // 10 minutes
      });

      // Build Shopify OAuth authorization URL
      const authUrl = `https://${shop}/admin/oauth/authorize?` +
        `client_id=${CLIENT_ID}&` +
        `scope=${SCOPES}&` +
        `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
        `state=${state}`;

      console.log('[SHOPIFY_INSTALL] Redirecting to Shopify OAuth');

      // Return redirect URL for client to follow
      res.json({ 
        success: true,
        redirectUrl: authUrl,
        shop: shop
      });

    } catch (error) {
      console.error('[SHOPIFY_INSTALL] Error:', error);
      res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'Failed to initiate OAuth flow' 
      });
    }
  }
);

/**
 * Handle Shopify OAuth callback
 * GET /api/shopify/callback
 * 
 * Query params (from Shopify):
 * - code: Authorization code
 * - hmac: HMAC signature for validation
 * - shop: Store name
 * - state: CSRF protection token
 * 
 * Authentication: Not required (OAuth callback)
 * Validation: HMAC and state validation required
 */
router.get('/callback',
  validateOAuthState,
  validateShopifyHMAC,
  async (req, res) => {
    try {
      const { code, shop } = req.query;
      const stateData = req.sanitized.stateData;

      console.log('[SHOPIFY_CALLBACK] Processing OAuth callback:', {
        shop: shop,
        clientId: stateData.clientId
      });

      if (!code) {
        return res.status(400).json({ 
          error: 'Bad Request',
          message: 'Authorization code missing' 
        });
      }

      // Exchange authorization code for access token
      const tokenResponse = await fetch(
        `https://${shop}/admin/oauth/access_token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: process.env.SHOPIFY_CLIENT_ID,
            client_secret: process.env.SHOPIFY_SECRET,
            code: code,
          }),
        }
      );

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('[SHOPIFY_CALLBACK] Token exchange failed:', errorText);
        throw new Error('Failed to exchange authorization code');
      }

      const tokenData = await tokenResponse.json();
      const { access_token, scope } = tokenData;

      console.log('[SHOPIFY_CALLBACK] Access token received');

      // Store credentials in database
      if (stateData.clientId) {
        const { error } = await supabase
          .from('clients')
          .update({
            shopify_store_url: shop,
            shopify_access_token: access_token,
            shopify_connected: true,
            shopify_scope: scope,
          })
          .eq('id', stateData.clientId);

        if (error) {
          console.error('[SHOPIFY_CALLBACK] Database update failed:', error);
          throw error;
        }

        console.log('[SHOPIFY_CALLBACK] Shopify connected for client:', stateData.clientId);
      }

      // Clear OAuth state cookie
      res.clearCookie('shopify_oauth_state');

      // Redirect to success page
      const redirectUrl = process.env.FRONTEND_URL + 
        `/manage/shopify?status=connected&shop=${encodeURIComponent(shop)}`;
      
      res.redirect(redirectUrl);

    } catch (error) {
      console.error('[SHOPIFY_CALLBACK] Error:', error);
      
      // Clear OAuth state cookie on error
      res.clearCookie('shopify_oauth_state');
      
      const redirectUrl = process.env.FRONTEND_URL + 
        `/manage/shopify?status=error&message=${encodeURIComponent(error.message)}`;
      
      res.redirect(redirectUrl);
    }
  }
);

/**
 * Test Shopify connection
 * GET /api/shopify/test
 * 
 * Authentication: Required
 * Authorization: User's client must have Shopify connected
 */
router.get('/test',
  authenticate,
  async (req, res) => {
    try {
      const clientId = req.user.client_id;

      console.log('[SHOPIFY_TEST] Testing connection for client:', clientId);

      // Fetch client's Shopify credentials
      const { data: client, error } = await supabase
        .from('clients')
        .select('shopify_store_url, shopify_access_token, shopify_connected')
        .eq('id', clientId)
        .single();

      if (error || !client) {
        return res.status(404).json({ 
          error: 'Not Found',
          message: 'Client not found' 
        });
      }

      if (!client.shopify_connected || !client.shopify_access_token) {
        return res.status(400).json({ 
          success: false,
          error: 'Shopify not connected for this client' 
        });
      }

      // Test API connection by fetching shop info
      const shopResponse = await fetch(
        `https://${client.shopify_store_url}/admin/api/2024-01/shop.json`,
        {
          headers: {
            'X-Shopify-Access-Token': client.shopify_access_token,
          },
        }
      );

      if (!shopResponse.ok) {
        const errorText = await shopResponse.text();
        console.error('[SHOPIFY_TEST] API test failed:', errorText);
        throw new Error(`Shopify API error: ${shopResponse.status}`);
      }

      const shopData = await shopResponse.json();

      console.log('[SHOPIFY_TEST] Connection successful');

      res.json({
        success: true,
        shop: client.shopify_store_url,
        shopName: shopData.shop?.name,
        email: shopData.shop?.email,
        connected: true
      });

    } catch (error) {
      console.error('[SHOPIFY_TEST] Error:', error);
      res.json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Disconnect Shopify integration
 * POST /api/shopify/disconnect
 * 
 * Authentication: Required
 * Authorization: User must be from the client being disconnected
 */
router.post('/disconnect',
  authenticate,
  async (req, res) => {
    try {
      const clientId = req.user.client_id;

      console.log('[SHOPIFY_DISCONNECT] Disconnecting client:', clientId);

      // Clear Shopify credentials
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

      console.log('[SHOPIFY_DISCONNECT] Successfully disconnected');

      res.json({ 
        success: true,
        message: 'Shopify disconnected successfully'
      });

    } catch (error) {
      console.error('[SHOPIFY_DISCONNECT] Error:', error);
      res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'Failed to disconnect Shopify' 
      });
    }
  }
);

/**
 * Get customer info from Shopify
 * GET /api/shopify/customer
 * 
 * Query params:
 * - email: Customer email address (required)
 * 
 * Authentication: Required
 * Authorization: Customer must belong to user's client
 */
router.get('/customer',
  authenticate,
  validateEmail('email'),
  async (req, res) => {
    try {
      const email = req.sanitized.email;
      const clientId = req.user.client_id;

      console.log('[SHOPIFY_CUSTOMER] Fetching customer info:', { email, clientId });

      // Verify email belongs to a customer of this client
      const { data: emailRecord, error: emailError } = await supabase
        .from('email-addresses')
        .select('customer_id')
        .eq('email_address', email)
        .single();

      if (emailError || !emailRecord) {
        return res.status(404).json({ 
          customer: null,
          error: 'Email not found in system' 
        });
      }

      // Verify customer belongs to user's client
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id, name, client_id')
        .eq('id', emailRecord.customer_id)
        .single();

      if (customerError || !customer) {
        return res.status(404).json({ 
          customer: null,
          error: 'Customer not found' 
        });
      }

      if (customer.client_id !== clientId) {
        console.warn('[SHOPIFY_CUSTOMER] Unauthorized access attempt');
        return res.status(403).json({ 
          customer: null,
          error: 'Access denied' 
        });
      }

      // Fetch client's Shopify credentials
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('shopify_store_url, shopify_access_token, shopify_connected')
        .eq('id', clientId)
        .single();

      if (clientError || !client || !client.shopify_connected) {
        return res.json({ 
          customer: null,
          error: 'Shopify not connected' 
        });
      }

      // Search customer in Shopify
      const shopifyResponse = await fetch(
        `https://${client.shopify_store_url}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(email)}`,
        {
          headers: {
            'X-Shopify-Access-Token': client.shopify_access_token,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!shopifyResponse.ok) {
        const errorText = await shopifyResponse.text();
        console.error('[SHOPIFY_CUSTOMER] API error:', errorText);
        throw new Error(`Shopify API error: ${shopifyResponse.status}`);
      }

      const data = await shopifyResponse.json();

      if (!data.customers || data.customers.length === 0) {
        return res.json({ 
          customer: null,
          message: 'No Shopify customer found for this email'
        });
      }

      console.log('[SHOPIFY_CUSTOMER] Customer found');

      res.json({
        customer: data.customers[0],
        shopifyStore: client.shopify_store_url,
      });

    } catch (error) {
      console.error('[SHOPIFY_CUSTOMER] Error:', error);
      res.json({
        customer: null,
        error: error.message
      });
    }
  }
);

/**
 * Get customer orders from Shopify
 * GET /api/shopify/orders
 * 
 * Query params:
 * - customerId: Internal customer ID (required)
 * 
 * Authentication: Required
 * Authorization: Customer must belong to user's client
 */
router.get('/orders',
  authenticate,
  validateId('customerId'),
  async (req, res) => {
    try {
      const customerId = req.sanitized.customerId;
      const clientId = req.user.client_id;

      console.log('[SHOPIFY_ORDERS] Fetching orders:', { customerId, clientId });

      // Fetch and verify customer
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id, name, client_id')
        .eq('id', customerId)
        .single();

      if (customerError || !customer) {
        return res.status(404).json({ 
          orders: [],
          error: 'Customer not found' 
        });
      }

      if (customer.client_id !== clientId) {
        console.warn('[SHOPIFY_ORDERS] Unauthorized access attempt');
        return res.status(403).json({ 
          orders: [],
          error: 'Access denied' 
        });
      }

      // Get customer email
      const { data: emails, error: emailError } = await supabase
        .from('incoming-mails')
        .select('email_address')
        .eq('customer_id', customerId)
        .order('send_at', { ascending: false })
        .limit(1);

      if (emailError || !emails || emails.length === 0) {
        return res.json({ 
          orders: [],
          error: 'No email found for customer' 
        });
      }

      const customerEmail = emails[0].email_address;

      // Fetch client's Shopify credentials
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('shopify_store_url, shopify_access_token, shopify_connected')
        .eq('id', clientId)
        .single();

      if (clientError || !client || !client.shopify_connected) {
        return res.json({ 
          orders: [],
          error: 'Shopify not connected' 
        });
      }

      // Fetch orders from Shopify
      const shopifyResponse = await fetch(
        `https://${client.shopify_store_url}/admin/api/2024-01/orders.json?limit=20&status=any&email=${encodeURIComponent(customerEmail)}`,
        {
          headers: {
            'X-Shopify-Access-Token': client.shopify_access_token,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!shopifyResponse.ok) {
        const errorText = await shopifyResponse.text();
        console.error('[SHOPIFY_ORDERS] API error:', errorText);
        throw new Error(`Shopify API error: ${shopifyResponse.status}`);
      }

      const data = await shopifyResponse.json();

      console.log('[SHOPIFY_ORDERS] Orders fetched:', data.orders?.length || 0);

      res.json({
        orders: data.orders || [],
        customerEmail: customerEmail,
        shopifyStore: client.shopify_store_url,
      });

    } catch (error) {
      console.error('[SHOPIFY_ORDERS] Error:', error);
      res.json({
        orders: [],
        error: error.message
      });
    }
  }
);

module.exports = router;