const express = require('express');
const router = express.Router();
const supabase = require("../config/supabase")
const nodemailer = require('nodemailer');

//getting mails from the mail table
router.get('/getMails', async (req, res) => {
  //getting params
  const client_id = req.query.client_id;
  //fetching from db
  try {
    const { data, error } = await supabase
      .from('incoming-mails') 
      .select('*')
      .eq("client_id", client_id)
      .eq('read', false)
      .order('send_at', { ascending: true })
      .limit(100);

    if (error) {
      console.log('Supabase error:', error.message);
      return res.status(500).json({ error: 'Datenbankfehler' });
    }

    res.json(data);
  } catch (err) {
    console.log('Server error:', err.message);
    res.status(500).json({ error: 'Serverfehler' });
  }
})

//gets all the mails from a customer using the customer id (send and incomming)
router.get('/getEmailsFromCustomer', async (req, res) => {
  const customerId = req.query.customerId;
  try {
    const { data: incomingMails, error: errorIncoming } = await supabase
      .from('incoming-mails')
      .select('*')
      .eq('customer_id', customerId);

    const { data: sentMails, error: errorSent } = await supabase
      .from('sent-mail')
      .select('*')
      .eq('customer_id', customerId);
    
    if (sentMails != null) {
      var allMails = [
        ...incomingMails.map(m => ({
          type: 'incoming',
          sendBy: m.customer_id,
          subject: m.subject,
          text: m.text_content,
          date: new Date(m.send_at),
          email_adress: m.email_address,
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
      var allMails = incomingMails;
    }

    
    if (errorIncoming || errorSent) {
      console.log('Supabase error:', errorIncoming || errorSent);
      return res.status(500).json({ error: 'Datenbankfehler' });
    }

    res.json(allMails)
  } catch (err) {
    console.log('Server error:', err.message);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

//sending mails and saving them to db
router.post('/sendMail', async (req, res) => {
  const customerId = req.query.customerId;
  const { to, subject, text } = req.body;

  //creating transporter
  const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.IMAP_USER,
    pass: process.env.IMAP_PASS,
  },
  });

  //sending mail
  try {
    const info = await transporter.sendMail({
      from: `"Service Desk" <${process.env.MAIL_USER}>`,
      to,
      subject,
      text,
    });

    const { data, error } = await supabase
      .from('sent-mail')
      .insert([{employee_id: 1, text_content: text, customer_id: parseInt(customerId)}]);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      messageId: info.messageId,
      insertedData: data
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

//making mails read by customerid
router.get('/makeRead', async (req, res) => {
  const customerId = req.query.customerId;

  try {
  const { data, error } = await supabase
  .from('incoming-mails')
  .update({ read: true })
  .eq('customer_id', customerId);

  if (error) {
  console.error('Supabase error:', error.message);
  return res.status(500).json({ success: false, error: error.message });
  }

  res.json({ success: true});
  } catch (err){
    console.error('Server error:', err.message);
    res.status(500).json({ success: false, error: 'Servererror' });
  } 
})

//get emails by list of customer ids
router.get('/getMailsbyCustomerIds', async (req, res) => {
  //getting array as parameter
  const ids = ([]).concat(req.query.ids ?? []).map(Number);
  console.log(ids)
  try {
    const {data, error} = await supabase
      .from('incoming-mails') 
      .select('*')
      .in('customer_id', ids)
      .eq('read', false)
      .order('send_at', { ascending: true })
      .limit(100)

    if (error) {
      console.log('Supabase error:', error.message);
      return res.status(500).json({ error: 'Datenbankfehler' });
    }
    res.json(data);    
  } catch (err) {
    console.error('Server error:', err.message);
    res.status(500).json({ success: false, error: 'Servererror' });
  }
})

//exporting
module.exports = router;
