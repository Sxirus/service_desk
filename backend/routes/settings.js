//file for the api routes to get the settings
const express = require('express');
const router = express.Router();
const supabase = require("../config/supabase")

//getting the signature from the database
router.get('/getSignature', async (req, res) => {
  //getting params
  const client_id = req.query.client_id;

  //fetching from db
  try {
    const { data, error } = await supabase
      .from('clients') 
      .select('email_signature')
      .eq("id", client_id)

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