const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'supabase/functions/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase.from('pedidos')
    .select('id, descripcion, repartidor_id, estado, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(3);
  
  console.log(JSON.stringify(data, null, 2));
}

run();
