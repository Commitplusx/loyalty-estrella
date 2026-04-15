const { createClient } = require('@supabase/supabase-js')
const { execSync } = require('child_process')

const SUPABASE_URL = 'https://jdrrkpvodnqoljycixbg.supabase.co'

let SERVICE_KEY = ''
try {
  const output = execSync('npx supabase secrets get SUPABASE_SERVICE_ROLE_KEY --project-ref jdrrkpvodnqoljycixbg', { encoding: 'utf-8' })
  // Podria ser "SUPABASE_SERVICE_ROLE_KEY=ey..." o "ey..."
  if (output.includes('SUPABASE_SERVICE_ROLE_KEY=')) {
    SERVICE_KEY = output.split('SUPABASE_SERVICE_ROLE_KEY=')[1].trim()
  } else {
    SERVICE_KEY = output.trim()
  }
} catch (e) {
  console.error("No service key")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

async function sanitizeTable(tableName) {
  console.log(`Sanitizing table ${tableName}...`)
  const { data, error } = await supabase.from(tableName).select('id, telefono')
  if (error) {
    console.error(error)
    return
  }
  
  for (const row of data || []) {
    if (row.telefono) {
      const cleanPhone = row.telefono.replace(/\D/g, '')
      if (cleanPhone !== row.telefono && cleanPhone.length > 0) {
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
