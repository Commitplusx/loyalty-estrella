import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || process.env.VITE_SUPABASE_URL,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || process.env.VITE_SUPABASE_ANON_KEY
)

async function test() {
  const { data, error } = await supabase.from('app_config').select('*').eq('id', 'default').maybeSingle();
  if (data) {
    const config = data.configuracion_precios || {};
    config.modo_lluvia = false;
    const { error: updErr } = await supabase.from('app_config').update({ configuracion_precios: config }).eq('id', 'default');
    console.log('Update error:', updErr);
    console.log('Modo lluvia apagado en app_config');
  } else {
    console.log('No default app_config found');
  }
}

test();
