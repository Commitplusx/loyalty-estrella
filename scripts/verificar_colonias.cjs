const https = require('https');
const fs = require('fs');

const GOOGLE_API_KEY = 'AIzaSyDp7UhOKBinnaUo82W5tafA-QMSN1wFHB4';
const SUPABASE_URL = 'jdrrkpvodnqoljycixbg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTA0OTI5MSwiZXhwIjoyMDkwNjI1MjkxfQ.tHMBk8RqW_bi5h2ynU9TLoAqHCWx84PFZZgJ2GTvH1o';

// Coordenada central de Comitan (considerada "generica")
const CENTRO_LAT = 16.2514;
const CENTRO_LNG = -92.1345;
const RESTAURANTE_LAT = 16.2506; // Cambia esto si tienes la coord real del resto
const RESTAURANTE_LNG = -92.1374;

// Distancia Haversine en km
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function precioDeDistancia(km) {
  if (km <= 2) return 45;
  if (km <= 4) return 50;
  if (km <= 6) return 60;
  return 70;
}

function reverseGeocode(lat, lng) {
  return new Promise((resolve) => {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=es&region=mx&key=${GOOGLE_API_KEY}`;
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.results && json.results.length > 0) {
            // Extraer colonia/barrio del resultado
            const components = json.results[0].address_components;
            const colonia = components.find(c => c.types.includes('sublocality') || c.types.includes('neighborhood'));
            const municipio = components.find(c => c.types.includes('locality'));
            resolve({
              direccionCompleta: json.results[0].formatted_address,
              coloniaDetectada: colonia ? colonia.long_name : null,
              municipio: municipio ? municipio.long_name : null,
            });
          } else {
            resolve({ direccionCompleta: 'Sin resultado', coloniaDetectada: null, municipio: null });
          }
        } catch(e) {
          resolve({ direccionCompleta: 'Error', coloniaDetectada: null, municipio: null });
        }
      });
    });
    req.on('error', () => resolve({ direccionCompleta: 'Error de red', coloniaDetectada: null, municipio: null }));
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchColonias() {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: SUPABASE_URL,
      path: '/rest/v1/colonias?select=id,nombre,lat,lng&order=nombre',
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('📡 Descargando colonias desde Supabase...');
  const colonias = await fetchColonias();
  
  const conCoordenadas = colonias.filter(c => c.lat !== null && c.lng !== null);
  const sinCoordenadas = colonias.filter(c => c.lat === null || c.lng === null);
  const genericas = conCoordenadas.filter(c => {
    return Math.abs(c.lat - CENTRO_LAT) < 0.005 && Math.abs(c.lng - CENTRO_LNG) < 0.005;
  });
  const buenas = conCoordenadas.filter(c => {
    return !(Math.abs(c.lat - CENTRO_LAT) < 0.005 && Math.abs(c.lng - CENTRO_LNG) < 0.005);
  });

  console.log(`\n📊 RESUMEN INICIAL:`);
  console.log(`   Total de colonias: ${colonias.length}`);
  console.log(`   🟢 Con coordenadas válidas: ${buenas.length}`);
  console.log(`   🟣 Genéricas (centro de Comitán): ${genericas.length}`);
  console.log(`   ❌ Sin coordenadas: ${sinCoordenadas.length}`);
  console.log(`\n🔍 Verificando ${buenas.length} colonias con Google Maps Reverse Geocoding...`);
  console.log(`   (Procesando con delay para respetar límites de API)\n`);

  const resultados = [];
  let errores = 0;
  let correctas = 0;
  let sospechosas = 0;

  for (let i = 0; i < buenas.length; i++) {
    const c = buenas[i];
    const km = haversine(RESTAURANTE_LAT, RESTAURANTE_LNG, c.lat, c.lng);
    const precio = precioDeDistancia(km);
    
    const geo = await reverseGeocode(c.lat, c.lng);
    
    // Verificar si la colonia detectada coincide con el nombre esperado
    const nombreNorm = c.nombre.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const detectadaNorm = geo.coloniaDetectada ? geo.coloniaDetectada.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : '';
    
    const coincide = detectadaNorm && nombreNorm.split(' ').some(word => word.length > 3 && detectadaNorm.includes(word));
    const enComitan = geo.municipio && geo.municipio.toLowerCase().includes('comit');
    
    let estado = '';
    if (!enComitan) {
      estado = '❌ FUERA_DE_COMITAN';
      errores++;
    } else if (!coincide) {
      estado = '⚠️  SOSPECHOSA';
      sospechosas++;
    } else {
      estado = '✅ OK';
      correctas++;
    }

    const resultado = {
      nombre: c.nombre,
      lat: c.lat,
      lng: c.lng,
      distanciaKm: km.toFixed(2),
      precioCalculado: precio,
      coloniaDetectadaPorGoogle: geo.coloniaDetectada || 'N/A',
      municipio: geo.municipio || 'N/A',
      estado,
    };

    resultados.push(resultado);
    
    if (estado !== '✅ OK') {
      console.log(`${estado} | ${c.nombre.padEnd(35)} | Google dice: ${geo.coloniaDetectada || 'N/A'} (${geo.municipio || '?'}) | ${km.toFixed(1)}km → $${precio}`);
    }

    if ((i + 1) % 10 === 0) {
      process.stdout.write(`   Procesadas: ${i + 1}/${buenas.length}...\r`);
    }

    await sleep(150); // Respetar límite de 7 req/s de Google
  }

  // Escribir CSV completo
  const csvHeader = 'Nombre,Latitud,Longitud,Distancia_KM,Precio_Calculado,Colonia_Detectada_Google,Municipio,Estado\n';
  const csvRows = resultados.map(r => 
    `"${r.nombre}",${r.lat},${r.lng},${r.distanciaKm},${r.precioCalculado},"${r.coloniaDetectadaPorGoogle}","${r.municipio}","${r.estado}"`
  ).join('\n');
  
  fs.writeFileSync('C:\\Users\\asus_\\Desktop\\loyalty-estrella\\colonias_verificadas.csv', csvHeader + csvRows, 'utf-8');

  // Reporte final
  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`📋 REPORTE FINAL DE VERIFICACIÓN`);
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Correctas y en Comitán:   ${correctas} colonias`);
  console.log(`⚠️  Sospechosas (nombre no coincide): ${sospechosas} colonias`);
  console.log(`❌ Fuera de Comitán/Error:   ${errores} colonias`);
  console.log(`🟣 Genéricas (sin ubicar):   ${genericas.length} colonias`);
  console.log(`\n📁 Reporte completo guardado en: colonias_verificadas.csv`);
  console.log(`   Abre ese CSV para ver cada colonia con su precio calculado y su ubicación real según Google.`);
}

main().catch(console.error);
