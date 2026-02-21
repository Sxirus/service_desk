/**
 * Stripe Webhook Handler
 * Processes Stripe events for subscription lifecycle management
 */
const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const supabase = require('../config/supabase');
const logger = require('../utils/logger');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-03-31.basil',
});

/**
 * Webhook endpoint for Stripe events
 * IMPORTANT: This route must be registered BEFORE express.json() middleware
 * because Stripe requires raw body for signature verification
 */
router.post(
  '/',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error('[Webhook] STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      logger.error('[Webhook] Signature verification failed', { error: err.message });
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    logger.info(`[Webhook] Received event: ${event.type} (${event.id})`);

    // Idempotency check - prevent duplicate processing
    const { data: existingEvent } = await supabase
      .from('processed_webhook_events')
      .select('id')
      .eq('event_id', event.id)
      .single();

    if (existingEvent) {
      logger.info(`[Webhook] Event ${event.id} already processed, skipping`);
      return res.status(200).json({ received: true, skipped: true });
    }

    try {
      // Process the event based on type
      await handleWebhookEvent(event, req);

      // Mark event as processed
      await supabase.from('processed_webhook_events').insert({
        event_id: event.id,
        event_type: event.type,
        payload: event.data.object,
      });

      logger.info(`[Webhook] Event ${event.id} processed successfully`);
      return res.status(200).json({ received: true });
    } catch (err) {
      logger.error(`[Webhook] Error processing event ${event.id}`, { error: err });
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

/**
 * Main event handler - routes events to specific handlers
 */
async function handleWebhookEvent(event, req) {
  switch (event.type) {
    case 'customer.subscription.deleted':
      await handleSubscriptionCancelled(event.data.object, req);
      break;

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object, req);
      break;

    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object, req);
      break;

    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object, req);
      break;

    case 'invoice.paid':
      await handleInvoicePaid(event.data.object, req);
      break;

    default:
      logger.info(`[Webhook] Unhandled event type: ${event.type}`);
  }
}

/**
 * Handle subscription cancellation
 * - Sets subscription_tier to 'free'
 * - Schedules employee disabling at period end (except owner)
 * - Creates platform notification
 */
async function handleSubscriptionCancelled(subscription, req) {
  logger.info('[Webhook] Processing subscription cancellation', { subscriptionId: subscription.id });

  const stripeCustomerId = subscription.customer;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : new Date();

  // Find the client by Stripe customer ID
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name, stripe_subscription_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (clientError || !client) {
    logger.error('[Webhook] Client not found for Stripe customer', { stripeCustomerId });
    throw new Error(`Client not found for Stripe customer: ${stripeCustomerId}`);
  }

  logger.info(`[Webhook] Found client: ${client.name} (ID: ${client.id})`);

  // Update client subscription status
  const { error: updateError } = await supabase
    .from('clients')
    .update({
      subscription_tier: 'free',
      subscription_cancelled_at: new Date().toISOString(),
      subscription_ends_at: periodEnd.toISOString(),
      stripe_subscription_id: null,
    })
    .eq('id', client.id);

  if (updateError) {
    logger.error('[Webhook] Error updating client', { error: updateError });
    throw updateError;
  }

  // Find owner (oldest admin employee)
  const ownerId = await findAccountOwner(client.id);
  logger.info(`[Webhook] Account owner ID: ${ownerId}`);

  // Schedule disabling of all employees except owner at period end
  if (ownerId) {
    const { error: scheduleError } = await supabase
      .from('employees')
      .update({ scheduled_disable_at: periodEnd.toISOString() })
      .eq('client_id', client.id)
      .neq('id', ownerId)
      .eq('disabled', false);

    if (scheduleError) {
      logger.error('[Webhook] Error scheduling employee disables', { error: scheduleError });
    } else {
      logger.info(`[Webhook] Scheduled employee disables for ${periodEnd.toISOString()}`);
    }
  }

  // Create platform notification
  await createPlatformNotification({
    type: 'subscription_cancelled',
    clientId: client.id,
    title: 'Subscription cancelled',
    message: `${client.name} cancelled the subscription. Access ends on ${periodEnd.toLocaleDateString('en-US')}.`,
    metadata: {
      subscription_id: subscription.id,
      cancelled_at: new Date().toISOString(),
      period_ends_at: periodEnd.toISOString(),
    },
  });

  // Log to audit trail
  await logWebhookAction(
    'subscription_cancelled',
    'client',
    client.id.toString(),
    {
      client_name: client.name,
      stripe_subscription_id: subscription.id,
      cancelled_at: new Date().toISOString(),
      period_ends_at: periodEnd.toISOString(),
    },
    req
  );

  logger.info(`[Webhook] Subscription cancellation processed for client ${client.id}`);
}

/**
 * Handle subscription updates (e.g., plan changes, quantity updates)
 */
async function handleSubscriptionUpdated(subscription, req) {
  logger.info('[Webhook] Processing subscription update', { subscriptionId: subscription.id });

  const stripeCustomerId = subscription.customer;

  // Find the client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (clientError || !client) {
    logger.error('[Webhook] Client not found for Stripe customer', { stripeCustomerId });
    return; // Don't throw - this might be a new customer not yet in our system
  }

  // Check if subscription is being reactivated
  if (subscription.status === 'active') {
    // Clear any scheduled disables if subscription is reactivated
    const { error: clearError } = await supabase
      .from('employees')
      .update({ scheduled_disable_at: null })
      .eq('client_id', client.id)
      .not('scheduled_disable_at', 'is', null);

    if (clearError) {
      logger.error('[Webhook] Error clearing scheduled disables', { error: clearError });
    }

    // Update client to paid tier
    await supabase
      .from('clients')
      .update({
        subscription_tier: 'paid',
        subscription_cancelled_at: null,
        subscription_ends_at: null,
        stripe_subscription_id: subscription.id,
      })
      .eq('id', client.id);

    logger.info(`[Webhook] Subscription reactivated for client ${client.id}`);
  }

  // Handle cancel_at_period_end (pending cancellation)
  if (subscription.cancel_at_period_end) {
    const periodEnd = new Date(subscription.current_period_end * 1000);
    
    await supabase
      .from('clients')
      .update({
        subscription_ends_at: periodEnd.toISOString(),
      })
      .eq('id', client.id);

    // Find owner and schedule disables
    const ownerId = await findAccountOwner(client.id);
    if (ownerId) {
      await supabase
        .from('employees')
        .update({ scheduled_disable_at: periodEnd.toISOString() })
        .eq('client_id', client.id)
        .neq('id', ownerId)
        .eq('disabled', false);
    }

    // Create notification for pending cancellation
    await createPlatformNotification({
      type: 'subscription_pending_cancellation',
      clientId: client.id,
    title: 'Cancellation pending',
    message: `${client.name} has cancelled. Access ends on ${periodEnd.toLocaleDateString('en-US')}.`,
      metadata: {
        subscription_id: subscription.id,
        period_ends_at: periodEnd.toISOString(),
      },
    });
  }

  logger.info(`[Webhook] Subscription update processed for client ${client.id}`);
}

/**
 * Handle payment failures
 */
async function handlePaymentFailed(invoice, req) {
  logger.info('[Webhook] Processing payment failure', { invoiceId: invoice.id });

  const stripeCustomerId = invoice.customer;

  // Find the client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (clientError || !client) {
    logger.error('[Webhook] Client not found for Stripe customer', { stripeCustomerId });
    return;
  }

  // Create platform notification
  await createPlatformNotification({
    type: 'payment_failed',
    clientId: client.id,
    title: 'Payment failed',
    message: `Payment for ${client.name} has failed. Amount: ${(invoice.amount_due / 100).toFixed(2)} ${invoice.currency.toUpperCase()}`,
    metadata: {
      invoice_id: invoice.id,
      amount_due: invoice.amount_due,
      currency: invoice.currency,
      attempt_count: invoice.attempt_count,
    },
  });

  // Log to audit trail
  await logWebhookAction(
    'payment_failed',
    'client',
    client.id.toString(),
    {
      client_name: client.name,
      invoice_id: invoice.id,
      amount_due: invoice.amount_due,
      currency: invoice.currency,
    },
    req
  );

  logger.info(`[Webhook] Payment failure notification created for client ${client.id}`);
}

/**
 * Handle successful checkout completion
 */
async function handleCheckoutCompleted(session, req) {
  logger.info('[Webhook] Processing checkout completion', { sessionId: session.id });

  // Only process subscription checkouts
  if (session.mode !== 'subscription') {
    logger.info('[Webhook] Not a subscription checkout, skipping');
    return;
  }

  const stripeCustomerId = session.customer;
  const subscriptionId = session.subscription;

  // Find the client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (clientError || !client) {
    logger.error('[Webhook] Client not found for Stripe customer', { stripeCustomerId });
    return;
  }

  // Update client with subscription info
  const { error: updateError } = await supabase
    .from('clients')
    .update({
      subscription_tier: 'paid',
      stripe_subscription_id: subscriptionId,
      subscription_cancelled_at: null,
      subscription_ends_at: null,
    })
    .eq('id', client.id);

  if (updateError) {
    logger.error('[Webhook] Error updating client', { error: updateError });
    throw updateError;
  }

  // Clear any scheduled disables
  await supabase
    .from('employees')
    .update({ scheduled_disable_at: null })
    .eq('client_id', client.id);

  // Re-enable any disabled employees (except manually disabled ones?)
  // Note: This might need business logic refinement

  // Log to audit trail
  await logWebhookAction(
    'subscription_activated',
    'client',
    client.id.toString(),
    {
      client_name: client.name,
      subscription_id: subscriptionId,
      checkout_session_id: session.id,
    },
    req
  );

  logger.info(`[Webhook] Checkout completed for client ${client.id}`);
}

/**
 * Handle successful invoice payment (subscription renewal)
 */
async function handleInvoicePaid(invoice, req) {
  logger.info('[Webhook] Processing paid invoice', { invoiceId: invoice.id });

  // Only process subscription invoices
  if (!invoice.subscription) {
    return;
  }

  const stripeCustomerId = invoice.customer;

  // Find the client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (clientError || !client) {
    return;
  }

  // Ensure subscription is marked as active
  await supabase
    .from('clients')
    .update({
      subscription_tier: 'paid',
    })
    .eq('id', client.id);

  logger.info(`[Webhook] Invoice paid for client ${client.id}`);
}

/**
 * Find the account owner (oldest admin employee)
 */
async function findAccountOwner(clientId) {
  const { data: employees, error } = await supabase
    .from('employees')
    .select(`
      id,
      created_at,
      roles-employees!inner(role_id)
    `)
    .eq('client_id', clientId)
    .eq('roles-employees.role_id', 1) // Admin role
    .order('created_at', { ascending: true })
    .limit(1);

  if (error || !employees || employees.length === 0) {
    logger.error('[Webhook] Could not find account owner', { error });
    return null;
  }

  return employees[0].id;
}

/**
 * Create a platform notification
 */
async function createPlatformNotification({ type, clientId, title, message, metadata }) {
  const { error } = await supabase.from('platform_notifications').insert({
    type,
    client_id: clientId,
    title,
    message,
    metadata,
    read: false,
  });

  if (error) {
    logger.error('[Webhook] Error creating notification', { error });
  }
}

/**
 * Log webhook action to audit trail
 */
async function logWebhookAction(action, targetType, targetId, details, req) {
  const { error } = await supabase.from('platform_audit_log').insert({
    admin_id: null, // Automated webhook - no admin
    action,
    target_type: targetType,
    target_id: targetId,
    details,
    ip_address: req?.ip || null,
    user_agent: req?.headers?.['user-agent'] || null,
  });

  if (error) {
    logger.error('[Webhook] Error logging to audit trail', { error });
  }
}

module.exports = router;


/**
 * TODO:
 * Configure Stripe Webhook: Im Stripe Dashboard den Endpoint https://your-domain.com/api/webhooks/stripe erstellen
 * Set up Cron Job (optional): For automatic employee deactivation after grace period
 */