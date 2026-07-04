import { load } from "https://deno.land/std@0.208.0/dotenv/mod.ts";
await load({ export: true, envPath: ".env" });
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

if (!supabaseUrl || !supabaseKey) {
  console.error("Faltan credenciales");
  Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Prueba de coordenada que asumo que es Centro
const { data, error } = await supabase.rpc('resolve_ubicacion_from_coords', { p_lat: 16.2514, p_lng: -92.1331 });
console.log("Resultado de 16.2514, -92.1331:", data, error);

// Y probemos Belisario
const { data: data2 } = await supabase.rpc('resolve_ubicacion_from_coords', { p_lat: 16.26, p_lng: -92.13 });
console.log("Resultado de 16.26, -92.13:", data2);
