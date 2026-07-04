import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const supabaseUrl = Deno.env.get('VITE_SUPABASE_URL')
const supabaseKey = Deno.env.get('VITE_SUPABASE_ANON_KEY')
const supabase = createClient(supabaseUrl, supabaseKey)
async function run() {
  const { data, error } = await supabase.from('pedidos').insert({
    cliente_tel: '9999999999',
    descripcion: 'test',
    estado: 'pendiente_pago',
    wb_message_id: 'testticket'
  }).select()
  console.log('DATA:', data)
  console.log('ERROR:', error)
}
run()
