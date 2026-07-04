import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'REPLACE_ME'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'REPLACE_ME'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function run() {
  const { data: zonas } = await supabase.from('zonas').select('id, nombre')
  const { data: tarifas } = await supabase.from('zonas_tarifas').select('origen_zona_id, destino_zona_id, precio')

  console.log(`Encontradas ${zonas.length} zonas y ${tarifas.length} tarifas configuradas.`)

  const missing = []
  for (const origen of zonas) {
    for (const destino of zonas) {
      const exists = tarifas.find(t => t.origen_zona_id === origen.id && t.destino_zona_id === destino.id)
      if (!exists) {
        missing.push({ origen: origen.nombre, destino: destino.nombre })
      }
    }
  }

  console.log(`\nFaltan ${missing.length} rutas por configurar.\n`)
  let i = 1
  for (const m of missing.slice(0, 5)) {
    console.log(`${i}. De ${m.origen} a ${m.destino}`)
    i++
  }
  if (missing.length > 5) console.log(`... y ${missing.length - 5} más.`)
}
run()
