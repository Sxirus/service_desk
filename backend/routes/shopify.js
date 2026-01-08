/**
 * Shopify Integration Routes
 * Handles OAuth flow, connection management, and API interactions
 * 
 * All routes are protected with authentication and authorization middleware
 */

const express = require('express');
const router = express.Router();
const crypto = require('node:crypto');
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
      const SCOPES = 'read_orders,read_all_orders,read_customers,read_products';

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

      // Validate required environment variables
      if (!process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_SECRET) {
        console.error('[SHOPIFY_CALLBACK] Missing Shopify credentials in environment');
        return res.status(500).json({ 
          error: 'Configuration Error',
          message: 'Shopify credentials not configured' 
        });
      }

      // Exchange authorization code for access token with timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      let tokenResponse;
      try {
        tokenResponse = await fetch(
          `https://${shop}/admin/oauth/access_token`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: process.env.SHOPIFY_CLIENT_ID,
              client_secret: process.env.SHOPIFY_SECRET,
              code: code,
            }),
            signal: controller.signal,
          }
        );
      } finally {
        clearTimeout(timeout);
      }

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
        `/manage/shopify?shopify=connected&shop=${encodeURIComponent(shop)}`;
      
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

      // Test API connection by fetching shop info via GraphQL
      const shopifyResponse = await fetch(
        `https://${client.shopify_store_url}/admin/api/2025-01/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': client.shopify_access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `
              {
                shop {
                  name
                  email
                  url
                }
                productsCount {
                  count
                }
                ordersCount {
                  count
                }
              }
            `
          })
        }
      );

      if (!shopifyResponse.ok) {
        const errorText = await shopifyResponse.text();
        console.error('[SHOPIFY_TEST] API test failed:', errorText);
        throw new Error(`Shopify API error: ${shopifyResponse.status}`);
      }

      const responseJson = await shopifyResponse.json();
      
      if (responseJson.errors) {
        console.error('[SHOPIFY_TEST] GraphQL errors:', responseJson.errors);
        throw new Error(`GraphQL error: ${responseJson.errors[0].message}`);
      }

      const shopData = responseJson.data;

      console.log('[SHOPIFY_TEST] Connection successful');

      res.json({
        success: true,
        shop: client.shopify_store_url,
        shopName: shopData.shop?.name,
        email: shopData.shop?.email,
        productsCount: shopData.productsCount?.count || 0,
        ordersCount: shopData.ordersCount?.count || 0,
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

      // Search customer in Shopify via GraphQL
      const shopifyResponse = await fetch(
        `https://${client.shopify_store_url}/admin/api/2025-01/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': client.shopify_access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `
              query findCustomer($query: String!) {
                customers(first: 1, query: $query) {
                  edges {
                    node {
                      id
                      email
                      firstName
                      lastName
                      numberOfOrders
                      amountSpent {
                        amount
                        currencyCode
                      }
                      defaultAddress {
                        address1
                        address2
                        city
                        province
                        zip
                        country
                        company
                      }
                      phone
                      verifiedEmail
                      createdAt
                      updatedAt
                    }
                  }
                }
              }
            `,
            variables: {
              query: `email:"${email}"`
            }
          })
        }
      );

      if (!shopifyResponse.ok) {
        const errorText = await shopifyResponse.text();
        console.error('[SHOPIFY_CUSTOMER] API error:', errorText);
        throw new Error(`Shopify API error: ${shopifyResponse.status}`);
      }

      const responseJson = await shopifyResponse.json();
      
      if (responseJson.errors) {
        console.error('[SHOPIFY_CUSTOMER] GraphQL errors:', responseJson.errors);
        throw new Error(`GraphQL error: ${responseJson.errors[0].message}`);
      }

      const edges = responseJson.data?.customers?.edges || [];

      if (edges.length === 0) {
        return res.json({ 
          customer: null,
          message: 'No Shopify customer found for this email'
        });
      }

      const node = edges[0].node;
      const numericId = node.id.split('/').pop();

      // Map GraphQL response to expected format
      const mappedCustomer = {
        id: numericId,
        email: node.email,
        first_name: node.firstName,
        last_name: node.lastName,
        orders_count: node.numberOfOrders,
        total_spent: node.amountSpent?.amount || "0.00",
        currency: node.amountSpent?.currencyCode,
        phone: node.phone,
        verified_email: node.verifiedEmail,
        created_at: node.createdAt,
        updated_at: node.updatedAt,
        default_address: node.defaultAddress ? {
          address1: node.defaultAddress.address1,
          address2: node.defaultAddress.address2,
          city: node.defaultAddress.city,
          province: node.defaultAddress.province,
          zip: node.defaultAddress.zip,
          country: node.defaultAddress.country,
          company: node.defaultAddress.company
        } : null
      };

      console.log('[SHOPIFY_CUSTOMER] Customer found');

      res.json({
        customer: mappedCustomer,
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
 */
router.get('/orders',
  authenticate,
  validateId('customerId'),
  async (req, res) => {
    try {
      const customerId = req.sanitized.customerId;
      const clientId = req.user.client_id;

      const { data: emails } = await supabase
        .from('incoming-mails')
        .select('email_address')
        .eq('customer_id', customerId)
        .order('send_at', { ascending: false })
        .limit(1);

      if (!emails || emails.length === 0) {
        return res.json({ orders: [], error: 'No email found' });
      }

      const customerEmail = emails[0].email_address;

      const { data: client } = await supabase
        .from('clients')
        .select('shopify_store_url, shopify_access_token, shopify_connected')
        .eq('id', clientId)
        .single();

      if (!client?.shopify_connected) {
        return res.json({ orders: [], error: 'Shopify not connected' });
      }

      const shopifyResponse = await fetch(
        `https://${client.shopify_store_url}/admin/api/2025-01/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': client.shopify_access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `
              query findOrdersByEmail($query: String!) {
                orders(first: 50, query: $query, sortKey: CREATED_AT, reverse: true) {
                  edges {
                    node {
                      id
                      name
                      createdAt
                      displayFinancialStatus
                      displayFulfillmentStatus
                      totalPriceSet { shopMoney { amount currencyCode } }
                      totalDiscountsSet { shopMoney { amount } }
                      totalShippingPriceSet { shopMoney { amount } }
                      totalTaxSet { shopMoney { amount } }
                      subtotalPriceSet { shopMoney { amount } }
                      totalRefundedSet { shopMoney { amount } }
                      refunds {
                        id
                        createdAt
                        note
                        totalRefundedSet { shopMoney { amount } }
                      }
                      cancelReason
                      cancelledAt
                      lineItems(first: 20) {
                        edges {
                          node {
                            id
                            title
                            quantity
                            refundableQuantity
                            variant { title sku }
                            originalUnitPriceSet { shopMoney { amount } }
                          }
                        }
                      }
                    }
                  }
                }
              }
            `,
            variables: {
              query: `email:"${customerEmail}" (status:open OR status:closed OR status:cancelled)`
            }
          })
        }
      );

      const responseJson = await shopifyResponse.json();
      if (responseJson.errors) throw new Error(responseJson.errors[0].message);

      const mappedOrders = (responseJson.data?.orders?.edges || []).map(edge => {
        const node = edge.node;
        return {
          id: node.id,
          order_number: node.name.replace('#', ''),
          created_at: node.createdAt,
          financial_status: node.displayFinancialStatus.toLowerCase(),
          fulfillment_status: node.displayFulfillmentStatus.toLowerCase(),
          total_price: node.totalPriceSet?.shopMoney?.amount || "0.00",
          total_discounts: node.totalDiscountsSet?.shopMoney?.amount || "0.00",
          total_shipping: node.totalShippingPriceSet?.shopMoney?.amount || "0.00",
          total_tax: node.totalTaxSet?.shopMoney?.amount || "0.00",
          subtotal: node.subtotalPriceSet?.shopMoney?.amount || "0.00",
          total_refunded: node.totalRefundedSet?.shopMoney?.amount || "0.00",
          refunds: (node.refunds || []).map(r => ({
            id: r.id,
            created_at: r.createdAt,
            note: r.note,
            amount: r.totalRefundedSet.shopMoney.amount
          })),
          currency: node.totalPriceSet?.shopMoney?.currencyCode,
          cancelled: !!node.cancelledAt,
          line_items: node.lineItems.edges.map(li => ({
            id: li.node.id,
            name: li.node.title,
            quantity: li.node.quantity,
            refundableQuantity: li.node.refundableQuantity,
            price: li.node.originalUnitPriceSet.shopMoney.amount,
            variantTitle: li.node.variant?.title,
            sku: li.node.variant?.sku
          }))
        };
      });

      res.json({ orders: mappedOrders, shopifyStore: client.shopify_store_url });
    } catch (error) {
      res.json({ orders: [], error: error.message });
    }
  }
);

/**
 * Calculate suggested refund
 * POST /api/shopify/refund/calculate
 */
router.post('/refund/calculate',
  authenticate,
  async (req, res) => {
    try {
      const { orderId, refundLineItems } = req.body;
      const clientId = req.user.client_id;

      const { data: client } = await supabase
        .from('clients')
        .select('shopify_store_url, shopify_access_token')
        .eq('id', clientId)
        .single();

      const response = await fetch(
        `https://${client.shopify_store_url}/admin/api/2025-01/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': client.shopify_access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `
              query suggestedRefund($id: ID!, $items: [RefundLineItemInput!]) {
                order(id: $id) {
                  suggestedRefund(refundLineItems: $items) {
                    amountSet { shopMoney { amount currencyCode } }
                    totalTaxSet { shopMoney { amount currencyCode } }
                    shipping { amountSet { shopMoney { amount currencyCode } } }
                  }
                }
              }
            `,
            variables: { id: orderId, items: refundLineItems }
          })
        }
      );

      const json = await response.json();
      if (json.errors) throw new Error(json.errors[0].message);

      res.json({ success: true, suggestedRefund: json.data.order.suggestedRefund });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Create a refund
 * POST /api/shopify/refund/create
 */
router.post('/refund/create',
  authenticate,
  async (req, res) => {
    try {
      const { orderId, refundLineItems, notifyCustomer, note, shippingAmount } = req.body;
      const clientId = req.user.client_id;

      const { data: client } = await supabase
        .from('clients')
        .select('shopify_store_url, shopify_access_token')
        .eq('id', clientId)
        .single();

      // We first calculate to get the currency and suggested transactions
      const calcResponse = await fetch(
        `https://${client.shopify_store_url}/admin/api/2025-01/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': client.shopify_access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `
              query suggestedRefund($id: ID!, $items: [RefundLineItemInput!]) {
                order(id: $id) {
                  suggestedRefund(refundLineItems: $items) {
                    suggestedTransactions {
                      gateway
                      amountSet { shopMoney { amount currencyCode } }
                      parentTransaction { id }
                    }
                  }
                }
              }
            `,
            variables: { id: orderId, items: refundLineItems }
          })
        }
      );

      const calcJson = await calcResponse.json();
      const transactions = calcJson.data.order.suggestedRefund.suggestedTransactions.map(t => ({
        gateway: t.gateway,
        amount: t.amountSet.shopMoney.amount,
        parentTransactionId: t.parentTransaction.id,
        kind: 'REFUND'
      }));

      const mutationResponse = await fetch(
        `https://${client.shopify_store_url}/admin/api/2025-01/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': client.shopify_access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `
              mutation refundCreate($input: RefundInput!) {
                refundCreate(input: $input) {
                  refund { id }
                  userErrors { field message }
                }
              }
            `,
            variables: {
              input: {
                orderId,
                refundLineItems,
                notify: notifyCustomer,
                note,
                transactions,
                shipping: shippingAmount ? { amount: shippingAmount, fullRefund: false } : undefined
              }
            }
          })
        }
      );

      const result = await mutationResponse.json();
      if (result.errors) throw new Error(result.errors[0].message);
      if (result.data.refundCreate.userErrors.length > 0) {
        throw new Error(result.data.refundCreate.userErrors[0].message);
      }

      res.json({ success: true, refund: result.data.refundCreate.refund });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * Cancel an order
 * POST /api/shopify/order/cancel
 */
router.post('/order/cancel',
  authenticate,
  async (req, res) => {
    try {
      const { orderId, reason, notifyCustomer, refundOriginalPaymentMethod, staffNote } = req.body;
      const clientId = req.user.client_id;

      const { data: client } = await supabase
        .from('clients')
        .select('shopify_store_url, shopify_access_token')
        .eq('id', clientId)
        .single();

      const response = await fetch(
        `https://${client.shopify_store_url}/admin/api/2025-01/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': client.shopify_access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `
              mutation orderCancel($id: ID!, $reason: OrderCancelReason!, $notify: Boolean, $refund: OrderCancelRefundMethodInput, $note: String) {
                orderCancel(orderId: $id, reason: $reason, notifyCustomer: $notify, refundMethod: $refund, restock: true, staffNote: $note) {
                  orderCancelUserErrors { code message }
                }
              }
            `,
            variables: {
              id: orderId,
              reason,
              notify: notifyCustomer,
              refund: refundOriginalPaymentMethod ? { originalPaymentMethodsRefund: true } : undefined,
              note: staffNote
            }
          })
        }
      );

      const json = await response.json();
      if (json.errors) throw new Error(json.errors[0].message);
      if (json.data.orderCancel.orderCancelUserErrors.length > 0) {
        throw new Error(json.data.orderCancel.orderCancelUserErrors[0].message);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;