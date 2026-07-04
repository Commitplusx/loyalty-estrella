import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function checkPoligonos() {
  console.log('Consultando vw_poligonos...');
  const { data, error } = await supabase
    .from('vw_poligonos')
    .select('id, nombre, tipo, geojson')
    .limit(3);

  if (error) {
    console.error('Error al consultar vw_poligonos:', error.message);
  } else {
    console.log('✅ Vista vw_poligonos conectada correctamente.');
    console.log(`Se encontraron ${data?.length} polígonos.`);
    if (data && data.length > 0) {
      console.log('Ejemplo 1:', data[0].nombre, 'Tipo:', data[0].tipo);
      console.log('GeoJSON existe?', !!data[0].geojson);
    }
  }
}

checkPoligonos();
