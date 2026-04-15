-- ============================================================
-- FIX RÁPIDO: Restaurar restaurantes invisibles
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Añadir columnas si no existen
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS telefono   TEXT;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS activo     BOOLEAN DEFAULT true;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS direccion  TEXT;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS lat        DOUBLE PRECISION;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS lng        DOUBLE PRECISION;

-- 2. CLAVE: Poner activo = true a los que quedaron en NULL
UPDATE restaurantes SET activo = true WHERE activo IS NULL OR activo = false;

-- 3. Verificar que quedaron visibles
SELECT id, nombre, telefono, activo FROM restaurantes;
