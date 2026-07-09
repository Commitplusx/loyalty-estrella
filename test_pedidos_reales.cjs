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
  { nombre: 'Taquería El Fogón (Belisario)', lat: 16.2559, lng: -92.1365 },
  { nombre: 'Pizzería Central (Belisario)', lat: 16.2600, lng: -92.1380 },
  { nombre: 'Sushi Roll (Plaza Belisario)', lat: 16.2480, lng: -92.1320 },
  { nombre: 'Café de la Ciudad', lat: 16.2450, lng: -92.1300 },
  { nombre: 'Burger King (Belisario)', lat: 16.2519, lng: -92.1345 },
  { nombre: 'Pollo Loco (Sur)', lat: 16.2420, lng: -92.1400 },
  { nombre: 'Antojitos Doña Mary', lat: 16.2620, lng: -92.1450 }
];

const destinosReales = [
  { dir: 'Barrio La Cruz Grande', lat: 16.2500, lng: -92.1450 },
  { dir: 'Barrio Candelaria', lat: 16.2580, lng: -92.1250 },
  { dir: 'Fracc. Fovisste (Casa Amarilla)', lat: 16.2400, lng: -92.1350 },
  { dir: 'Barrio Yalchivol (Portón Negro)', lat: 16.2460, lng: -92.1200 },
  { dir: 'Barrio Los Desamparados', lat: 16.2550, lng: -92.1480 },
  { dir: 'Centro Histórico (Edificio 3, Depto 2)', lat: 16.2650, lng: -92.1320 },
  { dir: 'Barrio San Sebastián', lat: 16.2380, lng: -92.1280 },
  { dir: 'Barrio Guadalupe', lat: 16.2420, lng: -92.1420 },
  { dir: 'Barrio Pilita Seca', lat: 16.2680, lng: -92.1450 },
  { dir: 'Colonia Mariano N. Ruiz', lat: 16.2620, lng: -92.1400 }
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

    pedidosTest.push({
      cliente_nombre: cliente,
      cliente_tel: `963${Math.floor(1000000 + Math.random() * 9000000)}`,
      direccion: dest.dir,
      estado: 'pendiente',
      tipo_pedido: 'domicilio',
      origen: 'web',
      total: Math.floor(150 + Math.random() * 400),
      precio_entrega: 45.50,
      lat: rest.lat,
      lng: rest.lng,
      lat_entrega: dest.lat,
      lng_entrega: dest.lng,
      descripcion: `📝 SIMULACIÓN SIMULTÁNEA - H3 Dist: ${distKm}km (${gridDist} celdas)`
    });
  }

  const insertados = [];

  // Lotes Simultáneos: Vamos a insertar en grupos de 3, para simular estrés de hora pico real
  const BATCH_SIZE = 3;
  for (let i = 0; i < pedidosTest.length; i += BATCH_SIZE) {
    const batch = pedidosTest.slice(i, i + BATCH_SIZE);
    
    console.log(`\n⏳ INYECTANDO LOTE SIMULTÁNEO DE ${batch.length} PEDIDOS...`);
    
    // Insertamos concurrentemente (Promise.all)
    const insertPromises = batch.map(async (p) => {
      const { data, error } = await supabase.from('pedidos').insert(p).select().single();
      if (error) {
        console.error("❌ Error insertando pedido:", error.message);
        return null;
      }
      return data;
    });

    const resultadosDB = await Promise.all(insertPromises);
    const pedidosExitosos = resultadosDB.filter(p => p !== null);

    // Llamamos a la Edge Function para cada uno (concurrentemente)
    const edgePromises = pedidosExitosos.map(async (data) => {
      insertados.push(data.id);
      console.log(`✅ Pedido ${data.cliente_nombre} (${data.descripcion}) creado en BD.`);
      
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
    });

    await Promise.all(edgePromises);
    
    // Esperamos 10 segundos entre cada lote para que los repartidores puedan reaccionar a la primera ráfaga
    if (i + BATCH_SIZE < pedidosTest.length) {
      console.log("\n⏸️  Pausa de 10 segundos antes del siguiente lote...");
      await new Promise(resolve => setTimeout(resolve, 10000));
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
