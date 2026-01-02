/**
 * Platform Administration API Routes
 * Provides endpoints for platform-level management across all clients
 * 
 * All routes require platform admin authentication.
 * These routes bypass normal client-scoping to allow cross-client access.
 */

const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticatePlatformAdmin, logPlatformAction } = require('../middleware/platformAuth');
const stripeService = require('../services/stripeService');

// Apply platform admin authentication to all routes
router.use(authenticatePlatformAdmin);

// ============================================================================
// CLIENT MANAGEMENT
// ============================================================================

/**
 * GET /api/platform/clients
 * List all clients with summary statistics
 */
router.get('/clients', async (req, res) => {
  try {
    const { search, tier, sort = 'created_at', order = 'desc', limit = 50, offset = 0 } = req.query;

    // Build query
    let query = supabase
      .from('clients')
      .select(`
        id,
        name,
        website,
        subscription_tier,
        stripe_customer_id,
        stripe_subscription_id,
        shopify_connected,
        created_at
      `, { count: 'exact' });

    // Apply filters
    if (search) {
      query = query.or(`name.ilike.%${search}%,website.ilike.%${search}%`);
    }
    if (tier) {
      query = query.eq('subscription_tier', tier);
    }

    // Apply sorting and pagination
    query = query.order(sort, { ascending: order === 'asc' })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const { data: clients, error, count } = await query;

    if (error) {
      console.error('[PLATFORM] Failed to fetch clients:', error);
      return res.status(500).json({ error: 'Failed to fetch clients' });
    }

    // Get employee counts for each client
    const clientIds = clients.map(c => c.id);
    const { data: employeeCounts } = await supabase
      .from('employees')
      .select('client_id')
      .in('client_id', clientIds);

    // Count employees per client
    const employeeCountMap = {};
    employeeCounts?.forEach(e => {
      employeeCountMap[e.client_id] = (employeeCountMap[e.client_id] || 0) + 1;
    });

    // Enrich clients with counts
    const enrichedClients = clients.map(client => ({
      ...client,
      employee_count: employeeCountMap[client.id] || 0
    }));

    res.json({
      success: true,
      data: enrichedClients,
      pagination: {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('[PLATFORM] Error fetching clients:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/platform/clients/:id
 * Get detailed information about a specific client
 */
router.get('/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const clientId = parseInt(id, 10);
    
    if (isNaN(clientId)) {
      return res.status(400).json({ error: 'Invalid client ID' });
    }

    // Fetch client details
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Fetch related data in parallel
    const [
      { data: employees, error: empError },
      { count: customerCount },
      { count: emailsSentCount }
    ] = await Promise.all([
      supabase
        .from('employees')
        .select('id, name, avatar_url, created_at, user_id, disabled')
        .eq('client_id', clientId)
        .order('name'),
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId),
      supabase
        .from('sent-mail')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
    ]);
    
    if (empError) {
      console.error('[PLATFORM] Error fetching employees:', empError);
    }

    // Get emails received count - first get customer IDs for this client
    const { data: clientCustomers } = await supabase
      .from('customers')
      .select('id')
      .eq('client_id', clientId);
    
    const customerIds = clientCustomers?.map(c => c.id) || [];
    let emailsReceivedCount = 0;
    if (customerIds.length > 0) {
      const { count } = await supabase
        .from('incoming-mails')
        .select('id', { count: 'exact', head: true })
        .in('customer_id', customerIds);
      emailsReceivedCount = count || 0;
    }

    // Get employee emails via RPC (since emails are in auth.users)
    let employeesWithEmails = employees || [];
    console.log('[PLATFORM] Employees found for client', clientId, ':', employees?.length || 0);
    
    if (employees && employees.length > 0) {
      const empIds = employees.map(e => e.id);
      console.log('[PLATFORM] Fetching emails for employee IDs:', empIds);
      
      const { data: emailRows, error: emailError } = await supabase.rpc('get_employee_emails', { emp_ids: empIds });
      
      if (emailError) {
        console.error('[PLATFORM] Failed to get employee emails:', emailError);
        // Continue with employees without emails
      } else if (emailRows) {
        console.log('[PLATFORM] Email rows returned:', emailRows.length);
        const emailMap = new Map(emailRows.map(row => [row.employee_id, row.email]));
        employeesWithEmails = employees.map(emp => ({
          ...emp,
          email: emailMap.get(emp.id) || null
        }));
      }
    }

    // Get revenue from Stripe
    const employeeCount = employees?.length || 0;
    let monthlyRevenue = 0;
    let totalRevenue = 0;
    
    // Get MRR from active subscription
    if (client.stripe_subscription_id) {
      const mrrResult = await stripeService.getSubscriptionMRR(client.stripe_subscription_id);
      if (mrrResult.success) {
        monthlyRevenue = mrrResult.mrr / 100; // Convert from cents to EUR
      }
    }
    
    // Get total revenue from Stripe invoices
    if (client.stripe_customer_id) {
      const revenueResult = await stripeService.getCustomerTotalRevenue(client.stripe_customer_id);
      if (revenueResult.success) {
        totalRevenue = revenueResult.totalRevenue / 100; // Convert from cents to EUR
      }
    }

    res.json({
      success: true,
      data: {
        ...client,
        employees: employeesWithEmails,
        stats: {
          employee_count: employeeCount,
          customer_count: customerCount || 0,
          emails_sent: emailsSentCount || 0,
          emails_received: emailsReceivedCount,
          monthly_revenue: monthlyRevenue,
          total_revenue: totalRevenue
        }
      }
    });
  } catch (error) {
    console.error('[PLATFORM] Error fetching client details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/platform/clients/:id
 * Update client settings
 */
router.patch('/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const clientId = parseInt(id, 10);
    
    if (isNaN(clientId)) {
      return res.status(400).json({ error: 'Invalid client ID' });
    }
    
    const updates = req.body;

    // Whitelist allowed fields
    const allowedFields = [
      'name',
      'website',
      'subscription_tier',
      'address_street',
      'address_city',
      'address_zip',
      'address_country',
      'vat'
    ];

    const filteredUpdates = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key];
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Get current client data for change tracking
    const { data: oldClient } = await supabase
      .from('clients')
      .select('name, subscription_tier')
      .eq('id', clientId)
      .single();

    const { data: client, error } = await supabase
      .from('clients')
      .update(filteredUpdates)
      .eq('id', clientId)
      .select()
      .single();

    if (error) {
      console.error('[PLATFORM] Failed to update client:', error);
      return res.status(500).json({ error: 'Failed to update client' });
    }

    // Build detailed log info
    const logDetails = {
      client_name: client.name,
      updated_fields: Object.keys(filteredUpdates)
    };
    
    // Track specific tier changes
    if (filteredUpdates.subscription_tier && oldClient?.subscription_tier !== filteredUpdates.subscription_tier) {
      logDetails.field = 'subscription_tier';
      logDetails.old_value = oldClient?.subscription_tier;
      logDetails.new_value = filteredUpdates.subscription_tier;
    }

    // Log the action
    await logPlatformAction(
      req.platformAdmin.id,
      'update_client',
      'client',
      clientId.toString(),
      logDetails,
      req
    );

    res.json({ success: true, data: client });
  } catch (error) {
    console.error('[PLATFORM] Error updating client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// EMPLOYEE MANAGEMENT (within client context)
// ============================================================================

/**
 * PATCH /api/platform/clients/:clientId/employees/:employeeId
 * Update an employee (name, disabled status)
 */
router.patch('/clients/:clientId/employees/:employeeId', async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    const employeeId = parseInt(req.params.employeeId, 10);
    
    if (isNaN(clientId) || isNaN(employeeId)) {
      return res.status(400).json({ error: 'Invalid client or employee ID' });
    }
    
    const { name, disabled } = req.body;
    
    // Build update object
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (disabled !== undefined) updates.disabled = disabled;
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    // Verify employee belongs to client and get current data
    const { data: employee, error: checkError } = await supabase
      .from('employees')
      .select('id, client_id, name, disabled')
      .eq('id', employeeId)
      .eq('client_id', clientId)
      .single();
    
    if (checkError || !employee) {
      return res.status(404).json({ error: 'Employee not found in this client' });
    }
    
    // Get client name for audit log
    const { data: clientData } = await supabase
      .from('clients')
      .select('name')
      .eq('id', clientId)
      .single();
    
    // Update employee
    const { data: updated, error } = await supabase
      .from('employees')
      .update(updates)
      .eq('id', employeeId)
      .select()
      .single();
    
    if (error) {
      console.error('[PLATFORM] Failed to update employee:', error);
      return res.status(500).json({ error: 'Failed to update employee' });
    }
    
    // Build detailed log info
    const logDetails = {
      client_id: clientId,
      client_name: clientData?.name || 'Unknown',
      employee_name: employee.name || updated.name || 'Unknown'
    };
    
    // Track specific changes
    if (name !== undefined && name !== employee.name) {
      logDetails.field = 'name';
      logDetails.old_value = employee.name;
      logDetails.new_value = name;
    }
    if (disabled !== undefined && disabled !== employee.disabled) {
      logDetails.field = 'status';
      logDetails.old_value = employee.disabled ? 'disabled' : 'enabled';
      logDetails.new_value = disabled ? 'disabled' : 'enabled';
    }
    
    // Log the action
    await logPlatformAction(
      req.platformAdmin.id,
      disabled !== undefined ? (disabled ? 'disable_employee' : 'enable_employee') : 'update_employee',
      'employee',
      employeeId.toString(),
      logDetails,
      req
    );
    
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('[PLATFORM] Error updating employee:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/platform/clients/:clientId/employees/:employeeId
 * Remove an employee from a client
 */
router.delete('/clients/:clientId/employees/:employeeId', async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    const employeeId = parseInt(req.params.employeeId, 10);
    
    if (isNaN(clientId) || isNaN(employeeId)) {
      return res.status(400).json({ error: 'Invalid client or employee ID' });
    }
    
    // Verify employee belongs to client and get user_id
    const { data: employee, error: checkError } = await supabase
      .from('employees')
      .select('id, client_id, user_id, name')
      .eq('id', employeeId)
      .eq('client_id', clientId)
      .single();
    
    if (checkError || !employee) {
      return res.status(404).json({ error: 'Employee not found in this client' });
    }
    
    // Get client name for audit log
    const { data: clientData } = await supabase
      .from('clients')
      .select('name')
      .eq('id', clientId)
      .single();
    
    // Delete the employee record
    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', employeeId);
    
    if (error) {
      console.error('[PLATFORM] Failed to delete employee:', error);
      return res.status(500).json({ error: 'Failed to delete employee' });
    }
    
    // Note: This doesn't delete the auth.users record - just removes them from this client
    // The user can still exist and be added to another client
    
    // Log the action
    await logPlatformAction(
      req.platformAdmin.id,
      'delete_employee',
      'employee',
      employeeId.toString(),
      { 
        client_id: clientId, 
        client_name: clientData?.name || 'Unknown',
        employee_name: employee.name || 'Unknown'
      },
      req
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('[PLATFORM] Error deleting employee:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// PLATFORM ANALYTICS
// ============================================================================

/**
 * GET /api/platform/analytics
 * Get platform-wide analytics and KPIs
 */
router.get('/analytics', async (req, res) => {
  try {
    const { from, to } = req.query;
    
    // Default to last 30 days
    const endDate = to ? new Date(to) : new Date();
    const startDate = from ? new Date(from) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fetch counts in parallel
    const [
      { count: totalClients },
      { count: paidClients },
      { count: totalEmployees },
      { count: totalCustomers },
      { count: emailsSent },
      { count: emailsReceived },
      { count: totalEmails },
      { count: newClientsThisMonth },
      { data: recentClients }
    ] = await Promise.all([
      supabase.from('clients').select('id', { count: 'exact', head: true }),
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('subscription_tier', 'paid'),
      supabase.from('employees').select('id', { count: 'exact', head: true }),
      supabase.from('customers').select('id', { count: 'exact', head: true }),
      supabase.from('sent-mail').select('id', { count: 'exact', head: true })
        .gte('send_at', startDate.toISOString())
        .lte('send_at', endDate.toISOString()),
      supabase.from('incoming-mails').select('id', { count: 'exact', head: true })
        .gte('timestamp', startDate.toISOString())
        .lte('timestamp', endDate.toISOString()),
      supabase.from('incoming-mails').select('id', { count: 'exact', head: true }),
      supabase.from('clients').select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      supabase.from('clients').select('id, name, subscription_tier, created_at').order('created_at', { ascending: false }).limit(5)
    ]);

    // Get client growth over time (last 12 months)
    const { data: clientGrowth } = await supabase
      .from('clients')
      .select('created_at')
      .order('created_at', { ascending: true });

    // Group by month
    const monthlyGrowth = {};
    clientGrowth?.forEach(client => {
      const month = client.created_at.substring(0, 7); // YYYY-MM
      monthlyGrowth[month] = (monthlyGrowth[month] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        overview: {
          totalClients: totalClients || 0,
          paidClients: paidClients || 0,
          freeClients: (totalClients || 0) - (paidClients || 0),
          totalEmployees: totalEmployees || 0,
          totalCustomers: totalCustomers || 0,
          emailsSentPeriod: emailsSent || 0,
          emailsReceivedPeriod: emailsReceived || 0,
          totalEmails: totalEmails || 0,
          newClientsThisMonth: newClientsThisMonth || 0
        },
        recentClients: recentClients || [],
        growth: monthlyGrowth,
        period: {
          from: startDate.toISOString(),
          to: endDate.toISOString()
        }
      }
    });
  } catch (error) {
    console.error('[PLATFORM] Error fetching analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// BILLING OVERVIEW
// ============================================================================

/**
 * GET /api/platform/billing
 * Get billing overview across all clients
 */
router.get('/billing', async (req, res) => {
  try {
    // Fetch all clients with Stripe info
    const { data: clients, error } = await supabase
      .from('clients')
      .select(`
        id,
        name,
        subscription_tier,
        stripe_customer_id,
        stripe_subscription_id,
        created_at
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[PLATFORM] Failed to fetch billing data:', error);
      return res.status(500).json({ error: 'Failed to fetch billing data' });
    }

    // Get employee counts for each client
    const clientIds = clients.map(c => c.id);
    const { data: employeeCounts } = await supabase
      .from('employees')
      .select('client_id')
      .in('client_id', clientIds);

    // Count employees per client
    const employeeCountMap = {};
    employeeCounts?.forEach(e => {
      employeeCountMap[e.client_id] = (employeeCountMap[e.client_id] || 0) + 1;
    });

    // Calculate total seats and paid seats
    const totalSeats = Object.values(employeeCountMap).reduce((a, b) => a + b, 0);
    
    // Calculate paid seats (only from paid clients)
    const paidClients = clients.filter(c => c.subscription_tier === 'paid');
    const paidSeats = paidClients.reduce((sum, client) => {
      return sum + (employeeCountMap[client.id] || 0);
    }, 0);

    // Get actual revenue metrics from Stripe
    const stripeMetrics = await stripeService.getPlatformRevenueMetrics();
    const mrr = stripeMetrics.success ? stripeMetrics.mrr / 100 : 0; // Convert cents to EUR
    const totalRevenue = stripeMetrics.success ? stripeMetrics.totalRevenue / 100 : 0; // Convert cents to EUR

    // Calculate summary stats
    const summary = {
      totalClients: clients.length,
      paidClients: paidClients.length,
      freeClients: clients.filter(c => c.subscription_tier === 'free').length,
      withStripe: clients.filter(c => c.stripe_customer_id).length,
      totalSeats: totalSeats,
      paidSeats: paidSeats,
      mrr: mrr,
      totalRevenue: totalRevenue,
      activeSubscriptions: stripeMetrics.activeSubscriptions || 0
    };

    res.json({
      success: true,
      data: {
        summary,
        clients: clients.map(c => ({
          id: c.id,
          name: c.name,
          tier: c.subscription_tier,
          has_stripe: !!c.stripe_customer_id,
          has_subscription: !!c.stripe_subscription_id,
          created_at: c.created_at,
          employee_count: employeeCountMap[c.id] || 0
        }))
      }
    });
  } catch (error) {
    console.error('[PLATFORM] Error fetching billing:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// PLATFORM ADMIN MANAGEMENT
// ============================================================================

/**
 * GET /api/platform/admins
 * List all platform administrators
 */
router.get('/admins', async (req, res) => {
  try {
    const { data: admins, error } = await supabase
      .from('platform_admins')
      .select('id, user_id, email, created_at, last_login, created_by')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[PLATFORM] Failed to fetch admins:', error);
      return res.status(500).json({ error: 'Failed to fetch platform admins' });
    }

    res.json({ success: true, data: admins });
  } catch (error) {
    console.error('[PLATFORM] Error fetching admins:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/platform/admins
 * Add a new platform administrator
 * Requires the user to already exist in auth.users
 */
router.post('/admins', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find the user by email in auth.users
    // Note: This requires service role access
    const { data: users, error: userError } = await supabase
      .from('employees')
      .select('user_id')
      .eq('email', email)
      .limit(1);

    // Try to find user_id through auth
    let userId = users?.[0]?.user_id;

    if (!userId) {
      // Alternative: Look up via Supabase Admin API if available
      // For now, require the email to match an existing employee
      return res.status(404).json({ 
        error: 'User not found',
        message: 'The email must belong to an existing user in the system' 
      });
    }

    // Check if already a platform admin
    const { data: existing } = await supabase
      .from('platform_admins')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existing) {
      return res.status(409).json({ error: 'User is already a platform admin' });
    }

    // Create platform admin record
    const { data: newAdmin, error: createError } = await supabase
      .from('platform_admins')
      .insert({
        user_id: userId,
        email: email,
        created_by: req.platformAdmin.id
      })
      .select()
      .single();

    if (createError) {
      console.error('[PLATFORM] Failed to create admin:', createError);
      return res.status(500).json({ error: 'Failed to create platform admin' });
    }

    // Log the action
    await logPlatformAction(
      req.platformAdmin.id,
      'add_platform_admin',
      'platform_admin',
      newAdmin.id,
      { email },
      req
    );

    res.status(201).json({ success: true, data: newAdmin });
  } catch (error) {
    console.error('[PLATFORM] Error creating admin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/platform/admins/:id
 * Remove a platform administrator
 */
router.delete('/admins/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (id === req.platformAdmin.id) {
      return res.status(400).json({ error: 'Cannot remove yourself as platform admin' });
    }

    // Get admin info for logging
    const { data: admin } = await supabase
      .from('platform_admins')
      .select('email')
      .eq('id', id)
      .single();

    if (!admin) {
      return res.status(404).json({ error: 'Platform admin not found' });
    }

    // Delete the admin
    const { error } = await supabase
      .from('platform_admins')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[PLATFORM] Failed to delete admin:', error);
      return res.status(500).json({ error: 'Failed to remove platform admin' });
    }

    // Log the action
    await logPlatformAction(
      req.platformAdmin.id,
      'remove_platform_admin',
      'platform_admin',
      id,
      { email: admin.email },
      req
    );

    res.json({ success: true, message: 'Platform admin removed' });
  } catch (error) {
    console.error('[PLATFORM] Error deleting admin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/platform/audit-log
 * Get platform audit log
 */
router.get('/audit-log', async (req, res) => {
  try {
    const { limit = 100, offset = 0, action, target_type } = req.query;

    let query = supabase
      .from('platform_audit_log')
      .select(`
        id,
        admin_id,
        action,
        target_type,
        target_id,
        details,
        ip_address,
        created_at,
        platform_admins!inner(email)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (action) {
      query = query.eq('action', action);
    }
    if (target_type) {
      query = query.eq('target_type', target_type);
    }

    const { data: logs, error, count } = await query;

    if (error) {
      console.error('[PLATFORM] Failed to fetch audit log:', error);
      return res.status(500).json({ error: 'Failed to fetch audit log' });
    }

    res.json({
      success: true,
      data: logs,
      pagination: {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('[PLATFORM] Error fetching audit log:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
