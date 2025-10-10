//file for all the client stuff like getting employees data etc.
const express = require('express');
const router = express.Router();
const supabase = require("../config/supabase")

//getting all employees of a client
router.get('/getEmployees', async (req, res) => {
  //getting params
  const client_id = req.query.client_id;

  //fetching from db
  try {
    const {data, error} = await supabase
      .from("employees")
      .select("id, name")
      .eq("client_id", client_id)
      .order("name")

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

//switching assigned employee
router.post('/assignEmployee', async (req, res) => {
  const reqdata = req.body;
   
  try {
    const {data, error} = await supabase
      .from('customers')
      .update({employee_id: reqdata.employee_id})
      .eq('id', reqdata.customer_id)

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