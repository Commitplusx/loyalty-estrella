const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://jdrrkpvodnqoljycixbg.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ');

async function testAsignar() {
  console.log("Calling asignar_pedido_atomico with user_id...");
  const { data, error } = await supabase.rpc('asignar_pedido_atomico', {
    p_pedido_id: "0fe600bf-b071-42c7-a0bf-3dcea73ca747",
    p_repartidor_id: "a93fd643-d72d-4e62-b46d-9f2924296ecc" // Ana Karen's user_id
  });

  if (error) {
    console.error("ERROR:", error);
  } else {
    console.log("SUCCESS:", data);
  }
}

testAsignar();
