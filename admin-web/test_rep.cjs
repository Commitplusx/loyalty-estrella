const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://jdrrkpvodnqoljycixbg.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ');

async function check() {
  const { data } = await supabase.from('repartidores').select('id, user_id, nombre').eq('user_id', 'a93fd643-d72d-4e62-b46d-9f2924296ecc');
  console.log(JSON.stringify(data, null, 2));
}
check();
