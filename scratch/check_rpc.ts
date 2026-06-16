import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || process.env.VITE_SUPABASE_URL,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || process.env.VITE_SUPABASE_ANON_KEY
)

async function run() {
  const { data, error } = await supabase.rpc('calcular_precio_mandadito', {
    p_lat_origen: 16.235321,   // Yalchivol
    p_lng_origen: -92.156889,
    p_lat_destino: 16.262503,  // Arboledas approx
    p_lng_destino: -92.131102
  })
  console.log('Error:', error)
  console.log('Data:', data)
}

run()
