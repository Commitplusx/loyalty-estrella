-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260613_precio_por_km.sql
-- CAMBIA el cálculo de precio de POLÍGONOS a KILÓMETROS desde un punto fijo.
-- La lógica de polígonos queda COMENTADA (no borrada) para reactivar si se necesita.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── Punto de origen fijo (desde donde salen los repartidores) ───────────────
-- 16°14'50.3"N  92°07'43.2"W  →  16.247306, -92.128667
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Fórmula de precio por km ────────────────────────────────────────────────
-- precio = MAX(45, ROUND((38 + km × 7) / 5) × 5)
-- Ejemplos:
--   0.8 km  → $45   (mínimo, zona central)
--   1.5 km  → $50
--   2.5 km  → $55   (salida Margarita aprox)
--   3.5 km  → $65   (Plaza, zona alejada)
--   4.5 km  → $70
--   5.0 km  → $75
--   6.0 km  → $80
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. DROP para poder reemplazar la firma de la función si cambió ───────────────
DROP FUNCTION IF EXISTS public.resolve_ubicacion_from_coords(double precision, double precision);

-- 2. Nueva función: precio por kilómetro ──────────────────────────────────────
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
  -- ── Punto de origen (sede / centro de despacho) ──
  v_origen_lat   double precision := 16.247306;
  v_origen_lng   double precision := -92.128667;

  v_point        geometry;
  v_origen_point geometry;
  v_distancia_km double precision;
  v_precio       integer;
  v_colonia      RECORD;
BEGIN
  v_point        := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);
  v_origen_point := ST_SetSRID(ST_MakePoint(v_origen_lng, v_origen_lat), 4326);

  -- ── Distancia en kilómetros (línea recta, Haversine via PostGIS geography) ──
  v_distancia_km := ST_Distance(
    v_point::geography,
    v_origen_point::geography
  ) / 1000.0;

  -- ── Fórmula: MAX(45, ROUND((38 + km × 7) / 5) × 5) ──
  v_precio := GREATEST(
    45,
    (ROUND((38.0 + v_distancia_km * 7.0) / 5.0) * 5)::integer
  );

  -- ── Intentar obtener el nombre de la colonia más cercana (solo para mostrar al cliente) ──
  SELECT c.id, c.nombre, c.lat, c.lng INTO v_colonia
  FROM public.colonias c
  WHERE ST_DWithin(
    ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
    v_point::geography,
    800  -- buscar en radio de 800m
  )
  ORDER BY ST_Distance(
    ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
    v_point::geography
  )
  LIMIT 1;

  RETURN QUERY SELECT
    v_colonia.id,
    COALESCE(v_colonia.nombre, 'Comitán')::text,
    v_precio,
    COALESCE(v_colonia.lat, p_lat),
    COALESCE(v_colonia.lng, p_lng),
    ('precio_km:' || ROUND(v_distancia_km::numeric, 2)::text)::text;

  -- ══════════════════════════════════════════════════════════════════════════
  -- LÓGICA ANTERIOR (POLÍGONOS) — DESACTIVADA, NO BORRAR
  -- ══════════════════════════════════════════════════════════════════════════
  /*
  DECLARE
    v_zona_kml RECORD;
  BEGIN
    v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

    -- A) Colonia más pequeña que contiene el punto
    SELECT c.id, c.nombre, c.precio, c.lat, c.lng, ST_Area(c.geom) as area INTO v_colonia
    FROM public.colonias c
    WHERE c.geom IS NOT NULL AND ST_Contains(c.geom, v_point)
    ORDER BY ST_Area(c.geom) ASC
    LIMIT 1;

    -- B) Zona KML más pequeña que contiene el punto
    SELECT z.id, z.nombre, z.precio, ST_Area(z.geom) as area INTO v_zona_kml
    FROM public.zonas_kml z
    WHERE z.activo = true AND ST_Contains(z.geom, v_point)
    ORDER BY ST_Area(z.geom) ASC
    LIMIT 1;

    -- C) Gana el polígono más pequeño (más específico)
    IF v_colonia.id IS NOT NULL AND v_zona_kml.id IS NOT NULL THEN
      IF v_zona_kml.area < v_colonia.area THEN
        RETURN QUERY SELECT v_colonia.id, v_colonia.nombre, v_zona_kml.precio,
          v_colonia.lat, v_colonia.lng, 'zona_especial'::text;
      ELSE
        RETURN QUERY SELECT v_colonia.id, v_colonia.nombre, v_colonia.precio,
          v_colonia.lat, v_colonia.lng, 'colonia_base'::text;
      END IF;
      RETURN;
    ELSIF v_zona_kml.id IS NOT NULL THEN
      RETURN QUERY SELECT NULL::uuid, v_zona_kml.nombre, v_zona_kml.precio,
        p_lat, p_lng, 'zona_especial'::text;
      RETURN;
    ELSIF v_colonia.id IS NOT NULL THEN
      RETURN QUERY SELECT v_colonia.id, v_colonia.nombre, v_colonia.precio,
        v_colonia.lat, v_colonia.lng, 'colonia_base'::text;
      RETURN;
    END IF;

    -- D) Fallback: colonia más cercana (500m)
    SELECT c.id, c.nombre, c.precio, c.lat, c.lng INTO v_colonia
    FROM public.colonias c
    WHERE ST_DWithin(
      ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
      v_point::geography, 500
    )
    ORDER BY ST_Distance(
      ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
      v_point::geography
    ) LIMIT 1;

    IF v_colonia.id IS NOT NULL THEN
      RETURN QUERY SELECT v_colonia.id, v_colonia.nombre,
        COALESCE(v_colonia.precio, 45), v_colonia.lat, v_colonia.lng, 'colonia_cercana'::text;
    END IF;
  END;
  */
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. También actualizamos calcular_precio_mandadito (origen → destino)
--    Ahora usa la distancia REAL entre pickup y delivery (más preciso aún).
-- ══════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.calcular_precio_mandadito(
  double precision, double precision, double precision, double precision
);

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

  -- Misma fórmula
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
