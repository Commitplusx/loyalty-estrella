import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const supabaseUrl = Deno.env.get('VITE_SUPABASE_URL')
const supabaseKey = Deno.env.get('VITE_SUPABASE_ANON_KEY')
const supabase = createClient(supabaseUrl, supabaseKey)
async function run() {
  const { data, error } = await supabase.from('pedidos').insert({}).select()
  console.log('ERROR:', error)
}
run()
