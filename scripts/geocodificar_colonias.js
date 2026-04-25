// scripts/geocodificar_colonias.js
// ─────────────────────────────────────────────────────────────────────────────
// Geocodifica todas las colonias de Comitán que tienen coordenadas genéricas
// o coordenadas nulas, usando Google Maps Geocoding API.
//
// Uso: node geocodificar_colonias.js
// ─────────────────────────────────────────────────────────────────────────────

const https = require('https')

// ── Config ────────────────────────────────────────────────────────────────────
const GOOGLE_MAPS_KEY  = 'AIzaSyBOZkp595ze0Agwb7yPG5u7MD29EL9gHMw'
const SUPABASE_URL     = 'https://jdrrkpvodnqoljycixbg.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

// Coordenada genérica que usó el sistema cuando no encontró la colonia
const GENERIC_LAT = 16.2506
const GENERIC_LNG = -92.1374
const TOLERANCE   = 0.0002   // ~20m de margen

// Ciudad base para la geocodificación
const CIUDAD = 'Comitán de Domínguez, Chiapas, México'

// Delay entre llamadas a Google (para no exceder rate limit)
const DELAY_MS = 150

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

async function supabaseQuery(sql) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/exec_sql`
  // Usamos la Management API directa via fetch en Node
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql })
    const opts = {
      hostname: 'jdrrkpvodnqoljycixbg.supabase.co',
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      }
    }
    const req = https.request(opts, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function getColoniasToFix() {
  return new Promise((resolve, reject) => {
    const path = `/rest/v1/colonias?select=id,nombre,etiqueta_zona,precio,lat,lng&or=(lat.is.null,and(lat.gte.${GENERIC_LAT - TOLERANCE},lat.lte.${GENERIC_LAT + TOLERANCE},lng.gte.${GENERIC_LNG - TOLERANCE},lng.lte.${GENERIC_LNG + TOLERANCE}))&order=nombre`
    const opts = {
      hostname: 'jdrrkpvodnqoljycixbg.supabase.co',
      path,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      }
    }
    https.get({ ...opts }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch(e) { reject(e) }
      })
    }).on('error', reject)
  })
}

async function geocodificar(nombre) {
  const query = encodeURIComponent(`${nombre}, ${CIUDAD}`)
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${GOOGLE_MAPS_KEY}&language=es&region=MX`
  const res = await fetchJson(url)

  if (res.status !== 'OK' || !res.results?.length) {
    return null
  }

  const loc = res.results[0].geometry.location
  const isGeneric = Math.abs(loc.lat - GENERIC_LAT) < TOLERANCE && Math.abs(loc.lng - GENERIC_LNG) < TOLERANCE

  if (isGeneric) return null

  return { lat: loc.lat, lng: loc.lng, formatted: res.results[0].formatted_address }
}

async function updateColonia(id, lat, lng) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ lat, lng })
    const opts = {
      hostname: 'jdrrkpvodnqoljycixbg.supabase.co',
      path: `/rest/v1/colonias?id=eq.${id}`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Length': Buffer.byteLength(body),
        'Prefer': 'return=minimal',
      }
    }
    const req = https.request(opts, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => resolve(res.statusCode))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ Falta SUPABASE_SERVICE_KEY. Ejecútalo así:')
    console.error('   $env:SUPABASE_SERVICE_KEY="tu_service_role_key"; node geocodificar_colonias.js')
    process.exit(1)
  }

  console.log('🔍 Obteniendo colonias con coordenadas genéricas o nulas...')
  const colonias = await getColoniasToFix()

  if (!Array.isArray(colonias)) {
    console.error('❌ Error obteniendo colonias:', colonias)
    process.exit(1)
  }

  console.log(`📍 Colonias a geocodificar: ${colonias.length}\n`)

  let ok = 0, fail = 0, skip = 0
  const failedList = []

  for (const c of colonias) {
    process.stdout.write(`  [${ok+fail+skip+1}/${colonias.length}] ${c.nombre.padEnd(30)} → `)

    const geo = await geocodificar(c.nombre)

    if (!geo) {
      // Intentar con variante: "Colonia X, Comitán"
      await sleep(DELAY_MS)
      const geo2 = await geocodificar(`Colonia ${c.nombre}`)
      if (!geo2) {
        console.log(`❌ No encontrado`)
        fail++
        failedList.push(c.nombre)
        await sleep(DELAY_MS)
        continue
      }
      await updateColonia(c.id, geo2.lat, geo2.lng)
      console.log(`✅ ${geo2.lat.toFixed(4)}, ${geo2.lng.toFixed(4)}  (${geo2.formatted})`)
      ok++
      await sleep(DELAY_MS)
      continue
    }

    await updateColonia(c.id, geo.lat, geo.lng)
    console.log(`✅ ${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}  (${geo.formatted})`)
    ok++
    await sleep(DELAY_MS)
  }

  console.log('\n' + '═'.repeat(60))
  console.log(`✅ Geocodificadas: ${ok}`)
  console.log(`❌ No encontradas: ${fail}`)
  if (failedList.length) {
    console.log('\nColonias que necesitan coordenadas manuales:')
    failedList.forEach(n => console.log(`  • ${n}`))
  }
  console.log('═'.repeat(60))
}

main().catch(console.error)
