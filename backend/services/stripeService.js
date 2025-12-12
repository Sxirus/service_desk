const Stripe = require('stripe');

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
    console.log('[StripeService] Creating Stripe customer for:', clientData.name);

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

    console.log('[StripeService] Stripe customer created successfully:', customer.id);
    return {
      success: true,
      stripe_customer_id: customer.id,
      customer: customer,
    };
  } catch (error) {
    console.error('[StripeService] Error creating Stripe customer:', error.message);
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
    console.log('[StripeService] Updating Stripe customer:', stripeCustomerId);

    const customer = await stripe.customers.update(stripeCustomerId, updates);

    console.log('[StripeService] Stripe customer updated successfully');
    return {
      success: true,
      customer: customer,
    };
  } catch (error) {
    console.error('[StripeService] Error updating Stripe customer:', error.message);
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
    console.error('[StripeService] Error retrieving Stripe customer:', error.message);
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
    console.log('[StripeService] Deleting Stripe customer:', stripeCustomerId);

    const deleted = await stripe.customers.del(stripeCustomerId);

    console.log('[StripeService] Stripe customer deleted successfully');
    return {
      success: true,
      deleted: deleted,
    };
  } catch (error) {
    console.error('[StripeService] Error deleting Stripe customer:', error.message);
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
    console.log('[StripeService] Creating checkout session for customer:', customerId, 'quantity:', quantity);

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

    console.log('[StripeService] Checkout session created:', session.id);
    return {
      success: true,
      clientSecret: session.client_secret,
      sessionId: session.id,
    };
  } catch (error) {
    console.error('[StripeService] Error creating checkout session:', error.message);
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
    console.log('[StripeService] Retrieving checkout session:', sessionId);

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    console.log('[StripeService] Session retrieved:', session.id, 'Status:', session.status);
    return {
      success: true,
      session: session,
      subscriptionId: session.subscription?.id || session.subscription,
      status: session.status,
    };
  } catch (error) {
    console.error('[StripeService] Error retrieving session:', error.message);
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
    console.log('[StripeService] Creating billing portal session for customer:', customerId);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    console.log('[StripeService] Billing portal session created');
    return {
      success: true,
      url: session.url,
    };
  } catch (error) {
    console.error('[StripeService] Error creating billing portal session:', error.message);
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
    console.log('[StripeService] Retrieving subscription:', subscriptionId);

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice', 'customer'],
    });

    console.log('[StripeService] Subscription retrieved:', subscription.id, 'Status:', subscription.status);
    console.log('[StripeService] Full subscription object keys:', Object.keys(subscription));
    console.log('[StripeService] Period dates:', {
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
    });
    console.log('[StripeService] Items:', subscription.items);
    return {
      success: true,
      subscription: subscription,
    };
  } catch (error) {
    console.error('[StripeService] Error retrieving subscription:', error.message);
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
    console.log('[StripeService] Updating subscription quantity:', subscriptionId, 'to', quantity);

    const subscription = await stripe.subscriptions.update(subscriptionId, {
      items: [{
        id: (await stripe.subscriptions.retrieve(subscriptionId)).items.data[0].id,
        quantity: quantity,
      }],
      proration_behavior: 'always_invoice', // Pro-rate immediately
    });

    console.log('[StripeService] Subscription quantity updated:', subscription.id, 'New quantity:', quantity);
    return {
      success: true,
      subscription: subscription,
    };
  } catch (error) {
    console.error('[StripeService] Error updating subscription quantity:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
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
};
