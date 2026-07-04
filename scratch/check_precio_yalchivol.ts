import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as h3 from 'npm:h3-js'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || process.env.VITE_SUPABASE_URL,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || process.env.VITE_SUPABASE_ANON_KEY
)

async function run() {
  const lat = 16.235321
  const lng = -92.156889
  const hex = h3.latLngToCell(lat, lng, 10)
  const { data } = await supabase.from('h3_zonas').select('precio').eq('h3_index', hex).maybeSingle()
  console.log(`Hex: ${hex}, Price: ${data?.precio}`)
}

run()
