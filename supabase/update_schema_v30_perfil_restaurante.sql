-- ============================================================
-- V30: Perfil Completo para Restaurantes (Horarios y Categorías)
-- ============================================================

ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS foto_fachada_url TEXT,
  ADD COLUMN IF NOT EXISTS hora_apertura TIME,
  ADD COLUMN IF NOT EXISTS hora_cierre TIME,
  ADD COLUMN IF NOT EXISTS categorias TEXT[];

-- (Opcional) Valores por defecto para restaurantes existentes
UPDATE restaurantes 
SET hora_apertura = '09:00:00', hora_cierre = '22:00:00' 
WHERE hora_apertura IS NULL;
