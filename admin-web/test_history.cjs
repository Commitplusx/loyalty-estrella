const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://jdrrkpvodnqoljycixbg.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ');

async function check() {
  const { data, error } = await supabase.from('pedidos_historial')
    .select('created_at, estado_anterior, estado_nuevo, pedido_id')
    .eq('pedido_id', '0fe600bf-b071-42c7-a0bf-3dcea73ca747')
    .order('created_at', { ascending: false });
  console.log(JSON.stringify(data, null, 2));
}
check();
