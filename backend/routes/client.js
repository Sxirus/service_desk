/**
 * Client Routes - SECURED
 * Handles client-related operations: employees, assignments
 * Refactored to use clientService
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validateId } = require('../middleware/validation');
const clientService = require('../services/clientService');
const logger = require('../utils/logger');
const { logFromReq, ACTIONS } = require('../services/activityLogger');
const supabase = require("../config/supabase"); // needed for direct queries in some edge cases if any

/**
 * Get all employees for authenticated user's client
 */
router.get('/getEmployees', authenticate, async (req, res) => {
  try {
    const data = await clientService.getEmployees(req.user.client_id);
    res.json({ success: true, data });
  } catch (err) {
    logger.error('[CLIENT] Error fetching employees', { error: err.message });
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Assign employee to customer
 */
router.post('/assignEmployee',
  authenticate,
  validateId('employee_id'),
  validateId('customer_id'),
  async (req, res) => {
    try {
      const data = await clientService.assignEmployee(
        req.user.client_id, 
        req.sanitized.employee_id, 
        req.sanitized.customer_id
      );
      logFromReq(req, { ...ACTIONS.EMPLOYEE_ASSIGNED, targetType: 'customer', targetId: req.sanitized.customer_id, details: { employeeId: req.sanitized.employee_id } });
      res.json({ success: true, data });
    } catch (err) {
      logger.error('[CLIENT] Assign employee error', { error: err.message });
      const status = err.status || 500;
      res.status(status).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * Assign group to customer
 */
router.post('/assignGroup',
  authenticate,
  validateId('group_id'),
  validateId('customer_id'),
  async (req, res) => {
    try {
      const data = await clientService.assignGroup(
        req.user.client_id, 
        req.sanitized.group_id, 
        req.sanitized.customer_id
      );
      logFromReq(req, { ...ACTIONS.GROUP_ASSIGNED, targetType: 'customer', targetId: req.sanitized.customer_id, details: { groupId: req.sanitized.group_id } });
      res.json({ success: true, data });
    } catch (err) {
      logger.error('[CLIENT] Assign group error', { error: err.message });
      const status = err.status || 500;
      res.status(status).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * Unassign employee and group from customer
 */
router.post('/unassign',
  authenticate,
  validateId('customer_id'),
  async (req, res) => {
    try {
      const data = await clientService.unassignCustomer(req.user.client_id, req.sanitized.customer_id);
      logFromReq(req, { ...ACTIONS.UNASSIGNED, targetType: 'customer', targetId: req.sanitized.customer_id });
      res.json({ success: true, data });
    } catch (err) {
      logger.error('[CLIENT] Unassign error', { error: err.message });
      const status = err.status || 500;
      res.status(status).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * Bulk assign employee or group to multiple customers
 */
const MAX_BULK_SIZE = 100;

router.post('/bulkAssign',
  authenticate,
  async (req, res) => {
    try {
      const { customerIds, employeeId, groupId } = req.body;
      
      // Basic validation
      if (!Array.isArray(customerIds) || customerIds.length === 0) {
        return res.status(400).json({ success: false, error: 'customerIds must be a non-empty array' });
      }
      if (!employeeId && !groupId) {
        return res.status(400).json({ success: false, error: 'Provide either employeeId or groupId' });
      }

      if (customerIds.length > MAX_BULK_SIZE) {
        return res.status(400).json({ 
          success: false, 
          error: `Maximum ${MAX_BULK_SIZE} items allowed per request` 
        });
      }

      const result = await clientService.bulkAssign(req.user.client_id, {
        customerIds: customerIds.map(Number).filter(id => !isNaN(id)),
        employeeId: employeeId ? Number(employeeId) : null,
        groupId: groupId ? Number(groupId) : null
      });

      logFromReq(req, { ...ACTIONS.BULK_ASSIGNED, details: { customerIds, employeeId: employeeId || null, groupId: groupId || null } });
      res.json({ success: true, ...result });
    } catch (err) {
      logger.error('[CLIENT] Bulk assign error', { error: err.message });
      const status = err.status || 500;
      res.status(status).json({ success: false, error: err.message || 'Server error' });
    }
  }
);

/**
 * Create Stripe customer for a client
 */
router.post('/createStripeCustomer',
  authenticate,
  async (req, res) => {
    try {
      const { client_id } = req.body;
      if (parseInt(client_id) !== req.user.client_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const result = await clientService.handleStripeCustomerCreation(req.user.client_id, req.body);
      res.json({
        success: true,
        stripe_customer_id: result.stripe_customer_id,
        customer: result.customer
      });
    } catch (err) {
      logger.error('[CLIENT] Create Stripe Customer error', { error: err.message });
      res.status(500).json({ error: 'Server error', message: err.message });
    }
  }
);

/**
 * Create Stripe Checkout Session
 */
router.post('/create-checkout-session', authenticate, async (req, res) => {
  try {
    const { priceId, quantity } = req.body;
    if (!priceId) return res.status(400).json({ success: false, error: 'priceId required' });

    // Get client for stripe ID
    const { data: clientData } = await supabase.from('clients').select('stripe_customer_id').eq('id', req.user.client_id).single();
    if (!clientData?.stripe_customer_id) return res.status(400).json({ success: false, error: 'No Stripe Customer ID' });

    const sessionResult = await clientService.createCheckoutSession({
      customerId: clientData.stripe_customer_id,
      priceId,
      quantity: quantity || 1,
      successUrl: `${process.env.FRONTEND_URL || 'http://localhost:4321'}/register?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:4321'}/register?payment=cancelled`,
    });

    if (!sessionResult.success) throw new Error(sessionResult.error);
    res.json({ success: true, clientSecret: sessionResult.clientSecret, sessionId: sessionResult.sessionId });
  } catch (err) {
    logger.error('[CLIENT] Create checkout session error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Upgrade Checkout Session
 */
router.post('/upgrade-checkout-session', authenticate, async (req, res) => {
  try {
    const { priceId, quantity } = req.body;
    if (!priceId) return res.status(400).json({ success: false, error: 'priceId required' });

    const { data: clientData } = await supabase.from('clients').select('stripe_customer_id').eq('id', req.user.client_id).single();
    if (!clientData?.stripe_customer_id) return res.status(400).json({ success: false, error: 'No Stripe Customer ID' });

    const sessionResult = await clientService.createCheckoutSession({
      customerId: clientData.stripe_customer_id,
      priceId,
      quantity: quantity || 1,
      successUrl: `${process.env.FRONTEND_URL || 'http://localhost:4321'}/manage/subscription?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:4321'}/manage/subscription?upgrade=cancelled`,
    });

    if (!sessionResult.success) throw new Error(sessionResult.error);
    res.json({ success: true, clientSecret: sessionResult.clientSecret, sessionId: sessionResult.sessionId });
  } catch (err) {
    logger.error('[CLIENT] Upgrade session error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Complete Subscription
 */
router.post('/complete-subscription', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });

    const sessionResult = await clientService.retrieveCheckoutSession(sessionId);
    if (!sessionResult.success) throw new Error(sessionResult.error);

    // Security Check: Verify that the session belongs to this client
    const { data: clientVerification } = await supabase
      .from('clients')
      .select('stripe_customer_id')
      .eq('id', req.user.client_id)
      .single();

    if (!clientVerification || clientVerification.stripe_customer_id !== sessionResult.session.customer) {
      logger.warn('[CLIENT] IDOR attempt on complete-subscription', { 
        clientId: req.user.client_id, 
        sessionId,
        sessionCustomer: sessionResult.session.customer,
        clientCustomer: clientVerification?.stripe_customer_id 
      });
      return res.status(403).json({ success: false, error: 'Access denied: Session does not belong to your account' });
    }

    const { subscriptionId, status } = sessionResult;
    if (status !== 'complete') return res.status(400).json({ success: false, error: 'Payment not complete' });

    await supabase.from('clients').update({ subscription_tier: 'paid', stripe_subscription_id: subscriptionId }).eq('id', req.user.client_id);
    
    logFromReq(req, { ...ACTIONS.SUBSCRIPTION_COMPLETED, details: { tier: 'paid', subscriptionId } });
    res.json({ success: true, subscriptionId, tier: 'paid' });
  } catch (err) {
    logger.error('[CLIENT] Complete subscription error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get Subscription
 */
router.get('/subscription', authenticate, async (req, res) => {
  try {
    const { data: clientData } = await supabase.from('clients').select('stripe_subscription_id, subscription_tier').eq('id', req.user.client_id).single();
    
    if (!clientData?.stripe_subscription_id) {
      return res.json({ success: true, tier: clientData?.subscription_tier || 'free', status: 'active', subscription: null });
    }

    const subResult = await clientService.getSubscription(clientData.stripe_subscription_id);
    if (!subResult.success) throw new Error(subResult.error);

    const sub = subResult.subscription;
    const item = sub.items.data[0];

    res.json({
      success: true,
      tier: clientData.subscription_tier,
      status: sub.status,
      subscription: {
        id: sub.id,
        status: sub.status,
        currentPeriodEnd: item?.current_period_end,
        currentPeriodStart: item?.current_period_start,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        canceledAt: sub.canceled_at,
        quantity: item?.quantity || 1,
        amount: item?.price?.unit_amount || 0,
        currency: item?.price?.currency || 'eur',
        interval: item?.price?.recurring?.interval || 'month',
      }
    });
  } catch (err) {
    logger.error('[CLIENT] Get subscription error', { error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * Create Billing Portal
 */
router.post('/billing-portal', authenticate, async (req, res) => {
  try {
    const { data: clientData } = await supabase.from('clients').select('stripe_customer_id').eq('id', req.user.client_id).single();
    if (!clientData?.stripe_customer_id) return res.status(400).json({ success: false, error: 'No Stripe Customer' });

    const portal = await clientService.createBillingPortalSession({
      customerId: clientData.stripe_customer_id,
      returnUrl: `${process.env.FRONTEND_URL || 'http://localhost:4321'}/manage/subscription`,
    });

    if (!portal.success) throw new Error(portal.error);
    res.json({ success: true, url: portal.url });
  } catch (err) {
    logger.error('[CLIENT] Billing portal error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Update Subscription Quantity
 */
router.post('/update-subscription-quantity', authenticate, async (req, res) => {
  try {
    const { quantity } = req.body;
    if (!quantity || quantity < 1) return res.status(400).json({ success: false, error: 'Invalid quantity' });

    const { data: clientData } = await supabase.from('clients').select('stripe_subscription_id, subscription_tier').eq('id', req.user.client_id).single();
    
    if (clientData.subscription_tier !== 'paid' || !clientData.stripe_subscription_id) {
      return res.json({ success: true, message: 'Free tier - no update needed' });
    }

    const result = await clientService.updateSubscriptionQuantity(clientData.stripe_subscription_id, quantity);
    if (!result.success) throw new Error(result.error);

    res.json({ success: true, subscription: result.subscription });
  } catch (err) {
    logger.error('[CLIENT] Update quantity error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Usage Stats
 */
router.get('/usage-stats', authenticate, async (req, res) => {
  try {
    const stats = await clientService.getClientUsageStats(req.user.client_id);
    res.json({ success: true, ...stats });
  } catch (err) {
    logger.error('[CLIENT] Usage stats error', { error: err.message });
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * Sync Stripe Customer
 */
router.post('/sync-stripe-customer', authenticate, async (req, res) => {
  try {
    const { name, address } = req.body;
    const { data: clientData } = await supabase.from('clients').select('stripe_customer_id').eq('id', req.user.client_id).single();
    
    if (!clientData?.stripe_customer_id) return res.json({ success: true, message: 'No Stripe ID to sync' });

    const updates = {};
    if (name) updates.name = name;
    if (address) updates.address = address;

    if (Object.keys(updates).length > 0) {
      const result = await clientService.updateStripeCustomer(clientData.stripe_customer_id, updates);
      if (!result.success) throw new Error(result.error);
    }

    res.json({ success: true, message: 'Synced' });
  } catch (err) {
    logger.error('[CLIENT] Sync stripe error', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
