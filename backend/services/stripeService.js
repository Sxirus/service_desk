const Stripe = require('stripe');
const logger = require('../utils/logger');

// Initialize Stripe with secret key from environment
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-03-31.basil', // Use latest API version
});

/**
 * Create a Stripe customer from client data
 * @param {Object} clientData - Client information
 * @param {string} clientData.email - Client email (from primary contact or admin)
 * @param {string} clientData.name - Company name
 * @param {string} clientData.address_street - Street address
 * @param {string} clientData.address_city - City
 * @param {string} clientData.address_zip - Postal code
 * @param {string} clientData.address_country - Country code (e.g., 'US', 'DE')
 * @param {number} clientData.client_id - Internal client ID to store as metadata
 * @returns {Promise<Object>} Stripe customer object
 */
async function createStripeCustomer(clientData) {
  try {
    logger.info('[StripeService] Creating Stripe customer for', { name: clientData.name });

    const customerData = {
      email: clientData.email,
      name: clientData.name,
      metadata: {
        client_id: clientData.client_id.toString(),
        created_via: 'registration_flow',
      },
    };

    // Add address if all required fields are present
    if (
      clientData.address_street &&
      clientData.address_city &&
      clientData.address_zip &&
      clientData.address_country
    ) {
      customerData.address = {
        line1: clientData.address_street,
        city: clientData.address_city,
        postal_code: clientData.address_zip,
        country: clientData.address_country,
      };

      // Stripe also supports shipping address
      customerData.shipping = {
        name: clientData.name,
        address: {
          line1: clientData.address_street,
          city: clientData.address_city,
          postal_code: clientData.address_zip,
          country: clientData.address_country,
        },
      };
    }

    // Add VAT number if present (useful for EU customers)
    if (clientData.vat) {
      customerData.metadata.vat_number = clientData.vat;
    }

    const customer = await stripe.customers.create(customerData);

    logger.info('[StripeService] Stripe customer created successfully', { customerId: customer.id });
    return {
      success: true,
      stripe_customer_id: customer.id,
      customer: customer,
    };
  } catch (error) {
    logger.error('[StripeService] Error creating Stripe customer', { error: error.message });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Update a Stripe customer
 * @param {string} stripeCustomerId - Stripe customer ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated Stripe customer object
 */
async function updateStripeCustomer(stripeCustomerId, updates) {
  try {
    logger.info('[StripeService] Updating Stripe customer', { stripeCustomerId });

    const customer = await stripe.customers.update(stripeCustomerId, updates);

    logger.info('[StripeService] Stripe customer updated successfully');
    return {
      success: true,
      customer: customer,
    };
  } catch (error) {
    logger.error('[StripeService] Error updating Stripe customer', { error: error.message });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Retrieve a Stripe customer
 * @param {string} stripeCustomerId - Stripe customer ID
 * @returns {Promise<Object>} Stripe customer object
 */
async function getStripeCustomer(stripeCustomerId) {
  try {
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    return {
      success: true,
      customer: customer,
    };
  } catch (error) {
    logger.error('[StripeService] Error retrieving Stripe customer', { error: error.message });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Delete a Stripe customer
 * @param {string} stripeCustomerId - Stripe customer ID
 * @returns {Promise<Object>} Deletion confirmation
 */
async function deleteStripeCustomer(stripeCustomerId) {
  try {
    logger.info('[StripeService] Deleting Stripe customer', { stripeCustomerId });

    const deleted = await stripe.customers.del(stripeCustomerId);

    logger.info('[StripeService] Stripe customer deleted successfully');
    return {
      success: true,
      deleted: deleted,
    };
  } catch (error) {
    logger.error('[StripeService] Error deleting Stripe customer', { error: error.message });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create a Stripe Checkout Session for subscription
 * @param {Object} params - Checkout session parameters
 * @param {string} params.customerId - Stripe customer ID
 * @param {string} params.priceId - Stripe Price ID for the subscription
 * @param {number} params.quantity - Number of users (default: 1)
 * @param {string} params.successUrl - URL to redirect on success
 * @param {string} params.cancelUrl - URL to redirect on cancel
 * @returns {Promise<Object>} Checkout session with client secret
 */
async function createCheckoutSession({ customerId, priceId, quantity = 1, successUrl, cancelUrl }) {
  try {
    logger.info('[StripeService] Creating checkout session for customer', { customerId, quantity });

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'custom', // Custom UI using Stripe Elements
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: quantity,
        },
      ],
      mode: 'subscription',
      return_url: successUrl,
    });

    logger.info('[StripeService] Checkout session created', { sessionId: session.id });
    return {
      success: true,
      clientSecret: session.client_secret,
      sessionId: session.id,
    };
  } catch (error) {
    logger.error('[StripeService] Error creating checkout session', { error: error.message });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Retrieve a Stripe Checkout Session
 * @param {string} sessionId - Stripe session ID
 * @returns {Promise<Object>} Checkout session with subscription details
 */
async function retrieveCheckoutSession(sessionId) {
  try {
    logger.info('[StripeService] Retrieving checkout session', { sessionId });

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    logger.info('[StripeService] Session retrieved', { sessionId: session.id, status: session.status });
    return {
      success: true,
      session: session,
      subscriptionId: session.subscription?.id || session.subscription,
      status: session.status,
    };
  } catch (error) {
    logger.error('[StripeService] Error retrieving session', { error: error.message });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create a Stripe Billing Portal Session
 * Allows customers to manage their subscription and payment methods
 * @param {Object} params - Portal session parameters
 * @param {string} params.customerId - Stripe customer ID
 * @param {string} params.returnUrl - URL to redirect after portal session
 * @returns {Promise<Object>} Portal session with URL
 */
async function createBillingPortalSession({ customerId, returnUrl }) {
  try {
    logger.info('[StripeService] Creating billing portal session for customer', { customerId });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    logger.info('[StripeService] Billing portal session created');
    return {
      success: true,
      url: session.url,
    };
  } catch (error) {
    logger.error('[StripeService] Error creating billing portal session', { error: error.message });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get subscription details
 * @param {string} subscriptionId - Stripe subscription ID
 * @returns {Promise<Object>} Subscription details
 */
async function getSubscription(subscriptionId) {
  try {
    logger.info('[StripeService] Retrieving subscription', { subscriptionId });

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice', 'customer'],
    });

    logger.info('[StripeService] Subscription retrieved', { subscriptionId: subscription.id, status: subscription.status });
    logger.info('[StripeService] Full subscription object keys', { keys: Object.keys(subscription) });
    logger.info('[StripeService] Period dates', {
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
    });
    logger.info('[StripeService] Items', { items: subscription.items });
    return {
      success: true,
      subscription: subscription,
    };
  } catch (error) {
    logger.error('[StripeService] Error retrieving subscription', { error: error.message });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Update subscription quantity (for adding/removing users)
 * @param {string} subscriptionId - Stripe subscription ID
 * @param {number} quantity - New quantity
 * @returns {Promise<Object>} Updated subscription
 */
async function updateSubscriptionQuantity(subscriptionId, quantity) {
  try {
    logger.info('[StripeService] Updating subscription quantity', { subscriptionId, quantity });

    const subscription = await stripe.subscriptions.update(subscriptionId, {
      items: [{
        id: (await stripe.subscriptions.retrieve(subscriptionId)).items.data[0].id,
        quantity: quantity,
      }],
      proration_behavior: 'always_invoice', // Pro-rate immediately
    });

    logger.info('[StripeService] Subscription quantity updated', { subscriptionId: subscription.id, quantity });
    return {
      success: true,
      subscription: subscription,
    };
  } catch (error) {
    logger.error('[StripeService] Error updating subscription quantity', { error: error.message });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get MRR for a specific subscription
 * @param {string} subscriptionId - Stripe subscription ID
 * @returns {Promise<Object>} Subscription MRR in cents
 */
async function getSubscriptionMRR(subscriptionId) {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    // Calculate MRR from subscription items
    let mrr = 0;
    for (const item of subscription.items.data) {
      const price = item.price;
      const quantity = item.quantity || 1;
      
      if (price.recurring) {
        let monthlyAmount = price.unit_amount * quantity;
        
        // Normalize to monthly
        if (price.recurring.interval === 'year') {
          monthlyAmount = monthlyAmount / 12;
        } else if (price.recurring.interval === 'week') {
          monthlyAmount = monthlyAmount * 4.33;
        } else if (price.recurring.interval === 'day') {
          monthlyAmount = monthlyAmount * 30;
        }
        
        mrr += monthlyAmount;
      }
    }
    
    return {
      success: true,
      mrr: Math.round(mrr), // MRR in cents
      status: subscription.status,
      currency: subscription.currency
    };
  } catch (error) {
    logger.error('[StripeService] Error getting subscription MRR', { error: error.message });
    return {
      success: false,
      error: error.message,
      mrr: 0
    };
  }
}

/**
 * Get total revenue for a customer from Stripe
 * @param {string} customerId - Stripe customer ID
 * @returns {Promise<Object>} Total paid amount
 */
async function getCustomerTotalRevenue(customerId) {
  try {
    // Get all paid invoices for this customer
    const invoices = await stripe.invoices.list({
      customer: customerId,
      status: 'paid',
      limit: 100, // Get up to 100 invoices
    });
    
    let totalRevenue = 0;
    for (const invoice of invoices.data) {
      totalRevenue += invoice.amount_paid;
    }
    
    // If there are more invoices, paginate
    let hasMore = invoices.has_more;
    let startingAfter = invoices.data.length > 0 ? invoices.data[invoices.data.length - 1].id : null;
    
    while (hasMore && startingAfter) {
      const moreInvoices = await stripe.invoices.list({
        customer: customerId,
        status: 'paid',
        limit: 100,
        starting_after: startingAfter,
      });
      
      for (const invoice of moreInvoices.data) {
        totalRevenue += invoice.amount_paid;
      }
      
      hasMore = moreInvoices.has_more;
      startingAfter = moreInvoices.data.length > 0 ? moreInvoices.data[moreInvoices.data.length - 1].id : null;
    }
    
    return {
      success: true,
      totalRevenue: totalRevenue, // In cents
      invoiceCount: invoices.data.length
    };
  } catch (error) {
    logger.error('[StripeService] Error getting customer revenue', { error: error.message });
    return {
      success: false,
      error: error.message,
      totalRevenue: 0
    };
  }
}

/**
 * Get platform-wide revenue metrics from Stripe
 * @returns {Promise<Object>} MRR and total revenue across all subscriptions
 */
async function getPlatformRevenueMetrics() {
  try {
    // Get all active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      expand: ['data.items.data.price']
    });
    
    let totalMRR = 0;
    
    for (const subscription of subscriptions.data) {
      for (const item of subscription.items.data) {
        const price = item.price;
        const quantity = item.quantity || 1;
        
        if (price.recurring) {
          let monthlyAmount = price.unit_amount * quantity;
          
          // Normalize to monthly
          if (price.recurring.interval === 'year') {
            monthlyAmount = monthlyAmount / 12;
          } else if (price.recurring.interval === 'week') {
            monthlyAmount = monthlyAmount * 4.33;
          } else if (price.recurring.interval === 'day') {
            monthlyAmount = monthlyAmount * 30;
          }
          
          totalMRR += monthlyAmount;
        }
      }
    }
    
    // Get total revenue from all paid invoices (last 12 months for performance)
    const twelveMonthsAgo = Math.floor(Date.now() / 1000) - (365 * 24 * 60 * 60);
    const invoices = await stripe.invoices.list({
      status: 'paid',
      limit: 100,
      created: { gte: twelveMonthsAgo }
    });
    
    let totalRevenue = 0;
    for (const invoice of invoices.data) {
      totalRevenue += invoice.amount_paid;
    }
    
    // Paginate if needed
    let hasMore = invoices.has_more;
    let startingAfter = invoices.data.length > 0 ? invoices.data[invoices.data.length - 1].id : null;
    
    while (hasMore && startingAfter) {
      const moreInvoices = await stripe.invoices.list({
        status: 'paid',
        limit: 100,
        starting_after: startingAfter,
        created: { gte: twelveMonthsAgo }
      });
      
      for (const invoice of moreInvoices.data) {
        totalRevenue += invoice.amount_paid;
      }
      
      hasMore = moreInvoices.has_more;
      startingAfter = moreInvoices.data.length > 0 ? moreInvoices.data[moreInvoices.data.length - 1].id : null;
    }
    
    return {
      success: true,
      mrr: Math.round(totalMRR), // In cents
      totalRevenue: totalRevenue, // In cents (last 12 months)
      activeSubscriptions: subscriptions.data.length,
      currency: 'eur'
    };
  } catch (error) {
    logger.error('[StripeService] Error getting platform revenue', { error: error.message });
    return {
      success: false,
      error: error.message,
      mrr: 0,
      totalRevenue: 0
    };
  }
}

/**
 * Verify Stripe webhook signature
 * @param {Buffer} payload - Raw request body
 * @param {string} signature - Stripe signature header
 * @param {string} secret - Webhook secret
 * @returns {Object} Constructed event
 */
function constructWebhookEvent(payload, signature, secret) {
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

/**
 * Get Stripe instance for direct API calls
 * @returns {Stripe} Stripe instance
 */
function getStripeInstance() {
  return stripe;
}

module.exports = {
  createStripeCustomer,
  updateStripeCustomer,
  getStripeCustomer,
  deleteStripeCustomer,
  createCheckoutSession,
  retrieveCheckoutSession,
  createBillingPortalSession,
  getSubscription,
  updateSubscriptionQuantity,
  getSubscriptionMRR,
  getCustomerTotalRevenue,
  getPlatformRevenueMetrics,
  constructWebhookEvent,
  getStripeInstance,
};
