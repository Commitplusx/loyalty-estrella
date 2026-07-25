const { createClient } = require('@supabase/supabase-js');
const h3 = require('h3-js');

const supabase = createClient(
  'https://jdrrkpvodnqoljycixbg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ'
);

// Generadores de Datos Realistas
const nombresMexicanos = [
  'Carlos Hernández', 'María García', 'Luis Pérez', 'Ana Martínez', 
  'Jorge López', 'Laura Gómez', 'Miguel Sánchez', 'Sofía Ramírez',
  'Alejandro Cruz', 'Diana Torres', 'Roberto Flores', 'Fernanda Rivera'
];

const restaurantesReales = [
  { nombre: 'Liverpool (Prueba)', lat: 16.216262514295245, lng: -92.11371672091971 }
];

const destinosReales = [
  { dir: 'Destino de Prueba Liverpool', lat: 16.247707223179393, lng: -92.14035224636748 }
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function lanzarPedidosDePrueba() {
  console.log("🚀 INICIANDO SIMULACIÓN DE PEDIDOS SIMULTÁNEOS (ANTI-AMONTONAMIENTO)\n");

  const pedidosTest = [];
  const TOTAL_PEDIDOS = 3;

  for (let i = 0; i < TOTAL_PEDIDOS; i++) {
    const rest = randomItem(restaurantesReales);
    const dest = randomItem(destinosReales);
    const cliente = randomItem(nombresMexicanos);

    // Calcular distancia H3 (Resolución 9: hexágonos de ~170 metros)
    const res = 9;
    const h3Origen = h3.latLngToCell(rest.lat, rest.lng, res);
    const h3Destino = h3.latLngToCell(dest.lat, dest.lng, res);
    
    // gridDistance nos da la distancia en "saltos de hexágonos"
    const gridDist = h3.gridDistance(h3Origen, h3Destino);
    // Aproximar distancia en KM (170m por hexágono aprox)
    const distKm = (gridDist * 0.174).toFixed(1);

    // ==========================================
    // Calcular costo de envío real usando H3 (Resolución 10)
    // Se toma el mayor entre la zona del restaurante y la zona del cliente
    // ==========================================
    const destHexIndex = h3.latLngToCell(dest.lat, dest.lng, 10);
    const origHexIndex = h3.latLngToCell(rest.lat, rest.lng, 10);
    let costoEnvioReal = 50.00; // fallback

    const { data: zonaDest } = await supabase.from('h3_zonas').select('precio').eq('h3_index', destHexIndex).maybeSingle();
    const { data: zonaOrig } = await supabase.from('h3_zonas').select('precio').eq('h3_index', origHexIndex).maybeSingle();

    const precioDest = zonaDest?.precio || 0;
    const precioOrig = zonaOrig?.precio || 0;

    if (precioDest > 0 || precioOrig > 0) {
      costoEnvioReal = Math.max(precioDest, precioOrig);
      console.log(`🤑 Zonas H3 Evaluadas -> Origen: $${precioOrig} | Destino: $${precioDest}`);
      console.log(`👉 Tarifa dinámica final aplicada: $${costoEnvioReal}`);
    } else {
      console.log(`⚠️ Zonas H3 NO Encontradas. Se usará tarifa base de $${costoEnvioReal}`);
    }

    pedidosTest.push({
      cliente_nombre: cliente,
      cliente_tel: `963${Math.floor(1000000 + Math.random() * 9000000)}`,
      direccion: dest.dir,
      estado: 'pendiente',
      tipo_pedido: 'domicilio',
      origen: 'web',
      total: Math.floor(150 + Math.random() * 400),
      lat_entrega: dest.lat,
      lng_entrega: dest.lng,
      lat: rest.lat,
      lng: rest.lng,
      precio_entrega: costoEnvioReal, // 👈 Tarifa calculada con H3
      metodo_pago: 'efectivo',
      restaurante_id: '00000000-0000-0000-0000-000000000000', // UUID falso para forzar validación segura
      descripcion: `[LIVERPOOL CLICK&COLLECT] 1x Tenis converse para niña ctas 1v hi. Mostrar No. Pedido: 2920113847 en módulo. (Dist: ${distKm}km, H3_Res10: ${destHexIndex})`
    });
  }

  const insertados = [];

  // Insertar secuencialmente con 5 segundos de diferencia
  console.log(`\n⏳ INYECTANDO ${pedidosTest.length} PEDIDOS (Uno cada 5 segundos)...`);
  
  for (let i = 0; i < pedidosTest.length; i++) {
    const p = pedidosTest[i];
    
    const { data, error } = await supabase.from('pedidos').insert(p).select().single();
    if (error) {
      console.error("❌ Error insertando pedido:", error.message);
      continue;
    }
    
    insertados.push(data.id);
    console.log(`✅ [${i + 1}/${pedidosTest.length}] Pedido ${data.cliente_nombre} creado en BD.`);
    
    try {
      const res = await fetch('https://jdrrkpvodnqoljycixbg.supabase.co/functions/v1/asignar-repartidor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ`
        },
        body: JSON.stringify({ id: data.id })
      });
      const jsonRes = await res.json();
      console.log(`📡 [Edge Function] Asignación para ${data.cliente_nombre}:`, jsonRes);
    } catch (e) {
      console.error("❌ Error llamando Edge Function:", e.message);
    }

    if (i < pedidosTest.length - 1) {
      console.log("⏸️  Esperando 5 segundos para el siguiente pedido...\n");
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log("\n=======================================================");
  console.log("📱 REVISA TUS TELÉFONOS. LLEGARON 3 PEDIDOS SIMULTÁNEOS");
  console.log("=======================================================\n");

  console.log("⏳ Tienes 3 MINUTOS para probar el sistema de Rebote, Bloqueos y Timeout...");
  await new Promise(resolve => setTimeout(resolve, 180000));

  console.log("🧹 Limpiando la base de datos (Borrando pedidos de prueba)...");
  for (const id of insertados) {
    await supabase.from('pedidos').delete().eq('id', id);
  }
  console.log("✅ Prueba finalizada y datos limpiados.");
}

lanzarPedidosDePrueba();
