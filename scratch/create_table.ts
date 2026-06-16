import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function run() {
  // Create table via rpc or just raw sql. Since we don't have rpc for this,
  // we can't run raw SQL from the JS client easily without an RPC. 
  console.log("We need to run SQL directly")
}
run()
