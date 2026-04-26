require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

// Use the exact keys from the .env file that the web app uses!
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const id = "fbac48b1-dba9-4a82-bd7e-35382bf77dd3";

async function main() {
  console.log("Checking...", supabaseUrl);
  
  const { data, error } = await supabase
    .from('pedidos')
    .select('*')
    .eq('id', id)
    .single();

  console.log("Error:", error);
  console.log("Data:", data);
}

main();
