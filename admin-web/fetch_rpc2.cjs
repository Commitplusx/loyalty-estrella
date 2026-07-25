const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://jdrrkpvodnqoljycixbg.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ');

async function getFunc() {
  const { data, error } = await supabase.rpc('buscar_repartidores_cercanos', {
    p_lat: 16.232, p_lng: -92.128, p_ofertas_rechazadas: []
  });
  console.log(error);
}
getFunc();
