import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
// WE USE ANON KEY THIS TIME!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  
  const { data, error } = await supabase.from('clientes').select('*').eq('telefono', '9631601852').single()

  return new Response(JSON.stringify({ data, error }, null, 2), { headers: { 'Content-Type': 'application/json' } })
})
