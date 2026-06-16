import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || process.env.VITE_SUPABASE_URL,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || process.env.VITE_SUPABASE_ANON_KEY
)

async function run() {
  const { data } = await supabase.from('colonias').select('id, nombre, lat, lng, precio, precio_max').ilike('nombre', '%arboledas%')
  console.log(data)
}

run()
