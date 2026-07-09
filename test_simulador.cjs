const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://jdrrkpvodnqoljycixbg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ'
);

async function simular() {
  console.log("========================================");
  console.log("🧪 INICIANDO SIMULADOR DE ALGORITMO ETA Y BATCHING");
  console.log("========================================\n");

  // 1. Simular ETA Dinámico
  console.log("⏱️  Probando ETA Dinámico...");
  const { data: etaData, error: etaError } = await supabase.rpc('calcular_eta_dinamico');
  if (etaError) console.error("Error ETA:", etaError);
  else console.log(`👉 Resultado ETA de la red actual: ${etaData}`);
  console.log("\n----------------------------------------\n");

  // 2. Probar Asignación (Batching)
  console.log("🛵 Evaluando Candidatos (Inteligencia Espacial)...");
  
  // Usamos coordenadas simuladas (Ej: Centro de la ciudad)
  // Restaurante (Origen)
  const restLat = 16.2519; 
  const restLng = -92.1345;

  // Cliente 1 (Norte)
  const clienteNorteLat = 16.2650;
  const clienteNorteLng = -92.1300;

  // Cliente 2 (Sur)
  const clienteSurLat = 16.2300;
  const clienteSurLng = -92.1400;

  console.log(`📍 Restaurante Origen: ${restLat}, ${restLng}`);
  console.log(`📍 Destino Simulado (Norte): ${clienteNorteLat}, ${clienteNorteLng}\n`);

  const { data: driversNorte, error: rpcError } = await supabase.rpc('buscar_repartidores_cercanos', {
    p_lat: restLat,
    p_lng: restLng,
    p_radio_metros: 10000,
    p_cliente_lat: clienteNorteLat,
    p_cliente_lng: clienteNorteLng
  });

  if (rpcError) {
    console.error("Error RPC:", rpcError);
  } else if (!driversNorte || driversNorte.length === 0) {
    console.log("⚠️ No se encontraron repartidores conectados o con batería.");
  } else {
    console.log(`✅ Se evaluaron ${driversNorte.length} candidatos:`);
    driversNorte.forEach((d, i) => {
      console.log(`   [${i+1}] Repartidor: ${d.repartidor_id.substring(0, 5)}...`);
      console.log(`       - Score (Puntaje Menor es Mejor): ${d.score.toFixed(2)}`);
      console.log(`       - Distancia al restaurante: ${(d.distancia_metros/1000).toFixed(2)} km`);
      console.log(`       - Carga de Trabajo: ${d.meta_envios} entregas históricas`);
      console.log(`       - 📦 ¿Es viaje apilado?: ${d.viaje_apilado ? 'SÍ (Cumplió criterio espacial de 2.5km)' : 'NO (Libre o primer viaje)'}`);
      console.log("");
    });
  }

  console.log("----------------------------------------");
  console.log("Simulación finalizada de forma segura. Ningún repartidor recibió alertas.");
}

simular();
