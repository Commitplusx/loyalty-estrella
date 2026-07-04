import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://jdrrkpvodnqoljycixbg.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function check() {
  console.log("Haciendo select a pedidos...")
  const { data, error } = await supabase.from('pedidos').select('*').limit(1)
  if (error) {
    console.error("Error:", error)
  } else if (data && data.length > 0) {
    console.log("Columnas actuales en 'pedidos':")
    console.log(Object.keys(data[0]))
  } else {
    console.log("La tabla pedidos está vacía, no puedo inferir las columnas por un registro.")
    // Intento forzar un error para ver si el esquema nos devuelve las columnas válidas
    const { error: insertError } = await supabase.from('pedidos').insert({ id: -1, campo_falso: 123 })
    console.log("Insert Error details:", insertError)
  }
}

check()
