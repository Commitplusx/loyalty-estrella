import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const supabaseUrl = Deno.env.get('VITE_SUPABASE_URL')
const supabaseKey = Deno.env.get('VITE_SUPABASE_ANON_KEY')
const supabase = createClient(supabaseUrl, supabaseKey)
async function run() {
  const { data, error } = await supabase.from('pedidos').select('*').eq('wb_message_id', 'testticket')
  console.log('SELECT DATA:', data)
  console.log('SELECT ERROR:', error)
}
run()
