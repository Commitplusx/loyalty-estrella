-- =========================================================================================
-- V29: Memoria Visual de Clientes (Fachadas)
-- =========================================================================================

-- Agregamos la columna de la foto de fachada a la tabla clientes
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS foto_fachada_url TEXT;

-- Nota: El Storage Bucket 'fachadas_clientes' debe ser creado manualmente desde el Dashboard de Supabase.
