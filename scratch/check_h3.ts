import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || process.env.VITE_SUPABASE_URL,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || process.env.VITE_SUPABASE_ANON_KEY
)

async function test() {
  const { data, error } = await supabase.from('h3_zonas').select('*').limit(1);
  console.log('Data:', data);
  console.log('Error:', error);
}

test();
