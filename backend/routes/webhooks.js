/**
 * Stripe Webhook Handler
 * Processes Stripe events for subscription lifecycle management
 */
const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const supabase = require('../config/supabase');

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
      console.error('[Webhook] STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('[Webhook] Signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    console.log(`[Webhook] Received event: ${event.type} (${event.id})`);

    // Idempotency check - prevent duplicate processing
    const { data: existingEvent } = await supabase
      .from('processed_webhook_events')
      .select('id')
      .eq('event_id', event.id)
      .single();

    if (existingEvent) {
      console.log(`[Webhook] Event ${event.id} already processed, skipping`);
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

      console.log(`[Webhook] Event ${event.id} processed successfully`);
      return res.status(200).json({ received: true });
    } catch (err) {
      console.error(`[Webhook] Error processing event ${event.id}:`, err);
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
      console.log(`[Webhook] Unhandled event type: ${event.type}`);
  }
}

/**
 * Handle subscription cancellation
 * - Sets subscription_tier to 'free'
 * - Schedules employee disabling at period end (except owner)
 * - Creates platform notification
 */
async function handleSubscriptionCancelled(subscription, req) {
  console.log('[Webhook] Processing subscription cancellation:', subscription.id);

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
    console.error('[Webhook] Client not found for Stripe customer:', stripeCustomerId);
    throw new Error(`Client not found for Stripe customer: ${stripeCustomerId}`);
  }

  console.log(`[Webhook] Found client: ${client.name} (ID: ${client.id})`);

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
    console.error('[Webhook] Error updating client:', updateError);
    throw updateError;
  }

  // Find owner (oldest admin employee)
  const ownerId = await findAccountOwner(client.id);
  console.log(`[Webhook] Account owner ID: ${ownerId}`);

  // Schedule disabling of all employees except owner at period end
  if (ownerId) {
    const { error: scheduleError } = await supabase
      .from('employees')
      .update({ scheduled_disable_at: periodEnd.toISOString() })
      .eq('client_id', client.id)
      .neq('id', ownerId)
      .eq('disabled', false);

    if (scheduleError) {
      console.error('[Webhook] Error scheduling employee disables:', scheduleError);
    } else {
      console.log(`[Webhook] Scheduled employee disables for ${periodEnd.toISOString()}`);
    }
  }

  // Create platform notification
  await createPlatformNotification({
    type: 'subscription_cancelled',
    clientId: client.id,
    title: 'Abonnement gekündigt',
    message: `${client.name} hat das Abonnement gekündigt. Zugang endet am ${periodEnd.toLocaleDateString('de-DE')}.`,
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

  console.log(`[Webhook] Subscription cancellation processed for client ${client.id}`);
}

/**
 * Handle subscription updates (e.g., plan changes, quantity updates)
 */
async function handleSubscriptionUpdated(subscription, req) {
  console.log('[Webhook] Processing subscription update:', subscription.id);

  const stripeCustomerId = subscription.customer;

  // Find the client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (clientError || !client) {
    console.error('[Webhook] Client not found for Stripe customer:', stripeCustomerId);
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
      console.error('[Webhook] Error clearing scheduled disables:', clearError);
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

    console.log(`[Webhook] Subscription reactivated for client ${client.id}`);
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
      title: 'Kündigung ausstehend',
      message: `${client.name} hat gekündigt. Zugang endet am ${periodEnd.toLocaleDateString('de-DE')}.`,
      metadata: {
        subscription_id: subscription.id,
        period_ends_at: periodEnd.toISOString(),
      },
    });
  }

  console.log(`[Webhook] Subscription update processed for client ${client.id}`);
}

/**
 * Handle payment failures
 */
async function handlePaymentFailed(invoice, req) {
  console.log('[Webhook] Processing payment failure:', invoice.id);

  const stripeCustomerId = invoice.customer;

  // Find the client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (clientError || !client) {
    console.error('[Webhook] Client not found for Stripe customer:', stripeCustomerId);
    return;
  }

  // Create platform notification
  await createPlatformNotification({
    type: 'payment_failed',
    clientId: client.id,
    title: 'Zahlung fehlgeschlagen',
    message: `Zahlung für ${client.name} ist fehlgeschlagen. Betrag: ${(invoice.amount_due / 100).toFixed(2)} ${invoice.currency.toUpperCase()}`,
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

  console.log(`[Webhook] Payment failure notification created for client ${client.id}`);
}

/**
 * Handle successful checkout completion
 */
async function handleCheckoutCompleted(session, req) {
  console.log('[Webhook] Processing checkout completion:', session.id);

  // Only process subscription checkouts
  if (session.mode !== 'subscription') {
    console.log('[Webhook] Not a subscription checkout, skipping');
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
    console.error('[Webhook] Client not found for Stripe customer:', stripeCustomerId);
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
    console.error('[Webhook] Error updating client:', updateError);
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

  console.log(`[Webhook] Checkout completed for client ${client.id}`);
}

/**
 * Handle successful invoice payment (subscription renewal)
 */
async function handleInvoicePaid(invoice, req) {
  console.log('[Webhook] Processing paid invoice:', invoice.id);

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

  console.log(`[Webhook] Invoice paid for client ${client.id}`);
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
    console.error('[Webhook] Could not find account owner:', error);
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
    console.error('[Webhook] Error creating notification:', error);
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
    console.error('[Webhook] Error logging to audit trail:', error);
  }
}

module.exports = router;


/**
 * TODO:
 * Stripe Webhook konfigurieren: Im Stripe Dashboard den Endpoint https://your-domain.com/api/webhooks/stripe erstellen
 * Cron Job einrichten (optional): Für automatisches Deaktivieren der Mitarbeiter nach Grace Period
 */