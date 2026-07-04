const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.+)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/);

if (!urlMatch || !keyMatch) {
  console.log('No supabase creds found');
  process.exit(1);
}

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
  console.log("Invoking notificar-whatsapp...");
  const { data, error } = await supabase.functions.invoke('notificar-whatsapp', {
    body: {
      tipo: 'nueva_orden_admin',
      ticket_id: 'TEST1234',
      restaurante: 'Test Restaurant',
      descripcion: 'This is a test order',
      tipo_entrega: 'domicilio'
    }
  });

  if (error) {
    console.error("Error invoking:", error);
  } else {
    console.log("Success:", data);
  }
}

run();
