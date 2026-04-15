const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({path: './supabase/functions/.env'})
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  const { data } = await supa.from('restaurantes').select('*').ilike('nombre', '%makitan%')
  console.log(JSON.stringify(data, null, 2))
}
run()
