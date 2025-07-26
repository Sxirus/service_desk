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
      .order('send_at', { ascending: true })
      .limit(10); ;

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

//gets all the mails from a customer using the customer id
router.get('/getEmailsFromCustomer', async (req, res) => {
  const customerId = req.query.customerId;
  try {
    const {data,error} = await supabase
      .from('incoming-mails')
      .select('*')
      .eq('customer_id', customerId)
      .order('send_at', { ascending: true })

    if (error) {
      console.log('Supabase error:', error.message);
      return res.status(500).json({ error: 'Datenbankfehler' });
    }

    res.json(data)
  } catch (err) {
    console.log('Server error:', err.message);
    res.status(500).json({ error: 'Serverfehler' });
  }
})

//sending mails and saving them to db
router.post('/sendMail', async (req, res) => {
  const customerId = req.query.customerId;
  const { to, subject, text } = req.body;

  //creating transporter
  const transporter = nodemailer.createTransport({
  host: process.env.IMAP_HOST,
  port: process.env.IMAP_PORT,
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
      .from('messages')
      .insert([{ customerId, subject, text}]);


    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, messageId: info.messageId }, data );
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }

})

//exporting
module.exports = router;
