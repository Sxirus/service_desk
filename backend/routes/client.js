/**
 * Client Routes - SECURED
 * Handles client-related operations: employees, assignments
 * 
 * All routes now protected with authentication and authorization
 */

const express = require('express');
const router = express.Router();
const supabase = require("../config/supabase");
const { authenticate } = require('../middleware/auth');
const { authorizeCustomerAccess, authorizeEmployeeAccess } = require('../middleware/authorization');
const { validateId } = require('../middleware/validation');
const { 
  createStripeCustomer, 
  createCheckoutSession, 
  retrieveCheckoutSession,
  createBillingPortalSession,
  getSubscription,
  updateSubscriptionQuantity
} = require('../services/stripeService');

/**
 * Get all employees for authenticated user's client
 * GET /api/client/getEmployees
 * 
 * Authentication: Required
 * Authorization: Automatically filtered by user's client_id
 */
router.get('/getEmployees', 
  authenticate,
  async (req, res) => {
    try {
      // Use client_id from authenticated user (secure - can't be spoofed)
      const client_id = req.user.client_id;
      
      console.log('[CLIENT] Fetching employees for client:', client_id);

      const { data, error } = await supabase
        .from("employees")
        .select("id, name")
        .eq("client_id", client_id)
        .order("name");

      if (error) {
        console.error('[CLIENT] Supabase error:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[CLIENT] Fetched', data.length, 'employees');
      res.json({success: true, data});
    } catch (err) {
      console.error('[CLIENT] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

/**
 * Assign employee to customer
 * POST /api/client/assignEmployee
 * Body: { employee_id, customer_id }
 * 
 * Authentication: Required
 * Authorization: Both employee and customer must belong to user's client
 */
router.post('/assignEmployee',
  authenticate,
  validateId('employee_id'),
  validateId('customer_id'),
  async (req, res) => {
    try {
      const employee_id = req.sanitized.employee_id;
      const customer_id = req.sanitized.customer_id;
      const client_id = req.user.client_id;

      console.log('[CLIENT] Assigning employee:', {
        employee_id,
        customer_id,
        client_id
      });

      // Verify employee belongs to user's client
      const { data: employee, error: employeeError } = await supabase
        .from('employees')
        .select('client_id')
        .eq('id', employee_id)
        .single();

      if (employeeError || !employee) {
        console.error('[CLIENT] Employee not found:', employee_id);
        return res.status(404).json({ error: 'Employee not found' });
      }

      if (employee.client_id !== client_id) {
        console.warn('[CLIENT] Unauthorized employee access attempt:', {
          employee_id,
          employee_client_id: employee.client_id,
          user_client_id: client_id
        });
        return res.status(403).json({ error: 'Employee does not belong to your client' });
      }

      // Verify customer belongs to user's client
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('client_id')
        .eq('id', customer_id)
        .single();

      if (customerError || !customer) {
        console.error('[CLIENT] Customer not found:', customer_id);
        return res.status(404).json({ error: 'Customer not found' });
      }

      if (customer.client_id !== client_id) {
        console.warn('[CLIENT] Unauthorized customer access attempt:', {
          customer_id,
          customer_client_id: customer.client_id,
          user_client_id: client_id
        });
        return res.status(403).json({ error: 'Customer does not belong to your client' });
      }

      // Both verified - proceed with assignment
      const { data, error } = await supabase
        .from('customers')
        .update({ employee_id: employee_id })
        .eq('id', customer_id);

      if (error) {
        console.error('[CLIENT] Assignment update failed:', error.message);
        return res.status(500).json({ error: 'Datenbankfehler' });
      }

      console.log('[CLIENT] Successfully assigned employee', employee_id, 'to customer', customer_id);
      res.json({ success: true, data });
    } catch (err) {
      console.error('[CLIENT] Server error:', err.message);
      res.status(500).json({ error: 'Serverfehler' });
    }
  }
);

/**
 * Create Stripe customer for a client
 * POST /api/client/createStripeCustomer
 * Body: { client_id, email, name, address_street, address_city, address_zip, address_country, vat }
 * 
 * Authentication: Required
 * Authorization: Must be creating for own client or be admin
 */
router.post('/createStripeCustomer',
  authenticate,
  async (req, res) => {
    try {
      const {
        client_id,
        email,
        name,
        address_street,
        address_city,
        address_zip,
        address_country,
        vat
      } = req.body;

      const user_client_id = req.user.client_id;

      console.log('[CLIENT] Creating Stripe customer for client:', client_id);

      // Verify user is creating for their own client
      if (parseInt(client_id) !== user_client_id) {
        console.warn('[CLIENT] Unauthorized Stripe customer creation attempt:', {
          requested_client_id: client_id,
          user_client_id: user_client_id
        });
        return res.status(403).json({ error: 'You can only create Stripe customers for your own organization' });
      }

      // Prepare client data for Stripe
      const clientData = {
        client_id,
        email,
        name,
        address_street,
        address_city,
        address_zip,
        address_country,
        vat
      };

      // Create Stripe customer
      const stripeResult = await createStripeCustomer(clientData);

      if (!stripeResult.success) {
        console.error('[CLIENT] Stripe customer creation failed:', stripeResult.error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to create Stripe customer',
          message: stripeResult.error 
        });
      }

      // Update client record with Stripe customer ID
      const { data: updateData, error: updateError } = await supabase
        .from('clients')
        .update({ stripe_customer_id: stripeResult.stripe_customer_id })
        .eq('id', client_id);

      if (updateError) {
        console.error('[CLIENT] Failed to update client with Stripe ID:', updateError.message);
        // Note: Stripe customer was created but we couldn't save the ID
        // You may want to handle this case differently in production
        return res.status(500).json({ 
          success: false,
          error: 'Stripe customer created but failed to save ID to database',
          stripe_customer_id: stripeResult.stripe_customer_id
        });
      }

      console.log('[CLIENT] Successfully created Stripe customer:', stripeResult.stripe_customer_id);
      res.json({
        success: true,
        stripe_customer_id: stripeResult.stripe_customer_id,
        customer: stripeResult.customer
      });

    } catch (err) {
      console.error('[CLIENT] Server error creating Stripe customer:', err.message);
      res.status(500).json({ error: 'Server error', message: err.message });
    }
  }
);

/**
 * Create Stripe Checkout Session
 * POST /api/client/create-checkout-session
 * 
 * Authentication: Required
 * Authorization: User must have a client with stripe_customer_id
 * 
 * Body: { priceId: string } - The Stripe Price ID for the subscription
 */
router.post('/create-checkout-session',
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      const { priceId, quantity = 1 } = req.body;

      if (!priceId) {
        return res.status(400).json({ 
          success: false, 
          error: 'priceId is required' 
        });
      }

      console.log('[CLIENT] Creating checkout session for client:', client_id);

      // Get client's Stripe customer ID
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('stripe_customer_id')
        .eq('id', client_id)
        .single();

      if (clientError || !clientData) {
        console.error('[CLIENT] Failed to fetch client:', clientError?.message);
        return res.status(500).json({ 
          success: false,
          error: 'Failed to fetch client data' 
        });
      }

      if (!clientData.stripe_customer_id) {
        return res.status(400).json({ 
          success: false,
          error: 'Client does not have a Stripe customer ID. Please create one first.' 
        });
      }

      // Create checkout session
      const sessionResult = await createCheckoutSession({
        customerId: clientData.stripe_customer_id,
        priceId,
        quantity: quantity || 1,
        successUrl: `${process.env.FRONTEND_URL || 'http://localhost:4321'}/register?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:4321'}/register?payment=cancelled`,
      });

      if (!sessionResult.success) {
        console.error('[CLIENT] Failed to create checkout session:', sessionResult.error);
        return res.status(500).json({ 
          success: false,
          error: sessionResult.error 
        });
      }

      console.log('[CLIENT] Successfully created checkout session:', sessionResult.sessionId);
      res.json({
        success: true,
        clientSecret: sessionResult.clientSecret,
        sessionId: sessionResult.sessionId
      });

    } catch (err) {
      console.error('[CLIENT] Server error creating checkout session:', err.message);
      res.status(500).json({ 
        success: false,
        error: 'Server error', 
        message: err.message 
      });
    }
  }
);

/**
 * POST /api/client/upgrade-checkout-session
 * 
 * Authentication: Required
 * Creates a checkout session for upgrading from free to paid tier
 * 
 * Body: { priceId: string, quantity: number }
 */
router.post('/upgrade-checkout-session',
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      const { priceId, quantity = 1 } = req.body;

      if (!priceId) {
        return res.status(400).json({ 
          success: false, 
          error: 'priceId is required' 
        });
      }

      console.log('[CLIENT] Creating upgrade checkout session for client:', client_id, 'quantity:', quantity);

      // Get client data
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('stripe_customer_id, subscription_tier')
        .eq('id', client_id)
        .single();

      if (clientError || !clientData) {
        console.error('[CLIENT] Failed to fetch client:', clientError?.message);
        return res.status(500).json({ 
          success: false,
          error: 'Failed to fetch client data' 
        });
      }

      if (!clientData.stripe_customer_id) {
        return res.status(400).json({ 
          success: false,
          error: 'Client does not have a Stripe customer ID. Please contact support.' 
        });
      }

      // Create checkout session with upgrade-specific URLs
      const sessionResult = await createCheckoutSession({
        customerId: clientData.stripe_customer_id,
        priceId,
        quantity,
        successUrl: `${process.env.FRONTEND_URL || 'http://localhost:4321'}/manage/subscription?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:4321'}/manage/subscription?upgrade=cancelled`,
      });

      if (!sessionResult.success) {
        console.error('[CLIENT] Failed to create upgrade checkout session:', sessionResult.error);
        return res.status(500).json({ 
          success: false,
          error: sessionResult.error 
        });
      }

      console.log('[CLIENT] Successfully created upgrade checkout session:', sessionResult.sessionId);
      res.json({
        success: true,
        clientSecret: sessionResult.clientSecret,
        sessionId: sessionResult.sessionId
      });

    } catch (err) {
      console.error('[CLIENT] Server error creating upgrade checkout session:', err.message);
      res.status(500).json({ 
        success: false,
        error: 'Server error', 
        message: err.message 
      });
    }
  }
);

/**
 * Complete Stripe Subscription
 * POST /api/client/complete-subscription
 * 
 * Authentication: Required
 * 
 * Body: { sessionId: string } - The Stripe checkout session ID
 * Updates the client record with subscription details after successful payment
 */
router.post('/complete-subscription',
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ 
          success: false, 
          error: 'sessionId is required' 
        });
      }

      console.log('[CLIENT] Completing subscription for client:', client_id, 'session:', sessionId);

      // Retrieve the session from Stripe
      const sessionResult = await retrieveCheckoutSession(sessionId);

      if (!sessionResult.success) {
        console.error('[CLIENT] Failed to retrieve session:', sessionResult.error);
        return res.status(500).json({ 
          success: false,
          error: sessionResult.error 
        });
      }

      const { session, subscriptionId, status } = sessionResult;

      if (status !== 'complete') {
        return res.status(400).json({ 
          success: false,
          error: 'Payment not completed yet' 
        });
      }

      if (!subscriptionId) {
        return res.status(400).json({ 
          success: false,
          error: 'No subscription found in session' 
        });
      }

      // Update client with subscription details
      const { error: updateError } = await supabase
        .from('clients')
        .update({ 
          subscription_tier: 'paid',
          stripe_subscription_id: subscriptionId
        })
        .eq('id', client_id);

      if (updateError) {
        console.error('[CLIENT] Failed to update client with subscription:', updateError.message);
        return res.status(500).json({ 
          success: false,
          error: 'Failed to update subscription in database' 
        });
      }

      console.log('[CLIENT] Successfully updated subscription:', subscriptionId);
      res.json({
        success: true,
        subscriptionId,
        tier: 'paid'
      });

    } catch (err) {
      console.error('[CLIENT] Server error completing subscription:', err.message);
      res.status(500).json({ 
        success: false,
        error: 'Server error', 
        message: err.message 
      });
    }
  }
);

/**
 * Get Subscription Details
 * GET /api/client/subscription
 * 
 * Authentication: Required
 * Returns current subscription status and details
 */
router.get('/subscription',
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;

      console.log('[CLIENT] Getting subscription for client:', client_id);

      // Get client data
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('stripe_customer_id, stripe_subscription_id, subscription_tier')
        .eq('id', client_id)
        .single();

      if (clientError || !clientData) {
        console.error('[CLIENT] Failed to fetch client:', clientError?.message);
        return res.status(500).json({ 
          success: false,
          error: 'Failed to fetch client data' 
        });
      }

      console.log('[CLIENT] Client data:', {
        stripe_customer_id: clientData.stripe_customer_id,
        stripe_subscription_id: clientData.stripe_subscription_id,
        subscription_tier: clientData.subscription_tier
      });

      // If no subscription, return free tier
      if (!clientData.stripe_subscription_id) {
        console.log('[CLIENT] No subscription ID found, returning free tier');
        return res.json({
          success: true,
          tier: clientData.subscription_tier || 'free',
          status: 'active',
          subscription: null
        });
      }

      // Get subscription details from Stripe
      const subscriptionResult = await getSubscription(clientData.stripe_subscription_id);

      if (!subscriptionResult.success) {
        console.error('[CLIENT] Failed to get subscription:', subscriptionResult.error);
        return res.status(500).json({ 
          success: false,
          error: subscriptionResult.error 
        });
      }

      const subscription = subscriptionResult.subscription;
      const subscriptionItem = subscription.items.data[0];

      console.log('[CLIENT] Mapping subscription data:', {
        current_period_start: subscriptionItem?.current_period_start,
        current_period_end: subscriptionItem?.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
      });

      res.json({
        success: true,
        tier: clientData.subscription_tier,
        status: subscription.status,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          currentPeriodEnd: subscriptionItem?.current_period_end,
          currentPeriodStart: subscriptionItem?.current_period_start,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          canceledAt: subscription.canceled_at,
          quantity: subscriptionItem?.quantity || 1,
          amount: subscriptionItem?.price?.unit_amount || 0,
          currency: subscriptionItem?.price?.currency || 'eur',
          interval: subscriptionItem?.price?.recurring?.interval || 'month',
        }
      });

    } catch (err) {
      console.error('[CLIENT] Server error getting subscription:', err.message);
      res.status(500).json({ 
        success: false,
        error: 'Server error', 
        message: err.message 
      });
    }
  }
);

/**
 * Create Billing Portal Session
 * POST /api/client/billing-portal
 * 
 * Authentication: Required
 * Creates a Stripe billing portal session for managing subscription
 */
router.post('/billing-portal',
  authenticate,
  async (req, res) => {
    try {
      const client_id = req.user.client_id;

      console.log('[CLIENT] Creating billing portal session for client:', client_id);

      // Get client's Stripe customer ID
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('stripe_customer_id')
        .eq('id', client_id)
        .single();

      if (clientError || !clientData) {
        console.error('[CLIENT] Failed to fetch client:', clientError?.message);
        return res.status(500).json({ 
          success: false,
          error: 'Failed to fetch client data' 
        });
      }

      if (!clientData.stripe_customer_id) {
        return res.status(400).json({ 
          success: false,
          error: 'No Stripe customer found. Please contact support.' 
        });
      }

      // Create billing portal session
      const portalResult = await createBillingPortalSession({
        customerId: clientData.stripe_customer_id,
        returnUrl: `${process.env.FRONTEND_URL || 'http://localhost:4321'}/manage/subscription`,
      });

      if (!portalResult.success) {
        console.error('[CLIENT] Failed to create billing portal:', portalResult.error);
        return res.status(500).json({ 
          success: false,
          error: portalResult.error 
        });
      }

      console.log('[CLIENT] Billing portal session created');
      res.json({
        success: true,
        url: portalResult.url
      });

    } catch (err) {
      console.error('[CLIENT] Server error creating billing portal:', err.message);
      res.status(500).json({ 
        success: false,
        error: 'Server error', 
        message: err.message 
      });
    }
  }
);

/**
 * Update subscription quantity
 * POST /api/client/update-subscription-quantity
 * 
 * Updates Stripe subscription quantity when users are added/removed
 * Body: { quantity: number }
 */
router.post('/update-subscription-quantity',
  authenticate,
  async (req, res) => {
    try {
      const { quantity } = req.body;

      if (!quantity || quantity < 1) {
        return res.status(400).json({
          success: false,
          error: 'Invalid quantity'
        });
      }

      console.log('[CLIENT] Updating subscription quantity to:', quantity);

      // Get client data
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('stripe_subscription_id, subscription_tier')
        .eq('id', req.user.client_id)
        .single();

      if (clientError || !clientData) {
        console.error('[CLIENT] Failed to get client:', clientError?.message);
        return res.status(404).json({
          success: false,
          error: 'Client not found'
        });
      }

      // Check if client has paid subscription
      if (clientData.subscription_tier !== 'paid' || !clientData.stripe_subscription_id) {
        console.log('[CLIENT] Client is not on paid plan, skipping quantity update');
        return res.json({
          success: true,
          message: 'Free tier - no subscription to update'
        });
      }

      // Update Stripe subscription quantity
      const result = await updateSubscriptionQuantity(
        clientData.stripe_subscription_id,
        quantity
      );

      if (!result.success) {
        console.error('[CLIENT] Failed to update subscription quantity:', result.error);
        return res.status(500).json({
          success: false,
          error: result.error
        });
      }

      console.log('[CLIENT] Subscription quantity updated successfully');
      res.json({
        success: true,
        subscription: result.subscription
      });

    } catch (err) {
      console.error('[CLIENT] Server error updating subscription quantity:', err.message);
      res.status(500).json({
        success: false,
        error: 'Server error',
        message: err.message
      });
    }
  }
);

/**
 * Get usage statistics for free tier
 * GET /api/client/usage-stats
 * 
 * Returns active employee count and email count for current month
 */
router.get('/usage-stats',
  authenticate,
  async (req, res) => {
    try {
      console.log('[CLIENT] Getting usage stats for client:', req.user.client_id);

      // Get active employee count (non-disabled)
      const { count: activeEmployees, error: empError } = await supabase
        .from('employees')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', req.user.client_id)
        .or('disabled.is.null,disabled.eq.false');

      if (empError) {
        console.error('[CLIENT] Error counting employees:', empError.message);
        return res.status(500).json({
          success: false,
          error: 'Failed to count employees'
        });
      }

      // Get email count for current month
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      // Get customer IDs for this client to filter sent emails
      const { data: customers, error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('client_id', req.user.client_id);

      if (customerError) {
        console.error('[CLIENT] Error fetching customers:', customerError.message);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch customers'
        });
      }

      const customerIds = (customers || []).map(c => c.id);
      
      let emailCount = 0;
      if (customerIds.length > 0) {
        const { count, error: emailError } = await supabase
          .from('sent-mail')
          .select('*', { count: 'exact', head: true })
          .in('customer_id', customerIds)
          .gte('send_at', firstDayOfMonth.toISOString());

        if (emailError) {
          console.error('[CLIENT] Error counting emails:', emailError.message);
          return res.status(500).json({
            success: false,
            error: 'Failed to count emails'
          });
        }

        emailCount = count || 0;
      }

      console.log('[CLIENT] Usage stats:', {
        activeEmployees,
        emailCount,
        customerCount: customerIds.length,
        month: firstDayOfMonth.toISOString()
      });

      res.json({
        success: true,
        activeEmployees: activeEmployees || 0,
        emailsSentThisMonth: emailCount || 0,
        limits: {
          maxEmployees: 1,
          maxEmailsPerMonth: 50
        }
      });

    } catch (err) {
      console.error('[CLIENT] Server error getting usage stats:', err.message);
      res.status(500).json({
        success: false,
        error: 'Server error',
        message: err.message
      });
    }
  }
);

module.exports = router;