import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || process.env.VITE_SUPABASE_URL,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || process.env.VITE_SUPABASE_ANON_KEY
)

async function run() {
  const { data, error } = await supabase.from('h3_zonas').select('nombre, precio').ilike('nombre', '%yalchivol%')
  console.log(`Hexagons with Yalchivol: ${data?.length}`)
  const prices = [...new Set(data?.map(d => d.precio))]
  console.log(`Unique prices: ${prices}`)
}

run()
