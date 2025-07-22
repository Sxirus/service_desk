const express = require('express');
const router = express.Router();
const supabase = require("../config/supabase")

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

//exporting
module.exports = router;
