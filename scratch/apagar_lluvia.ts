import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || process.env.VITE_SUPABASE_URL,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || process.env.VITE_SUPABASE_ANON_KEY
)

async function test() {
  const { data, error } = await supabase.from('configuraciones_globales').select('*').limit(1);
  if (data && data.length > 0) {
    const config = data[0].configuracion_precios || {};
    config.modo_lluvia = false;
    const { error: updErr } = await supabase.from('configuraciones_globales').update({ configuracion_precios: config }).eq('id', data[0].id);
    console.log('Update error:', updErr);
  }
  console.log('Done');
}

test();
