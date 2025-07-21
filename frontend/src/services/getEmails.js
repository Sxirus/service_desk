//test file
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

async function fetchData() {
  const { data, error } = await supabase.from('Client').select('*')

  if (error) console.error('Fehler:', error)
  else console.log('Daten:', data)
}

fetchData()
