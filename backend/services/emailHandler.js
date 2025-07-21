// --- emailHandler.js ---
const supabase = require('../config/supabase');
const { get } = require('../routes/health');

async function saveEmail(parsedEmail, clientId) {
  const { subject, from, date, text, html, attachments = [] } = parsedEmail;
    const senderEmailAddress = from.value[0].address;
    let customerId;
    console.log("Checking if email address exists:", senderEmailAddress);
    if (!(await checkIfEmailAddressExists(senderEmailAddress))) {
        // If email address does not exist, create a new customer
        console.log("Email address does not exist, creating new customer:", senderEmailAddress);
        customerId = await createCustomerWithEmail(from, clientId);
    } else {
        console.log("Email address exists, retrieving customer ID:", senderEmailAddress);
        customerId = await getCustomerIdByEmail(senderEmailAddress);
    }

  const { data: email, error: emailError } = await supabase.from('incoming-mails').insert([
    {
        send_at: date,
        client_id: clientId,
        customer_id: customerId,
        subject: subject,
        text_content: text,
        html_content: html,
        email_address: senderEmailAddress,
    }
  ]).select().single();

  if (emailError) {
    console.error(`[${clientId}] Failed to insert email:`, emailError);
    return;
  }
}

async function createCustomerWithEmail(from, clientId) {
    const senderEmailAddress = from.value[0].address;
    const senderName = from.value[0].name || 'Unknown Sender';
    // Create a new customer record
    const { data: customer, error: customerError } = await supabase.from('customers').insert([
        {
            client_id: clientId,
            name: senderName // Use the extracted senderName
        }
    ]).select().single();

    if (customerError) {
        console.error(`[${senderEmailAddress}] Failed to create customer:`, customerError);
        return;
    }

    // Create Email Address in the database
    const { data: emailAddress, error: emailError } = await supabase.from('email-addresses').insert([
        {
            email_address: senderEmailAddress,
            customer_id: customer.id
        }
    ]).select().single();

    if (emailError) {
        console.error(`[${clientId}] Failed to create email address:`, emailError);
        return;
    }

    return customer.id; // Return the newly created customer's ID
}

async function checkIfEmailAddressExists(email) {
    // Check if an email address exists in the database
    const { data, error } = await supabase.from('email-addresses').select('customer_id').eq('email_address', email).maybeSingle();
    if (error) {
        console.error(`[${email}] Failed to check email existence:`, error);
        return false;
    } else {
        return data && data.customer_id ? true : false;
    }
}

async function getCustomerIdByEmail(email) {
    // Retrieve the customer ID associated with the given email address
    const { data, error } = await supabase.from('email-addresses').select('customer_id').eq('email_address', email).maybeSingle();
    if (error) {
        console.error(`[${email}] Failed to get customer ID by email:`, error);
        return null;
    }
    return data.customer_id;
}

module.exports = { saveEmail };