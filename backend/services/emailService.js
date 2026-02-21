const supabase = require('../config/supabase');
const nodemailer = require('nodemailer');
const encryption = require('../utils/encryption');
const { storeOutgoingAttachmentsInDB } = require('./attachments/outgoing');
const logger = require('../utils/logger');

/**
 * Get unread mails for a client
 * @param {string} clientId 
 */
async function getUnreadMails(clientId) {
  // Fetch only unassigned customer mails (customers without an employee_id)
  const { data: unassignedCustomers, error: custErr } = await supabase
    .from('customers')
    .select('id')
    .eq('client_id', clientId)
    .is('employee_id', null);

  if (custErr) throw new Error('Database error: ' + custErr.message);

  const ids = (unassignedCustomers ?? []).map(c => c.id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('incoming-mails')
    .select('*')
    .eq('client_id', clientId)
    .in('customer_id', ids)
    .in('status', ['new', 'open'])
    .order('send_at', { ascending: true })
    .limit(100);

  if (error) throw new Error('Database error: ' + error.message);

  return data ?? [];
}

/**
 * Get all emails for a customer
 * @param {string} customerId 
 */
async function getCustomerEmails(customerId) {
  // Fetch incoming mails
  const { data: incomingMails, error: errorIncoming } = await supabase
    .from('incoming-mails')
    .select('*')
    .eq('customer_id', customerId);

  if (errorIncoming) throw new Error('Database error: ' + errorIncoming.message);

  // Fetch sent mails
  const { data: sentMails, error: errorSent } = await supabase
    .from('sent-mail')
    .select('*')
    .eq('customer_id', customerId);
  
  if (errorSent) throw new Error('Database error: ' + errorSent.message);

  // Combine and sort
  if (sentMails && sentMails.length > 0) {
    return [
      ...incomingMails.map(m => ({
        type: 'incoming',
        sendBy: m.customer_id,
        subject: m.subject,
        text: m.text_content,
        date: new Date(m.send_at),
        email_address: m.email_address,
      })),
      ...sentMails.map(m => ({
        type: 'sent',
        sendBy: m.employee_id,
        subject: 'None',
        text: m.text_content,
        date: new Date(m.send_at),
      })),
    ].sort((a, b) => a.date - b.date);
  } else {
    return incomingMails.map(m => ({
      type: 'incoming',
      sendBy: m.customer_id,
      subject: m.subject,
      text: m.text_content,
      date: new Date(m.send_at),
      email_address: m.email_address,
    }));
  }
}

/**
 * Send email to customer
 */
async function sendEmail({ 
  clientId, 
  employeeId, 
  customerId, 
  to, 
  subject, 
  text, 
  attachments = [], 
  threadEmailAddress = null,
  ticketStatus = 'resolved'
}) {
  // Check limits
  await checkEmailLimits(clientId);

  // Handle auto-assignment
  await handleAutoAssignment(clientId, customerId, employeeId);

  // Get SMTP Config
  const smtpConfig = await getClientSmtpConfig(clientId, threadEmailAddress);
  if (!smtpConfig) {
    throw new Error('No SMTP configuration found for this client.');
  }

  // Send via Nodemailer
  const transporter = nodemailer.createTransport(smtpConfig);
  await transporter.verify();

  const info = await transporter.sendMail({
    from: `"Service Desk" <${smtpConfig.auth.user}>`,
    to,
    subject,
    text,
    attachments: attachments.map(file => ({
      filename: file.originalname,
      content: file.buffer,
      contentType: file.mimetype
    }))
  });

  // Store in DB
  const { data, error } = await supabase
    .from('sent-mail')
    .insert([{
      employee_id: employeeId,
      text_content: text,
      customer_id: customerId,
      sent_via: smtpConfig.auth.user,
      provider_name: smtpConfig.provider
    }])
    .select()
    .single();

  if (error) {
    logger.error('[EmailService] DB Error', { error });
    // Note: Email was sent, but DB failed.
    throw new Error('Email sent, but database storage failed');
  }

  // Update Ticket Status
  const validStatuses = ['new', 'open', 'waiting', 'resolved'];
  const finalStatus = validStatuses.includes(ticketStatus) ? ticketStatus : 'resolved';
  
  await supabase
    .from('incoming-mails')
    .update({ status: finalStatus, read: true })
    .eq('customer_id', customerId);

  // Handle Attachments
  if (attachments.length > 0) {
    await storeOutgoingAttachmentsInDB(attachments, clientId, data.id);
  }

  return {
    messageId: info.messageId,
    sentVia: smtpConfig.auth.user,
    provider: smtpConfig.provider,
    insertedData: data
  };
}

// --- Helper Functions ---

async function checkEmailLimits(clientId) {
  const { data: clientData, error } = await supabase
    .from('clients')
    .select('subscription_tier')
    .eq('id', clientId)
    .single();

  if (error) return; // Skip check on error

  if (clientData.subscription_tier === 'free' || !clientData.subscription_tier) {
    // Check user limit
    const { count: activeEmployeeCount } = await supabase
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .or('disabled.is.null,disabled.eq.false');

    if (activeEmployeeCount > 1) {
      throw { status: 403, message: 'User limit exceeded for free tier' };
    }

    // Check email limit
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const { data: customers } = await supabase.from('customers').select('id').eq('client_id', clientId);
    const customerIds = (customers || []).map(c => c.id);
    
    if (customerIds.length > 0) {
      const { count: emailCount } = await supabase
        .from('sent-mail')
        .select('*', { count: 'exact', head: true })
        .in('customer_id', customerIds)
        .gte('send_at', firstDayOfMonth.toISOString());

      if (emailCount >= 50) {
        throw { status: 403, message: 'Monthly email limit reached for free tier' };
      }
    }
  }
}

async function handleAutoAssignment(clientId, customerId, employeeId) {
  const { data: clientData } = await supabase
    .from('clients')
    .select('auto_assign_employee_on_send')
    .eq('id', clientId)
    .single();

  if (!clientData?.auto_assign_employee_on_send) return;

  const { data: customer } = await supabase
    .from('customers')
    .select('employee_id')
    .eq('id', customerId)
    .single();

  if (customer && !customer.employee_id) {
    await supabase
      .from('customers')
      .update({ employee_id: employeeId })
      .eq('id', customerId);
  }
}

async function getClientSmtpConfig(client_id, threadEmailAddress = null) {
  // 1. Client Settings
  const { data: clientSettings } = await supabase
    .from('clients')
    .select('email_sending_mode, primary_email_id')
    .eq('id', client_id)
    .single();

  if (!clientSettings) return null;
  const { email_sending_mode, primary_email_id } = clientSettings;

  // 2. Thread Mode
  if (email_sending_mode === 'thread-based' && threadEmailAddress) {
    const config = await getEmailAccountConfig(client_id, { email_address: threadEmailAddress });
    if (config) return { ...config, provider: 'Thread-Based: ' + threadEmailAddress };
  }

  // 3. Primary Mode
  if (email_sending_mode === 'primary' && primary_email_id) {
    const config = await getEmailAccountConfig(client_id, { id: primary_email_id });
    if (config) return { ...config, provider: 'Primary' };
  }

  // 4. Fallback
  const config = await getEmailAccountConfig(client_id, {}, true); // limit 1
  if (config) return { ...config, provider: 'Fallback' };

  return null;
}

async function getEmailAccountConfig(client_id, query = {}, limit = false) {
  let builder = supabase
    .from('client-emails')
    .select(`
      id, email_address, password,
      email-provider (smtp, smtp_port)
    `)
    .eq('client_id', client_id)
    .eq('active', true);

  if (query.id) builder = builder.eq('id', query.id);
  if (query.email_address) builder = builder.eq('email_address', query.email_address);
  if (limit) builder = builder.limit(1);

  const { data } = limit ? await builder.order('id').limit(1) : await builder.single();
  const emailData = limit ? data?.[0] : data;

  if (!emailData || !emailData['email-provider']) return null;

  const provider = emailData['email-provider'];
  const decryptedPassword = encryption.decrypt(emailData.password);

  return {
    host: provider.smtp,
    port: parseInt(provider.smtp_port),
    secure: parseInt(provider.smtp_port) === 465,
    auth: {
      user: emailData.email_address,
      pass: decryptedPassword
    }
  };
}

/**
 * Update ticket status
 */
async function updateTicketStatus(customerId, status) {
  const { error } = await supabase
    .from('incoming-mails')
    .update({ status: status })
    .eq('customer_id', customerId);

  if (error) throw new Error(error.message);
  return status;
}

/**
 * Bulk update ticket status
 */
async function bulkUpdateTicketStatus(client_id, customerIds, status) {
  // Verify all customers belong to client
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, client_id')
    .in('id', customerIds);

  if (error) throw new Error(error.message);

  const unauthorized = customers.find(c => c.client_id !== client_id);
  if (unauthorized) throw { status: 403, message: 'Access denied to one or more customers' };

  const authorizedIds = customers.map(c => c.id);

  const { error: updateError } = await supabase
    .from('incoming-mails')
    .update({ status: status })
    .in('customer_id', authorizedIds);

  if (updateError) throw new Error(updateError.message);
  return authorizedIds.length;
}

async function getMailsByCustomerIds(clientId, ids) {
  // Verify all customers belong to user's client (security check)
  // We can do this verification in chunks as well if needed, but typically checking ownership is fast.
  // However, `in` clause limit applies here too.
  
  const CHUNK_SIZE = 200; // Safe limit for URL length / query parameters
  const authorizedIds = [];

  // 1. Verify ownership in chunks
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    
    const { data: customers, error: customerError } = await supabase
      .from('customers')
      .select('id, client_id')
      .in('id', chunk);

    if (customerError) throw new Error(customerError.message);

    // Check ownership for this chunk
    for (const customer of customers) {
      if (customer.client_id !== clientId) {
        throw { status: 403, message: 'Access denied to one or more customers' };
      }
      authorizedIds.push(customer.id);
    }
  }

  if (authorizedIds.length === 0) return [];

  // 2. Fetch mails in chunks
  let allMails = [];
  
  for (let i = 0; i < authorizedIds.length; i += CHUNK_SIZE) {
    const chunk = authorizedIds.slice(i, i + CHUNK_SIZE);
    
    const { data, error } = await supabase
      .from('incoming-mails') 
      .select('*, customers(id, name)')
      .in('customer_id', chunk)
      .in('status', ['new', 'open', 'waiting'])
      .order('send_at', { ascending: false });
      // Removed .limit(100) per chunk as it might hide relevant emails if spread across chunks.
      // If global limit is needed, it should be applied after merging or via more complex pagination.
      // For now, fetching all active emails for these customers is safer logic than partial limits.

    if (error) throw new Error(error.message);
    
    if (data) {
      allMails = allMails.concat(data);
    }
  }

  // Re-sort combined results
  allMails.sort((a, b) => new Date(b.send_at) - new Date(a.send_at));

  // Apply a global limit if necessary (e.g. 100 most recent across all customers)
  return allMails.slice(0, 100);
}

module.exports = {
  getUnreadMails,
  getCustomerEmails,
  sendEmail,
  updateTicketStatus,
  bulkUpdateTicketStatus,
  getMailsByCustomerIds,
  getClientSmtpConfig
};
