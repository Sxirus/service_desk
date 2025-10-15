const express = require('express');
const router = express.Router();
const supabase = require("../config/supabase")

//gets the customer from the database by using the customer id
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

//getting the ids of all the customers assigned to an employee
router.get('/getAssignedCustomers', async (req, res) => {
  //getting params
  const employee_id = req.query.employee_id;

  try {
    const {data, error} = await supabase
      .from('customers')
      .select('id')
      .eq('employee_id', employee_id)
    
    if (error) {
      console.log('Supabase error:', error.message);
      return res.status(500).json({ error: 'Datenbankfehler' });
    }

    res.json(data);
  } catch (error) {
    console.log('Server error:', error.message);
    res.status(500).json({ error: 'Serverfehler' });
  }
})

//exporting
module.exports = router;