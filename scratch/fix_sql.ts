import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || process.env.VITE_SUPABASE_URL,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || process.env.VITE_SUPABASE_ANON_KEY
)

const sql = `
CREATE OR REPLACE FUNCTION public.calcular_precio_mandadito(
  p_lat_origen  double precision,
  p_lng_origen  double precision,
  p_lat_destino double precision,
  p_lng_destino double precision
)
RETURNS TABLE(
  precio         integer,
  distancia_km   numeric,
  colonia_origen text,
  colonia_destino text
)
LANGUAGE plpgsql AS $$
DECLARE
  v_distancia_km double precision;
  v_precio       integer;
  v_col_orig     text := 'Origen';
  v_col_dest     text := 'Destino';
  v_r            RECORD;
BEGIN
  -- Distancia entre origen y destino (punto a punto real del mandadito)
  v_distancia_km := ST_Distance(
    ST_SetSRID(ST_MakePoint(p_lng_origen,  p_lat_origen),  4326)::geography,
    ST_SetSRID(ST_MakePoint(p_lng_destino, p_lat_destino), 4326)::geography
  ) / 1000.0;

  -- Fórmula base: 38 + 7 por km extra
  v_precio := GREATEST(
    45,
    (ROUND((38.0 + v_distancia_km * 7.0) / 5.0) * 5)::integer
  );

  -- Nombre de colonia origen (solo display)
  SELECT c.nombre INTO v_r
  FROM public.colonias c
  WHERE ST_DWithin(
    ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint(p_lng_origen, p_lat_origen), 4326)::geography, 800
  )
  ORDER BY ST_Distance(
    ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint(p_lng_origen, p_lat_origen), 4326)::geography
  ) LIMIT 1;
  IF FOUND THEN v_col_orig := v_r.nombre; END IF;

  -- Nombre de colonia destino (solo display)
  SELECT c.nombre INTO v_r
  FROM public.colonias c
  WHERE ST_DWithin(
    ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint(p_lng_destino, p_lat_destino), 4326)::geography, 800
  )
  ORDER BY ST_Distance(
    ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint(p_lng_destino, p_lat_destino), 4326)::geography
  ) LIMIT 1;
  IF FOUND THEN v_col_dest := v_r.nombre; END IF;

  RETURN QUERY SELECT
    v_precio,
    ROUND(v_distancia_km::numeric, 2),
    v_col_orig,
    v_col_dest;
END;
$$;
`

async function run() {
  // Supabase RPC execute_sql usually isn't there unless we made it.
  // Instead of execute_sql, I'll just change the TS fallback in mandadito-handler to be robust and explain to the user.
}
run()
