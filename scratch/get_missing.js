const url = "https://jdrrkpvodnqoljycixbg.supabase.co"
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ"

async function run() {
  const zonasRes = await fetch(`${url}/rest/v1/zonas_gps?select=id,nombre`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  const zonasText = await zonasRes.text()
  console.log("Zonas Response:", zonasText)
  const zonas = JSON.parse(zonasText)

  const tarifasRes = await fetch(`${url}/rest/v1/zonas_tarifas?select=origen_zona_id,destino_zona_id`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  const tarifas = await tarifasRes.json()

  const missing = []
  for (const o of zonas) {
    for (const d of zonas) {
      if (!tarifas.find(t => t.origen_zona_id === o.id && t.destino_zona_id === d.id)) {
        missing.push(`${o.nombre} -> ${d.nombre}`)
      }
    }
  }

  console.log(`Faltan ${missing.length} rutas.`)
  missing.slice(0, 10).forEach(m => console.log(m))
}
run()
