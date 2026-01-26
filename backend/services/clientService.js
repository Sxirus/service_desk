const supabase = require('../config/supabase');
const { 
  createStripeCustomer, 
  createCheckoutSession, 
  retrieveCheckoutSession,
  createBillingPortalSession,
  getSubscription,
  updateSubscriptionQuantity,
  updateStripeCustomer
} = require('./stripeService');
const logger = require('../utils/logger');

async function getEmployees(clientId) {
  const { data, error } = await supabase
    .from("employees")
    .select("id, name")
    .eq("client_id", clientId)
    .order("name");

  if (error) throw new Error('Database error: ' + error.message);
  return data;
}

async function assignEmployee(clientId, employeeId, customerId) {
  // Verify employee
  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('client_id')
    .eq('id', employeeId)
    .single();

  if (employeeError || !employee) throw { status: 404, message: 'Employee not found' };
  if (employee.client_id !== clientId) throw { status: 403, message: 'Employee does not belong to your client' };

  // Verify customer
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('client_id')
    .eq('id', customerId)
    .single();

  if (customerError || !customer) throw { status: 404, message: 'Customer not found' };
  if (customer.client_id !== clientId) throw { status: 403, message: 'Customer does not belong to your client' };

  // Update
  const { data, error } = await supabase
    .from('customers')
    .update({ 
      employee_id: employeeId,
      group_id: null
    })
    .eq('id', customerId)
    .select()
    .single();

  if (error) throw new Error('Database error: ' + error.message);
  return data;
}

async function assignGroup(clientId, groupId, customerId) {
  // Verify group
  const { data: group, error: groupError } = await supabase
    .from('employee_groups')
    .select('client_id')
    .eq('id', groupId)
    .single();

  if (groupError || !group) throw { status: 404, message: 'Group not found' };
  if (group.client_id !== clientId) throw { status: 403, message: 'Group does not belong to your client' };

  // Verify customer
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('client_id')
    .eq('id', customerId)
    .single();

  if (customerError || !customer) throw { status: 404, message: 'Customer not found' };
  if (customer.client_id !== clientId) throw { status: 403, message: 'Customer does not belong to your client' };

  // Update
  const { data, error } = await supabase
    .from('customers')
    .update({ 
      group_id: groupId,
      employee_id: null 
    })
    .eq('id', customerId)
    .select()
    .single();

  if (error) throw new Error('Database error: ' + error.message);
  return data;
}

async function unassignCustomer(clientId, customerId) {
  // Verify customer
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('client_id')
    .eq('id', customerId)
    .single();

  if (customerError || !customer) throw { status: 404, message: 'Customer not found' };
  if (customer.client_id !== clientId) throw { status: 403, message: 'Customer does not belong to your client' };

  const { data, error } = await supabase
    .from('customers')
    .update({ 
      employee_id: null,
      group_id: null
    })
    .eq('id', customerId)
    .select()
    .single();

  if (error) throw new Error('Database error: ' + error.message);
  return data;
}

async function bulkAssign(clientId, { customerIds, employeeId, groupId }) {
  // Verify customers
  const { data: customers, error: customerError } = await supabase
    .from('customers')
    .select('id, client_id')
    .in('id', customerIds);

  if (customerError) throw new Error('Database error: ' + customerError.message);

  const unauthorized = customers.find(c => c.client_id !== clientId);
  if (unauthorized) throw { status: 403, message: 'Access denied to one or more customers' };

  const authorizedIds = customers.map(c => c.id);

  if (employeeId) {
    const { data: employee } = await supabase
      .from('employees')
      .select('client_id')
      .eq('id', employeeId)
      .single();
      
    if (!employee || employee.client_id !== clientId) throw { status: 403, message: 'Invalid employee' };

    await supabase
      .from('customers')
      .update({ employee_id: employeeId, group_id: null })
      .in('id', authorizedIds);
      
    return { updated: authorizedIds.length, assignee: { type: 'employee', id: employeeId } };
  } else if (groupId) {
    const { data: group } = await supabase
      .from('employee_groups')
      .select('client_id')
      .eq('id', groupId)
      .single();

    if (!group || group.client_id !== clientId) throw { status: 403, message: 'Invalid group' };

    await supabase
      .from('customers')
      .update({ group_id: groupId, employee_id: null })
      .in('id', authorizedIds);

    return { updated: authorizedIds.length, assignee: { type: 'group', id: groupId } };
  }
}

async function handleStripeCustomerCreation(clientId, clientData) {
  // Create Stripe customer
  const stripeResult = await createStripeCustomer(clientData);
  if (!stripeResult.success) throw new Error(stripeResult.error);

  // Update DB
  const { error: updateError } = await supabase
    .from('clients')
    .update({ stripe_customer_id: stripeResult.stripe_customer_id })
    .eq('id', clientId);

  if (updateError) {
    // Log but don't fail hard if possible, or throw
    logger.error('Failed to update client with Stripe ID', { error: updateError });
    throw new Error('Stripe customer created but failed to save ID');
  }

  return stripeResult;
}

async function getClientUsageStats(clientId) {
  // Employees
  const { count: activeEmployees } = await supabase
    .from('employees')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .or('disabled.is.null,disabled.eq.false');

  // Emails this month
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const { data: customers } = await supabase.from('customers').select('id').eq('client_id', clientId);
  const customerIds = (customers || []).map(c => c.id);
  
  let emailCount = 0;
  if (customerIds.length > 0) {
    const { count } = await supabase
      .from('sent-mail')
      .select('*', { count: 'exact', head: true })
      .in('customer_id', customerIds)
      .gte('send_at', firstDayOfMonth.toISOString());
    emailCount = count || 0;
  }

  return {
    activeEmployees: activeEmployees || 0,
    emailsSentThisMonth: emailCount || 0,
    limits: { maxEmployees: 1, maxEmailsPerMonth: 50 }
  };
}

module.exports = {
  getEmployees,
  assignEmployee,
  assignGroup,
  unassignCustomer,
  bulkAssign,
  handleStripeCustomerCreation,
  getClientUsageStats,
  // Re-export stripe services that don't need wrapping
  createCheckoutSession,
  retrieveCheckoutSession,
  createBillingPortalSession,
  getSubscription,
  updateSubscriptionQuantity,
  updateStripeCustomer
};
