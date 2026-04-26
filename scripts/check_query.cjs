require('dotenv').config({ path: '../../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const id = "fbac48b1-dba9-4a82-bd7e-35382bf77dd3";

async function main() {
  console.log("Checking...", supabaseUrl);
  const { data, error } = await supabase
    .from('pedidos')
    .select('*, restaurante_data:restaurantes(nombre, lat, lng)')
    .eq('id', id)
    .single();

  console.log("Error:", error);
  console.log("Data:", !!data);
}

main();
