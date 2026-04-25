const fs = require('fs');

// Leer el CSV generado anteriormente
const csvText = fs.readFileSync('C:\\Users\\asus_\\Desktop\\loyalty-estrella\\colonias_verificadas.csv', 'utf-8');
const lines = csvText.trim().split('\n');
const headers = lines[0].split(',');

const registros = lines.slice(1).map(line => {
  // Parsear CSV con comillas
  const cols = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { cols.push(current.trim()); current = ''; }
    else { current += char; }
  }
  cols.push(current.trim());

  return {
    nombre: cols[0] || '',
    lat: cols[1] || '',
    lng: cols[2] || '',
    distanciaKm: cols[3] || '',
    precio: cols[4] || '',
    coloniaGoogle: cols[5] || '',
    municipio: cols[6] || '',
    estado: cols[7] || '',
  };
});

// Separar por grupos
const correctas    = registros.filter(r => r.estado.includes('OK'));
const sospechosas  = registros.filter(r => r.estado.includes('SOSPECHOSA'));
const fuera        = registros.filter(r => r.estado.includes('FUERA'));

// También incluir las genéricas del CSV (si existen) - pueden no estar
const genericas    = registros.filter(r => r.estado.includes('GENERICA') || (!r.lat && !r.lng));

function separarLinea() {
  return '─'.repeat(110) + '\n';
}

function encabezado(titulo, cantidad) {
  return `\n${'═'.repeat(110)}\n  ${titulo.toUpperCase()}  (${cantidad} colonias)\n${'═'.repeat(110)}\n`;
}

function filaColonia(r, i) {
  const num     = String(i + 1).padStart(3, ' ');
  const nombre  = r.nombre.padEnd(35, ' ');
  
  // Juntar latitud y longitud en una sola cadena lista para copiar (ej: 16.123, -92.123)
  let coords    = "";
  if (r.lat && r.lng) {
    coords = `${r.lat}, ${r.lng}`;
  }
  coords = coords.padEnd(25, ' ');
  
  const dist    = `${r.distanciaKm} km`.padEnd(9, ' ');
  const precio  = `$${r.precio}`.padEnd(6, ' ');
  const google  = (r.coloniaGoogle || 'N/A').padEnd(30, ' ');
  const mpio    = (r.municipio || 'N/A');
  return `${num}. ${nombre}  [ ${coords} ]   ${dist}  ${precio}  Google: ${google}  (${mpio})\n`;
}

let reporte = '';

reporte += '📋 REPORTE DE DEPURACIÓN DE COORDENADAS - COLONIAS COMITÁN\n';
reporte += `   Generado: ${new Date().toLocaleString('es-MX')}\n\n`;
reporte += `   RESUMEN:\n`;
reporte += `   ✅ Correctas:          ${correctas.length} colonias\n`;
reporte += `   ⚠️  Sospechosas:        ${sospechosas.length} colonias\n`;
reporte += `   ❌ Fuera de Comitán:   ${fuera.length} colonias\n`;
reporte += `   🟣 Genéricas/Sin GPS:  18 colonias (ver mapa Flutter)\n`;
reporte += '\n';
reporte += '   COLUMNAS: #  NOMBRE                               [ COORDENADA COMPLETA ]     DISTANCIA  PRECIO  COLONIA_GOOGLE\n';

// ── GRUPO 1: Correctas ─────────────────────────────
reporte += encabezado('✅ CORRECTAS - En Comitán y nombre coincide', correctas.length);
reporte += separarLinea();
correctas.forEach((r, i) => { reporte += filaColonia(r, i); });

// ── GRUPO 2: Sospechosas ──────────────────────────
reporte += encabezado('⚠️  SOSPECHOSAS - En Comitán pero nombre diferente al de Google', sospechosas.length);
reporte += '   NOTA: Estas pueden estar bien. Google no siempre conoce los nombres de fraccionamientos nuevos.\n';
reporte += '         Revisa las que tengan distancias que NO correspondan a donde queda esa colonia.\n';
reporte += separarLinea();
sospechosas.forEach((r, i) => { reporte += filaColonia(r, i); });

// ── GRUPO 3: Fuera de Comitán ─────────────────────
reporte += encabezado('❌ FUERA DE COMITÁN - Coordenadas claramente equivocadas', fuera.length);
reporte += '   ACCIÓN REQUERIDA: Estas colonias necesitan que muevas su pin en el mapa de tu app de Flutter,\n';
reporte += '                    O bien, son comunidades rurales que no hacen entrega (marcar como no disponible).\n';
reporte += separarLinea();
fuera.forEach((r, i) => { reporte += filaColonia(r, i); });

fs.writeFileSync(
  'C:\\Users\\asus_\\Desktop\\loyalty-estrella\\colonias_reporte_depuracion.txt',
  reporte,
  'utf-8'
);

console.log('✅ Reporte organizado generado: colonias_reporte_depuracion.txt');
console.log(`   ✅ Correctas:        ${correctas.length}`);
console.log(`   ⚠️  Sospechosas:      ${sospechosas.length}`);
console.log(`   ❌ Fuera de Comitán: ${fuera.length}`);
