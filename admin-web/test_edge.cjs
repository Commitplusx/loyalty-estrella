const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://jdrrkpvodnqoljycixbg.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ');

async function testEdgeFunc() {
  console.log("Calling Edge Function asignar-repartidor...");
  
  // We mock a webhook payload that Supabase would send
  const payload = {
    type: "UPDATE",
    table: "pedidos",
    record: {
      id: "0fe600bf-b071-42c7-a0bf-3dcea73ca747",
      lat: 16.232568,
      lng: -92.128555,
      estado: "buscando_repartidor",
      restaurante: "Pollo Robin's",
      ofertas_rechazadas: []
    },
    old_record: {
      estado: "pendiente"
    }
  };

  try {
    const { data, error } = await supabase.functions.invoke('asignar-repartidor', {
      body: payload
    });

    if (error) {
      console.error("EDGE FUNCTION ERROR:", error);
    } else {
      console.log("EDGE FUNCTION SUCCESS:", data);
    }
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}

testEdgeFunc();
