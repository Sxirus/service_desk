const supabase = require('../config/supabase');
const { updateSubscriptionQuantity, updateStripeCustomer } = require('./stripeService');
const logger = require('../utils/logger');

async function getAnalytics(days = 30) {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);

  // Overview stats
  const { count: totalClients } = await supabase.from('clients').select('*', { count: 'exact', head: true });
  const { count: paidClients } = await supabase.from('clients').select('*', { count: 'exact', head: true }).eq('subscription_tier', 'paid');
  const { count: freeClients } = await supabase.from('clients').select('*', { count: 'exact', head: true }).neq('subscription_tier', 'paid');
  const { count: totalEmployees } = await supabase.from('employees').select('*', { count: 'exact', head: true });
  const { count: totalCustomers } = await supabase.from('customers').select('*', { count: 'exact', head: true });
  const { count: totalEmails } = await supabase.from('sent-mail').select('*', { count: 'exact', head: true });

  // Growth (last 6 months)
  const growth = {};
  for (let i = 0; i < 6; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthKey = d.toLocaleString('default', { month: 'short', year: 'numeric' });
    
    const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString();

    const { count } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth)
      .lte('created_at', endOfMonth);
      
    growth[monthKey] = count || 0;
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

  // Enrich with employee counts
  const enrichedClients = await Promise.all((clients || []).map(async (client) => {
    const { count: employees } = await supabase
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .or('disabled.is.null,disabled.eq.false');
      
    return {
      ...client,
      employees: employees || 0,
      mrr: client.subscription_tier === 'paid' ? (employees || 0) * 9.99 : 0
    };
  }));

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

  // Enrich with stats
  const enriched = await Promise.all(clients.map(async (client) => {
    const { count: employees } = await supabase
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client.id);

    const { count: tickets } = await supabase
      .from('incoming-mails')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client.id);

    return { ...client, stats: { employees: employees || 0, tickets: tickets || 0 } };
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

  // Fetch email stats
  let emailStats = { sent: 0, received: 0 };
  const { count: sent } = await supabase.from('sent-mail').select('*', { count: 'exact', head: true }).eq('client_id', clientId); // Requires join or denormalization, approximated here
  
  // Actually we need to fetch via customers or add client_id to sent-mail. Assuming join logic from route:
  // Route logic:
  const { data: empIds } = await supabase.from('employees').select('id').eq('client_id', clientId);
  const ids = empIds.map(e => e.id);
  if (ids.length > 0) {
    const { count: sentCount } = await supabase.from('sent-mail').select('*', { count: 'exact', head: true }).in('employee_id', ids);
    emailStats.sent = sentCount || 0;
  }

  const { count: received } = await supabase.from('incoming-mails').select('*', { count: 'exact', head: true }).eq('client_id', clientId);
  emailStats.received = received || 0;

  return {
    ...client,
    employees: employees || [],
    stats: {
      ...emailStats,
      tickets: emailStats.received
    }
  };
}

async function updateClient(clientId, updates) {
  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', clientId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Sync with Stripe if needed
  if (data.stripe_customer_id) {
    const stripeUpdates = {};
    if (updates.name) stripeUpdates.name = updates.name;
    // Address updates would require mapping address fields
    
    if (Object.keys(stripeUpdates).length > 0) {
      await updateStripeCustomer(data.stripe_customer_id, stripeUpdates);
    }
  }

  return data;
}

async function deleteClient(clientId) {
  // 1. Get client data for cleanup
  const { data: client } = await supabase.from('clients').select('stripe_subscription_id').eq('id', clientId).single();

  // 2. Cancel subscription if active (handled via stripeService potentially, or manually here)
  // For now, just deleting the DB record. Real-world would need Stripe cancellation.
  
  // 3. Delete from DB (Cascade should handle relations, but let's be safe)
  const { error } = await supabase.from('clients').delete().eq('id', clientId);
  if (error) throw new Error(error.message);

  return true;
}

module.exports = {
  getAnalytics,
  getBillingOverview,
  getClients,
  getClientDetail,
  updateClient,
  deleteClient
};
