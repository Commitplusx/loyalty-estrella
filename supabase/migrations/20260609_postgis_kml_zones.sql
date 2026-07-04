-- ════════════════════════════════════════════════════════════════════
-- Migration: 20260609_postgis_kml_zones.sql
-- SOLO AGREGA lo nuevo. No modifica ni borra nada existente.
-- ════════════════════════════════════════════════════════════════════

-- PostGIS ya está activo (verificado). No se necesita CREATE EXTENSION.

-- ─── 1. Agregar columna geom a colonias (nullable, no rompe nada) ─────────────
ALTER TABLE public.colonias
  ADD COLUMN IF NOT EXISTS geom geometry(Polygon, 4326);

CREATE INDEX IF NOT EXISTS idx_colonias_geom
  ON public.colonias USING GIST (geom)
  WHERE geom IS NOT NULL;

-- ─── 2. Crear tabla zonas_kml (capas de tarifa del KML nuevo) ─────────────────
CREATE TABLE IF NOT EXISTS public.zonas_kml (
  id        uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre    text    NOT NULL,
  precio    integer NOT NULL,
  capa      text,
  geom      geometry(Polygon, 4326) NOT NULL,
  activo    boolean DEFAULT true,
  creado_en timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zonas_kml_geom
  ON public.zonas_kml USING GIST (geom);

ALTER TABLE public.zonas_kml ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "zonas_kml_public_read" ON public.zonas_kml;
CREATE POLICY "zonas_kml_public_read" ON public.zonas_kml FOR SELECT USING (true);

-- ─── 3. Helper: subir polígono de colonia desde el script de importación ──────
CREATE OR REPLACE FUNCTION public.upsert_colonia_geom(
  p_nombre      text,
  p_lat         double precision,
  p_lng         double precision,
  p_precio_base integer,
  p_geom_wkt    text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Actualizar si ya existe por nombre
  UPDATE public.colonias
  SET
    geom   = ST_GeomFromText(p_geom_wkt, 4326),
    lat    = COALESCE(lat, p_lat),
    lng    = COALESCE(lng, p_lng),
    precio = COALESCE(precio, p_precio_base)
  WHERE f_unaccent(LOWER(nombre)) = f_unaccent(LOWER(p_nombre));

  -- Insertar si no existe
  IF NOT FOUND THEN
    INSERT INTO public.colonias (nombre, lat, lng, precio, geom)
    VALUES (p_nombre, p_lat, p_lng, p_precio_base, ST_GeomFromText(p_geom_wkt, 4326))
    ON CONFLICT (nombre) DO UPDATE SET
      geom   = EXCLUDED.geom,
      precio = COALESCE(public.colonias.precio, EXCLUDED.precio);
  END IF;
END;
$$;

-- ─── 4. Helper: subir zona de tarifa especial ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.insert_zona_kml_geom(
  p_nombre    text,
  p_precio    integer,
  p_capa      text,
  p_geom_wkt  text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.zonas_kml (nombre, precio, capa, geom)
  VALUES (p_nombre, p_precio, p_capa, ST_GeomFromText(p_geom_wkt, 4326));
END;
$$;

-- ─── 5. Función nueva: resolver ubicación con Regla de Oro ────────────────────
-- Prioridad: zonas_kml (overlay de precio) > colonia.precio > default 45
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
    v_colonia.id, v_colonia.nombre, v_precio,
    v_colonia.lat, v_colonia.lng,
    CASE WHEN v_zona_kml IS NOT NULL THEN 'zona_especial' ELSE 'colonia_base' END;
END;
$$;

-- ─── 6. Corregir get_zona_from_coords: usar ST_Contains en zonas_gps ──────────
-- Antes usaba ST_DWithin(150m) que podía dar zona equivocada en bordes
CREATE OR REPLACE FUNCTION public.get_zona_from_coords(
  p_lat double precision,
  p_lng double precision
)
RETURNS TABLE(id integer, nombre text)
LANGUAGE plpgsql AS $$
DECLARE
  v_point geometry;
BEGIN
  v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

  -- Primero: containment exacto
  RETURN QUERY
  SELECT z.id::integer, z.nombre::text
  FROM public.zonas_gps z
  WHERE ST_Contains(z.geom, v_point)
  LIMIT 1;

  -- Si no encontró: fallback por proximidad (150m al borde)
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT z.id::integer, z.nombre::text
    FROM public.zonas_gps z
    WHERE ST_DWithin(
      z.geom::geography,
      v_point::geography,
      150
    )
    ORDER BY ST_Distance(z.geom::geography, v_point::geography)
    LIMIT 1;
  END IF;
END;
$$;
