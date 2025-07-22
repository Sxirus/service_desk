const express = require('express');
const router = express.Router();
const supabase = require("../config/supabase")

router.get('/getCustomerById', async (req, res) => {
  //getting params
  const customerId = req.query.customerId;

  try {
    const { data, error } = await supabase
      .from('customers') 
      .select('*')
      .eq("id", customerId)
      .limit(1);

    if (error) {
      console.log('Supabase error:', error.message);
      return res.status(500).json({ error: 'Datenbankfehler' });
    }

    res.json(data);
  } catch (error) {
    console.log('Server error:', err.message);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

//exporting
module.exports = router;