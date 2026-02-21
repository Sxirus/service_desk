const supabase = require('../config/supabase');
const { updateSubscriptionQuantity, updateStripeCustomer } = require('./stripeService');
const logger = require('../utils/logger');

async function getAnalytics(days = 30) {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);

  // Overview stats — run all counts in parallel instead of sequentially
  const [
    { count: totalClients },
    { count: paidClients },
    { count: freeClients },
    { count: totalEmployees },
    { count: totalCustomers },
    { count: totalEmails }
  ] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('subscription_tier', 'paid'),
    supabase.from('clients').select('*', { count: 'exact', head: true }).neq('subscription_tier', 'paid'),
    supabase.from('employees').select('*', { count: 'exact', head: true }),
    supabase.from('customers').select('*', { count: 'exact', head: true }),
    supabase.from('sent-mail').select('*', { count: 'exact', head: true })
  ]);

  // Growth (last 6 months) — single query + JS grouping instead of 6 sequential queries
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  const startDate = new Date(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth(), 1).toISOString();

  const { data: recentCreations } = await supabase
    .from('clients')
    .select('created_at')
    .gte('created_at', startDate);

  const growth = {};
  for (let i = 0; i < 6; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthKey = d.toLocaleString('default', { month: 'short', year: 'numeric' });
    const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);

    growth[monthKey] = (recentCreations || []).filter(c => {
      const created = new Date(c.created_at);
      return created >= startOfMonth && created <= endOfMonth;
    }).length;
  }

  // Recent clients
  const { data: recentClients } = await supabase
    .from('clients')
    .select('id, name, created_at, subscription_tier')
    .order('created_at', { ascending: false })
    .limit(5);

  return {
    overview: {
      totalClients: totalClients || 0,
      paidClients: paidClients || 0,
      freeClients: freeClients || 0,
      totalEmployees: totalEmployees || 0,
      totalCustomers: totalCustomers || 0,
      totalEmails: totalEmails || 0,
      emailsSentPeriod: 0, // Placeholder
      newClientsThisMonth: growth[new Date().toLocaleString('default', { month: 'short', year: 'numeric' })] || 0
    },
    growth,
    recentClients: recentClients || []
  };
}

async function getBillingOverview() {
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, subscription_tier, stripe_customer_id, stripe_subscription_id, created_at')
    .order('created_at', { ascending: false });

  // Batch: single query for all active employee counts, grouped in JS
  const { data: activeEmployees } = await supabase
    .from('employees')
    .select('client_id')
    .or('disabled.is.null,disabled.eq.false');

  const empCountMap = {};
  for (const emp of (activeEmployees || [])) {
    empCountMap[emp.client_id] = (empCountMap[emp.client_id] || 0) + 1;
  }

  const enrichedClients = (clients || []).map(client => {
    const employees = empCountMap[client.id] || 0;
    return {
      ...client,
      employees,
      mrr: client.subscription_tier === 'paid' ? employees * 9.99 : 0
    };
  });

  const summary = {
    totalClients: enrichedClients.length,
    paidClients: enrichedClients.filter(c => c.subscription_tier === 'paid').length,
    freeClients: enrichedClients.filter(c => c.subscription_tier !== 'paid').length,
    withStripe: enrichedClients.filter(c => c.stripe_customer_id).length,
    totalSeats: enrichedClients.reduce((sum, c) => sum + (c.subscription_tier === 'paid' ? c.employees : 0), 0),
    mrr: enrichedClients.reduce((sum, c) => sum + c.mrr, 0),
    totalRevenue: 0 // Would need invoice data
  };

  return { clients: enrichedClients, summary };
}

async function getClients() {
  const { data: clients, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  // Batch: two queries instead of 2N sequential queries
  const clientIds = clients.map(c => c.id);

  const [{ data: allEmployees }, { data: allTickets }] = await Promise.all([
    supabase.from('employees').select('client_id').in('client_id', clientIds),
    supabase.from('incoming-mails').select('client_id').in('client_id', clientIds)
  ]);

  const empCountMap = {};
  for (const e of (allEmployees || [])) {
    empCountMap[e.client_id] = (empCountMap[e.client_id] || 0) + 1;
  }
  const ticketCountMap = {};
  for (const t of (allTickets || [])) {
    ticketCountMap[t.client_id] = (ticketCountMap[t.client_id] || 0) + 1;
  }

  const enriched = clients.map(client => ({
    ...client,
    stats: {
      employees: empCountMap[client.id] || 0,
      tickets: ticketCountMap[client.id] || 0
    }
  }));

  return enriched;
}

async function getClientDetail(clientId) {
  const { data: client, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();

  if (error || !client) throw new Error('Client not found');

  // Fetch employees
  const { data: employees } = await supabase
    .from('employees')
    .select('*, roles-employees(role_id, roles(name))')
    .eq('client_id', clientId);

  // Generate signed avatar URLs for employees
  const employeesWithAvatars = await Promise.all((employees || []).map(async (emp) => {
    if (emp.avatar_url) {
      try {
        const { data: signedData } = await supabase.storage
          .from('avatars')
          .createSignedUrl(emp.avatar_url, 60 * 60); // 1 hour
        return { ...emp, avatar_url: signedData?.signedUrl || null };
      } catch {
        return { ...emp, avatar_url: null };
      }
    }
    return emp;
  }));

  // Fetch employee count (active only)
  const { count: employeeCount } = await supabase
    .from('employees')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .or('disabled.is.null,disabled.eq.false');

  // Fetch customer count
  const { count: customerCount } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId);

  // Fetch email sent count via employee IDs
  let emailsSent = 0;
  const { data: empIds } = await supabase.from('employees').select('id').eq('client_id', clientId);
  const ids = (empIds || []).map(e => e.id);
  if (ids.length > 0) {
    const { count: sentCount } = await supabase
      .from('sent-mail')
      .select('*', { count: 'exact', head: true })
      .in('employee_id', ids);
    emailsSent = sentCount || 0;
  }

  // Calculate revenue based on subscription tier and active employees
  const activeEmployees = employeeCount || 0;
  const monthlyRevenue = client.subscription_tier === 'paid' ? activeEmployees * 9.99 : 0;

  return {
    ...client,
    employees: employeesWithAvatars,
    stats: {
      employee_count: employeeCount || 0,
      customer_count: customerCount || 0,
      emails_sent: emailsSent,
      monthly_revenue: monthlyRevenue,
      total_revenue: 0 // Would need Stripe invoice data for accurate total
    }
  };
}

// Allowed fields for client update (whitelist)
const ALLOWED_CLIENT_UPDATE_FIELDS = [
  'name', 'website', 'subscription_tier',
  'address_street', 'address_city', 'address_zip', 'address_country',
  'vat'
];

async function updateClient(clientId, updates) {
  // Whitelist allowed fields to prevent injection of sensitive columns
  const sanitizedUpdates = {};
  for (const key of ALLOWED_CLIENT_UPDATE_FIELDS) {
    if (updates[key] !== undefined) {
      sanitizedUpdates[key] = updates[key];
    }
  }

  if (Object.keys(sanitizedUpdates).length === 0) {
    throw new Error('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('clients')
    .update(sanitizedUpdates)
    .eq('id', clientId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Sync with Stripe if needed
  if (data.stripe_customer_id) {
    const stripeUpdates = {};
    if (sanitizedUpdates.name) stripeUpdates.name = sanitizedUpdates.name;
    if (sanitizedUpdates.address_street || sanitizedUpdates.address_city || sanitizedUpdates.address_zip || sanitizedUpdates.address_country) {
      stripeUpdates.address = {
        line1: data.address_street || '',
        city: data.address_city || '',
        postal_code: data.address_zip || '',
        country: data.address_country || ''
      };
    }
    
    if (Object.keys(stripeUpdates).length > 0) {
      try {
        await updateStripeCustomer(data.stripe_customer_id, stripeUpdates);
      } catch (stripeErr) {
        logger.error('[PLATFORM] Stripe sync failed (non-blocking)', { error: stripeErr.message });
      }
    }
  }

  return data;
}

async function deleteClient(clientId) {
  // 1. Get client data for cleanup
  const { data: client } = await supabase
    .from('clients')
    .select('stripe_subscription_id, stripe_customer_id')
    .eq('id', clientId)
    .single();

  if (!client) throw new Error('Client not found');

  // 2. Cancel Stripe subscription if active
  if (client.stripe_subscription_id) {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      await stripe.subscriptions.cancel(client.stripe_subscription_id);
      logger.info('[PLATFORM] Cancelled Stripe subscription', { clientId, subscriptionId: client.stripe_subscription_id });
    } catch (stripeErr) {
      logger.error('[PLATFORM] Failed to cancel Stripe subscription (proceeding with delete)', {
        clientId,
        error: stripeErr.message
      });
    }
  }
  
  // 3. Delete from DB (cascade should handle relations)
  const { error } = await supabase.from('clients').delete().eq('id', clientId);
  if (error) throw new Error(error.message);

  return true;
}

/**
 * Update an employee belonging to a client
 */
async function updateEmployee(clientId, employeeId, updates) {
  // Verify employee belongs to this client
  const { data: employee, error: fetchError } = await supabase
    .from('employees')
    .select('id, client_id')
    .eq('id', employeeId)
    .eq('client_id', clientId)
    .single();

  if (fetchError || !employee) {
    throw new Error('Employee not found or does not belong to this client');
  }

  // Whitelist allowed fields
  const allowedFields = ['name', 'disabled'];
  const sanitizedUpdates = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      sanitizedUpdates[key] = updates[key];
    }
  }

  if (Object.keys(sanitizedUpdates).length === 0) {
    throw new Error('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('employees')
    .update(sanitizedUpdates)
    .eq('id', employeeId)
    .eq('client_id', clientId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // If toggling disabled status, update Stripe seat count
  if ('disabled' in sanitizedUpdates) {
    try {
      await updateSubscriptionQuantity(clientId);
    } catch (stripeErr) {
      logger.error('[PLATFORM] Stripe seat sync failed (non-blocking)', { error: stripeErr.message });
    }
  }

  return data;
}

/**
 * Delete an employee belonging to a client
 */
async function deleteEmployee(clientId, employeeId) {
  // Verify employee belongs to this client
  const { data: employee, error: fetchError } = await supabase
    .from('employees')
    .select('id, client_id')
    .eq('id', employeeId)
    .eq('client_id', clientId)
    .single();

  if (fetchError || !employee) {
    throw new Error('Employee not found or does not belong to this client');
  }

  const { error } = await supabase
    .from('employees')
    .delete()
    .eq('id', employeeId)
    .eq('client_id', clientId);

  if (error) throw new Error(error.message);

  // Update Stripe seat count
  try {
    await updateSubscriptionQuantity(clientId);
  } catch (stripeErr) {
    logger.error('[PLATFORM] Stripe seat sync failed (non-blocking)', { error: stripeErr.message });
  }

  return true;
}

module.exports = {
  getAnalytics,
  getBillingOverview,
  getClients,
  getClientDetail,
  updateClient,
  deleteClient,
  updateEmployee,
  deleteEmployee
};
