const express = require('express');
const router = express.Router();
const supabase = require("../config/supabase")

//getting mails from the mail table
router.get('/getMails', async (req, res) => {
  const customerId = req.query.customer_id;
  try {
    const { data, error } = await supabase
      .from('incoming-mails') 
      .select('*')
      .eq("customer_id", customerId);

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

module.exports = router;
