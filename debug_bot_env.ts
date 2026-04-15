import { createClient } from '@supabase/supabase-js'

// Simular el entorno de Edge Function
const WA_TOKEN = 'EAAhR4GDYGKEBRNoUp3xvQ8kxjbiZChVVeA0M2EkjuiHsSt50ZC1efDJiE5TdBQTJqT1PtC32EiS4f0jX6ZB3ZBGcE3UXc4RmhQlJK6QRkLtWvSGqgyS1XRWeMK5P54SyifaEhKlfcVGIMigcQQjZBbh2FKspTMw9Ne42a7rs4L4G9N89TiGtjtOtpEwGWQQZDZD'
// Opcional, pero para debug lo leemos directo del env (o puedes hardcodear tu Supabase URL/Key)
import { config } from 'dotenv'
config({ path: '.env' }) // Asume que tienes supabase en .env local o ponlos estáticos

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://jdrrkpvodnqoljycixbg.supabase.co'
const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY || '') // Usa el admin key o anon! Wait, necesitamos el SERVICE_KEY para el bot

async function testWA() {
  try {
    // Para ver si la función sendWA() falla
    const to = '529631371902' // O un número al que se envió para testar, por ejemplo el de yoko
    const WA_PHONE_ID = '391060937428172' // Espera, ¿tengo el WA_PHONE_ID? Lo ignoraremos, solo veremos si el supabase endpoint sirve
    console.log("Testeando conexión con Supabase...")
    
    // Obtener las funciones que el bot llama al inicio para ver si crashean (ej. restaurantes)
    const { data: isRep, error: repErr } = await supabase.from('repartidores').select('id').ilike('telefono', '%9631371902%').maybeSingle()
    console.log('Test Repartidores:', isRep, repErr)

    const { data: cliente, error: cliErr } = await supabase.from('clientes').select('nombre').ilike('telefono', '%9631371902%').maybeSingle()
    console.log('Test Clientes:', cliente, cliErr)

  } catch(e) {
    console.error("DEBUG ERROR:", e)
  }
}

testWA()
