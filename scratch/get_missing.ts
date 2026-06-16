import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import "https://deno.land/std@0.167.0/dotenv/load.ts"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function run() {
  const { data: zonas } = await supabase.from('zonas').select('id, nombre')
  const { data: tarifas } = await supabase.from('zonas_tarifas').select('origen_zona_id, destino_zona_id, precio')

  const missing = []
  
  // Create all pairs
  for (const origen of zonas) {
    for (const destino of zonas) {
      const exists = tarifas.find(t => t.origen_zona_id === origen.id && t.destino_zona_id === destino.id)
      if (!exists) {
        missing.push({ oId: origen.id, oName: origen.nombre, dId: destino.id, dName: destino.nombre })
      }
    }
  }

  Deno.writeTextFileSync('c:/Users/asus_/Desktop/loyalty-estrella/scratch/rutas_faltantes.json', JSON.stringify(missing, null, 2))
  console.log(`Faltan ${missing.length} rutas. Guardado en rutas_faltantes.json`)
}

run()
