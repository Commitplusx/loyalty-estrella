import { load } from 'https://deno.land/std@0.208.0/dotenv/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const envText = new TextDecoder().decode(Deno.readFileSync('.env'));
const supabaseUrl = envText.match(/SUPABASE_URL=([^\r\n]+)/)?.[1]?.trim() || envText.match(/VITE_SUPABASE_URL=([^\r\n]+)/)?.[1]?.trim();
const supabaseKey = envText.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)?.[1]?.trim() || envText.match(/VITE_SUPABASE_ANON_KEY=([^\r\n]+)/)?.[1]?.trim();
const supabase = createClient(supabaseUrl, supabaseKey);

const sql = `
CREATE OR REPLACE FUNCTION public.resolve_ubicacion_from_coords(
  p_lat double precision,
  p_lng double precision
)
RETURNS TABLE(
  colonia_id     uuid,
  colonia_nombre text,
  precio         integer,
  lat            double precision,
  lng            double precision,
  fuente         text
)
LANGUAGE plpgsql AS $$
DECLARE
  v_point    geometry;
  v_colonia  RECORD;
  v_zona_kml RECORD;
  v_precio   integer;
BEGIN
  v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

  -- A) Colonia cuyo polígono contiene el punto (exacto)
  SELECT c.id, c.nombre, c.precio, c.lat, c.lng INTO v_colonia
  FROM public.colonias c
  WHERE c.geom IS NOT NULL AND ST_Contains(c.geom, v_point)
  LIMIT 1;

  -- B) Si no hay polígono, colonia más cercana por centroide (hasta 500m)
  IF NOT FOUND THEN
    SELECT c.id, c.nombre, c.precio, c.lat, c.lng INTO v_colonia
    FROM public.colonias c
    WHERE ST_DWithin(
      ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
      v_point::geography, 500
    )
    ORDER BY ST_Distance(
      ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
      v_point::geography
    )
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN RETURN; END IF;

  -- C) Regla de Oro: ¿hay overlay de tarifa especial que cubra el punto?
  SELECT z.precio INTO v_zona_kml
  FROM public.zonas_kml z
  WHERE z.activo = true AND ST_Contains(z.geom, v_point)
  ORDER BY z.precio DESC  -- si se traslapan, la más cara gana
  LIMIT 1;

  v_precio := CASE WHEN v_zona_kml IS NOT NULL
    THEN v_zona_kml.precio
    ELSE COALESCE(v_colonia.precio, 45)
  END;

  RETURN QUERY SELECT
    v_colonia.id, v_colonia.nombre::text, v_precio,
    v_colonia.lat, v_colonia.lng,
    (CASE WHEN v_zona_kml IS NOT NULL THEN 'zona_especial' ELSE 'colonia_base' END)::text;
END;
$$;
`;

const { data, error } = await supabase.rpc('run_sql', { sql: sql });
console.log("EXECUTE SQL DATA:", data, "ERROR:", error);
