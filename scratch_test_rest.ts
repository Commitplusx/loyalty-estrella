import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import 'https://deno.land/std@0.167.0/dotenv/load.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.from('restaurantes').select('*');
  if (error) {
    console.error('Error fetching restaurants:', error);
  } else {
    console.log('Restaurants:');
    data.forEach(r => console.log(`- ${r.nombre}: ${r.telefono} (activo: ${r.activo})`));
  }
}

main();
