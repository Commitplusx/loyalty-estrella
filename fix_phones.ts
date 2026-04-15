import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://jdrrkpvodnqoljycixbg.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.argv[2] 

if (!SERVICE_KEY) {
  console.error("No service key provided. Pass as argument.")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

async function sanitizeTable(tableName: string) {
  console.log(`Sanitizing table ${tableName}...`)
  const { data, error } = await supabase.from(tableName).select('id, telefono')
  if (error) {
    console.error(error)
    return
  }
  
  for (const row of data || []) {
    if (row.telefono) {
      const cleanPhone = row.telefono.replace(/\D/g, '')
      if (cleanPhone !== row.telefono) {
        console.log(`Updating ${tableName} ${row.id}: ${row.telefono} -> ${cleanPhone}`)
        await supabase.from(tableName).update({ telefono: cleanPhone }).eq('id', row.id)
      }
    }
  }
  console.log(`Done sanityzing ${tableName}.`)
}

async function run() {
  await sanitizeTable('restaurantes')
  await sanitizeTable('clientes')
  await sanitizeTable('repartidores')
}

run()
