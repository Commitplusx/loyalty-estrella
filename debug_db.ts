import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://jdrrkpvodnqoljycixbg.supabase.co'
const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '') // Assuming local env has something

// No need for env if public table
async function foo() { 
   const {data, error} = await supabase.from('restaurantes').select('nombre, telefono, activo')
   console.log("RESTAURANTES DB:", data)
}
foo()
