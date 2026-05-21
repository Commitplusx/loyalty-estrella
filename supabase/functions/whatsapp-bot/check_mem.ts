import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || process.env.SUPABASE_URL!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function run() {
  const { data, error } = await supabase.from('bot_memory').select('phone, history, updated_at').order('updated_at', { ascending: false }).limit(5)
  if (error) console.error(error)
  else console.log(JSON.stringify(data, null, 2))
}

run()
