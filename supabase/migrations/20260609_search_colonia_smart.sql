-- ════════════════════════════════════════════════════════════════════
-- Migration: 20260609_search_colonia_smart.sql
-- Búsqueda inteligente de colonias con manejo de typos, variantes y 
-- normalizacion fonética española.
-- ════════════════════════════════════════════════════════════════════

-- Asegurar extensiones necesarias (ya instaladas en Supabase)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Índice trigram sobre el nombre normalizado de colonias (si no existe)
CREATE INDEX IF NOT EXISTS idx_colonias_nombre_trgm 
  ON public.colonias USING GIN (lower(f_unaccent(nombre)) gin_trgm_ops);

-- ─── Función de búsqueda inteligente ─────────────────────────────────────────
-- Combina 3 técnicas:
--   1. Trigrama (pg_trgm): maneja typos, letras transpuestas, faltantes
--   2. Unaccent: ñ=n, é=e, así "yocnajab" = "Yocnajáb"
--   3. Palabras parciales: "pilita" encuentra "Pilita Seca"
--
-- Retorna resultados con score de confianza 0..1
DROP FUNCTION IF EXISTS public.search_colonia_smart(text, float);
CREATE OR REPLACE FUNCTION public.search_colonia_smart(
  query_text text,
  min_score  float DEFAULT 0.25
)
RETURNS TABLE(
  id     uuid,
  nombre text,
  lat    double precision,
  lng    double precision,
  score  float
)
LANGUAGE plpgsql
STABLE -- no modifica datos, permite caché de plan
AS $$
DECLARE
  q        text;
  q_words  text[];
  q_word   text;
BEGIN
  -- Normalizar query: minúsculas + sin acentos + sin espacios extras
  q := trim(regexp_replace(lower(f_unaccent(query_text)), '\s+', ' ', 'g'));

  -- Palabras individuales para match parcial (ej: solo "pilita" encuentra "Pilita Seca")
  q_words := string_to_array(q, ' ');

  RETURN QUERY
  WITH scored AS (
    SELECT
      c.id,
      c.nombre::text,
      c.lat,
      c.lng,
      lower(f_unaccent(c.nombre::text)) AS nombre_norm,
      GREATEST(
        -- Técnica 1: Trigrama completo (maneja typos: "seka" → "seca")
        similarity(lower(f_unaccent(c.nombre::text)), q),

        -- Técnica 2: Query contenida en el nombre ("pilita" → "Pilita Seca")
        CASE WHEN lower(f_unaccent(c.nombre::text)) LIKE '%' || q || '%' THEN 0.85 ELSE 0.0 END,

        -- Técnica 3: Nombre contenido en query ("pilita seca barrio" → "Pilita Seca")
        CASE WHEN q LIKE '%' || lower(f_unaccent(c.nombre::text)) || '%' THEN 0.80 ELSE 0.0 END,

        -- Técnica 4: Match de primera palabra significativa (ej. "pilita")
        CASE WHEN array_length(q_words, 1) > 0 
             AND lower(f_unaccent(c.nombre::text)) LIKE '%' || q_words[1] || '%' 
             THEN 0.65 ELSE 0.0 END,

        -- Técnica 5: Match de segunda palabra (ej. "seca" en "pilita seca")
        CASE WHEN array_length(q_words, 1) > 1 
             AND lower(f_unaccent(c.nombre::text)) LIKE '%' || q_words[2] || '%' 
             THEN 0.55 ELSE 0.0 END
      )::float AS score
    FROM public.colonias c
    WHERE c.lat IS NOT NULL AND c.lng IS NOT NULL
      AND (
        -- Pre-filtro rápido por trigrama (usa el índice GIN, muy rápido)
        similarity(lower(f_unaccent(c.nombre::text)), q) > min_score
        -- O contiene el texto
        OR lower(f_unaccent(c.nombre::text)) LIKE '%' || q || '%'
        -- O el texto contiene el nombre
        OR q LIKE '%' || lower(f_unaccent(c.nombre::text)) || '%'
        -- O contiene la primera palabra si es suficientemente larga
        OR (array_length(q_words, 1) > 0 AND length(q_words[1]) >= 4
            AND lower(f_unaccent(c.nombre::text)) LIKE '%' || q_words[1] || '%')
      )
  )
  SELECT s.id, s.nombre, s.lat, s.lng, s.score
  FROM scored s
  WHERE s.score >= min_score
  ORDER BY s.score DESC
  LIMIT 5;
END;
$$;
