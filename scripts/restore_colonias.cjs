const fs = require('fs');
const https = require('https');

const SUPABASE_URL = 'https://jdrrkpvodnqoljycixbg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

function parseCsv(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',');
  const results = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    // Regex para parsear CSV respetando comillas si existieran
    const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    
    // CSV original: id,nombre,etiqueta_zona,precio,lat,lng
    results.push({
      id: values[0],
      lat: values[4] === 'NULL' || !values[4] ? null : parseFloat(values[4]),
      lng: values[5] === 'NULL' || !values[5] ? null : parseFloat(values[5]),
    });
  }
  return results;
}

async function updateColonia(id, lat, lng) {
  return new Promise((resolve, reject) => {
    // Si lat o lng son null, mandamos null
    const bodyObj = {};
    if (lat === null || isNaN(lat)) bodyObj.lat = null; else bodyObj.lat = lat;
    if (lng === null || isNaN(lng)) bodyObj.lng = null; else bodyObj.lng = lng;

    const body = JSON.stringify(bodyObj);
    const opts = {
      hostname: 'jdrrkpvodnqoljycixbg.supabase.co',
      path: `/rest/v1/colonias?id=eq.${encodeURIComponent(id)}`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Length': Buffer.byteLength(body),
        'Prefer': 'return=minimal',
      }
    };
    
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ Falta SUPABASE_SERVICE_KEY.');
    process.exit(1);
  }

  const buffer = fs.readFileSync('C:\\Users\\asus_\\Desktop\\loyalty-estrella\\colonias_coordenadas.csv');
  let csvText = buffer.toString('utf16le');
  // Remover caracter nulo o BOM si existe al principio
  if (csvText.charCodeAt(0) === 0xFEFF || csvText.charCodeAt(0) === 0xFFFE) {
    csvText = csvText.substring(1);
  }
  const records = parseCsv(csvText);
  
  console.log(`🔍 Se encontraron ${records.length} registros en el respaldo.`);
  
  let ok = 0;
  for (const r of records) {
    const status = await updateColonia(r.id, r.lat, r.lng);
    if (status === 204 || status === 200) {
      ok++;
    } else {
      console.log(`❌ Error al actualizar ${r.id} (status ${status})`);
    }
  }
  
  console.log(`✅ Restauradas: ${ok} de ${records.length}`);
}

main().catch(console.error);
